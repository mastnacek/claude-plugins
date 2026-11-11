---
id: 01M75VK0HFCRR3340Q70ZPZRJ8
scope: "project:claude-plugins"
type: decision
title: "Immune recommendations in cc-uma-memory: OpenRouter only — Gemini by default, optional custom model"
tags:
  - cc-uma-memory
  - immune
  - model-choice
status: stable
supersedes: 01M742C02854JD7BDEHEV14DDE
generated:
  by: pi-agent/1.1
  at: "2026-11-11T17:48:14.767202616+00:00"
since: "2026-11-11T01:02:27.403436977+00:00"
---
Decided by the user on 2026-11-11 for the port of the immune interceptor (item 5) into the cc-uma-memory plugin. Replaces the earlier version with Haiku/Sonnet from the Claude subscription — the user explicitly does not want those.

The recommendation in the immune dialog (whether an edit VIOLATEs / TOUCHes / is UNRELATED to a rule; pi `src/slices/immune/recommendation.ts`) goes **through OpenRouter only**:

- **default model:** `google/gemini-3.5-flash-lite` — the same judge as the UMA core (`core/uma-core/src/fastbrain/transport.rs` DEFAULT_JUDGE_MODEL).
- **custom model:** the user can enter any OpenRouter model ID by hand (`/uma immune-model <openrouter-id>`; `/uma immune-model default` restores Gemini). Stored in `$.store` like the other switches.
- Key from `OPENROUTER_API_KEY` or `~/.pi/agent/auth.json` (`openrouter.access`).
- **No** `$.model.complete` (Haiku/Sonnet) — do not use it.

The recommendation is advice in the dialog only: it never approves or blocks on its own; on an error, timeout, unknown model or missing key the dialog is shown without a recommendation.