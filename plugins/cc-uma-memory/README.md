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
- **Warns before risky code edits** (immune interceptor, port from pi): before `Write` / `Edit` / `NotebookEdit` into a file *outside* the UMA store, the plugin asks `uma risk pain <file>`, loads the active rules (`decision`, `pattern`, `preference`, `correction`) and judges the edit — a medium/critical pain score, or an edit that shares enough vocabulary with a rule, is a warning; a rule with an ast-grep contract is checked with `ast-grep` (from `PATH`, or the copy pi installed under `~/.pi/agent/npm`; without it the contract only warns, visibly). Modes (`/uma immune`): **warn** (default) writes one log line and tells the model nothing; **ask** opens the *🛡️ UMA imunitní interceptor* dialog (*Ano, pokračovat* / *Ne, zablokovat*) when a rule, a contract or a pain score ≥ 50 is involved — *Ne* blocks the edit with the warning as the reason; **auto** additionally blocks a *verified* deny contract at once (visible log line, reason for the model); **off**. A heuristic verdict never vetoes silently: with nobody to ask (`-p`) the edit goes through with a warning.
- **A second opinion in that dialog** — when a rule matched, a cheap model on **OpenRouter** says whether the edit *violates*, *touches* or is *unrelated* to the rule (advice only; it never approves or blocks). Default model `google/gemini-3.5-flash-lite`; choose another with `/uma immune-model <openrouter-id>`, back with `/uma immune-model default`. The key is `OPENROUTER_API_KEY`, else the one pi keeps in `~/.pi/agent/auth.json` (`openrouter`: an `oauth` entry that has not expired, or `key`); the key is never logged or shown. No key, timeout (8 s) or error → the dialog simply has no recommendation. Your answers are kept in a local decision log (`$.store`, never in memory facts); `/uma immune stats` shows how often you followed the recommendation, and plasticity of the rule is updated as in pi (`uma plasticity reinforce|frustrate`).
- **Humility gate** (port from pi, **off** by default; `/uma humility on`) — `uma_humility` only advises. With the gate on, a **LOW** verdict (`familiarity: low` and `exploration_required`) marks the directories of the `files` the model passed as unfamiliar. Until the model has `Read` the verdict's `required_reads` (3) files under such a directory **and** has stated a hypothesis, `Write` / `Edit` / `NotebookEdit` there are denied with pi's *Read-Only Explorative Mode* message, which says what is still missing. There is no `confirm` call in the MCP tool, so the hypothesis is a line in the model's own reply — `Hypothesis: …` (or `Hypotéza: …`) written after the check; the person is not asked. A new `uma_humility` call (new intent) starts clean, a HIGH verdict clears the marks, a new session forgets them. `Grep`/`Glob` and shell commands are neither counted nor gated (as in pi).
- **Reminds the model of open debts** (Prospective Debt Ledger): when the main agent finishes a turn, `uma debt check` is asked for open *blocking* debts (the agent records them with `uma_debt`); if there are any, the ledger's reminder is sent to the model as a new prompt so it carries on — settles the debts or explains them. At most **2 reminders per run** (a run is your prompt plus the continuations the plugin started); after that one log line `Otevřených blokujících dluhů: N …` and the model is left alone. Outside a git repo or without `uma` it stays silent (one log line per series). While blocking debts are open the tag below shows ` ⚖N`.
- **Shadow worker** (port from pi, **on** by default; `/uma shadow on|off|jev`) — notices moments worth remembering and stages them as *drafts* in `.uma/.staging/` (`uma staging distill`), in the background, without a dialog and without delaying a turn: a build/test command (`cargo test`, `npm test`, `tsc`, …) that failed and then passed within 5 minutes; an edit of a dependency manifest (`Cargo.toml`, `package.json`); a message of yours that corrects the agent ("špatně", "don't use …"). It never writes memory. `on` uses the engine's heuristic (no network, as pi's default); `jev` lets the Jev judge decide over OpenRouter.
- **Proposes routines** (muscle synthesis) — when the same sequence of three shell commands runs twice, a draft of a `skill` routine is staged (`uma staging create`, never `uma muscle new`). `/uma shadow off` stops it too.
- **Review drafts with `/uma review`** — each waiting draft is shown in the same step dialog as a memory write (preview, then *Approve* / *Edit* / *Skip* / *Reject*). Approve runs `uma staging approve` (with your edited title and body), Reject runs `uma staging discard`. The engine's `approve` takes only a title and a body, so tags and scope cannot be changed here (there is no "switch scope"). While drafts wait, the tag below the prompt shows ` 📝N`. A shell `uma staging approve|discard` from the model still asks for your approval.
- **Turn off Claude Code's own automatic memory** (not UMA) so UMA is the only memory — globally or per project.
- **Tag at the end of the hint line under the prompt** — `[UMA]` when Claude's auto memory is off, `[UMA ⚠ CC]` when it is on; ` ↻` is added once you changed it in this session (applies from the next one).

## MCP tools

- `uma_read`, `uma_list`, `uma_search`, `uma_consolidate` — read-only.
- `uma_write`, `uma_supersede` — write; enabled by `--allow-writes`.
- `uma_skill_invoke` — expands a stored skill template into a command; never runs it (you run it with your shell tool). Needs `uma` from pi-uma `master` after 0.17.8.
- `uma_debt` — the Prospective Debt Ledger of the working tree (`.uma/.state/debts.json`, never committed): the agent records an obligation its action creates (`add`), settles it (`settle`) or lists open ones. Advisory working state, not memory; the plugin's reminders (above) make it hard to finish with blocking debts open.
- `uma_muscle` — operator-curated routines: `list`, or `run <name>` as a **dry-run** that prints the exact steps and a `plan_hash`. It never executes anything (even with `confirm`).
- `uma_skeptic` — the adversarial Skeptic: a typed critique of a planned change (failure mode, devil objection, risk level, `suggested_debt`). Read-only, advisory.
- `uma_humility` — Familiarity Index: how well memory covers the code you are about to touch; `low` means read at least 3 related files first. Read-only, advisory.

