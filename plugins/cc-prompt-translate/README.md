# cc-prompt-translate

A [Claude Code](https://claude.com/claude-code) plugin that translates your prompts into English before they reach the model, and translates the model's final answer back into your language (Czech by default). Claude works and reasons in English; you write and read in your own language.

Port of the pi extension [pi-prompt-translate-czk](https://github.com/mastnacek/pi-prompt-translate-czk) (itself a fork of `05kim/pi-prompt-translate`).

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install prompt-translate --marketplace mastnacek/claude-plugins
```

Answer `y` to add the marketplace, then pick the user scope so it loads in every session. From a shell:

```
claude plugin install prompt-translate --marketplace mastnacek/claude-plugins
```

Update later with `claude plugin update prompt-translate` and `/reload-plugins`.

## Setup

The default translation model runs on [OpenRouter](https://openrouter.ai) (`openrouter/google/gemini-3.1-flash-lite`). The key is read from `OPENROUTER_API_KEY`, or from pi's `~/.pi/agent/auth.json` when pi is already logged in to OpenRouter. No key is needed with a Claude model (`/prompt-translate model haiku`), which runs on Claude Code's own client.

## What it does

- **Prompt → English.** Your prompt is translated by a small, cheap model in one call. Code blocks, inline code, URLs, file paths, `@file` mentions and tables are masked and restored byte-identical. A prompt already in English (or pure code) is always detected and passed through untouched.
- **Answer → your language.** When the turn ends, the final answer is translated in the background and drawn in place of the English. The stored message stays English, so the model's context is never mixed.
- **Translation frame.** Each translated prompt is drawn as one frame: your original (`-`) and the English (`+`) in diff colours, tagged `[boost: …]` / `[s historií]` when they applied, with the attached history below. One switch: `/prompt-translate original on|off`. Tokens and cost are in `/prompt-translate stats`.
- **Indicator.** `[🇬🇧 46 Kč]` at the end of the hint line under the prompt: translation is on, and the OpenRouter credit left, marked `⚠` when critical (`[🇬🇧 ⚠ 12 Kč]`). Dim text, no colours. While a prompt or answer is being translated it reads `[🇬🇧 ⟳ překládám…]`; no pop-up notifications. With a Claude model it is just `[🇬🇧]`.
- **Prompt boost.** `off`, `on` (default), `plus`, `mega`: from faithful translation to a restructured, ordered task list, in the same single call. A prompt already in English, or plain code, is sent as written at every level.
- **Conversation history.** `off`, `ask`, `auto` (when the prompt says "to", "tohle", "předchozí"…), `always`: recent turns are attached so pronouns translate correctly.
- **AskUserQuestion dialogs** the model opens are translated into your language.
- **Skill and command arguments** typed in your language are translated before the command runs.

## Commands

```
/prompt-translate help                       all commands with current values
/prompt-translate on|off                     prompt translation
/prompt-translate responses on|off           answer translation
/prompt-translate lang <language>            target language for answers
/prompt-translate model <m>                  openrouter/<vendor>/<model> | haiku | sonnet | current
/prompt-translate boost off|on|plus|mega     prompt enhancement
/prompt-translate history off|ask|auto|always|inspect
/prompt-translate think off|low|medium|high  reasoning of the translation model (default low)
/prompt-translate confirm on|off             confirm the translation before sending
/prompt-translate original on|off            the original/translation frame
/prompt-translate ui on|off                  translate AskUserQuestion dialogs
/prompt-translate note on|off                hidden "work in English" note on every prompt
/prompt-translate stats                      price, OpenRouter credit, ČNB USD→CZK rate, tokens
/prompt-translate log on|off                 evaluation log in ~/.claude/prompt-translate/log/ (off by default)
/prompt-translate reset | global show|off
```

Settings are saved to `.claude/prompt-translate.json` in the project; add `--global` to save them for every project.

## Limits

- Only the final answer is translated; text between tool calls stays English.
- The answer appears in English for a second or two before the translation replaces it.
- Prompts with an attached image are not translated.

## Development

The plugin is a Claude Code hooks module organised as vertical slices: `hooks/register.tsx` wires the slices in `hooks/features/` (one folder per feature), which share the core in `hooks/shared/`. `CLAUDE.md` has the rules. Load a working copy with `claude --plugin-dir <folder>` or `CLAUDE_CODE_PLUGIN_DIRS`; check it with `claude plugin validate .`, `claude plugin test .` and `scripts/vsa-check.sh`.

## License

MIT
