---
type: Todo
title: "workflow-grade --llm: wider, targeted excerpts so the Sonnet grader matches the Fable reference"
timestamp: 2026-11-22 19:41:35
status: todo
source: orchestrator
tags: [agent, coder, workflow]
facets:
  project: claude
  project_path: D:/01_programovani/claude
spai_symbol: '.'
lang: en
title_cs: "workflow-grade --llm: širší, cílené výňatky, aby grader Sonnet odpovídal referenci Fable"
blocked_by: [SPAI-024]
---

# SPAI-025: workflow-grade --llm: wider, targeted excerpts so the Sonnet grader matches the Fable reference

. workflow-grade --llm: wider, targeted excerpts so the Sonnet grader matches the Fable reference @claude :agent:coder:workflow:

Calibration result SPAI-023 @claude: Sonnet agreed with Fable on 4/8 rows; every difference was Sonnet "unknown" because "the excerpt doesn't show …" (merge order, SMOKE runs, hook tests, coder transcript missing). Reference: the Fable grades are saved by the orchestrator as docs/workflow-hodnoceni/reference/fable-SPAI-011-008.jsonl (it will be added to the worktree before you start).

```
WORKDIR         D:/01_programovani/claude-excerpt (claude repo, branch feat/grade-excerpts), after the off-switch task is merged
ALLOWED_PATHS   scripts/workflow-grade.py, scripts/tests/
GATE            python -m unittest discover -s scripts/tests -q (no pipes hiding exit codes)
HARD_CONSTRAINTS no real model calls (stub only); you must not start agents or model processes; never modify docs/workflow-klic.toml or prompts/.
```

## Scope
1. Excerpt selection per llm row, anchored on events found by the script rows: the merge line, the last GATE run, every live run after the agent's "done" (herdr agent prompt / pane run / binary runs) up to the merge, new or changed files under .claude/hooks or guard code in the diff, spai log entries of the task. Include ±15 lines around each anchor, all with line refs; keep the 60k cap by trimming tool_result bodies first.
2. Coder transcript: when the task log has no coder session line (older tasks), fall back to the newest transcript in ~/.claude/projects/<slug of the WORKDIR from the brief>/ whose first user message mentions the task id.
3. Tests with fake transcripts for each anchor type and the fallback.

## SMOKE (orchestrator)
python scripts/workflow-grade.py SPAI-011 and SPAI-008 --project D:/01_programovani/claude --llm --hand <reference> -> at least 7 of 8 AGREE.
Commit proposal: feat(workflow): targeted excerpts for the llm grader
