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

## Vault-first workflow (anon 2026-11-21)

anon now treats the vault as the main source; rules that only guess are suggestions.

- **Vault (exact match):** passwords, user names, servers, colleague and customer names, internal names. Bulk import: `anon vault import <file.csv|txt>` (columns `kind,label,value[,options]`) or `Ctrl+O` on the Trezor page of `anon tui`. Names get Czech declension variants automatically (e.g. Havlíček, Havlíčka, Havlíčkovi, Havlíčková), each word also on its own, whole words of 4+ characters only.
- **Rules that still mask:** passwords and secrets, Gitleaks tokens and keys, checksum-validated data (IBAN, card, rodné číslo, IČO).
- **Rules that only suggest:** user names, Notes names, IP, phone. They do not mask; findings go to the **Návrhy** page of `anon tui`: Enter = add to the vault, F3 = never mask (word exception), Del = drop. A value masked once (it is in the map) stays masked everywhere.
- **Never mask a kind:** `[anon] never_mask = ["email"]` in `rules.toml`; per rule: `[anon] mode_<rule-id> = "mask" | "suggest" | "off"`.
- **Round trip:** the map keeps the exact found form, so writes restore the original byte for byte; `anon unmask --strict` fails on unknown tags and leftover fake values.

### Master password

- First run `anon unlock` **in your own terminal window** (never through `!` in a Claude Code session: the password would end up in the transcript). The first unlock sets the master password and converts the vault; the map and fake values stay the same. Until then the old vault without a password keeps working.
- The key is protected by Argon2id (about 0.5 s on this PC) and XChaCha20-Poly1305, plus DPAPI on top.
- After 30 minutes without use the vault locks (`[anon] lock_minutes`). While locked, the plugin denies every read and write in all sessions, agents included, until you run `anon unlock` again or press `Ctrl+K` in `anon tui` (`Ctrl+L` locks).
- `anon lock` locks now, `anon passwd` changes the password, `anon vault rekey` makes a new data key (crash-safe).
- **If you forget the master password, the vault and the map cannot be recovered.** Keep it in your password manager.

### Limits

Protection against an agent running as your own Windows user is not complete: the agent can still read a written file in an encoded form. Secrets are not restored into shell commands (`shellSecrets`), but only a tag shows the kind: with style `fake` a fake password in a command is restored, as before. Pasted images in a prompt cannot be masked; a warning line shows under the message. A real boundary is only an agent under another account, in a container or a VM.

## Commands

No commands. Settings:

- `consent` (`ask` default | `never`): `never` masks without a dialog and only shows the note under the row; agent sessions (`CC_ROLE` set) and `-p` runs never ask.
- `reveal` (`partial` default | `full` | `none`): detected values on screen only, never sent to the model; names, e-mails, usernames, hosts and IPs in full, passwords/secrets/tokens as first 2 and last 2 characters.
- `shellSecrets` (`deny` default | `ask` | `allow`): a Bash or PowerShell command with a tag of a kind from `shellSecretKinds` (default `password,secret,card,iban,national-id`) is refused: "Hesla a tajemství se do příkazů nevracejí…". `ask` shows a dialog (agent sessions and `-p` refuse). Other kinds (name, username, host, email, ip) are restored as before; Edit, Write and NotebookEdit are unchanged.
- PDF: `Read` of a `.pdf` returns only the masked text from `pdftotext` (poppler, must be on PATH, else the read is denied); the document itself is never passed on.
- Images: `Read` of png, jpg, jpeg, gif, bmp, webp, tif, tiff asks "Obrázek nejde zamaskovat. Poslat ho modelu?"; agent sessions, `-p` runs and `consent: never` deny.
- `unmaskReply` (default off): show replies with the original values.
- `style` (`default`, `fake`, `redact`, `tag`; default `default`): passed to `anon mask --style`. `fake` gives realistic fake values, `redact` gives `REDACTED` (cannot be restored; a write that stores it as a value is denied), `tag` gives `«REDACTED:<kind>:<n>»` (stable, restorable). `default` sends no flag, so `[anon]` in anon's `rules.toml` decides.
