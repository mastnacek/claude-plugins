# Changelog

## 0.1.0

Port of `pi-herdr-plugin-dev`.

### Added
- Skill `herdr-plugin-dev` with the herdr **0.9.5** docs (plugins, CLI reference, socket API) as offline references; Ratatui lookups go through Context7.
- Tools `herdr_scaffold_plugin` (rust | typescript | bash) and `herdr_validate_manifest`; the manifest check now uses a real TOML reader
  and the 0.9.5 rules (unique local ids without dots, argv commands, pane placement, link-handler actions).
- Command `/herdr-plugin scaffold | validate | docs` with argument completion and a framed output.
- Docs gate: Edit/Write/MultiEdit/NotebookEdit of source in a herdr project is refused until the skill or its references were read; rules in the system prompt.
- Line limit: a source file over 400 lines in a herdr project is an error, from 300 a warning.

### Changed
- Both gates act only inside a herdr project (a parent folder with `herdr-plugin.toml`); elsewhere nothing is refused or added.

### Removed
- Subscription bookkeeping (`unsubscribers`, `session_shutdown`): the engine owns the hooks' life cycle.
- The hand-written digests `manifest-schema`, `runtime-environment`, `cli-and-linking`: the official 0.9.5 pages replace them.
