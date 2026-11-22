---
type: Todo
title: "task-link.sh recorded a stale coder transcript for SPAI-008 (claude-wait session instead of the herdr-git one)"
timestamp: 2026-11-22 18:49:51
status: done
source: orchestrator
tags: [workflow, bug]
facets:
  project: claude
  project_path: D:/01_programovani/claude
spai_symbol: 'x'
lang: en
title_cs: "task-link.sh zaznamenal zastaralý přepis kodéra pro SPAI-008 (sezení claude-wait namísto herdr-git)"
done_evidence: "task-link waits for newer transcript; call after prompt"
---

# SPAI-022: task-link.sh recorded a stale coder transcript for SPAI-008 (claude-wait session instead of the herdr-git one)

x task-link.sh recorded a stale coder transcript for SPAI-008 (claude-wait session instead of the herdr-git one) @claude :workflow:bug:

Source: kolega (Sonnet) 2026-11-22. task-link ran right after the coder restart; the herdr agent_session id may still point to the previous session. Fix: resolve the transcript after the agent's first turn of the new session (or match cwd of the transcript to the pane cwd), and verify the path exists and is newer than the prompt. Also the orchestrator-only-git hook now exists twice (claude repo and herdr monorepo, extended copy from 29294f1): pick one shared implementation so they do not drift.

## Log
- 2026-11-22 18:53 (orchestrator) done: task-link waits for newer transcript; call after prompt
