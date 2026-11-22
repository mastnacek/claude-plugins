---
type: Todo
title: "cc-prompt-translate: translate answers of turns that no prompt started (background-task notifications)"
timestamp: 2026-11-22 20:01:32
status: done
source: orchestrator
tags: [agent, coder, bug]
facets:
  project: claude
  project_path: D:/01_programovani/claude
spai_symbol: 'x'
lang: en
title_cs: "cc-prompt-translate: přeložit odpovědi tahů, které nezačaly žádným promptem (oznámení úloh na pozadí)"
done_evidence: "75675a6, 100 tests, installed 0.9.2; live smoke pending next notification turn"
---

# SPAI-026: cc-prompt-translate: translate answers of turns that no prompt started (background-task notifications)

x cc-prompt-translate: translate answers of turns that no prompt started (background-task notifications) @claude :agent:coder:bug:

Found 2026-11-22 by the orchestrator: in session ffe01966 the plugin store has 200 translated prompts but only 5 translated answers; the 5 are exactly the English replies to user prompts. Replies in turns started by a background-task notification stay English, because answer-to-target translates only when the `pending` slot is set (hooks/features/answer-to-target/register.ts:80-92), and only prompt-to-english / command-arguments set it.

```
WORKDIR         D:/01_programovani/claude-translate (claude repo, branch fix/translate-notification-turns), plugin plugins/cc-prompt-translate
ALLOWED_PATHS   plugins/cc-prompt-translate/** only; version 0.9.2; CHANGELOG
GATE            from the plugin folder: claude plugin validate .; claude plugin test .; scripts/vsa-check.sh; npx -y -p typescript tsc -p . --noEmit (no pipes hiding exit codes)
HARD_CONSTRAINTS read the plugin-authoring skill; no real translation calls in tests; git read-only; you must not start agents or claude sessions.
```

## Scope
1. turn.complete of the main agent (agentId undefined) with reason "answer" and no `pending`: translate the answer using the config (enabled && translateResponses, targetLanguage), same path as recoverMissedAnswer. Keep the existing behaviour for turns with pending (per-prompt toggles still win).
2. Never translate twice: skip when `finals` already has the answer's textKey; keep the already-target (Czech/Slovak) skip.
3. Rendering stays on screen only (ui.render AssistantMessage); the stored message and the model context stay English; written files are untouched.
4. Update the slice CLAUDE.md (Kontrakt, Pasti) and README.
5. Tests: notification-started turn (no prompt.submit, no pending) -> answer translated and rendered; turn with pending and translateResponses false -> not translated; already Czech -> not translated; finals hit -> no second call; full-chain test through register.tsx (hooks/pipeline.test.ts).

## SMOKE (orchestrator)
After install and /reload-plugins: the orchestrator ends a turn started by a background-task notification with an English answer; the plugin log (.claude/prompt-translate.json log: true, ~/.claude/prompt-translate/log/<day>.jsonl) shows kind translation purpose answer for it, and the user sees it in Czech.
Commit proposal: fix(prompt-translate): translate answers of turns without a prompt (0.9.2)

## Log
- 2026-11-22 20:01 (orchestrator) session 5106cc1e-5e50-4f43-bac8-4ff283f30fc9 pane w2J:p2D transcript C:/Users/jaroslav/.claude/projects/D--01-programovani/5106cc1e-5e50-4f43-bac8-4ff283f30fc9.jsonl
- 2026-11-22 20:02 (orchestrator) orchestrator session ffe01966-1e2f-4b82-b29b-28c254f3953e transcript C:/Users/jaroslav/.claude/projects/D--01-programovani-claude/ffe01966-1e2f-4b82-b29b-28c254f3953e.jsonl
- 2026-11-22 20:07 (orchestrator) done: 75675a6, 100 tests, installed 0.9.2; live smoke pending next notification turn
