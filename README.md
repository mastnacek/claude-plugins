# claude-plugins

Claude Code plugins by mastnacek, in one marketplace.

```
/plugin marketplace add mastnacek/claude-plugins
/plugin install cc-prompt-translate@mastnacek
```

| Plugin | What it does |
|---|---|
| [cc-prompt-translate](plugins/cc-prompt-translate) | Translates your prompts into English before they reach the model and the final answer back into Czech (or your language). |

Each plugin lives in `plugins/<name>/` with its own README, tests and version.

## Developing plugins

This repository is also the knowledge base for building them. Open Claude Code
in a clone of it: [`CLAUDE.md`](CLAUDE.md) loads automatically and walks
through the three steps — agree on a name, generate the scaffold, write the
code slice by slice.

| Need | Where |
|---|---|
| New plugin, step by step | [`docs/novy-plugin.md`](docs/novy-plugin.md) |
| Porting an extension from the pi agent | [`docs/port-z-pi.md`](docs/port-z-pi.md) |
| Hooks code: slices, deep modules, engine traps | [`docs/architektura.md`](docs/architektura.md) |
| Commits, branches, releasing a version | [`docs/git-a-vydani.md`](docs/git-a-vydani.md) |
| Scaffold template | [`templates/plugin/`](templates/plugin) |

Create a plugin from the template (it also registers it in the marketplace and
runs both validators):

```sh
scripts/new-plugin.sh <name> "<one-line description>"
```

The guides are written in Czech. [`plugins/cc-prompt-translate`](plugins/cc-prompt-translate)
is the worked example they refer to.
