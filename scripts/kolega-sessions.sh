#!/usr/bin/env bash
# kolega-sessions.sh — vypíše sezení Claude v panelech aktuálního workspace herdr:
#   role|panel|přepis JSONL|řádků
# Role = jméno panelu (orchestrátor, programátor, tester, fable …), jinak „agent“.
# Přepis = ~/.claude/projects/<slug cwd>/<ID sezení z herdr>.jsonl (ID hledá i v ostatních složkách),
# jinak nejnovější *.jsonl ve složce cwd panelu (slug: nealfanumerické znaky → '-').
set -euo pipefail

ws="${HERDR_WORKSPACE_ID:-}"
projects="${USERPROFILE:-$HOME}/.claude/projects"
projects="${projects//\\//}"

herdr pane list ${ws:+--workspace "$ws"} | python -c '
import json, os, re, subprocess, sys
projects = sys.argv[1]
for p in json.load(sys.stdin)["result"]["panes"]:
    if p.get("agent") != "claude":
        continue
    pid = p["pane_id"]
    info = json.loads(subprocess.run(["herdr", "pane", "process-info", "--pane", pid],
                                     capture_output=True, text=True).stdout or "{}")
    procs = info.get("result", {}).get("process_info", {}).get("foreground_processes", [])
    cwd = next((x.get("cwd") for x in procs if x.get("cwd")), None) or p.get("cwd") or ""
    slug = re.sub(r"[^A-Za-z0-9]", "-", cwd.rstrip("\\/"))
    folder = os.path.join(projects, slug)
    sid = (p.get("agent_session") or {}).get("value")
    exact = os.path.join(folder, f"{sid}.jsonl") if sid else ""
    if sid and not os.path.isfile(exact):  # cwd se mohl změnit: hledej ID ve všech složkách
        exact = next((os.path.join(projects, d, f"{sid}.jsonl") for d in os.listdir(projects)
                      if os.path.isfile(os.path.join(projects, d, f"{sid}.jsonl"))), "")
    if exact and os.path.isfile(exact):
        newest = exact
    else:
        files = [os.path.join(folder, f) for f in os.listdir(folder)] if os.path.isdir(folder) else []
        files = [f for f in files if f.endswith(".jsonl")]
        if not files:
            continue
        newest = max(files, key=os.path.getmtime)
    with open(newest, "rb") as fh:
        lines = sum(1 for _ in fh)
    role = (p.get("label") or p.get("title") or "agent").split(" (")[0]
    print(f"{role}|{pid}|{newest.replace(chr(92), chr(47))}|{lines}")
' "$projects"
