---
type: Todo
title: "Workflow grading: one-shot Sonnet grader for the llm rows of the key (K03, K05, K07, K09)"
timestamp: 2026-11-22 18:05:08
status: todo
source: orchestrator
tags: [agent, coder, workflow]
facets:
  project: claude
  project_path: D:/01_programovani/claude
spai_symbol: '.'
lang: en
title_cs: "Hodnocení workflow: one-shot Sonnet grader pro llm řádky klíče (K03, K05, K07, K09)"
---

# SPAI-018: Workflow grading: one-shot Sonnet grader for the llm rows of the key (K03, K05, K07, K09)

. Workflow grading: one-shot Sonnet grader for the llm rows of the key (K03, K05, K07, K09) @claude :agent:coder:workflow:

Plan step 5 from the Fable review SPAI-016 @claude. Builds on scripts/workflow-grade.py (SPAI-017) and docs/workflow-klic.toml.

```
WORKDIR         new worktree of the claude repo (branch feat/workflow-llm)
ALLOWED_PATHS   scripts/**, docs/herdr-orchestrace.md, docs/workflow-hodnoceni/
GATE            python -m unittest discover -s scripts/tests -q; bash -n on changed .sh
HARD_CONSTRAINTS never modify docs/workflow-klic.toml or prompts/; transcripts read-only; the grader runs read-only (claude -p --model sonnet --allowedTools Read,Grep,Glob, no write tools); its output is written by the calling script.
```

## Scope
1. workflow-grade.py --llm: for rows check="llm" builds a compact excerpt per row (only the relevant transcript ranges found by the script rows, capped), runs one claude -p call per task (Sonnet) with the key rows and excerpts, requires strict JSON per row {row, verdict met|not_met|na|unknown, evidence:[{transcript,line}], note}; not_met without an evidence line is rejected (row becomes unknown with note).
2. Calibration (done-criterion): the user grades two tasks by hand (the orchestrator will collect it); the LLM verdicts must match on those two before the grader is trusted; report agreement per row.
3. Tests with a stub claude binary (no real model call in tests).

## SMOKE
1. python scripts/workflow-grade.py SPAI-037 --project D:/01_programovani/anon --llm -> table where K03/K05/K07/K09 have met/not_met/na with transcript lines (real Sonnet call, once).
2. A not_met without evidence from the stub -> becomes unknown.
Commit proposal: feat(workflow): hodnocení úsudkových řádků klíče jednorázovým Sonnetem
