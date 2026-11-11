# cc-agent-watchdog

Watchdog for coding agents: a ledger of tool calls, rules, and a scorecard for the coder and the tester.

It only **reports**. It never denies a tool call and never changes a tool's input.

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
  reading credentials (W21), writes on remote hosts and devices (W26), debugging leftovers (W28), and — as an opt-in profile rule —
  editing files through the shell (W29). A denied call counts only as an attempt (10 points), not as the act.
- **Scorecard.** `/watch report` draws a framed card: score 0–100, every violation with time and evidence (instant failures in red),
  and a summary of counts.
- **Tag under the prompt**, next to other plugins' tags: `[👁 85]`, `[👁 85 ⚠2]` (⚠ = number of violations), `[👁 0 ⛔]` (instant failure).

## Commands

| command | what it does |
|---|---|
| `/watch report` | scorecard of this session |
| `/watch report last` | the previous session of this project |
| `/watch report all` | one line per session of this project |
| `/watch report <id>` | a session by the first characters of its id |
| `/watch rules` | the rules active for the current role |

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
  "profile": ["W29"]
}
```

| key | meaning | default |
|---|---|---|
| `gate` | commands (each a command prefix) that must all pass after the last change before the agent says "done" (W14, W16, W17); empty = the usual test/build/lint commands (`cargo test`, `npm test`, `pytest`, `go test`, `claude plugin test`, `make test` …) count, any one of them | `[]` |
| `allowed` | paths the agent may change besides the project root and scratch; also lets it read otherwise protected paths | `[]` |
| `protected` | paths it must not touch; **added to** the built-in list (`~/.ssh`, `~/.claude/settings*`, `~/.claude/rules`, `~/.claude/statusline*`, `~/.pi/agent/*.json`, `/etc`, `.git/config`, …) | built-in list |
| `scratch` | places for probes and temporary files | `["/tmp/claude-*"]` |
| `remoteAllow` | hosts and device serials where writes are allowed (W26) | `[]` |
| `profile` | opt-in rules to switch on (`W29`) | `[]` |

Paths may use `~`, `*` and `**`; relative ones are taken from the project root.

## Limits

Commands are tokenised heuristically (quotes, `&&`, `;`, pipes, `bash -c`; heredoc bodies are ignored), not run through a shell. Symlinks are not resolved.
The "done" claim in W14 is a word match per sentence; sentences with a negation ("not done", "není hotovo", "NOT VERIFIED") are ignored, other phrasings can still fool it. A session that changed nothing is not judged. Rules that need file contents or an LLM judge are not part of this version.
