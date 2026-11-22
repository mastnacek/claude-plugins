---
type: Todo
title: "agent-wait.sh decides 'done' from the worker's transcript (last assistant message with stop_reason end_turn), not only from the pane"
timestamp: 2026-11-20 17:12:02
status: done
source: orchestrator
tags: [workflow]
facets:
  project: claude
  project_path: D:/01_programovani/claude
spai_symbol: 'x'
lang: en
title_cs: "agent-wait.sh rozhoduje o stavu 'done' na základě přepisu workeru (poslední zpráva asistenta s stop_reason end_turn), nikoliv pouze z panelu"
done_evidence: "18cd77a, unittest OK, live smoke 40s turn -> 49 s"
---

# SPAI-011: agent-wait.sh decides 'done' from the worker's transcript (last assistant message with stop_reason end_turn), not only from the pane

x agent-wait.sh decides 'done' from the worker's transcript (last assistant message with stop_reason end_turn), not only from the pane @claude :workflow:

Source: agy observer 2026-11-20, verified: SPAI-011 wait ended 20 s after the prompt before the coder wrote anything; sleep 30 is a patch. Canonical script: D:/01_programovani/claude/scripts/agent-wait.sh.

## Log
- 2026-11-22 18:08 (orchestrator) Brief for the coder (orchestrator 2026-11-22):

  ```
  WORKDIR         D:/01_programovani/claude-wait (claude repo, branch fix/agent-wait)
  ALLOWED_PATHS   scripts/agent-wait.sh, scripts/tests/ (new tests), docs/herdr-orchestrace.md (Čekání a kontrola)
  GATE            bash -n scripts/agent-wait.sh; python -m unittest discover -s scripts/tests -q
  HARD_CONSTRAINTS git read-only; transcripts read-only; no herdr server changes.
  ```

  ## Scope
  1. agent-wait.sh <pane> returns only when the worker's turn is really over: find the worker's transcript (herdr agent get <pane> -> agent_session id + cwd -> ~/.claude/projects/<cwd-slug>/<sid>.jsonl, same as scripts/kolega-sessions.sh) and wait until the last assistant message has stop_reason end_turn AND it is newer than the prompt that started the wait (record the transcript line count / last timestamp at start), AND herdr status is idle/done. Also return on blocked (dialog) immediately with a clear line "blocked: <pane>". Keep the panel-text fallback when no transcript is found (non-Claude agents), and drop any fixed sleep patch.
  2. Output one line: "done <pane> <transcript>:<line>" or "blocked <pane>" or "timeout <pane>"; exit codes 0 / 2 / 1.
  3. Tests with a fake transcript and a stub herdr: no early return when a new end_turn line is missing; returns after an end_turn appended later; blocked returns immediately; fallback path.

  ## SMOKE
  1. Start a real coder in a scratch repo, send a prompt that takes > 30 s; run agent-wait.sh right after the prompt: it must not return before the coder's final message (compare times with the transcript).
  2. Dialog case: a prompt that triggers a permission dialog -> "blocked".
  Commit proposal: fix(agent-wait): konec tahu podle přepisu agenta (end_turn), ne jen podle panelu
- 2026-11-22 18:10 (orchestrator) session 54c6b8f6-3de6-4297-87b1-67c597902bd8 pane w2J:p2D transcript C:/Users/jaroslav/.claude/projects/D--01-programovani-claude-wait/54c6b8f6-3de6-4297-87b1-67c597902bd8.jsonl
- 2026-11-22 18:10 (orchestrator) orchestrator session ffe01966-1e2f-4b82-b29b-28c254f3953e transcript C:/Users/jaroslav/.claude/projects/D--01-programovani-claude/ffe01966-1e2f-4b82-b29b-28c254f3953e.jsonl
- 2026-11-22 18:25 (orchestrator) done: 18cd77a, unittest OK, live smoke 40s turn -> 49 s
