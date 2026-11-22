---
type: Todo
title: "Protect git in the herdr monorepo like claude and spai (watchdog or orchestrator-only hook)"
timestamp: 2026-11-20 15:43:27
status: done
source: orchestrator
tags: [workflow]
facets:
  project: claude
  project_path: D:/01_programovani/claude
spai_symbol: 'x'
lang: en
title_cs: "Ochrana git v monorepu herdr jako u claude a spai (watchdog nebo hook pouze pro orchestrátor)"
pending: [embed]
blocked_by: [SPAI-011]
done_evidence: "herdr merge, hook tests OK, live smoke: git rm denied, status allowed"
---

# SPAI-008: Protect git in the herdr monorepo like claude and spai (watchdog or orchestrator-only hook)

x Protect git in the herdr monorepo like claude and spai (watchdog or orchestrator-only hook) @claude :workflow:

Source: orchestrator, 2026-11-20: a coder ran git rm --cached in D:/01_programovani/herdr; nothing blocked it.

## Log
- 2026-11-22 18:08 (orchestrator) Brief for the coder (orchestrator 2026-11-22), after SPAI-011 is merged:

  ```
  WORKDIR         D:/01_programovani/herdr-git (herdr monorepo worktree, branch agent/git-guard) — plus read-only reference D:/01_programovani/claude/.claude/hooks/orchestrator-only-git.sh and claude/.claude/settings.json
  ALLOWED_PATHS   herdr repo: .claude/settings.json, .claude/hooks/** (new), docs or README note
  GATE            bash -n on the hook; the hook's own test script (feed sample JSON tool inputs, check allow/deny exit and output) passes
  HARD_CONSTRAINTS git read-only; do not change the claude repo; never break the orchestrator (no CC_ROLE) workflow.
  ```

  ## Scope
  1. Port the claude repo's orchestrator-only-git hook to the herdr monorepo (.claude/settings.json PreToolUse Bash + PowerShell): agents (CC_ROLE set: coder, tester, kolega …) are denied git write commands (commit, push, tag, reset, stash, checkout/restore of files, clean, rm, mv, worktree remove, branch -d/-D, merge, rebase, config); read commands stay allowed; the orchestrator (no CC_ROLE) is unaffected. Cover `git rm --cached` explicitly (the incident). Same deny message style.
  2. Prefer one shared implementation: if practical, make the herdr hook call the claude repo script by absolute path (document it); otherwise copy and note the source commit.
  3. Tests: sample inputs for Bash and PowerShell, with and without CC_ROLE.

  ## SMOKE
  1. In a coder session in the herdr worktree: `git rm --cached <some file>` -> denied with the message; `git status` -> allowed.
  2. Orchestrator session (no CC_ROLE) in herdr: `git status` allowed; (do not actually commit in the SMOKE).
  Commit proposal: feat(herdr): git zápis jen orchestrátor (hook jako v repu claude)
- 2026-11-22 18:26 (orchestrator) session 17202c68-7829-48d0-b785-8c3340f4f5a9 pane w2J:p2D transcript C:/Users/jaroslav/.claude/projects/D--01-programovani-claude-wait/17202c68-7829-48d0-b785-8c3340f4f5a9.jsonl
- 2026-11-22 18:45 (orchestrator) done: herdr merge, hook tests OK, live smoke: git rm denied, status allowed
