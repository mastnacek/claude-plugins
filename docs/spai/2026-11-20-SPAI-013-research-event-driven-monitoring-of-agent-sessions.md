---
type: Note
title: "Research: event-driven monitoring of agent sessions (for the kolega observer) and pi packages"
timestamp: 2026-11-20 17:32:38
status: done
source: orchestrator
tags: [agent, coder, research, workflow]
facets:
  project: claude
  project_path: D:/01_programovani/claude
spai_symbol: 'x'
lang: en
title_cs: "Výzkum: monitorování sezení agentů řízené událostmi (pro kolega observer) a balíčky pi"
done_evidence: "docs/research/2026-11-20-kolega-udalosti.md; herdr events and key repos verified by orchestrator"
---

# SPAI-013: Research: event-driven monitoring of agent sessions (for the kolega observer) and pi packages

x Research: event-driven monitoring of agent sessions (for the kolega observer) and pi packages @claude :agent:coder:research:workflow:

Read-only research, change no repository. Write the result to C:/Users/jaroslav/AppData/Local/Temp/claude/ea3dc87168f08f14/ffe01966-1e2f-4b82-b29b-28c254f3953e/scratchpad/kolega-research.md and reply only 'hotovo' and the path.

## Context
Our observer 'kolega' (agy, read-only) watches the orchestrator and worker sessions (Claude Code transcripts ~/.claude/projects/<slug>/<session>.jsonl, panes in the herdr multiplexer). Today a watcher script pings it every 10 minutes (D:/01_programovani/claude/scripts/kolega-watch.sh, kolega-sessions.sh). The user wants it to follow sessions continuously by their real activity: end of a turn, a tool call, an error, a blocked dialog, a finished subagent - not a timer.

## Do
1. GitHub via gh (gh search repos '<query>' --sort stars --limit 20 --json fullName,stargazersCount,description,updatedAt,url; and gh search code where useful). Queries at least: claude code hooks monitor / claude code session observability / claude code transcript watcher / agent activity monitor / claude code Stop hook notify / multi agent supervisor claude / tmux agent monitor / herdr plugin / pi agent extension / codex session monitor / agent telemetry dashboard. Prefer repos updated in 2026.
2. Read the official Claude Code hooks docs (events Stop, SubagentStop, Notification, PreToolUse, PostToolUse, SessionStart/End; how a hook can call a script) and the herdr CLI help (herdr agent wait, herdr agent list states, herdr notification, herdr plugin events) - which events can trigger our watcher without polling.
3. pi packages: fetch https://pi.dev/packages, list the most popular / relevant packages (monitoring, supervision, multi-agent, memory, tasks, review, safety), with what idea is worth copying.
4. Top ~10 monitoring/observability tools or plugins (name, URL, stars from gh, one line, idea for kolega) and top ~10 pi packages.
5. End with a concrete recommended design for kolega's trigger: which events (Claude Code hooks? herdr agent state? transcript file growth with end_turn?), debounce, how to avoid flooding agy, and how it covers orchestrator, coder, tester and fable at once. 8-12 ranked bullets, each with its source.
Facts verifiable (stars from gh, real URLs); mark unverified. Max ~250 lines.

## Log
- 2026-11-20 17:35 (orchestrator) User addition: also herdr plugins (https://herdr.dev/tui/plugins/, gh topic herdr-plugin) and herdr plugin events (agent state changes) as a possible event-driven trigger for kolega.
- 2026-11-20 17:37 (orchestrator) done: docs/research/2026-11-20-kolega-udalosti.md; herdr events and key repos verified by orchestrator
