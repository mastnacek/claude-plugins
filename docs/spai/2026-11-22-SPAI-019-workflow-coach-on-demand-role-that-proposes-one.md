---
type: Todo
title: "Workflow coach: on-demand role that proposes ONE change to prompts/docs from the graded not_met rows"
timestamp: 2026-11-22 18:05:17
status: todo
source: orchestrator
tags: [agent, coder, workflow]
facets:
  project: claude
  project_path: D:/01_programovani/claude
spai_symbol: '.'
lang: en
title_cs: "Workflow coach: role na vyžádání, která navrhuje JEDNU změnu v prompts/docs na základě hodnocených řádků not_met"
blocked_by: [SPAI-018]
---

# SPAI-019: Workflow coach: on-demand role that proposes ONE change to prompts/docs from the graded not_met rows

. Workflow coach: on-demand role that proposes ONE change to prompts/docs from the graded not_met rows @claude :agent:coder:workflow:

Plan step 7 from the Fable review SPAI-016 @claude. Start only after the LLM grader (previous task) is calibrated AND at least 10 tasks are graded in docs/workflow-hodnoceni/.

Design (from the review): the coach runs on demand with a strong model (Opus), read-only tools; input = not_met rows of recent graded tasks with evidence, the key, the target file; output = one draft prompts/versions/<date>-<change>.md with header status, target, base (commit), the diff, and a prediction made in advance (e.g. "K03: 3/5 -> at most 1/5"). It never edits live prompts, the key or kolega; the calling script writes the file. The user approves; the orchestrator applies and commits. Evaluation: one change in play at a time; metric = not_met share of the target row on the next 5 occurrences of its trigger vs the previous 5; a missed prediction reverts the change. Old versions are kept by git.

Done-criterion: one draft with a prediction, the user decided, the outcome after 5 occurrences recorded in the draft.
