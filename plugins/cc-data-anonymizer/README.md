# cc-data-anonymizer

Maskuje citlivá data (jména Notes, e-maily, hesla, tokeny) v promptech, @ souborech a výsledcích nástrojů přes CLI anon

## Install

```
/plugin marketplace add mastnacek/claude-plugins
/plugin install cc-data-anonymizer@mastnacek
```

## What it does

- Masks prompts, `@` files and tool results (Read, Grep, Bash, PowerShell, NotebookEdit, MCP) with the `anon` CLI, so the agent only sees fake values.
- Restores the originals in what the agent writes (Edit, Write, NotebookEdit, Bash, PowerShell inputs). A tag that anon did not issue in this session, or a mangled one, is denied; MCP inputs with a tag are denied.
- The first time a file is read, shows the `anon scan` summary and asks to allow it.
- If `anon` is missing or fails, the read is denied (fail-closed).
- Optional: shows the assistant's replies unmasked on screen (off by default).

Needs the `anon` binary: `ANON_BIN`, then `PATH`, then `D:/01_programovani/_tools/anon.exe`.

## Vault guard

Agents cannot read or change the anon home (`vault.bin`, `vault.key`, `map.db`, `rules.toml`), run `anon unmask|map|vault|tui|rules|import|export`, `--with-values` or `--reveal`, point `ANON_HOME` at the real home or call DPAPI. The denial says so and that you can do it yourself with `!` in the prompt. `anon scan|mask`, `--help`, `--version` and `ANON_HOME=<other folder>` stay allowed.

## Commands

No commands. Settings:

- `consent` (`ask` default | `never`): `never` masks without a dialog and only shows the note under the row; agent sessions (`CC_ROLE` set) and `-p` runs never ask.
- `reveal` (`partial` default | `full` | `none`): detected values on screen only, never sent to the model; names, e-mails, usernames, hosts and IPs in full, passwords/secrets/tokens as first 2 and last 2 characters.
- `unmaskReply` (default off): show replies with the original values.
- `style` (`default`, `fake`, `redact`, `tag`; default `default`): passed to `anon mask --style`. `fake` gives realistic fake values, `redact` gives `REDACTED` (cannot be restored; a write that stores it as a value is denied), `tag` gives `«REDACTED:<kind>:<n>»` (stable, restorable). `default` sends no flag, so `[anon]` in anon's `rules.toml` decides.
