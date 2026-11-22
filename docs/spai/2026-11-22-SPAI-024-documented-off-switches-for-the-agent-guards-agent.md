---
type: Todo
title: "Documented off-switches for the agent guards (agent-no-spawn, herdr git guard)"
timestamp: 2026-11-22 19:41:20
status: done
source: orchestrator
tags: [agent, coder, workflow]
facets:
  project: claude
  project_path: D:/01_programovani/claude
spai_symbol: 'x'
lang: en
title_cs: "Zdokumentovány vypínače pro ochranné mechanismy agenta (agent-no-spawn, herdr git guard)"
done_evidence: "claude+herdr merged, live smoke: switch allows, default denies"
---

# SPAI-024: Documented off-switches for the agent guards (agent-no-spawn, herdr git guard)

x Documented off-switches for the agent guards (agent-no-spawn, herdr git guard) @claude :agent:coder:workflow:

Fix for key row K07 (Fable reference grading SPAI-023): both new guards lack a documented way to disable them for a fix session, which is how SPAI-025 @anon (a guard blocking its own fix) happened.

```
WORKDIR         D:/01_programovani/claude-guardoff (claude repo, branch feat/guard-off) — plus a herdr worktree D:/01_programovani/herdr-guardoff (branch agent/guard-off) for the herdr hook
ALLOWED_PATHS   claude: .claude/hooks/agent-no-spawn.sh, scripts/agent.sh, scripts/tests/, docs/herdr-orchestrace.md ; herdr: .claude/hooks/**, AGENTS.md
GATE            claude: python -m unittest discover -s scripts/tests -q ; herdr: bash .claude/hooks/test-orchestrator-only-git.sh ; bash -n on changed .sh (no pipes hiding exit codes)
HARD_CONSTRAINTS git read-only; you must not start agents or panes; the switch must be read from the hook process environment (set when the agent session is started), never from the command text, so an agent cannot turn it off itself.
```

## Scope
1. agent-no-spawn.sh: exit 0 when NO_AGENT_GUARD=1 is in the hook's environment. agent.sh passes it through when the orchestrator starts an agent with `NO_AGENT_GUARD=1 agent.sh coder`. A command like `NO_AGENT_GUARD=1 claude -p x` from the agent must still be denied (test it).
2. herdr orchestrator-only-git hook: same with NO_GIT_GUARD=1 (and its test script).
3. Document both switches in docs/herdr-orchestrace.md (claude) and AGENTS.md (herdr): when to use (only for a session that fixes the guard itself), who sets it (orchestrator at agent start), and that it is never set by default.
4. Tests for: switch set in env -> allowed; switch only in command text -> denied; default -> denied.

## SMOKE (orchestrator runs the live part)
- coder: unit tests above.
- orchestrator: start a coder with NO_AGENT_GUARD=1 agent.sh coder -> `herdr pane list` allowed and `claude -p hi` allowed (then not executed further); start a normal coder -> denied; in the normal coder `NO_AGENT_GUARD=1 claude -p hi` -> denied.
Commit proposal: feat(orchestrace): documented off-switches for the agent guards

## Log
- 2026-11-22 19:42 (orchestrator) session ccae8e2f-e57d-47b3-aa5e-7959977a6d90 pane w2J:p2D transcript C:/Users/jaroslav/.claude/projects/D--01-programovani/ccae8e2f-e57d-47b3-aa5e-7959977a6d90.jsonl
- 2026-11-22 19:42 (orchestrator) orchestrator session ffe01966-1e2f-4b82-b29b-28c254f3953e transcript C:/Users/jaroslav/.claude/projects/D--01-programovani-claude/ffe01966-1e2f-4b82-b29b-28c254f3953e.jsonl
- 2026-11-22 19:47 (orchestrator) done: claude+herdr merged, live smoke: switch allows, default denies
