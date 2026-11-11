# cc-uma-memory

UMA (Universal Memory Architecture) pro Claude Code — paměť sdílená s pi

## Install

```
/plugin marketplace add mastnacek/claude-plugins
/plugin install cc-uma-memory@mastnacek
```

## Requirements

The MCP server is the `uma` binary (Rust core shared with pi) and must be on your `PATH`:

```sh
git clone https://github.com/mastnacek/pi-uma
cd pi-uma/core
cargo build --release
cp target/release/uma ~/.local/bin/   # any directory on PATH
```

## What it does

- **Gives Claude Code the UMA memory tools** through an MCP server named `uma` (`uma mcp serve --allow-writes`).
- **Adds relevant memories to your prompts** (recall): before a prompt is sent, `uma recall check` looks for facts that fit it, and up to 3 are attached as hidden context for the model. Facts already attached in this session are not repeated. Recall is advisory: if `uma` fails or takes more than 3 s, the prompt goes through unchanged (one log line per series of failures).
- **Puts your rules in the system prompt**: the active facts of type `decision` and `pattern` (`uma list --json --type …`, at most 10, first line of each body) are added to the system prompt as a section titled *Project Memory & Architectural Rules (from UMA)*, same text as in pi. They are fetched once per session (the prompt stays stable for the provider's cache), so a fact written meanwhile appears in the next session. No rules or `uma` failing → no section.
- **Asks before anything is written to memory** (write gate): every `uma_write` / `uma_supersede` opens a step dialog with pi's proposal preview (type, scope, tags, 📌 title, 📄 body with 8 lines) and four choices — *✅ Schválit a uložit do paměti*, *✏️ Upravit* (title, body, tags — type the new value under "Type something" — or the full text), *🔄 Přepnout rozsah* (🌐 global ↔ 📁 project), *❌ Zamítnout a zahodit*. After each change you are back at the updated preview, and what you approve is what is stored, edits included. Text typed in the main dialog rejects the write and goes to the model as the reason. Without a way to ask (`-p`) the write is refused.
- **Closes the side doors**: `Write` / `Edit` / `NotebookEdit` aimed at the UMA store (`.uma/`, the global store) are refused, and a shell command that would change memory (`uma write`, `uma mcp serve --allow-writes`, `echo > .uma/x.md`, `cp … .uma/…`, also inside `bash -c`) gets a yes/no dialog (*🛡️ UMA imunitní interceptor*: *Ano, pokračovat* / *Ne, zablokovat*).
- **Turn off Claude Code's own automatic memory** (not UMA) so UMA is the only memory — globally or per project.
- **Tag at the end of the hint line under the prompt** — `[UMA]` when Claude's auto memory is off, `[UMA ⚠ CC]` when it is on; ` ↻` is added once you changed it in this session (applies from the next one).

## MCP tools

- `uma_read`, `uma_list`, `uma_search`, `uma_consolidate` — read-only.
- `uma_write`, `uma_supersede` — write; enabled by `--allow-writes`.

Writes are approved by the write gate (see above). Claude Code's own MCP permission prompt may ask once more; add `mcp__plugin_cc-uma-memory_uma__uma_write` and `mcp__plugin_cc-uma-memory_uma__uma_supersede` to `permissions.allow` if you want only the plugin's dialog. Storage: global `~/.local/share/uma/global`, per project `<git root>/.uma`. New tools are added in the Rust core, not in this plugin.

## Commands

- `/uma claude-memory` — show whether Claude Code's auto memory (not UMA) is on and where the value comes from (global / project / local / default).
- `/uma claude-memory off` — write `"autoMemoryEnabled": false` to `.claude/settings.local.json` of the current project.
- `/uma claude-memory off --global` — write it to `~/.claude/settings.json`.
- `/uma claude-memory on [--global]` — the same with `true`.
- `/uma recall` — show whether recall is on; `/uma recall on|off` switches it (default **on**).
- `/uma write-gate` — show the write approval mode; `/uma write-gate ask|off` switches it (default **ask**). `off` removes the dialog only; `Write` / `Edit` into the store stay refused.
- `/uma append` — show whether the rules section is on; `/uma append on|off` switches it (default **on**).
- `/uma search <query>`, `/uma list [global|<project>]`, `/uma read <id>`, `/uma timeline [--id <ULID>] [--all]`, `/uma doctor` — look into the memory. The full listing is shown to you; the model gets only a one-line summary. They read only.
- `/uma reindex` — rebuild the search index (`uma search "" --reindex`).
- `/uma export --out <folder>` — write the facts as an OKF bundle (one Markdown document per fact) into the folder; memory is not changed.
- `/uma help` — short help.

The switches (`recall`, `write-gate`, `append`) are stored with the plugin (`$.store`), so they apply in every session and project.

Limits of the write gate: it judges shell commands by their spelling, not by running them — variables, `eval`, scripts in files and symlinks reached from a shell command pass. It guards against the model's mistakes, not against malice.

A change applies from the next session (the system prompt is built at start). Settings files are edited safely: only `autoMemoryEnabled` changes, and a file that is not valid JSON is left untouched.
