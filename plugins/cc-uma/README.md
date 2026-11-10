# cc-uma

UMA (Universal Memory Architecture) pro Claude Code — paměť sdílená s pi

## Install

```
/plugin marketplace add mastnacek/claude-plugins
/plugin install cc-uma@mastnacek
```

## What it does

- **Turn off Claude Code's own automatic memory** (not UMA) so UMA is the only memory — globally or per project.
- **Status under the prompt** — whether Claude's auto memory is on or off, and which settings file decides.

## Commands

- `/uma claude-memory` — show whether Claude Code's auto memory (not UMA) is on and where the value comes from (global / project / local / default).
- `/uma claude-memory off` — write `"autoMemoryEnabled": false` to `.claude/settings.local.json` of the current project.
- `/uma claude-memory off --global` — write it to `~/.claude/settings.json`.
- `/uma claude-memory on [--global]` — the same with `true`.
- `/uma help` — short help.

A change applies from the next session (the system prompt is built at start). Settings files are edited safely: only `autoMemoryEnabled` changes, and a file that is not valid JSON is left untouched.
