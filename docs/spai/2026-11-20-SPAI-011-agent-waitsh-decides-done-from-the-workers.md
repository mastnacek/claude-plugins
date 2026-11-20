---
type: Todo
title: "agent-wait.sh decides 'done' from the worker's transcript (last assistant message with stop_reason end_turn), not only from the pane"
timestamp: 2026-11-20 17:12:02
status: todo
source: orchestrator
tags: [workflow]
facets:
  project: claude
  project_path: D:/01_programovani/claude
spai_symbol: '.'
lang: en
title_cs: "agent-wait.sh rozhoduje o stavu 'done' na základě přepisu workeru (poslední zpráva asistenta s stop_reason end_turn), nikoliv pouze z panelu"
---

# SPAI-011: agent-wait.sh decides 'done' from the worker's transcript (last assistant message with stop_reason end_turn), not only from the pane

. agent-wait.sh decides 'done' from the worker's transcript (last assistant message with stop_reason end_turn), not only from the pane @claude :workflow:

Source: agy observer 2026-11-20, verified: SPAI-011 wait ended 20 s after the prompt before the coder wrote anything; sleep 30 is a patch. Canonical script: D:/01_programovani/claude/scripts/agent-wait.sh.
