---
name: herdr-plugin-dev
description: Herdr plugin authoring (herdr 0.9.5) — herdr-plugin.toml manifest, actions, panes, event hooks, link handlers, Rust + Ratatui popups, scaffolding, `herdr plugin link`. Read before creating, editing or debugging any herdr plugin (a folder with herdr-plugin.toml); edits to its source are refused until this skill or its references were read.
---

# Herdr plugin development

Herdr is a terminal multiplexer for coding agents. A plugin is an out-of-process package declared in `herdr-plugin.toml`; Herdr owns windows, panes, tabs, events and keybindings. There is no SDK: the whole Herdr CLI (`$HERDR_BIN_PATH`) is the plugin API.

## Tools and command of this plugin

- `herdr_scaffold_plugin` `{ targetDir, id, name, language: rust|typescript|bash, description? }` — starter project; refuses to overwrite an existing `herdr-plugin.toml`.
- `herdr_validate_manifest` `{ path }` — checks a manifest (or the folder holding it) against the rules below; run it after every manifest edit.
- `/herdr-plugin scaffold <lang> [dir] [id] | validate [path] | docs` — the same for the person.

## Rules

1. **Rust + Ratatui.** Herdr plugins are built in Rust with Ratatui unless the user asks for another language (instant cold start, small footprint, popups). TypeScript and Bash are for small helpers only.
2. **Vertical Slice Architecture.** `src/main.rs` is the composition root (CLI dispatch only); `src/shared/` is the kernel (Herdr client, context parser) and knows no slice; `src/slices/<feature>/` owns one feature. **Slices never import each other.** Details: `references/vsa-architecture.md`.
3. **Never guess Ratatui APIs** (they change between versions). Before writing Ratatui code: Context7 `resolve-library-id` "ratatui", then `query-docs` for the widget or pattern. Details: `references/rust-plugin.md`.
4. **Source files stay at or below 400 lines** (warning from 300); split into cohesive modules. Enforced in herdr projects.

## Manifest checklist

- Required top level: `id`, `name`, `version`, `min_herdr_version`. `id` uses letters, digits, `.`, `:`, `_`, `-`.
- Action, pane and link-handler ids are local: no dots, unique per kind. Herdr qualifies them as `<plugin-id>.<id>`.
- `command` is an argv array, never run through a shell.
- Declare `platforms = ["linux", "macos", "windows"]` (or a subset); items can override it.
- Pane `placement`: `overlay` (default), `popup`, `split`, `tab`, `zoomed`; `width`/`height` in cells or `"80%"`.
- A link handler's `action` must name an action of the same manifest.
- Runtime state: never write to `HERDR_PLUGIN_ROOT`; config goes to `HERDR_PLUGIN_CONFIG_DIR`, state to `HERDR_PLUGIN_STATE_DIR`. Call Herdr through `HERDR_BIN_PATH`.

## Development loop

```sh
herdr plugin link .                              # register the working directory (no build step is run)
herdr plugin action list --plugin <id>
herdr plugin action invoke <id>.<action>
herdr plugin pane open --plugin <id> --entrypoint <pane-id>
herdr plugin log list --plugin <id>
herdr plugin unlink <id>
```

Publish: GitHub repository with the topic `herdr-plugin`; users install with `herdr plugin install owner/repo[/subdir]`.

## References (herdr 0.9.5; read the one you need)

- `references/herdr-plugins.md` — the official plugin guide: manifest, install and link, build and startup, environment, panes, keybindings, link handlers.
- `references/herdr-cli-reference.md` — every CLI command (the plugin API).
- `references/herdr-socket-api.md` — raw socket requests.
- `references/rust-plugin.md` — Rust + Ratatui plugin layout and popups.
- `references/vsa-architecture.md` — slices, kernel and composition root.
- `references/typescript-plugin.md` — Node template (reference only).
