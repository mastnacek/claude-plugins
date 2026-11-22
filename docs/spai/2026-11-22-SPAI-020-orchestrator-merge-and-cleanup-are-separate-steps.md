---
type: Note
title: "Orchestrator: merge and cleanup are separate steps; check the merge result (git status, log) before worktree remove --force and branch -d"
timestamp: 2026-11-22 18:48:52
status: note
source: orchestrator
tags: [workflow]
facets:
  project: claude
  project_path: D:/01_programovani/claude
spai_symbol: '-'
lang: en
title_cs: "Orchestrator: merge a cleanup jsou samostatné kroky; před worktree remove --force a branch -d zkontrolujte výsledek merge (git status, log)"
---

# SPAI-020: Orchestrator: merge and cleanup are separate steps; check the merge result (git status, log) before worktree remove --force and branch -d

- Orchestrator: merge and cleanup are separate steps; check the merge result (git status, log) before worktree remove --force and branch -d @claude :workflow:

Source: kolega (Sonnet) 2026-11-22, verified in the orchestrator transcript: SPAI-008 merge, worktree remove --force, branch -d, spai set done, grading, commit and push ran in one chained command; a merge conflict would not have stopped the cleanup.
