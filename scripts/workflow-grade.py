#!/usr/bin/env python3
"""workflow-grade.py — mechanicky ohodnotí úkol SPAI podle řádků klíče s check="script".

  workflow-grade.py <ID> --project <repo> [--orchestrator-transcript <jsonl>] [--key <toml>] [--out-dir <dir>]
                    [--llm [--hand <jsonl>]]

--llm: řádky check="llm" ohodnotí jedno volání `claude -p --model sonnet --allowedTools Read,Grep,Glob`
(binárka z env WORKFLOW_GRADE_CLAUDE); not_met bez řádku důkazu se mění na unknown; výstup píše tento skript.

Čte klíč (docs/workflow-klic.toml), úkol (spai show --json) a přepisy JSONL (jen ke čtení):
přepisy agenta a orchestrátora z logu úkolu (řádky z task-link.sh), orchestrátora lze dát i volbou.
Zapíše <out-dir>/<ID>.jsonl (výchozí docs/workflow-hodnoceni/) a vytiskne krátkou tabulku.

Rozsah úkolu v přepisu orchestrátora: od první volby nástroje, která zmiňuje úkol (SPAI-NNN,
msgNNN, sNNN, tNNN, "spai set|log|show NNN"), po první `git merge`, který ho také zmiňuje.
Jen stdlib.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GATE_RE = re.compile(
    r"\b(pytest|cargo\s+(test|clippy|build)|npm\s+(run\s+)?test|tsc\b|claude\s+plugin\s+(validate|test)|vsa-check|bash\s+-n|check_[a-z_]+\.py)"
)
EDIT_TOOLS = {"Edit", "Write", "MultiEdit", "NotebookEdit"}
SHELL_TOOLS = {"Bash", "PowerShell"}


def load(path):
    """Přepis -> (calls, results, final_text). calls: [{line,name,id,text,input}]; results: id -> {line,error}."""
    calls, results, final = [], {}, ""
    with open(path, encoding="utf-8", errors="replace") as fh:
        for n, raw in enumerate(fh, 1):
            try:
                ev = json.loads(raw)
            except ValueError:
                continue
            content = (ev.get("message") or {}).get("content")
            if not isinstance(content, list):
                continue
            for c in content:
                if not isinstance(c, dict):
                    continue
                if ev.get("type") == "assistant" and c.get("type") == "tool_use":
                    inp = c.get("input") or {}
                    text = inp.get("command") or json.dumps(inp, ensure_ascii=False)
                    calls.append({"line": n, "name": c.get("name"), "id": c.get("id"), "text": text,
                                  "input": inp, "all": json.dumps(inp, ensure_ascii=False)})
                elif ev.get("type") == "assistant" and c.get("type") == "text":
                    final = c.get("text") or final
                elif ev.get("type") == "user" and c.get("type") == "tool_result":
                    results[c.get("tool_use_id")] = {"line": n, "error": bool(c.get("is_error"))}
    return calls, results, final


def task_re(num):
    return re.compile(
        rf"(?i)(SPAI-0*{num}\b|\bmsg0*{num}\b|\b[st]0*{num}\b|spai(?:\.exe)?\s+(?:log|set|show|dep)\s+0*{num}\b)"
    )


def ev(path, line):
    return {"transcript": str(path), "line": line}


def task_window(calls, rx, num, project):
    """(první zmínka, odeslání zadání, merge) jako objekty volání; None, když chybí."""
    # číslo úkolu je jen v rámci projektu: volání musí zmínit jeho jméno (jiné repo má vlastní SPAI-015)
    mine = [c for c in calls if project.lower() in c["all"].lower().replace("\\", "/")]
    first = next((c for c in mine if rx.search(c["all"])), None)
    if not first:
        return None, None, None
    send = next((c for c in mine if rx.search(c["all"])
                 and re.search(rf"(?is)Read\s+(?:SPAI-0*{num}\b|\$\{{?ID\b).*carry it out fully now", c["all"])), None)
    start = send or first  # sloučení dřívějšího úkolu často v tomtéž volání zadává tento
    merge = next(
        (c for c in mine if c["line"] > start["line"] and c["name"] in SHELL_TOOLS
         and re.search(r"\bgit\b[^;&|\n]*\bmerge\b", c["text"]) and rx.search(c["all"])),
        None,
    )
    return first, send, merge


def masked(text):
    if re.search(r"set\s+-\w*o\s+pipefail", text):
        return False
    return bool(re.search(r"\|\s*(tail|head)\b|\|\|\s*true\b", text))


def row_k01(ctx):
    task = ctx["task"]
    if {"docs", "chore"} & set(task.get("tags") or []):
        return "na", [], "task tagged docs/chore: no user-visible change"
    has = "## SMOKE" in (task.get("body") or "")
    first = ctx["first"]
    if first:
        e = [ev(ctx["orch_path"], first["line"])]
    else:
        e = [ev(task.get("path", ""), 1)]
    if has:
        return "met", e, "brief has ## SMOKE"
    return "not_met", e, "brief has no ## SMOKE section"


def orch_scope(ctx):
    if not ctx["orch"]:
        return "no orchestrator transcript"
    if not ctx["first"]:
        return "task not found in orchestrator transcript"
    return None


def row_k02(ctx):
    why = orch_scope(ctx)
    if why:
        return "unknown", [], why
    merge = ctx["merge"]
    if not merge:
        return "na", [], "no merge of the task in orchestrator transcript"
    first, calls, results = ctx["start"], ctx["orch"], ctx["orch_results"]
    # po posledním dotazu na agenta (agent-wait / agent get) před sloučením
    marks = [c["line"] for c in calls if first["line"] < c["line"] < merge["line"] and c["name"] in SHELL_TOOLS
             and re.search(r"agent-wait|herdr\s+agent\s+(get|read)", c["text"])]
    start = max(marks) if marks else first["line"]
    gates = [c for c in calls if start <= c["line"] < merge["line"] and c["name"] in SHELL_TOOLS
             and GATE_RE.search(c["text"])]
    good = [c for c in gates if not (results.get(c["id"]) or {}).get("error")]
    if good:
        g = good[-1]
        return "met", [ev(ctx["orch_path"], g["line"])], f"gate run at line {g['line']} before merge at {merge['line']}"
    return "not_met", [ev(ctx["orch_path"], merge["line"])], "no successful gate call after the agent's last turn before merge"


def row_k04(ctx):
    why = orch_scope(ctx)
    if why:
        return "unknown", [], why
    merge = ctx["merge"]
    if not merge:
        return "na", [], "no merge of the task in orchestrator transcript"
    seen = [c for c in ctx["orch"] if ctx["start"]["line"] < c["line"] <= merge["line"] and c["name"] in SHELL_TOOLS
            and re.search(r"\bgit\b[^;&|\n]*\b(status|diff)\b", c["text"])]
    if seen:
        return "met", [ev(ctx["orch_path"], seen[-1]["line"])], "git status/diff before merge"
    return "not_met", [ev(ctx["orch_path"], merge["line"])], "no git status/diff before merge"


def row_k06(ctx):
    why = orch_scope(ctx)
    if why:
        return "unknown", [], why
    n = ctx["num"]
    send = ctx["send"]
    first = ctx["first"]
    if not send:
        return "not_met", [ev(ctx["orch_path"], first["line"])], "no 'Read SPAI-N ... carry it out fully now' message found"
    work = [c for c in ctx["orch"] if first["line"] <= c["line"] <= send["line"]
            and ctx["project"].lower() in c["all"].lower().replace("\\", "/") and re.search(rf"\bset\s+(?:(?:SPAI-)?0*{n}|\$\{{?ID[^\s]*)\s+working\b", c["text"])]
    if not work:
        return "not_met", [ev(ctx["orch_path"], send["line"])], "task not set to working before the send"
    return "met", [ev(ctx["orch_path"], send["line"])], f"set working at line {work[-1]['line']}, message at {send['line']}"


def row_k08(ctx):
    if not ctx["coders"]:
        return "unknown", [], "no coder transcript linked"
    last = None
    for path, calls, results, final in ctx["coders"]:
        if any(c["name"] in EDIT_TOOLS and "scratchpad" not in c["all"].replace("\\", "/") for c in calls):
            last = (path, calls, results, final)
    if not last:
        return "na", [], "coder made no file edits"
    path, calls, results, final = last
    edit = [c for c in calls if c["name"] in EDIT_TOOLS and "scratchpad" not in c["all"].replace("\\", "/")][-1]
    gates = [c for c in calls if c["line"] > edit["line"] and c["name"] in SHELL_TOOLS and GATE_RE.search(c["text"])]
    ok = [c for c in gates if not masked(c["text"]) and not (results.get(c["id"]) or {}).get("error")]
    nv = "NOT VERIFIED" in final
    if ok:
        return "met", [ev(path, edit["line"]), ev(path, ok[-1]["line"])], f"gate after last edit; NOT VERIFIED in report: {nv}"
    if gates:
        return "not_met", [ev(path, edit["line"]), ev(path, gates[-1]["line"])], "gate after last edit is masked or failed"
    return "not_met", [ev(path, edit["line"])], "no gate run after the last file edit"


def row_k10(ctx):
    why = orch_scope(ctx)
    if why:
        return "unknown", [], why
    end = ctx["merge"]["line"] if ctx["merge"] else float("inf")
    sends = [c for c in ctx["orch"] if ctx["start"]["line"] < c["line"] <= end and c["name"] in SHELL_TOOLS
             and re.search(r"send-text\s+\S+\s+[\"']/\w", c["text"])]
    if not sends:
        return "na", [], "no slash command sent to a pane"
    bad = [c for c in sends if "MSYS_NO_PATHCONV=1" not in c["text"]]
    if bad:
        return "not_met", [ev(ctx["orch_path"], bad[0]["line"])], "slash command sent without MSYS_NO_PATHCONV=1"
    return "met", [ev(ctx["orch_path"], sends[0]["line"])], f"{len(sends)} send(s), all with MSYS_NO_PATHCONV=1"


CHECKS = {"K01": row_k01, "K02": row_k02, "K04": row_k04, "K06": row_k06, "K08": row_k08, "K10": row_k10}


def spai_bin():
    """Jako agent.sh: SPAI_BIN, jinak D:/01_programovani/_tools/spai.exe, jinak spai z PATH."""
    env = os.environ.get("SPAI_BIN")
    if env:
        return env
    tools = "D:/01_programovani/_tools/spai.exe"
    return tools if Path(tools).exists() else "spai"


def spai_show(task_id, project):
    out = subprocess.run([spai_bin(), "show", task_id, "--project", project, "--json"],
                         capture_output=True, text=True, encoding="utf-8", check=True).stdout
    return json.loads(out)["data"]


def linked(task):
    """Cesty přepisů z logu: (agent, orchestrátor)."""
    agent, orch = [], []
    for e in task.get("log") or []:
        t = e.get("text", "")
        m = re.match(r"orchestrator session \S+ transcript (.+)$", t)
        if m:
            orch.append(m.group(1).strip())
            continue
        m = re.match(r"session \S+ pane \S+ transcript (.+)$", t)
        if m:
            agent.append(m.group(1).strip())
    return agent, orch


def git_sha(path):
    r = subprocess.run(["git", "hash-object", str(path)], capture_output=True, text=True)
    return r.stdout.strip() or "unknown"


EXCERPT_CAP = 60000   # znaků výňatků na úkol (všechny llm řádky dohromady)
CALL_CAP = 300        # znaků jednoho volání ve výňatku
VERDICTS = {"met", "not_met", "na", "unknown"}
# co z přepisu je pro řádek relevantní: (zdroj: orch|coder, regex nad textem volání nebo None = vše v rozsahu)
LLM_SELECT = {
    "K03": ("orch", re.compile(r"(?i)smoke|scenario|--help|\.exe|plugin\s+(test|validate)|herdr|agent-wait|git\s+merge")),
    "K05": ("orch", re.compile(r"(?i)spai\s+log|agent\s+prompt|git\s+(diff|status)|agent-wait|git\s+merge")),
    "K07": ("orch", re.compile(r"(?i)hook|guard|permission|settings|allow|deny|live|disable|off-switch|git\s+merge")),
    "K09": ("coder", None),
}


def claude_bin():
    return os.environ.get("WORKFLOW_GRADE_CLAUDE") or "claude"


def excerpt_lines(label, calls, lo, hi, rx, results):
    """Řádky výňatku: '<label>:<řádek> <nástroj>[!] <text>'; jen volání v rozsahu lo..hi, která sedí na rx."""
    out = []
    for c in calls:
        if not (lo <= c["line"] <= hi):
            continue
        text = c["text"] if c["name"] in SHELL_TOOLS else c["all"]
        if rx and not rx.search(c["all"]):
            continue
        text = " ".join(text.split())
        if len(text) > CALL_CAP:
            text = text[:CALL_CAP] + "…"
        err = "!" if (results.get(c["id"]) or {}).get("error") else ""
        out.append(f"{label}:{c['line']} {c['name']}{err} {text}")
    return out


def build_excerpts(ctx, llm_ids):
    """({řádek: text výňatku}, {label: cesta přepisu}); text je omezen tak, aby celek nepřesáhl EXCERPT_CAP."""
    labels = {}
    orch_label = None
    if ctx["orch"] and ctx["orch_path"]:
        orch_label = "O"
        labels[orch_label] = ctx["orch_path"]
    for i, (path, _c, _r, _f) in enumerate(ctx["coders"], 1):
        labels[f"C{i}"] = path
    lo = ctx["start"]["line"] if ctx["start"] else 0
    hi = ctx["merge"]["line"] if ctx["merge"] else float("inf")
    per_row = EXCERPT_CAP // max(1, len(llm_ids))
    out = {}
    for rid in llm_ids:
        who, rx = LLM_SELECT.get(rid, ("orch", None))
        lines = []
        if who == "orch" and orch_label:
            lines = excerpt_lines(orch_label, ctx["orch"], lo, hi, rx, ctx["orch_results"])
        elif who == "coder":
            for i, (_p, calls, results, final) in enumerate(ctx["coders"], 1):
                lines += excerpt_lines(f"C{i}", calls, 0, float("inf"), rx, results)
                if final:
                    lines.append(f"C{i}:final-report " + " ".join(final.split())[:1500])
        text, used = [], 0
        for ln in lines:
            if used + len(ln) + 1 > per_row:
                text.append("[... excerpt truncated ...]")
                break
            text.append(ln)
            used += len(ln) + 1
        out[rid] = "\n".join(text) or "(no relevant transcript lines found)"
    return out, labels


def build_prompt(task, key_rows, excerpts, labels):
    rows = "\n\n".join(
        f"### {r['id']} ({r['who']})\ntrigger: {r['trigger']}\nrequired: {r['required']}\nevidence: {r['evidence']}\n"
        f"transcript excerpt (format <label>:<line> <tool> <call>; '!' = the call failed):\n{excerpts[r['id']]}"
        for r in key_rows)
    lab = "\n".join(f"{k} = {v}" for k, v in labels.items()) or "(none)"
    return (
        "You grade how an orchestrator and a coder agent followed a workflow key. Judge each row below only from the "
        "excerpts (you may use Read/Grep/Glob on the transcript files, read-only). Do not guess: if the excerpt does not "
        "decide it, answer unknown.\n"
        "Verdicts: met (trigger happened and the required behaviour is evidenced), not_met (trigger happened and the "
        "behaviour is missing), na (trigger did not happen), unknown.\n"
        "not_met MUST cite at least one evidence line.\n"
        "Reply with ONLY a JSON array, no prose, no code fence, one object per row:\n"
        '[{"row":"K03","verdict":"met|not_met|na|unknown","evidence":[{"transcript":"<label>","line":<int>}],"note":"<one sentence>"}]\n\n'
        f"Task {task['id']}: {task.get('title', '')}\nBrief:\n{(task.get('body') or '')[:6000]}\n\n"
        f"Transcript labels:\n{lab}\n\n{rows}\n")


def parse_grader(raw, key_rows, labels):
    """Výstup `claude -p --output-format json` -> {řádek: (verdict, evidence, note)}; selhání -> vše unknown."""
    fail = {r["id"]: ("unknown", [], "grader output not JSON") for r in key_rows}
    try:
        text = json.loads(raw)["result"]
        arr = json.loads(text.strip())
    except (ValueError, KeyError, TypeError, AttributeError):
        return fail
    if not isinstance(arr, list):
        return fail
    by_id = {a.get("row"): a for a in arr if isinstance(a, dict)}
    by_path = {Path(p).name: p for p in labels.values()} | {p: p for p in labels.values()}
    res = {}
    for r in key_rows:
        a = by_id.get(r["id"])
        if not a:
            res[r["id"]] = ("unknown", [], "grader gave no verdict for this row")
            continue
        verdict, note = a.get("verdict"), str(a.get("note") or "")
        if verdict not in VERDICTS:
            res[r["id"]] = ("unknown", [], f"grader gave invalid verdict {verdict!r}")
            continue
        evidence = []
        for e in a.get("evidence") or []:
            if not isinstance(e, dict) or not isinstance(e.get("line"), int) or isinstance(e.get("line"), bool):
                continue
            t = str(e.get("transcript"))
            path = labels.get(t) or by_path.get(t) or by_path.get(Path(t).name)
            if path:
                evidence.append(ev(path, e["line"]))
        if verdict == "not_met" and not evidence:
            res[r["id"]] = ("unknown", [], "grader said not_met without evidence line: " + note)
            continue
        res[r["id"]] = (verdict, evidence, note)
    return res


def run_grader(prompt):
    """Jedno volání claude -p (Sonnet, jen čtení); prompt jde na stdin. Vrací stdout nebo None při selhání."""
    cmd = [claude_bin(), "-p", "--model", "sonnet", "--allowedTools", "Read,Grep,Glob", "--output-format", "json"]
    try:
        r = subprocess.run(cmd, input=prompt, capture_output=True, text=True, encoding="utf-8", timeout=900)
    except (OSError, subprocess.SubprocessError):
        return None
    return r.stdout if r.returncode == 0 else None


def grade(task_id, project, orch_transcript=None, key_path=None, llm=False):
    key_path = Path(key_path or ROOT / "docs" / "workflow-klic.toml")
    rows = tomllib.loads(key_path.read_text(encoding="utf-8"))["row"]
    task = spai_show(task_id, project)
    num = int(re.sub(r"\D", "", task["id"]))
    agent_paths, orch_paths = linked(task)
    if orch_transcript:
        orch_paths.insert(0, orch_transcript)
    orch_paths = [p for p in orch_paths if Path(p).exists()]
    agent_paths = [p for p in agent_paths if Path(p).exists()]
    ctx = {"task": task, "num": num, "orch": None, "orch_path": None, "project": Path(project).name, "first": None, "send": None, "start": None, "merge": None, "coders": []}
    rx = task_re(num)
    for p in orch_paths:
        calls, results, _ = load(p)
        first, send, merge = task_window(calls, rx, num, Path(project).name)
        if first:
            ctx.update(orch=calls, orch_results=results, orch_path=p, first=first, send=send, merge=merge,
                       start=send or first)
            break
    if not ctx["orch"] and orch_paths:  # úkol v přepisu nenalezen
        calls, results, _ = load(orch_paths[0])
        ctx.update(orch=calls, orch_results=results, orch_path=orch_paths[0])
    ctx["coders"] = [(p, *load(p)) for p in agent_paths]
    sha = git_sha(key_path)
    llm_rows = [r for r in rows if r.get("check") == "llm"]
    llm_res = {}
    if llm and llm_rows:
        excerpts, labels = build_excerpts(ctx, [r["id"] for r in llm_rows])
        raw = run_grader(build_prompt(task, llm_rows, excerpts, labels))
        llm_res = parse_grader(raw, llm_rows, labels) if raw is not None else {
            r["id"]: ("unknown", [], "grader call failed") for r in llm_rows}
    out = []
    for r in rows:
        checker = "script"
        if r.get("check") == "script" and r["id"] in CHECKS:
            verdict, evidence, note = CHECKS[r["id"]](ctx)
        elif r["id"] in llm_res:
            (verdict, evidence, note), checker = llm_res[r["id"]], "llm"
        else:
            verdict, evidence, note = "unknown", [], "needs llm/human"
        if verdict == "not_met" and not evidence:
            raise SystemExit(f"BUG: {r['id']} not_met without evidence")
        out.append({"task": task["id"], "row": r["id"], "verdict": verdict, "evidence": evidence,
                    "note": note, "checker": checker, "key": sha})
    return out


def agreement(rows, hand_path):
    """Shoda verdiktů llm řádků s ručním hodnocením (jsonl {task,row,verdict}); vrací řádky tabulky."""
    hand = {}
    for ln in Path(hand_path).read_text(encoding="utf-8").splitlines():
        if ln.strip():
            h = json.loads(ln)
            hand[(h["task"], h["row"])] = h["verdict"]
    lines = []
    for r in rows:
        if r["checker"] != "llm":
            continue
        h = hand.get((r["task"], r["row"]))
        state = "no hand verdict" if h is None else ("AGREE" if h == r["verdict"] else "DIFFER")
        lines.append(f"{r['row']:<4} llm={r['verdict']:<8} hand={h or '-':<8} {state}")
    return lines


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("id")
    ap.add_argument("--project", required=True)
    ap.add_argument("--orchestrator-transcript")
    ap.add_argument("--key")
    ap.add_argument("--out-dir", default=str(ROOT / "docs" / "workflow-hodnoceni"))
    ap.add_argument("--llm", action="store_true", help="llm rows: one read-only Sonnet call (claude -p)")
    ap.add_argument("--hand", help="jsonl with hand verdicts {task,row,verdict}: print llm agreement per row")
    a = ap.parse_args(argv)
    rows = grade(a.id, a.project, a.orchestrator_transcript, a.key, llm=a.llm)
    out = Path(a.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    target = out / f"{rows[0]['task']}.jsonl"
    target.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows), encoding="utf-8")
    for r in rows:
        refs = ",".join(f"{Path(e['transcript']).name[:8]}:{e['line']}" for e in r["evidence"]) or "-"
        print(f"{r['row']:<4} {r['verdict']:<8} {refs:<24} {r['note']}")
    if a.hand:
        print("calibration vs hand:")
        for ln in agreement(rows, a.hand):
            print(ln)
    print(f"-> {target}")


if __name__ == "__main__":
    main()