`uma_skeptic` and `uma_humility` ask the judge model `google/gemini-3.5-flash-lite` on OpenRouter (override with `UMA_JUDGE_MODEL`). The key comes from `OPENROUTER_API_KEY` or pi's login in `~/.pi/agent/auth.json`; without a key they answer offline and say so in `judged_by`.

The read-only tools never need a prompt. To stop Claude Code asking for them, add to `permissions.allow`:

```json
"mcp__plugin_cc-uma-memory_uma__uma_read",
"mcp__plugin_cc-uma-memory_uma__uma_list",
"mcp__plugin_cc-uma-memory_uma__uma_search",
"mcp__plugin_cc-uma-memory_uma__uma_consolidate",
"mcp__plugin_cc-uma-memory_uma__uma_skill_invoke",
"mcp__plugin_cc-uma-memory_uma__uma_muscle",
"mcp__plugin_cc-uma-memory_uma__uma_skeptic",
"mcp__plugin_cc-uma-memory_uma__uma_humility",
"mcp__plugin_cc-uma-memory_uma__uma_debt"
```

`uma_debt` is not read-only, but it writes only the local, git-ignored ledger (no memory facts), so it is listed too.

**Running a routine.** Dry-run with `uma_muscle` → the model runs `uma muscle run <name> --confirm --plan-hash <hash>` with Bash → the write gate does its own dry-run and shows a dialog with the steps (`$ command args…`), the routine name and the hash; you answer *Ano, pokračovat* / *Ne, zablokovat*. A command without `--plan-hash`, with a hash that no longer matches the routine, with a failed dry-run, or with more than one routine is refused without a dialog. The dialog appears also with `/uma write-gate off` (running processes is not writing memory), and in `-p` mode the run is refused. For you in a terminal `--plan-hash` stays optional (the CLI); the gate guards the model.

**Project or global?** The MCP server runs in the folder where the Claude Code session started. Started inside a git repository, new facts go to that project's `.uma/`; started elsewhere (e.g. your home folder), they go to the global store unless the call names a `scope`.

Writes are approved by the write gate (see above). Claude Code's own MCP permission prompt may ask once more; add `mcp__plugin_cc-uma-memory_uma__uma_write` and `mcp__plugin_cc-uma-memory_uma__uma_supersede` to `permissions.allow` if you want only the plugin's dialog. Storage: global `~/.local/share/uma/global`, per project `<git root>/.uma`. New tools are added in the Rust core, not in this plugin.

## Commands

- `/uma claude-memory` — show whether Claude Code's auto memory (not UMA) is on and where the value comes from (global / project / local / default).
- `/uma claude-memory off` — write `"autoMemoryEnabled": false` to `.claude/settings.local.json` of the current project.
- `/uma claude-memory off --global` — write it to `~/.claude/settings.json`.
- `/uma claude-memory on [--global]` — the same with `true`.
- `/uma recall` — show whether recall is on; `/uma recall on|off` switches it (default **on**).
- `/uma write-gate` — show the write approval mode; `/uma write-gate ask|off` switches it (default **ask**). `off` removes the dialog only; `Write` / `Edit` into the store stay refused.
- `/uma append` — show whether the rules section is on; `/uma append on|off` switches it (default **on**).
- `/uma immune` — show the interceptor mode; `/uma immune off|warn|ask|auto` switches it (default **warn**); `/uma immune stats` — your answers to its dialogs.
- `/uma humility [on|off]` — show or switch the humility gate (default **off**).
- `/uma shadow [on|off|jev]` — show or switch the shadow worker (default **on**).
- `/uma review` — go through the staged drafts one by one (approve / edit / skip / reject).
- `/uma staging list`, `show <id>`, `discard <id>` — look at the drafts or throw one away.
- `/uma immune-model [<openrouter-id>|default]` — show or set the OpenRouter model of the dialog's recommendation (default `google/gemini-3.5-flash-lite`).
- `/uma search <query>`, `/uma list [global|<project>]`, `/uma read <id>`, `/uma timeline [--id <ULID>] [--all]`, `/uma doctor` — look into the memory. The full listing is shown to you; the model gets only a one-line summary. They read only. Results are drawn in a rounded frame (bold `🧠 UMA` header, coloured fact-type labels, dim IDs/paths/tags, ✅/⚠️/❌ by meaning); errors get a red frame. The model never sees the drawing.
- `/uma reindex` — rebuild the search index (`uma search "" --reindex`).
- `/uma export --out <folder>` — write the facts as an OKF bundle (one Markdown document per fact) into the folder; memory is not changed.
- `/uma debt [list|clear]` — `list` (default) shows every debt of this working tree, open and settled, to you (the model gets a one-line summary); `clear` deletes them all. `clear` is your action: it runs `uma debt clear` directly, and a shell `uma debt clear` from the model asks for your approval (`add`, `settle`, `list`, `check` do not).
- `/uma help` — short help.

The switches (`recall`, `write-gate`, `append`, `immune`, `immune-model`, `humility`, `shadow`) are stored with the plugin (`$.store`), so they apply in every session and project.

Limits of the write gate: it judges shell commands by their spelling, not by running them — variables, `eval`, scripts in files and symlinks reached from a shell command pass. It guards against the model's mistakes, not against malice.

A change applies from the next session (the system prompt is built at start). Settings files are edited safely: only `autoMemoryEnabled` changes, and a file that is not valid JSON is left untouched.
