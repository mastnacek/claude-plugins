---
type: Note
title: "Run fast checks (clippy, lint, types) before slow tests in the gate"
timestamp: 2026-11-20 15:39:41
status: note
source: orchestrator
tags: [workflow]
facets:
  project: claude
  project_path: D:/01_programovani/claude
spai_symbol: '-'
lang: en
title_cs: "Spustit rychlé kontroly (clippy, lint, typy) před pomalými testy v bráně"
---

# SPAI-002: Run fast checks (clippy, lint, types) before slow tests in the gate

- Run fast checks (clippy, lint, types) before slow tests in the gate @claude :workflow:

Source: agy observer, SPAI-005 @anon (programmer ran cargo test 14 times, ~19 s each in debug). Applied in prompts/coder.md (bee2e19).
