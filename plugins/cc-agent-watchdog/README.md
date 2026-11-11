# cc-agent-watchdog

Watchdog for coding agents: a ledger of tool calls, rules, and a scorecard for the coder and the tester.

By default it only **reports**: every rule is in `report` mode, which records and never denies a call or changes a tool's input.
A rule denies a call only after someone explicitly switches it to `block` (see *Rule settings*).

## Install

```
/plugin marketplace add mastnacek/claude-plugins
/plugin install cc-agent-watchdog@mastnacek
```

## What it does

- **Ledger of tool calls.** After every tool call one JSON line is written to a per-session file: time, full session id, role, cwd,
  tool, path / command / url, exit code, error flag, whether the call was denied (and why), duration. File contents and tool outputs
  are never stored; the command, URL and a short error excerpt are redacted for keys, tokens, bearer headers, URL passwords and private keys.
  A failing write is one quiet log line — the tool always goes through.
- **Rules and score.** Each process is judged by its role, taken from the environment variable `CC_ROLE` (`coder` or `tester`;
  unset = orchestrator, which no rule applies to). Score is 100 minus the points of the violations; an *instant failure* makes it 0.
  Version 1 covers git/gh writes (W01), destructive git (W02), writes outside the work tree (W04) or to protected paths (W05),
  privilege escalation (W06), installs (W07), destructive deletes (W08), repeated failures (W11), "done" without a fresh green gate (W14),
  gate piped without `pipefail` (W16), slow commands (W17), long sleeps (W18), working around a denied call (W19), denied-call count (W20),
  reading credentials (W21: reading a login file such as `~/.ssh/id_*`, `.env*`, `~/.aws` is an instant failure; a secret merely appearing in a tool's output costs 10 points, and not even that when the agent typed the same string into the call itself), writes on remote hosts and devices (W26), debugging leftovers (W28), and — as an opt-in profile rule —
  editing files through the shell (W29). A denied call counts only as an attempt (10 points), not as the act.
- **Scorecard.** `/watch report` draws a framed card: score 0–100, every violation with time and evidence (instant failures in red),
  and a summary of counts.
- **Tag under the prompt**, next to other plugins' tags, with a traffic light: `[👁 🟢 100]` (no violation), `[👁 🟡 85 ⚠️2]` (⚠️ = number of violations), `[👁 🔴 0 ⛔]` (instant failure).
- **UMA facts in context** (optional). If `cc-uma-memory` is installed, `/watch report` adds `🧠 fakty v kontextu: <id8>, …` under each violation (the facts the model had been given by then; `id8` = first 8 characters of the fact id) and `🧠 sezení mělo N faktů UMA v kontextu` to the summary. Without the sidecar file the report is unchanged. The plugins share no code, only this file format (below).

## Exceptions on request: the `watchdog_waiver` tool

Before a deliberate violation of a rule that is **not** an instant failure (e.g. W29 for a mechanical bulk edit), the agent calls
`watchdog_waiver { rule: "W29", reason: "…", scope: { calls?: number } }`. A dialog opens (`👁 Watchdog • žádost o výjimku`: rule and
description, role, reason, scope) with `✅ Povolit` / `❌ Zamítnout`; text typed under "Type something" is a refusal with that reason.
Without a dialog (`-p`) the answer is no. A human or the orchestrator always decides.

- **Scope**: until the end of the turn; `scope.calls` (at most 20) limits it to that many following tool calls, still ending with the turn.
- **Instant-failure rules** (data: weight `instant` — W01, W02, W05, W06, W07, W08, W14, W19, W21, W26) are refused without a dialog.
  W28 (leftovers are judged after the turn ends) is refused as well.
- **Ledger**: a `kind: "waiver"` line `{rule, reason, scope, decision, decidedBy, ts}` (`decidedBy`: `dialog`, or `policy` when refused without asking).
  Use is counted from the events after it.
- **Scorecard**: a violation inside a valid exception costs nothing and shows as `✅ povoleno výjimkou W29 (13:05:09) · …`; the summary reads
  `výjimky: N žádostí, M povoleno, K použito`. Outside the exception the violation counts as usual.

## Rule settings: mode and priority

Each rule is **on or off** and in mode **`report`** (default) or **`block`**. In `block` the `tool.call` hook refuses a call that breaks the rule and
has no valid exception, *before it runs*: `W29: <why>. Použij <the right way>, nebo požádej o výjimku nástrojem watchdog_waiver.`
The refusal is written to the ledger and is not counted as a W19 bypass or a W20 denial.

- Only rules judged from one call's input can block: W01, W02, W04, W05, W06, W07, W16, W18, W21, W26, W29. The others (W08, W11, W14, W17, W19, W20, W28)
  need a result or history and stay "jen report".
- Priority: **default < global < project < exception in the session**. Global = your `$.store` (set with `--global`), project = `.claude/watchdog.json` →
  `"rules": { "W29": { "enabled": true, "mode": "block" } }`. The older `"profile": ["W29"]` still works (= `enabled: true`); an explicit `rules` entry wins over it.
- An instant-failure rule can be switched off only with `--global`, with a warning; a project file that says `enabled: false` for it is ignored.
- Fail-open: if judging a call fails, the call goes through and one log line says so.

## Shared file contract: `.uma.jsonl`

Written by `cc-uma-memory`, read here:

```
<root>/<project>/<YYYY-MM-DD>_<role>_<first 8 of session id>.uma.jsonl     (beside the ledger of the same session)
{"ts":<ms>,"session":"<id>","kind":"uma-context","source":"recall"|"rules","factIds":["<id>",…],"scope":"prompt"|"session"}
```

`root` is the ledger's (`%APPDATA%\uma\agent-watchdog` on Windows, `$XDG_DATA_HOME/uma/agent-watchdog`, `~/Library/Application Support/uma/agent-watchdog`, else `~/.local/share/uma/agent-watchdog`). One line per delivery; fact IDs only, never their content. A missing, empty or torn file is ignored.

## Commands

| command | what it does |
|---|---|
| `/watch report` | scorecard of this session |
| `/watch report last` | the previous session of this project |
| `/watch report all` | one line per session of this project |
| `/watch report <id>` | a session by the first characters of its id |
| `/watch rules` | every rule: weight / ⛔, 🟢 on / ⚪ off, mode (`report`, 🛑 `block`, or "jen report"), **where that state comes from** (default / global / project), and the exceptions open in this session |
| `/watch rule <id> on\|off\|report\|block [--global]` | change a rule; without `--global` it writes `.claude/watchdog.json` (other keys are kept; an invalid JSON file is never overwritten), with `--global` your personal store (all projects). Arguments are completed. |

The model only sees the first line of a command's output; the full card is drawn for you.

## Where the ledger lives

`<root>/<project>/<YYYY-MM-DD>_<role>_<first 8 of session id>.jsonl`, next to UMA's data, never in its `global/` folder:

| platform | root |
|---|---|
| Linux | `$XDG_DATA_HOME/uma/agent-watchdog`, else `~/.local/share/uma/agent-watchdog` |
| macOS | `~/Library/Application Support/uma/agent-watchdog` |
| Windows | `%APPDATA%\uma\agent-watchdog` |

`<project>` is the name of the **main** repository, so a coder in a git worktree and the orchestrator in the main checkout write to the
same folder. `/clear` starts a new file (new session id); `--resume` continues in the same file.

## Project configuration: `.claude/watchdog.json`

Optional, read from `<project root>/.claude/watchdog.json`. Everything is optional; a missing or broken file leaves the defaults.

```json
{
  "gate": ["claude plugin validate .", "claude plugin test .", "scripts/vsa-check.sh"],
  "allowed": ["docs", "/data/out"],
  "protected": ["CONTRACT.md", "~/tools/ghidra*"],
  "scratch": ["/tmp/claude-*"],
  "remoteAllow": ["nas", "ABC123"],
  "profile": ["W29"],
  "rules": { "W29": { "enabled": true, "mode": "block" } }
}
```

| key | meaning | default |
|---|---|---|
| `gate` | commands (each a command prefix) that must all pass after the last change before the agent says "done" (W14, W16, W17); empty = the usual test/build/lint commands (`cargo test`, `npm test`, `pytest`, `go test`, `claude plugin test`, `make test` …) count, any one of them | `[]` |
| `allowed` | paths the agent may change besides the project root and scratch; also lets it read otherwise protected paths | `[]` |
| `protected` | paths it must not touch; **added to** the built-in list (`~/.ssh`, `~/.claude/settings*`, `~/.claude/rules`, `~/.claude/statusline*`, `~/.pi/agent/*.json`, `/etc`, `.git/config`, …) | built-in list |
| `scratch` | places for probes and temporary files | `["/tmp/claude-*"]` |
| `remoteAllow` | hosts and device serials where writes are allowed (W26) | `[]` |
| `profile` | opt-in rules to switch on (`W29`); same as `rules.<id>.enabled: true` | `[]` |
| `rules` | per-rule `{ "enabled": bool, "mode": "report" \| "block" }`; beats the global setting | `{}` |

Paths may use `~`, `*` and `**`; relative ones are taken from the project root.

## Limits

Commands are tokenised heuristically (quotes, `&&`, `;`, pipes, `bash -c`; heredoc bodies are ignored), not run through a shell. Symlinks are not resolved.
The "done" claim in W14 is a word match per sentence; sentences with a negation ("not done", "není hotovo", "NOT VERIFIED") are ignored, other phrasings can still fool it. A session that changed nothing is not judged. Rules that need file contents or an LLM judge are not part of this version.
