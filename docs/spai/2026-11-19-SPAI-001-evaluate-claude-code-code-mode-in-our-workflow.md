---
type: Idea
title: "Evaluate Claude Code Code Mode in our workflow"
lang: en
title_cs: "Vyzkoušet Code Mode Claude Code v našem workflow"
timestamp: 2026-11-19 23:30:00
status: idea
source: claude-code
tags: [claude-code, code-mode]
facets:
  project: claude
  project_path: D:/01_programovani/claude
spai_symbol: '?'
---

# SPAI-001: Evaluate Claude Code Code Mode in our workflow

? Evaluate Claude Code Code Mode in our workflow :claude-code:code-mode:

Code Mode (experimental, Claude Code 2.1.323+): Claude writes JavaScript that makes several
tool calls at once (Bash, Read, Edit, MCP) through the internal `REPL` tool; only the result
returns to the model, not every step. Enabled globally on 2026-11-19 via
`"CLAUDE_CODE_EXPERIMENTAL_CODE_MODE": "1"` in `~/.claude/settings.json` → `env`.
Docs: https://code.claude.com/docs/en/code-mode.md

**Conflict found 2026-11-19:** Code Mode disables Remote Control (also Claude in Chrome and
computer use) — documented under "Unavailable features" on the Code Mode page, no reason
given. Our settings have `remoteControlAtStartup: true`, so a global Code Mode silently turns
it off. Decision 2026-11-19: Code Mode removed from global settings; enable it per session
only (`$env:CLAUDE_CODE_EXPERIMENTAL_CODE_MODE="1"; claude`).

Limits: interactive terminal only (not `-p`, Agent SDK, VS Code, Desktop); a session resumes
only with the variable set; it does not start with an API key helper, OpenTelemetry or
`DISABLE_TELEMETRY`.

**Test 2026-11-20 (spai, agent coder in Code Mode, `CODE_MODE=1 scripts/agent.sh coder`):**
the transcript starts with `{"type":"repl-mode","replMode":true}`; 27 `REPL` calls ran 427
Bash, 29 Edit, 14 Write and 13 Read inner calls — the cc-agent-watchdog ledger
(`%APPDATA%\uma\agent-watchdog\spai\2026-11-19_coder_03bcd698.jsonl`) recorded every one, so
PreToolUse hooks do see calls made from code. No first-session prompt appeared. Gate green,
work merged (`c9bdd0a`).

## Plán
- [x] Confirm the REPL tool appears after restart and accept the first-session prompt
- [x] Check that plugin engine hooks (`tool.call`, watchdog, line limit) still see tool calls made from code
- [ ] Compare token use and speed on a bulk task (e.g. reading many files) with and without Code Mode
- [ ] Decide: keep globally, keep per session, or turn off
