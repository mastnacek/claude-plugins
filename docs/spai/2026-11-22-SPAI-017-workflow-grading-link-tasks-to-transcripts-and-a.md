---
type: Todo
title: "Workflow grading: link tasks to transcripts and a script that checks the key rows check=script"
timestamp: 2026-11-22 17:41:32
status: done
source: orchestrator
tags: [agent, coder, workflow]
facets:
  project: claude
  project_path: D:/01_programovani/claude
spai_symbol: 'x'
lang: en
title_cs: "Hodnocení workflow: propojte úkoly s přepisy a skriptem, který kontroluje klíčové řádky check=script"
done_evidence: "merged, 14 unittest, calibration 033/037/015 ok"
---

# SPAI-017: Workflow grading: link tasks to transcripts and a script that checks the key rows check=script

x Workflow grading: link tasks to transcripts and a script that checks the key rows check=script @claude :agent:coder:workflow:

Plan steps 3 and 4 from the Fable review SPAI-016 @claude. Key: D:/01_programovani/claude/docs/workflow-klic.toml (approved v0, 10 rows; read it first). Docs: docs/herdr-orchestrace.md.

```
WORKDIR         D:/01_programovani/claude-grade (claude repo, branch feat/workflow-grade)
ALLOWED_PATHS   scripts/**, docs/herdr-orchestrace.md, docs/workflow-hodnoceni/ (new, with .gitkeep), tests for the scripts (scripts/tests/)
GATE            python -m pytest scripts/tests -q (all pass); bash -n on changed .sh; python scripts are stdlib only
HARD_CONSTRAINTS never modify docs/workflow-klic.toml or prompts/; read real transcripts only read-only; never print transcript content beyond short quoted evidence; git read-only.
```

## Scope
1. Link: scripts/task-link.sh <ID> <project> <pane>: records the agent's session id and transcript path on the task via `spai log <ID> "session <sid> pane <pane> transcript <path>"` (session id from `herdr agent get`, transcript = ~/.claude/projects/<cwd-slug>/<sid>.jsonl). Call it from the documented send step in herdr-orchestrace.md (step 2 "Odeslání"). Also records the orchestrator's own transcript path (env CLAUDE_SESSION / newest jsonl of the orchestrator project dir, document the choice).
2. Grader: scripts/workflow-grade.py <ID> --project <repo> [--orchestrator-transcript <path>]: reads the key, finds the task's linked transcripts from its spai log, evaluates every row with check="script" (K01, K02, K04, K06, K08, K10) mechanically: JSONL parsing of assistant tool_use / tool_result events with line numbers; writes docs/workflow-hodnoceni/<ID>.jsonl, one JSON line per row {task,row,verdict met|not_met|na|unknown,evidence:[{transcript,line}],note,checker:"script",key:<git sha of the key file>}; rows check=llm/human are written as verdict "unknown" with note "needs llm/human". not_met without an evidence line is a bug. Prints a short table.
3. Calibration (the done-criterion): run the grader read-only on the known sessions of 2026-11-20..22 in this orchestrator transcript (C:/Users/jaroslav/.claude/projects/D--01-programovani-claude/ffe01966-1e2f-4b82-b29b-28c254f3953e.jsonl) for tasks SPAI-033 @anon (merge after a live smoke found a bug and the task was sent back: K05 territory, K02 met) and SPAI-037 @anon, and on one clean task SPAI-015 @anon; report the verdict tables. Known truths to match: for SPAI-033 and SPAI-037 K02 met (orchestrator ran the gate before merge); K01 not_met for both (briefs had no ## SMOKE yet). Write the found evidence lines.
4. Tests (pytest) with small fake transcripts for each script row: met, not_met, na.

## SMOKE
1. bash scripts/task-link.sh on a fake task in a scratch spai copy -> spai log shows the session line.
2. python scripts/workflow-grade.py SPAI-033 --project D:/01_programovani/anon --orchestrator-transcript <the path above> -> table with K01 not_met, K02 met, each with a transcript line; file docs/workflow-hodnoceni/SPAI-033.jsonl written (in the worktree).
3. Same for SPAI-015 @anon -> no not_met without evidence.
Commit proposal: feat(workflow): hodnocení úkolu podle klíče — vazba na přepisy a skriptové řádky

## Log
- 2026-11-22 17:51 (orchestrator) Orchestrator review: (1) Repro: python scripts/workflow-grade.py SPAI-037 --project D:/01_programovani/anon --orchestrator-transcript <orchestrator jsonl> from a normal shell fails: PermissionError WinError 5 at scripts/workflow-grade.py:205, because subprocess.run(["spai", ...]) resolves to the blocked ~/.cargo/bin/spai.exe. Use SPAI_BIN if set, else D:/01_programovani/_tools/spai.exe if it exists, else "spai" (same order as agent.sh); same for any other external tool. Add a test that the binary is taken from SPAI_BIN. (2) Gate: pytest is not installed and must not be. Rewrite the tests to stdlib unittest (no pytest import) and set the gate to `python -m unittest discover -s scripts/tests -q`; run it and quote the output. (3) Re-run the calibration from a plain shell (not your runner) for SPAI-033, SPAI-037 and SPAI-015 @anon and quote the tables.
- 2026-11-22 17:54 (orchestrator) done: merged, 14 unittest, calibration 033/037/015 ok
