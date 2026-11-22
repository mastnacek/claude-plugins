---
type: Todo
title: "Agents announce done/blocked to the orchestrator themselves (Stop + Notification hook); kolega announces fundamental findings"
timestamp: 2026-11-22 22:01:39
status: done
source: claude-code
tags: [agent, coder, workflow, kolega]
facets:
  project: claude
  project_path: D:/01_programovani/claude
spai_symbol: 'x'
lang: en
title_cs: "Agenti sami oznamují dokončení/zablokování orchestrátorovi (Stop + notifikační hook); kolega oznamuje zásadní zjištění"
pending: [embed]
done_evidence: "1a50559; unittest 93 OK; SMOKE: coder with ORCH_PANE sent DONE into orchestrator pane without agent-wait (text then mangled by translate, see SPAI-029)"
---

# SPAI-028: Agents announce done/blocked to the orchestrator themselves (Stop + Notification hook); kolega announces fundamental findings

x Agents announce done/blocked to the orchestrator themselves (Stop + Notification hook); kolega announces fundamental findings @claude :agent:coder:workflow:kolega:

Decided with the user 2026-11-22. Today the orchestrator learns that a coder or tester finished only through scripts/agent-wait.sh running in the background, which it must remember to start. The agent should signal it itself; kolega should signal only fundamental findings.

```
WORKDIR         D:/01_programovani/claude (worktree from the orchestrator)
ALLOWED_PATHS   .claude/hooks/agent-notify.sh (new), scripts/tests/test_agent_notify.py (new), scripts/agent.sh, scripts/kolega.sh, docs/herdr-orchestrace.md
GATE            python -m unittest discover -s scripts/tests -v; bash -n .claude/hooks/agent-notify.sh (no pipes hiding exit codes). bash -n of agent.sh / kolega.sh is denied to you by agent-no-spawn (known false positive): the orchestrator runs it; say so in the report.
HARD_CONSTRAINTS a notification never blocks or fails the agent's turn (hook always exits 0, short timeout); no loops; tests use a fake herdr (HERDR_BIN) and made-up transcripts only; git read-only; you must not start agents, claude sessions or herdr panes.
```

## Scope
1. `.claude/hooks/agent-notify.sh` (stdin = Claude Code hook JSON), active only when CC_ROLE is set and ORCH_PANE is set:
   - `Stop` event (skip when `stop_hook_active` is true): role coder|tester → send `DONE <role> <HERDR_PANE_ID>: <first line of the last assistant text, ≤160 chars>`; if that text starts with or contains a line `BLOCKED:` → send `BLOCKED <role> <pane>: <that line>` instead.
   - role kolega: only when this turn (transcript lines after the last user message) ran `spai add` whose text has `:fundamental:` → `INSIGHT <SPAI ID from the spai add JSON result> @jaroslav: <title>`; otherwise nothing.
   - `Notification` event (permission or idle prompt, coder|tester only) → `WAITING <role> <pane>: <message>`.
   - Delivery: `"$HERDR_BIN" agent prompt "$ORCH_PANE" "<text>"` (no --wait) and `"$HERDR_BIN" notification show "<role>" --body "<text>" --sound done` (request sound for BLOCKED/WAITING/INSIGHT). HERDR_BIN defaults to `herdr`. Each call bounded (timeout ~5 s), errors to a log in TEMP, exit 0 always.
2. `scripts/agent.sh`: add Stop and Notification entries for agent-notify.sh to the merged `--settings`; pass `ORCH_PANE` through from the caller's env (orchestrator sets it when starting the agent); without ORCH_PANE the hook is silent.
3. `scripts/kolega.sh`: same Stop entry in kolega's merged settings; ORCH_PANE = the caller's `ORCH_PANE`, else the caller's HERDR_PANE_ID when kolega.sh is run from the orchestrator pane (not from agent.sh inside a coder pane: there use ORCH_PANE only).
4. docs/herdr-orchestrace.md: starting an agent with `$env:ORCH_PANE='<orchestrator pane>'`; message formats; agent-wait.sh stays as the fallback for agents without the hook (pi, agy).

## Tests
Fake herdr records argv. Cases: coder Stop → DONE text and toast; BLOCKED line → BLOCKED; stop_hook_active → nothing; no CC_ROLE or no ORCH_PANE → nothing; kolega turn with `spai add … :fundamental:` → INSIGHT with the ID from the result; kolega turn with `:medium:` → nothing; Notification → WAITING; herdr failing or hanging → exit 0 within the timeout.

## SMOKE (orchestrator)
After merge: start a coder with ORCH_PANE set, prompt "reply OK"; a `DONE coder <pane>: OK` message arrives in the orchestrator pane and a toast shows, without agent-wait.sh. Kolega INSIGHT is covered by the fixture test (no fake fundamental finding in the real backlog).
Commit proposal: feat(orchestrace): agents announce done/blocked, kolega fundamental insights (Stop hook)

## Log
- 2026-11-22 22:05 (orchestrator) session 59a99e5d-8f41-4b53-b52b-b6444ffda9cc pane w2J:p2Q transcript C:/Users/jaroslav/.claude/projects/D--01-programovani-claude-notify/59a99e5d-8f41-4b53-b52b-b6444ffda9cc.jsonl
- 2026-11-22 22:05 (orchestrator) orchestrator session ffe01966-1e2f-4b82-b29b-28c254f3953e transcript C:/Users/jaroslav/.claude/projects/D--01-programovani-claude/ffe01966-1e2f-4b82-b29b-28c254f3953e.jsonl
- 2026-11-22 22:12 (spai) done: 1a50559; unittest 93 OK; SMOKE: coder with ORCH_PANE sent DONE into orchestrator pane without agent-wait (text then mangled by translate, see SPAI-029)
