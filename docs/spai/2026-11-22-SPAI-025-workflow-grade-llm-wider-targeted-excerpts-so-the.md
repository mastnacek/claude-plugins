---
type: Todo
title: "workflow-grade --llm: wider, targeted excerpts so the Sonnet grader matches the Fable reference"
timestamp: 2026-11-22 19:41:35
status: done
source: orchestrator
tags: [agent, coder, workflow]
facets:
  project: claude
  project_path: D:/01_programovani/claude
spai_symbol: 'x'
lang: en
title_cs: "workflow-grade --llm: širší, cílené výňatky, aby grader Sonnet odpovídal referenci Fable"
blocked_by: [SPAI-024]
done_evidence: "merged, 61 tests, live calibration 5/8 no false met"
---

# SPAI-025: workflow-grade --llm: wider, targeted excerpts so the Sonnet grader matches the Fable reference

x workflow-grade --llm: wider, targeted excerpts so the Sonnet grader matches the Fable reference @claude :agent:coder:workflow:

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

## Log
- 2026-11-22 19:47 (orchestrator) session 5106cc1e-5e50-4f43-bac8-4ff283f30fc9 pane w2J:p2D transcript C:/Users/jaroslav/.claude/projects/D--01-programovani/5106cc1e-5e50-4f43-bac8-4ff283f30fc9.jsonl
- 2026-11-22 19:47 (orchestrator) orchestrator session ffe01966-1e2f-4b82-b29b-28c254f3953e transcript C:/Users/jaroslav/.claude/projects/D--01-programovani-claude/ffe01966-1e2f-4b82-b29b-28c254f3953e.jsonl
- 2026-11-22 19:55 (orchestrator) Orchestrator review (live calibration, real Sonnet): 5/8 AGREE, target 7/8. Not merged.
  - K07 SPAI-008: llm=met, reference=not_met (wrong direction). Likely cause: the grader has Read/Grep/Glob and judged today's repo (herdr AGENTS.md got the NO_GIT_GUARD off-switch later, in SPAI-024), not the state at task time. Fix: run the grader with no tools at all (judge only from the excerpts; check `claude --help` for the exact flag, e.g. --tools "" or --allowedTools with an empty list plus --disallowedTools Read,Grep,Glob,Bash) and say so in the prompt: "Judge only from the excerpts; the repository today may differ."
  - K05 SPAI-011: llm=unknown, reference=na. Prompt rule: if the excerpts contain the orchestrator's review (gate run, live smoke) and no spai log entry with a defect, the trigger did not happen -> na, not unknown.
  - K03 SPAI-011: llm=unknown, reference=not_met. Give the grader the brief's ## SMOKE steps as a numbered list and require one line per step: which excerpt line shows it run live, or "not run". If any functional step is "not run" -> not_met.
  - K05 SPAI-008 excerpt only 375 chars: find out why (orchestrator transcript anchors for that task) and fix.
  Rerun only with the stub; the orchestrator reruns the live calibration.
- 2026-11-22 20:00 (orchestrator) done: merged, 61 tests, live calibration 5/8 no false met
