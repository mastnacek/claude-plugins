---
type: Todo
title: "Design review: verifier/coach loop for our herdr orchestration (answer key, kolega as verifier, new coach role)"
timestamp: 2026-11-22 17:32:11
status: done
source: orchestrator
tags: [agent, fable, workflow, design]
facets:
  project: claude
  project_path: D:/01_programovani/claude
spai_symbol: 'x'
lang: en
title_cs: "Design review: verifier/coach smyčka pro naši herdr orchestraci (klíč odpovědí, kolega jako verifier, nová role coach)"
done_evidence: "Fable verdict in pane Fable (rada): key yes (TOML, scripted), smoke scenario first, kolega stays observer, coach later"
---

# SPAI-016: Design review: verifier/coach loop for our herdr orchestration (answer key, kolega as verifier, new coach role)

x Design review: verifier/coach loop for our herdr orchestration (answer key, kolega as verifier, new coach role) @claude :agent:fable:workflow:design:

Read-only design review. Do not edit files, no git writes. Answer in Czech, concise; judge, do not just confirm.

Source idea (user): Stanford-style self-improving agents: Generator (does the work), Verifier (read-only, checks outputs against an answer key and explains why), Coach (proposes ONE change per draft in a versions folder, never touches the answer key, verifier or the live generator), autonomy level 2 (AI proposes, human approves), level 3 only with hard pass/fail tests and max 10 iterations. Overconfidence: in one study 56% of self-claimed improvements did not help.

Our setup (read): D:/01_programovani/claude/docs/herdr-orchestrace.md, claude/prompts/{coder,tester,kolega}.md, claude/scripts/{agent.sh,agent-wait.sh,kolega.sh,kolega-sessions.sh}, herdr plugin D:/01_programovani/herdr/plugins/herdr-kolega (event watcher), SPAI :workflow: notes in D:/01_programovani/claude/docs/spai/, watchdog D:/01_programovani/claude/.claude/watchdog.json and hooks .claude/hooks/. Orchestrator = Claude Opus (talks to the user, writes SPAI briefs, runs gates and live smoke tests, merges); coder = Sonnet in a worktree; tester = Haiku; kolega = Haiku read-only observer prompted by herdr events.

Evidence from recent sessions (2026-11-20..22): the coder reported "done" with green gates three times while live smoke tests by the orchestrator found real bugs (inflected names not masked, image read blocked in the hook chain, data-loss window in vault rekey); a security guard shipped that blocked work on its own fix; kolega produced "nelze posoudit" until it got a system prompt and chunked reading.

Orchestrator's proposal:
1. Answer key docs/workflow-klic.md: table "situation -> correct behaviour" built from those failures and :workflow: notes (e.g. agent says done -> orchestrator runs gate AND live smoke test before merge; brief has done-criteria, allowed paths, gate; new hook/guard -> live session test; slice test plus full-chain test). Each new failure becomes a row.
2. Kolega as verifier: after each finished task, grade the transcripts against the key per row: met / not met / n.a. with transcript line refs; read-only.
3. New role "kouc" (coach): on demand or after 5 tasks, reads kolega's grades and proposes ONE change to prompts/coder.md, tester.md, docs/herdr-orchestrace.md or a script, written only as a draft prompts/versions/<date>-<change>.md (reason, diff, expected effect); never edits live files, the key or kolega. Enforced by a hook on CC_ROLE=kouc (write only to prompts/versions/).
4. Human approval: orchestrator shows the draft, user decides; orchestrator applies, commits, old version kept; kolega checks the following tasks for regression.

Deliver:
A. Verdict: what is worth it, what is overhead, what is missing or wrong (e.g. who verifies the orchestrator itself, conflicts of interest since the orchestrator both verifies and applies; is Haiku enough for kolega/coach; key drift; how to measure "improved").
B. Concrete design adjustments: key format (rows with id, trigger, required behaviour, evidence to look for), grading output format, when kolega grades (event), coach inputs/outputs, permission enforcement (hooks/watchdog with exact paths), how a change is evaluated (before/after on N tasks, which metric), versions layout, where the key lives (canonical claude repo).
C. A staged plan of small tasks with done-criteria (what to build first), each verifiable.
Cite file:line for current code you rely on.

## Log
- 2026-11-22 17:34 (orchestrator) done: Fable verdict in pane Fable (rada): key yes (TOML, scripted), smoke scenario first, kolega stays observer, coach later
