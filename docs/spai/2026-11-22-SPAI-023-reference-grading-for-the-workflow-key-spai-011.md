---
type: Todo
title: "Reference grading for the workflow key: SPAI-011 and SPAI-008 @claude, rows K03 K05 K07 K09"
timestamp: 2026-11-22 19:25:56
status: done
source: orchestrator
tags: [agent, fable, workflow]
facets:
  project: claude
  project_path: D:/01_programovani/claude
spai_symbol: 'x'
lang: en
title_cs: "Referenční hodnocení pro klíč workflow: SPAI-011 a SPAI-008 @claude, řádky K03 K05 K07 K09"
done_evidence: "Fable reference grades saved; 4/8 agreement"
---

# SPAI-023: Reference grading for the workflow key: SPAI-011 and SPAI-008 @claude, rows K03 K05 K07 K09

x Reference grading for the workflow key: SPAI-011 and SPAI-008 @claude, rows K03 K05 K07 K09 @claude :agent:fable:workflow:

Read-only. Do not edit files, no git writes, start no processes. Answer in English.

Purpose: calibrate the one-shot Sonnet grader (scripts/workflow-grade.py --llm). You are the independent reference grader; the user delegated this to you.

Inputs:
- Key: D:/01_programovani/claude/docs/workflow-klic.toml (rows K03, K05, K07, K09: read trigger, required, evidence).
- Tasks: SPAI-011 and SPAI-008 in D:/01_programovani/claude/docs/spai/ (briefs and ## Log; the log names the coder transcripts via "session … transcript …").
- Orchestrator transcript: C:/Users/jaroslav/.claude/projects/D--01-programovani-claude/ffe01966-1e2f-4b82-b29b-28c254f3953e.jsonl (huge: use Grep with -n for SPAI-011 / SPAI-008 / agent-wait / git-guard / herdr-git / merge, then Read small ranges; work from roughly line 13900 to 14800).
- Coder transcripts: newest *.jsonl in C:/Users/jaroslav/.claude/projects/D--01-programovani-claude-wait/ and D--01-programovani-herdr-git/.

Known context (verify, do not trust): during SPAI-011 the coder started test agents for the SMOKE (the orchestrator's brief told it to, which was the orchestrator's mistake); the orchestrator then stopped it, added the agent-no-spawn hook, and ran the SMOKE itself (40 s turn -> agent-wait returned after 49 s). For SPAI-008 the orchestrator ran the live SMOKE in a restarted coder session (git rm -n --cached denied, git status allowed).

Deliver exactly one JSON line per task and row (8 lines), nothing else in that block:
{"task":"SPAI-011","row":"K03","verdict":"met|not_met|na","evidence":"<transcript>:<line>","note":"<one sentence>"}
Then at most 5 lines of comments on rows where the key itself is ambiguous.

## Log
- 2026-11-22 19:42 (orchestrator) done: Fable reference grades saved; 4/8 agreement
