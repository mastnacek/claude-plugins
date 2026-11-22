#!/usr/bin/env python3
"""workflow-grade.py — mechanicky ohodnotí úkol SPAI podle řádků klíče s check="script".

  workflow-grade.py <ID> --project <repo> [--orchestrator-transcript <jsonl>] [--key <toml>] [--out-dir <dir>]

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


def grade(task_id, project, orch_transcript=None, key_path=None):
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
    out = []
    for r in rows:
        if r.get("check") == "script" and r["id"] in CHECKS:
            verdict, evidence, note = CHECKS[r["id"]](ctx)
        else:
            verdict, evidence, note = "unknown", [], "needs llm/human"
        if verdict == "not_met" and not evidence:
            raise SystemExit(f"BUG: {r['id']} not_met without evidence")
        out.append({"task": task["id"], "row": r["id"], "verdict": verdict, "evidence": evidence,
                    "note": note, "checker": "script", "key": sha})
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("id")
    ap.add_argument("--project", required=True)
    ap.add_argument("--orchestrator-transcript")
    ap.add_argument("--key")
    ap.add_argument("--out-dir", default=str(ROOT / "docs" / "workflow-hodnoceni"))
    a = ap.parse_args(argv)
    rows = grade(a.id, a.project, a.orchestrator_transcript, a.key)
    out = Path(a.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    target = out / f"{rows[0]['task']}.jsonl"
    target.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows), encoding="utf-8")
    for r in rows:
        refs = ",".join(f"{Path(e['transcript']).name[:8]}:{e['line']}" for e in r["evidence"]) or "-"
        print(f"{r['row']:<4} {r['verdict']:<8} {refs:<24} {r['note']}")
    print(f"-> {target}")


if __name__ == "__main__":
    main()
