---
type: Todo
title: "Event-driven kolega: herdr plugin + watcher, near real time, agent-agnostic"
timestamp: 2026-11-20 17:45:14
status: done
source: orchestrator
tags: [agent, coder, kolega, workflow]
facets:
  project: claude
  project_path: D:/01_programovani/claude
spai_symbol: 'x'
lang: en
title_cs: "Event-driven kolega: herdr plugin + watcher, téměř v reálném čase, agent-agnostic"
done_evidence: "herdr-kolega merged and running (event watcher)"
---

# SPAI-014: Event-driven kolega: herdr plugin + watcher, near real time, agent-agnostic

x Event-driven kolega: herdr plugin + watcher, near real time, agent-agnostic @claude :agent:coder:kolega:workflow:

Design approved by the user 2026-11-20. Research: D:/01_programovani/claude/docs/research/2026-11-20-kolega-udalosti.md (read it first).

```
WORKDIR         D:/01_programovani/herdr-kolega/plugins/herdr-kolega (new plugin in a worktree of the herdr monorepo, branch feat/kolega)
                + D:/01_programovani/claude (scripts/kolega*.sh, prompts/kolega.md, docs/herdr-orchestrace.md) - edit only those files there
SCRATCH         C:/Users/jaroslav/AppData/Local/Temp/claude/ea3dc87168f08f14/ffe01966-1e2f-4b82-b29b-28c254f3953e/scratchpad
GATE            plugin: cargo clippy --all-targets -- -D warnings; cargo test; cargo build --release; herdr_validate_manifest; files <= 400 lines
                claude scripts: bash -n on every script; a dry run in SCRATCH
HARD_CONSTRAINTS Read the herdr-plugin-dev skill first (Rust + VSA, manifest rules, never write to HERDR_PLUGIN_ROOT, state in HERDR_PLUGIN_STATE_DIR). Git read-only. Do not link/install the plugin into the running herdr and do not touch the running kolega panes - the orchestrator does that after review.
```

## How it works (user's words, simplified)
1. herdr emits an event whenever any agent changes state (working, blocked, done, idle) or a pane with an agent appears or exits.
2. The plugin (one Rust binary, subcommand `event`) appends one line to a queue file in HERDR_PLUGIN_STATE_DIR: time, pane, agent, status. Nothing else; fast.
3. The watcher (same binary, subcommand `watch --pane <kolega>`, long running, in the small pane 'kolega-hlídač') follows the queue file without polling sleeps of minutes (file notify or a short tail loop <= 1 s), groups bursts (debounce 3-5 s, configurable), sends 'blocked' immediately.
4. Before sending it waits until the kolega pane is ready: herdr agent wait <kolega> --until idle,done (works for agy, pi and claude).
5. The prompt says per session: role, pane, transcript path, line range to read (cursor per transcript; first time last 400 lines), and why (turn done, blocked, error, new session, session ended). Session discovery as scripts/kolega-sessions.sh does (herdr agent_session id -> ~/.claude/projects/<slug>/<id>.jsonl); for non-Claude agents give pane id and say to use herdr agent read.
6. Ignore the kolega pane's own events (no self-trigger loop).
7. Fallback: if no event for 60 min but transcripts grew, send one prompt.

## Manifest
[[events]] on pane.agent_status_changed, pane.agent_detected, pane.exited -> [binary, event]; platforms windows/linux/macos; an action 'start' that runs scripts' equivalent.

## claude repo
- scripts/kolega.sh gets --agent agy|pi|claude (default agy): agy as today (plan mode, deny commands); pi with a model from KOLEGA_PI_MODEL, read-only tools; claude --model haiku with permissions denying Write, Edit, Bash. Starts the plugin watcher instead of kolega-watch.sh when the plugin binary exists; kolega-watch.sh stays as fallback.
- prompts/kolega.md: mention line ranges and reasons in the prompt.
- docs/herdr-orchestrace.md section Kolega updated.

## Tests
Queue append/read, debounce grouping, blocked bypasses debounce, self-events ignored, cursor ranges, fallback timer (fake clock), prompt text. No real herdr calls in tests (trait with a fake).

Commit proposals: feat(herdr-kolega): event-driven observer plugin / feat(orchestrace): kolega --agent and event watcher

## Log
- 2026-11-20 17:52 (orchestrator) User decision: agy hit its limit; default kolega agent = Claude Code with Haiku (read-only via permissions deny Write/Edit/NotebookEdit/Bash), agy and pi stay options.
- 2026-11-22 18:06 (orchestrator) done: herdr-kolega merged and running (event watcher)
