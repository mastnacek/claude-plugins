#!/usr/bin/env python3
"""workflow-grade.py — mechanicky ohodnotí úkol SPAI podle řádků klíče s check="script".

  workflow-grade.py <ID> --project <repo> [--orchestrator-transcript <jsonl>] [--key <toml>] [--out-dir <dir>]
                    [--llm [--hand <jsonl>]]

--llm: řádky check="llm" ohodnotí jedno volání `claude -p --model sonnet --tools ""` (bez nástrojů)
(binárka z env WORKFLOW_GRADE_CLAUDE); not_met bez řádku důkazu se mění na unknown; výstup píše tento skript.
Výňatky jsou ukotvené: merge, poslední GATE, živé běhy po "done", soubory hooků/guardu, spai log úkolu (±15 řádků).
Bez řádku se sezením kodéra v logu se kodér hledá v ~/.claude/projects/<slug WORKDIR ze zadání>/ (env WORKFLOW_GRADE_PROJECTS).

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
                    body = c.get("content")
                    if isinstance(body, list):
                        body = " ".join(str(b.get("text") or "") for b in body if isinstance(b, dict))
                    results[c.get("tool_use_id")] = {"line": n, "error": bool(c.get("is_error")),
                                                     "text": str(body or "")[:4000]}
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
WINDOW = 15           # řádků přepisu kolem každé kotvy
RESULT_CAPS = (600, 150, 0)  # znaků těla tool_result; při překročení limitu se zkracuje jako první
# co z přepisu je pro řádek relevantní: (zdroje: orch/coder, regex volání, které je navíc kotvou, nebo None)
LLM_SELECT = {
    "K03": (("orch", "coder"), re.compile(r"(?i)smoke|scenario|--help|plugin\s+(test|validate)")),
    "K05": (("orch",), re.compile(r"(?i)spai\s+log|agent\s+prompt|git\s+(diff|status)")),
    "K07": (("orch", "coder"), re.compile(r"(?i)hook|permission|settings|allow|deny|disable|off-switch")),
    "K09": (("coder",), None),
}
# živý běh: příkaz herdr, binárka, nápověda, scénář
LIVE_RE = re.compile(
    r"(?i)herdr\s+(agent\s+(prompt|wait|read|get)|pane\s+(run|split|send-text|wait-output|read))"
    r"|agent-wait|\.exe\b|--help|smoke|claude\s+plugin\s+(test|validate)|cargo\s+run|target/(debug|release)/")
DONE_RE = re.compile(r"agent-wait|herdr\s+agent\s+(get|read)")
HOOK_RE = re.compile(r"(?i)\.claude/+hooks/+|guard")
DIFF_RE = re.compile(r"\bgit\b[^;&|\n]*\b(diff|status|show)\b")


def claude_bin():
    return os.environ.get("WORKFLOW_GRADE_CLAUDE") or "claude"


def norm(text):
    return text.replace("\\", "/")


def render_events(label, calls, results, cap):
    """{řádek přepisu: text} pro volání i jejich výsledky; tělo výsledku se krátí na cap znaků (0 = jen příznak chyby)."""
    events = {}
    for c in calls:
        text = c["text"] if c["name"] in SHELL_TOOLS else c["all"]
        text = " ".join(text.split())
        if len(text) > CALL_CAP:
            text = text[:CALL_CAP] + "…"
        r = results.get(c["id"]) or {}
        events[c["line"]] = f"{label}:{c['line']} {c['name']}{'!' if r.get('error') else ''} {text}"
        body = " ".join((r.get("text") or "").split())
        if r and cap > 0 and body:
            events[r["line"]] = f"{label}:{r['line']} result{'!' if r.get('error') else ''} {body[:cap]}"
        elif r.get("error"):
            events[r["line"]] = f"{label}:{r['line']} result! (body omitted)"
    return events


def hook_touch(c, results):
    """Volání, které mění nebo ukazuje soubor pod .claude/hooks či ochranný kód (Edit/Write, nebo git diff/status s ním ve výsledku)."""
    if c["name"] in EDIT_TOOLS:
        return bool(HOOK_RE.search(norm(c["all"])))
    if c["name"] in SHELL_TOOLS and DIFF_RE.search(c["text"]):
        return bool(HOOK_RE.search(norm((results.get(c["id"]) or {}).get("text", ""))))
    return False


def find_anchors(calls, results, lo, hi, merge=None, row_rx=None, task_rx=None):
    """[(priorita, řádek, okolí)]; nižší priorita se vybírá dřív: merge, poslední GATE, soubory hooků/guardu,
    spai log úkolu, živé běhy po 'done' (nejnovější první), samotné 'done', řádky podle regexu řádku klíče."""
    rng = [c for c in calls if lo <= c["line"] <= hi]
    shell = [c for c in rng if c["name"] in SHELL_TOOLS]
    out = []
    if merge:
        out.append((0, merge["line"], WINDOW))
    gates = [c for c in shell if GATE_RE.search(c["text"])]
    if gates:
        out.append((1, gates[-1]["line"], WINDOW))
    out += [(2, c["line"], WINDOW) for c in rng if hook_touch(c, results)]
    if task_rx:
        out += [(3, c["line"], WINDOW) for c in shell
                if re.search(r"(?i)\bspai(?:\.exe)?\s+log\b", c["text"]) and task_rx.search(c["all"])]
    done = next((c for c in shell if DONE_RE.search(c["text"])), None)
    after = done["line"] if done else lo
    live = [c for c in shell if c["line"] > after and LIVE_RE.search(c["text"])]
    out += [(4, c["line"], WINDOW) for c in reversed(live)]
    if done:
        out.append((5, done["line"], WINDOW))
    if row_rx:
        out += [(6, c["line"], 1) for c in rng if row_rx.search(c["all"])]
    return out


def pick_lines(events, anchors, lo, hi, budget):
    """Řádky v oknech kotev podle priority, dokud se vejdou do budget; -> (seřazené řádky, něco vypadlo?)."""
    chosen, used, dropped = {}, 0, False
    for _prio, line, margin in sorted(anchors):
        for ln in sorted(k for k in events if line - margin <= k <= line + margin and lo <= k <= hi):
            if ln in chosen:
                continue
            if used + len(events[ln]) + 1 > budget:
                dropped = True
                continue
            chosen[ln] = events[ln]
            used += len(events[ln]) + 1
    return [chosen[k] for k in sorted(chosen)], dropped


def section_excerpt(label, calls, results, anchors, lo, hi, budget, final=""):
    """Výňatek jednoho přepisu: nejdřív se zkracují těla tool_result, teprve potom se vyřazují okna s nízkou prioritou."""
    for cap in RESULT_CAPS:
        events = render_events(label, calls, results, cap)
        pool = list(anchors)
        if final:
            events[0] = f"{label}:final-report " + " ".join(final.split())[:1500]
            pool.append((-1, 0, 0))
        lines, dropped = pick_lines(events, pool, lo, hi, budget)
        if not dropped:
            break
    return lines + (["[... excerpt truncated ...]"] if dropped else [])


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
    merge = ctx["merge"]
    hi = merge["line"] if merge else float("inf")
    per_row = EXCERPT_CAP // max(1, len(llm_ids))
    task_rx = task_re(ctx["num"]) if ctx.get("num") else None
    out = {}
    for rid in llm_ids:
        who, row_rx = LLM_SELECT.get(rid, (("orch",), None))
        sections = []   # (label, calls, results, anchors, lo, hi, final)
        if "orch" in who and orch_label:
            anchors = find_anchors(ctx["orch"], ctx["orch_results"], lo, hi, merge, row_rx, task_rx)
            sections.append((orch_label, ctx["orch"], ctx["orch_results"], anchors, lo, hi + WINDOW, ""))
        if "coder" in who:
            for i, (_p, calls, results, final) in enumerate(ctx["coders"], 1):
                if rid == "K09":  # řetěz hooků: kodérovy volání celá
                    anchors = [(1, c["line"], 1) for c in calls]
                else:
                    anchors = find_anchors(calls, results, 0, float("inf"), None, row_rx)
                sections.append((f"C{i}", calls, results, anchors, 0, float("inf"), final))
        text = []
        for label, calls, results, anchors, a, b, final in sections:
            text += section_excerpt(label, calls, results, anchors, a, b, per_row // len(sections), final)
        out[rid] = "\n".join(text) or "(no relevant transcript lines found)"
    return out, labels


def first_user_text(path):
    """Text první zprávy uživatele v přepisu (pro hledání úkolu)."""
    with open(path, encoding="utf-8", errors="replace") as fh:
        for raw in fh:
            try:
                e = json.loads(raw)
            except ValueError:
                continue
            if e.get("type") != "user" or e.get("isMeta"):
                continue
            c = (e.get("message") or {}).get("content")
            if isinstance(c, list):
                c = " ".join(str(b.get("text") or "") for b in c if isinstance(b, dict))
            if isinstance(c, str) and c.strip():
                return c
    return ""


def projects_dir(path_text):
    """~/.claude/projects/<slug cesty> (slug: nealfanumerické znaky -> '-'); kořen lze přepsat WORKFLOW_GRADE_PROJECTS."""
    root = os.environ.get("WORKFLOW_GRADE_PROJECTS") or str(Path.home() / ".claude" / "projects")
    return Path(root) / re.sub(r"[^A-Za-z0-9]", "-", path_text)


def fallback_orch(project, exclude):
    """Úkol bez řádku s přepisem orchestrátora: přepisy v projects/<slug repa>/, nejnovější první."""
    base = projects_dir(project)
    if not base.is_dir():
        return []
    skip = {Path(p).resolve() for p in exclude}
    return [str(p) for p in sorted(base.glob("*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True)
            if p.resolve() not in skip]


def fallback_coder(task, exclude):
    """Úkol bez řádku se sezením kodéra: nejnovější přepis v <projects>/<slug WORKDIR ze zadání>/, jehož první zpráva zmiňuje ID."""
    m = re.search(r"(?m)^\s*WORKDIR\s+(\S+)", task.get("body") or "")
    if not m:
        return []
    base = projects_dir(m.group(1))
    if not base.is_dir():
        return []
    skip = {Path(p).resolve() for p in exclude}
    tid = re.compile(rf"(?i)\b{re.escape(task['id'])}\b")
    for p in sorted(base.glob("*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True):
        if p.resolve() not in skip and tid.search(first_user_text(p)):
            return [str(p)]
    return []


def smoke_steps(body):
    """Kroky z oddílu '## SMOKE' zadání (neprázdné řádky, bez číslování) -> seznam textů."""
    m = re.search(r"(?ms)^[ \t]*##\s*SMOKE[^\n]*\n(.*?)(?=^[ \t]*##\s|^[ \t]*Commit proposal|^- \d{4}-\d\d-\d\d|\Z)", body or "")
    if not m:
        return []
    return [re.sub(r"^\s*(?:\d+[.)]|[-*])\s*", "", ln).strip() for ln in m.group(1).splitlines() if ln.strip()]


def build_prompt(task, key_rows, excerpts, labels):
    steps = smoke_steps(task.get("body"))
    smoke = ""
    if steps and any(r["id"] == "K03" for r in key_rows):
        smoke = ("\nK03 SMOKE steps of the brief (numbered). For K03 write in the note one entry per step: the excerpt line "
                 "(<label>:<line>) that shows it run live, or 'not run'. If any functional step is 'not run' -> not_met "
                 "(cite the line of the merge or of the last related run).\n"
                 + "\n".join(f"{i}. {s}" for i, s in enumerate(steps, 1)) + "\n")
    rows ="\n\n".join(
        f"### {r['id']} ({r['who']})\ntrigger: {r['trigger']}\nrequired: {r['required']}\nevidence: {r['evidence']}\n"
        f"transcript excerpt (format <label>:<line> <tool> <call>; '!' = the call failed):\n{excerpts[r['id']]}"
        for r in key_rows)
    lab = "\n".join(f"{k} = {v}" for k, v in labels.items()) or "(none)"
    return (
        "You grade how an orchestrator and a coder agent followed a workflow key. You have no tools. Judge each row "
        "below only from the excerpts; the repository today may differ from the state at task time, so never judge "
        "from what you believe the repository contains now. Do not guess: if the excerpt does not decide it, answer unknown.\n"
        "Verdicts: met (trigger happened and the required behaviour is evidenced), not_met (trigger happened and the "
        "behaviour is missing), na (trigger did not happen), unknown.\n"
        "not_met MUST cite at least one evidence line.\n"
        "K05: if the excerpts show the orchestrator's review (gate run, live smoke) and no spai log entry reporting a "
        "defect of the agent's result, the trigger did not happen -> na, not unknown.\n"
        "Reply with ONLY a JSON array, no prose, no code fence, one object per row:\n"
        '[{"row":"K03","verdict":"met|not_met|na|unknown","evidence":[{"transcript":"<label>","line":<int>}],"note":"<one sentence>"}]\n\n'
        f"Task {task['id']}: {task.get('title', '')}\nBrief:\n{(task.get('body') or '')[:6000]}\n\n"
        f"Transcript labels:\n{lab}\n{smoke}\n{rows}\n")


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
    """Jedno volání claude -p (Sonnet, bez nástrojů: soudí jen z výňatků); prompt jde na stdin. Vrací stdout nebo None při selhání."""
    cmd = [claude_bin(), "-p", "--model", "sonnet", "--tools", "", "--output-format", "json"]
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
    agent_paths = [p for p in agent_paths if Path(p).exists()] or fallback_coder(task, orch_paths)
    ctx = {"task": task, "num": num, "orch": None, "orch_path": None, "project": Path(project).name, "first": None, "send": None, "start": None, "merge": None, "coders": []}
    rx = task_re(num)
    for p in orch_paths:
        calls, results, _ = load(p)
        first, send, merge = task_window(calls, rx, num, Path(project).name)
        if first:
            ctx.update(orch=calls, orch_results=results, orch_path=p, first=first, send=send, merge=merge,
                       start=send or first)
            break
    if not ctx["orch"]:  # záloha: přepisy repa; první s merge úkolu, jinak první, kde je úkol zmíněn
        found = []
        for p in fallback_orch(project, orch_paths):
            calls, results, _ = load(p)
            first, send, merge = task_window(calls, rx, num, Path(project).name)
            if first:
                found.append((calls, results, p, first, send, merge))
                if merge:
                    break
        if found:
            calls, results, p, first, send, merge = next((f for f in found if f[5]), found[0])
            ctx.update(orch=calls, orch_results=results, orch_path=p, first=first, send=send, merge=merge,
                       start=send or first)
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
