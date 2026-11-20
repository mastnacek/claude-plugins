# cc-data-anonymizer

Maskuje citlivá data (jména Notes, e-maily, hesla, tokeny) v promptech, @ souborech a výsledcích nástrojů přes CLI anon

## Install

```
/plugin marketplace add mastnacek/claude-plugins
/plugin install cc-data-anonymizer@mastnacek
```

## What it does

- Masks prompts, `@` files and tool results (Read, Grep, Bash, MCP) with the `anon` CLI, so the agent only sees fake values.
- Restores the originals in what the agent writes (Edit, Write, Bash inputs).
- The first time a file is read, shows the `anon scan` summary and asks to allow it.
- If `anon` is missing or fails, the read is denied (fail-closed).
- Optional: shows the assistant's replies unmasked on screen (off by default).

Needs the `anon` binary: `ANON_BIN`, then `PATH`, then `D:/01_programovani/_tools/anon.exe`.

## Commands

No commands. Settings:

- `unmaskReply` (default off): show replies with the original values.
- `style` (`default`, `fake`, `redact`, `tag`; default `default`): passed to `anon mask --style`. `fake` gives realistic fake values, `redact` gives `REDACTED` (cannot be restored; an Edit/Write/Bash input that still holds it goes through unchanged and the band above the prompt warns), `tag` gives `«REDACTED:<kind>:<n>»` (stable, restorable). `default` sends no flag, so `[anon]` in anon's `rules.toml` decides.
