---
type: Todo
title: "cc-prompt-translate: skipPatterns config, prompts matching a regex are never translated (agent notifications)"
timestamp: 2026-11-22 22:12:53
status: done
source: claude-code
tags: [agent, coder, bug, translation]
facets:
  project: claude
  project_path: D:/01_programovani/claude
spai_symbol: 'x'
lang: en
title_cs: "cc-prompt-translate: konfigurace skipPatterns, prompty odpovídající regulárnímu výrazu nejsou nikdy překládány (oznámení agenta)"
pending: [embed]
done_evidence: "5b3e88d; plugin test 108 pass, tsc 0, vsa OK"
---

# SPAI-029: cc-prompt-translate: skipPatterns config, prompts matching a regex are never translated (agent notifications)

x cc-prompt-translate: skipPatterns config, prompts matching a regex are never translated (agent notifications) @claude :agent:coder:bug:translation:

Found 2026-11-22 in the SPAI-028 smoke: agent-notify.sh sent "DONE coder w2J:p2Q: OK" into the orchestrator pane; detectLanguageOrCode returned reason "default" (no Czech or English signal) and the prompt was translated to "Coder w2J:p2Q: OK", losing DONE. The default stays (the user writes Czech without diacritics); add an explicit opt-out instead.

```
WORKDIR         D:/01_programovani/claude (worktree from the orchestrator), plugin plugins/cc-prompt-translate
ALLOWED_PATHS   plugins/cc-prompt-translate/** only; version 0.9.5; CHANGELOG
GATE            from the plugin folder: claude plugin validate .; claude plugin test .; scripts/vsa-check.sh; npx -y -p typescript tsc -p . --noEmit (no pipes hiding exit codes)
HARD_CONSTRAINTS read the plugin-authoring skill; no real translation calls in tests; no orchestration names (DONE, herdr, coder…) in plugin code, only in tests and docs examples; git read-only; you must not start agents or claude sessions.
```

## Scope
1. Config key `skipPatterns: string[]` (regex sources, default []), read from global and project config like the other keys; invalid regex ignored with a debug log line.
2. A prompt whose trimmed text matches any pattern is not translated and not detected (log `kind: "detect", reason: "skip_pattern"`, skipped true); same for command arguments if that path detects language.
3. `/prompt-translate` shows the count of skip patterns in its settings output; no new subcommand needed (patterns are edited in the JSON file).
4. README (setting, example `["^(DONE|BLOCKED|WAITING|INSIGHT) "]`), slice CLAUDE.md, CHANGELOG 0.9.5.
5. Tests: matching prompt not sent to the model and left unchanged; non-matching prompt translated as before; invalid regex ignored; full chain through hooks/pipeline.test.ts.

## SMOKE (orchestrator)
After install: add `"skipPatterns": ["^(DONE|BLOCKED|WAITING|INSIGHT) "]` to D:/01_programovani/claude/.claude/prompt-translate.json; the next agent DONE message arrives verbatim and the log shows reason skip_pattern.
Commit proposal: feat(prompt-translate): skipPatterns, prompts never translated (0.9.5)

## Log
- 2026-11-22 22:14 (orchestrator) session 23b18a9f-2a0a-4075-a5ef-bbbc6117b0e5 pane w2J:p2Q transcript C:/Users/jaroslav/.claude/projects/D--01-programovani-claude/23b18a9f-2a0a-4075-a5ef-bbbc6117b0e5.jsonl
- 2026-11-22 22:14 (orchestrator) orchestrator session 23b18a9f-2a0a-4075-a5ef-bbbc6117b0e5 transcript C:/Users/jaroslav/.claude/projects/D--01-programovani-claude/23b18a9f-2a0a-4075-a5ef-bbbc6117b0e5.jsonl
- 2026-11-22 22:22 (spai) done: 5b3e88d; plugin test 108 pass, tsc 0, vsa OK
