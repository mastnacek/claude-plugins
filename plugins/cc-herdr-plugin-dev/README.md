# cc-herdr-plugin-dev

Writing herdr plugins: a skill with offline docs, a starter project, manifest validation and gates before editing.

## Install

```
/plugin marketplace add mastnacek/claude-plugins
/plugin install cc-herdr-plugin-dev@mastnacek
```

## What it does

- **Skill `herdr-plugin-dev`** — herdr 0.9.5 plugin guide for the model (manifest, actions, panes, events, link handlers,
  Rust + Ratatui, vertical slices) with the full official docs (plugins, CLI reference, socket API) as offline references.
  Ratatui APIs are looked up through Context7, never guessed.
- **Starter project.** The `herdr_scaffold_plugin` tool (and `/herdr-plugin scaffold`) writes a Rust (Ratatui, VSA), TypeScript or Bash plugin
  with a valid manifest. An existing `herdr-plugin.toml` is never overwritten.
- **Manifest check.** The `herdr_validate_manifest` tool (and `/herdr-plugin validate`) lists errors and warnings:
  required fields, id formats, unique local ids, argv commands, pane placement, link-handler actions.
- **Docs before edit.** In a herdr project (a parent folder holds `herdr-plugin.toml`) an Edit/Write of a source file is refused
  until the session read the skill or its references (or ran the skill). Rules are also added to the system prompt there.
- **Line limit.** In a herdr project a source file over 400 lines is reported as an error telling the model to split it; from 300 lines a warning.

Outside a herdr project the plugin refuses nothing and adds nothing to the context.

## Commands

| command | does |
|---|---|
| `/herdr-plugin scaffold <rust\|typescript\|bash> [dir] [id]` | starter plugin (defaults: `./my-herdr-plugin`, `custom.herdr-tool`) |
| `/herdr-plugin validate [dir\|file]` | check `herdr-plugin.toml` (default: current folder) |
| `/herdr-plugin docs` | where the offline herdr docs are |

Tools for the model: `herdr_scaffold_plugin`, `herdr_validate_manifest`.
