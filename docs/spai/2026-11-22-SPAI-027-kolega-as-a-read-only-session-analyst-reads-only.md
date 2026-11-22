---
type: Todo
title: "Kolega as a read-only session analyst: reads only session folders, hook-enforced, findings recorded as SPAI notes in the home backlog"
timestamp: 2026-11-22 21:28:22
status: done
source: claude-code
tags: [agent, coder, kolega, workflow]
facets:
  project: claude
  project_path: D:/01_programovani/claude
spai_symbol: 'x'
lang: en
title_cs: "Kolega jako analytik sezení v režimu jen pro čtení: čte pouze složky sezení, vynuceno hookem, zjištění zaznamenána jako poznámky SPAI v domovském backlogu"
done_evidence: "7990d12 + b01d23e; unittest 79 OK; SMOKE: Read/rg outside roots denied, no Write tool, kolega-read.py live, home SPAI-002 EN+CZ+tags"
---

# SPAI-027: Kolega as a read-only session analyst: reads only session folders, hook-enforced, findings recorded as SPAI notes in the home backlog

x Kolega as a read-only session analyst: reads only session folders, hook-enforced, findings recorded as SPAI notes in the home backlog @claude :agent:coder:kolega:workflow:

Decided with the user 2026-11-22. Kolega studies our agent sessions and records fundamental insights; it grades no agent. Today it has only Read/Grep/Glob, cannot read the huge JSONL lines (Read/Grep skip them), may read any repo, and writes findings only into its pane.

```
WORKDIR         D:/01_programovani/claude (branch feat/kolega-analyst; worktree is the orchestrator's call)
ALLOWED_PATHS   scripts/kolega.sh, scripts/kolega-read.py (new), .claude/hooks/kolega-guard.sh (new), scripts/tests/test_kolega_guard.py (new), scripts/tests/test_kolega_read.py (new), prompts/kolega.md, docs/herdr-orchestrace.md (kolega section only)
GATE            python -m unittest discover -s scripts/tests -v; bash -n scripts/kolega.sh .claude/hooks/kolega-guard.sh (no pipes hiding exit codes)
HARD_CONSTRAINTS "only read"; kolega reads only the sessions in ~/.claude and ~/.pi, no code anywhere else; it must not be able to edit anything, enforced by hooks; findings are SPAI entries (note or idea) written in English through the spai binary (which stores the Czech translation), each with the session_id and the path of the session. Tests use made-up paths and values only; never the real anon home or real secrets. Git read-only; you must not start agents, claude sessions or herdr panes.
```

## Scope
1. Read roots (all tools): `~/.claude/projects/**`, `~/.pi/agent/sessions/**`. Nothing else, also not repos, docs or prompts.
2. `scripts/kolega-read.py <transcript> <from> <to> [--chars N]`: prints each JSONL line of the range as compact text with its ORIGINAL line number: role/type, message text, tool name + key input, first N (default 400) chars of a tool result, is_error. Works for Claude Code and pi session JSONL. Read-only, stdlib only.
3. `.claude/hooks/kolega-guard.sh` (PreToolUse, matcher `.*`), active when CC_ROLE=kolega:
   - Read/Grep/Glob: the path (or Grep/Glob `path`, default cwd) must resolve inside a read root, else deny.
   - Write/Edit/NotebookEdit and every other writing or networking tool (Agent, WebFetch, WebSearch, mcp__*): deny.
   - Bash/PowerShell: allow only a pipeline of allowlisted read commands: rg, grep, jq, head, tail, wc, ls, sed -n, cat, sort, uniq, cut, `python <abs path>/scripts/kolega-read.py`, and `spai` with subcommand add|log|similar|show|list|search where --project is the home backlog (C:/Users/jaroslav) only. Every path argument must be inside a read root. Deny redirection (>, >>), tee, -delete, -exec, command substitution, `;`/`&&` chains with a non-allowlisted command, and everything else (git, rm, mv, cp, claude, herdr, pi, curl, other python). Deny message says what is allowed.
   - Off-switch only in the hook env: NO_KOLEGA_GUARD=1 (document it like NO_AGENT_GUARD).
4. `kolega.sh` (claude agent): pass the hook via one merged `--settings` (same pattern as agent.sh), keep ANON_MASK_AGENT_STATE=1 and cc-data-anonymizer on, tools Read,Grep,Glob,Bash; `--add-dir` only the read roots (no D:/01_programovani, no scratch); cwd = `~/.claude/projects`; no MCP servers (`--strict-mcp-config` with an empty config).
5. `prompts/kolega.md`: keep the analyst role and citation rules; sources = only the read roots; use kolega-read.py for long lines; each finding = one SPAI entry in the home backlog:
   - `spai similar` first; a confirmed existing finding gets `spai log <ID> --project C:/Users/jaroslav` with the new evidence ("strengthened"), not a new entry;
   - new: `spai add "<line>\n<body>" --project C:/Users/jaroslav --source kolega --json`, English, prefix `- ` (note: observation or pattern) or `? ` (idea: an open question worth checking);
   - tags: `:kolega:insight:` + kind `:pattern:` or `:observation:` + level `:fundamental:` or `:medium:` + confidence `:certain:`, `:probable:` or `:hypothesis:` + topic tags as fit (e.g. `:handoff:`, `:hooks:`, `:translation:`);
   - body: What / Evidence (each line `session <session_id> <transcript path>:<line> "verbatim quote ≤160 chars"`) / Cause / Counter-example / To verify;
   - pane output per prompt: only the SPAI IDs added or strengthened, one line each, or "no change".
6. docs/herdr-orchestrace.md kolega section: read roots, hook, off-switch, where findings live (home backlog, tag :kolega:insight:) and how the orchestrator reviews them (`spai list --project C:/Users/jaroslav --tag insight`).

## Tests
- kolega-guard: allowed and denied tables for every tool (Read inside/outside roots, Write anywhere, Bash allowlist, redirection, -exec, chains, spai with another --project, spai set/delete), CC_ROLE unset → no effect, off-switch.
- kolega-read: fixture JSONL with a huge tool result line → truncated text, original line numbers, Claude and pi formats.

## SMOKE (orchestrator)
After merge: restart kolega; in its pane it tries (a) Read of a repo file → denied, (b) Write → denied, (c) `rg x D:/01_programovani` → denied, (d) kolega-read.py on a live transcript → works; then it records one finding with `spai add` into the home backlog; `spai show <ID> --project C:/Users/jaroslav --json` shows English text, Czech title, the tags and a session_id + path line.
Commit proposal: feat(kolega): read-only session analyst, hook-enforced, findings as SPAI notes

## Log
- 2026-11-22 21:32 (orchestrator) session fcd6058e-562f-4964-86ca-aad6ec25f330 pane w2J:p2N transcript C:/Users/jaroslav/.claude/projects/D--01-programovani-claude-kolega/fcd6058e-562f-4964-86ca-aad6ec25f330.jsonl
- 2026-11-22 21:32 (orchestrator) orchestrator session ffe01966-1e2f-4b82-b29b-28c254f3953e transcript C:/Users/jaroslav/.claude/projects/D--01-programovani-claude/ffe01966-1e2f-4b82-b29b-28c254f3953e.jsonl
- 2026-11-22 21:58 (spai) done: 7990d12 + b01d23e; unittest 79 OK; SMOKE: Read/rg outside roots denied, no Write tool, kolega-read.py live, home SPAI-002 EN+CZ+tags
