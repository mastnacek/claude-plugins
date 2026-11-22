---
type: Todo
title: "Scripts changed by the orchestrator get a live run before commit (kolega.sh dialog loop committed after bash -n only)"
timestamp: 2026-11-22 18:49:21
status: todo
source: orchestrator
tags: [workflow]
facets:
  project: claude
  project_path: D:/01_programovani/claude
spai_symbol: '.'
lang: en
title_cs: "Skripty změněné orchestrátorem projdou před commit živým spuštěním (dialogová smyčka kolega.sh commitnuta až po bash -n)"
---

# SPAI-021: Scripts changed by the orchestrator get a live run before commit (kolega.sh dialog loop committed after bash -n only)

. Scripts changed by the orchestrator get a live run before commit (kolega.sh dialog loop committed after bash -n only) @claude :workflow:

Source: kolega (Sonnet) 2026-11-22, verified: commit 4a59dc5 changed the kolega.sh start-dialog loop and was committed after bash -n only; the running kolega had been started by hand. SMOKE applies to the orchestrator's own scripts too. Action now: close the kolega pane and run scripts/kolega.sh from scratch once to prove the loop; note the assumption that "Yes" is below "No, exit" in the loop comment.
