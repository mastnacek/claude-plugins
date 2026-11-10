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
- **Turn off Claude Code's own automatic memory** (not UMA) so UMA is the only memory — globally or per project.
- **Tag at the end of the hint line under the prompt** — `[UMA]` when Claude's auto memory is off, `[UMA ⚠ CC]` when it is on; ` ↻` is added once you changed it in this session (applies from the next one).

## MCP tools

- `uma_read`, `uma_list`, `uma_search`, `uma_consolidate` — read-only.
- `uma_write`, `uma_supersede` — write; enabled by `--allow-writes`.

Writes are approved in Claude Code itself (MCP tool permissions): you are asked before the first write unless you allow the tool. Storage: global `~/.local/share/uma/global`, per project `<git root>/.uma`. New tools are added in the Rust core, not in this plugin.

## Commands

- `/uma claude-memory` — show whether Claude Code's auto memory (not UMA) is on and where the value comes from (global / project / local / default).
- `/uma claude-memory off` — write `"autoMemoryEnabled": false` to `.claude/settings.local.json` of the current project.
- `/uma claude-memory off --global` — write it to `~/.claude/settings.json`.
- `/uma claude-memory on [--global]` — the same with `true`.
- `/uma help` — short help.

A change applies from the next session (the system prompt is built at start). Settings files are edited safely: only `autoMemoryEnabled` changes, and a file that is not valid JSON is left untouched.
