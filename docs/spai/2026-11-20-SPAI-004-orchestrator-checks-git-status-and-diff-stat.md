---
type: Note
title: "Orchestrator checks git status and diff --stat before committing an agent's worktree"
timestamp: 2026-11-20 15:40:23
status: note
source: orchestrator
tags: [workflow]
facets:
  project: claude
  project_path: D:/01_programovani/claude
spai_symbol: '-'
lang: en
title_cs: "Orchestrator kontroluje stav git a diff --stat před commitnutím worktree agenta"
---

# SPAI-004: Orchestrator checks git status and diff --stat before committing an agent's worktree

- Orchestrator checks git status and diff --stat before committing an agent's worktree @claude :workflow:

Source: agy observer (next.sh used git add -A blindly). next.sh stops on files outside ALLOWED_PATHS; rule in docs/herdr-orchestrace.md (bee2e19).
