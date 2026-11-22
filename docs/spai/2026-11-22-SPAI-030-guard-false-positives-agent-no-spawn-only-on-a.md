---
type: Todo
title: "Guard false positives: agent-no-spawn only on a real agent start; W29 resolves scratchpad variables and also checks PowerShell"
timestamp: 2026-11-22 23:14:07
status: done
source: claude-code
tags: [agent, coder, workflow, hooks]
facets:
  project: claude
  project_path: D:/01_programovani/claude
spai_symbol: 'x'
lang: en
title_cs: "Ošetření falešných pozitiv: agent-no-spawn pouze při skutečném spuštění agenta; W29 vyřeší proměnné ve scratchpadu a také zkontroluje PowerShell"
pending: [embed]
done_evidence: "a86be51; agent-no-spawn 6 OK, watchdog 130 pass; SMOKE fresh coder: bash -n kolega.sh, cat agent.sh, redirect and mkdir in SCRATCH allowed, bash scripts/agent.sh coder denied"
---

# SPAI-030: Guard false positives: agent-no-spawn only on a real agent start; W29 resolves scratchpad variables and also checks PowerShell

x Guard false positives: agent-no-spawn only on a real agent start; W29 resolves scratchpad variables and also checks PowerShell @claude :agent:coder:workflow:hooks:

From kolega insights SPAI-002 and SPAI-003 @jaroslav (home backlog), verified by the orchestrator 2026-11-22. Rule decided with the user (prompts/coder.md rule 10, commit 7217de0): files in WORKDIR change only via Edit/Write; Bash/PowerShell only run things; output redirects and mkdir only inside SCRATCH.

```
WORKDIR         D:/01_programovani/claude (worktree from the orchestrator)
ALLOWED_PATHS   .claude/hooks/agent-no-spawn.sh, scripts/tests/test_agent_no_spawn.py, plugins/cc-agent-watchdog/** (version 0.3.2, CHANGELOG)
GATE            python -m unittest scripts/tests/test_agent_no_spawn.py -v; from plugins/cc-agent-watchdog: claude plugin validate .; claude plugin test .; scripts/vsa-check.sh; npx -y -p typescript tsc -p . --noEmit (copy .claude-plugin/types from the main checkout if missing; it is gitignored). No pipes hiding exit codes.
HARD_CONSTRAINTS no loosening for real violations: a real agent start stays denied; a write into WORKDIR via shell stays a W29 hit. Tests use made-up paths; git read-only; you must not start agents, claude sessions or herdr panes.
```

## Scope
1. agent-no-spawn.sh (SPAI-002): deny only when a command segment (after splitting on `;`, `&&`, `||`, `|`, newlines, and after `&`, `bash`, `sh`, `exec`, `env VAR=…`, `timeout N`, `cd x &&`) STARTS an agent: claude (except `claude plugin …` / `claude --help`), agy, pi, codex, `herdr agent <start|prompt|send-*>`, `herdr pane <split|run|close|send-*>`, or runs agent.sh / kolega.sh as the program or as the script of bash/sh. Mentions as arguments (`bash -n scripts/kolega.sh`, `cat scripts/agent.sh`, `wc -l`, `rg kolega.sh`, `ls scripts`) are allowed. Keep the NO_AGENT_GUARD env off-switch and the "switch in command text is denied" behaviour.
2. W29 (SPAI-003) in plugins/cc-agent-watchdog (hooks/shared/checks.ts `w29`, `factsOf`, `isScratch`):
   - a write target given through a variable is resolved with the session env: `$SCRATCH`, `$AGENT_SCRATCH`, `$env:AGENT_SCRATCH`, and any shell variable assigned earlier in the same command (`S=/x; … > "$S/log"`); a target that still cannot be resolved is not counted (no hit), a literal or resolved path inside WORKDIR and outside SCRATCH is a hit;
   - PowerShell calls are checked like Bash: `>`, `>>`, `*>`, `Out-File`, `Set-Content`, `Add-Content`, `New-Item -ItemType File`, `Copy-Item`/`Move-Item` into WORKDIR;
   - `mkdir` / `New-Item -ItemType Directory` inside SCRATCH is not a hit.
3. Slice CLAUDE.md and README of the watchdog: the rule text matches prompts/coder.md rule 10.

## Tests
agent-no-spawn: the three denied calls from SPAI-002 (`cat scripts/kolega.sh`, `wc -l scripts/agent.sh scripts/kolega.sh`, `bash -n scripts/agent.sh`) allowed; `bash scripts/agent.sh coder`, `cd x && bash scripts/kolega.sh`, `& 'C:\Program Files\Git\bin\bash.exe' scripts/agent.sh coder`, `herdr pane split …`, `claude -p x` still denied; existing tests stay green.
W29: the evidence commands from SPAI-003 (`tsc … > "$SCR/tsc.log" 2>&1` with SCR = scratch, `claude plugin test . > "$S/test.log"`, `mkdir -p "$S/smoke"`) → no hit; `echo x > src/a.ts`, `sed -i … src/a.ts`, PowerShell `Set-Content src/a.ts x` and `"x" *> src/a.ts` → hit.

## SMOKE (orchestrator)
After merge and plugin update: a fresh coder runs `bash -n scripts/kolega.sh` and `npx … > "$AGENT_SCRATCH/x.log"` without a denial; `bash scripts/agent.sh coder` is still denied.
Commit proposal: fix(guards): agent-no-spawn only on real starts, W29 resolves scratchpad and checks PowerShell

## Log
- 2026-11-22 23:15 (orchestrator) session 8a4ce1fc-cc97-4634-af2d-c305bb4b49a7 pane w2J:p2Q transcript C:/Users/jaroslav/.claude/projects/D--01-programovani-claude/8a4ce1fc-cc97-4634-af2d-c305bb4b49a7.jsonl
- 2026-11-22 23:15 (orchestrator) orchestrator session 8a4ce1fc-cc97-4634-af2d-c305bb4b49a7 transcript C:/Users/jaroslav/.claude/projects/D--01-programovani-claude/8a4ce1fc-cc97-4634-af2d-c305bb4b49a7.jsonl
- 2026-11-22 23:28 (spai) done: a86be51; agent-no-spawn 6 OK, watchdog 130 pass; SMOKE fresh coder: bash -n kolega.sh, cat agent.sh, redirect and mkdir in SCRATCH allowed, bash scripts/agent.sh coder denied
