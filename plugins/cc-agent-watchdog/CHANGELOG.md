# Changelog

## 0.3.2

### Fixed
- **W29 resolves variables in a write target.** `$SCRATCH`, `$AGENT_SCRATCH`, `$env:AGENT_SCRATCH` (read from the session env) and any
  variable assigned earlier in the same command (`S=/x; … > "$S/log"`, `export S=…`, PowerShell `$S = …`) are expanded; a directory they
  name counts as scratch. A target that still cannot be resolved is not counted (it was read as a path inside the work tree).
  `mkdir` / `New-Item -ItemType Directory` inside scratch is no hit.
- **W29 checks PowerShell like Bash.** `>`, `>>`, `*>`, `Out-File`, `Set-Content`, `Add-Content`, `New-Item`, `Copy-Item`, `Move-Item`
  into the work tree are a hit; the PowerShell tokenizer keeps `\` as a path separator. The shell facts also reach W04, W05, W14 and W21 for PowerShell calls.

### Changed
- W29 / coder rule 10 wording: files of the work tree change only through Write/Edit; Bash and PowerShell only run things; redirects and `mkdir` only into scratch.

## 0.3.1

### Fixed
- Waiver summary declines in Czech: „1 žádost“, „2 žádosti“, „5 žádostí“ (was „1 žádostí“).
- W16 says how the gate's exit code was hidden — „v rouře do tail bez pipefail“, „za ním „||“ …“ or „za ním „;“ …“ —
  instead of „v rouře“ for every case; the rule text and the W14 evidence follow.

## 0.3.0

### Changed
- **W21 no longer ends the score because of a secret in a tool's output.** Instant failure remains only for *reading login files*
  (`~/.ssh/id_*`, `ssh-keygen -y`, `~/.pi/agent/auth.json`, `~/.config/gh/hosts.yml`, `.env*`, `~/.aws`, `~/.claude/.credentials*`).
  A secret pattern in the output is now −10 points.
- The ledger sets `secretOut` only for a secret the agent did not send itself: if the secret (or its first 8 characters, as tools print
  cut previews) is in the call's own input, it is test data the agent made up and nothing is flagged
  (false positive: `uma secrets scan` on a fake `sk-…` key scored 0).
- `[👁 🟢 100]` / `[👁 🟡 85 ⚠️2]` / `[👁 🔴 0 ⛔]`: traffic light in the tag under the prompt.

### Added
- **Exceptions on request**: the `watchdog_waiver` tool (dialog, `kind: "waiver"` ledger lines, instant-failure rules refused without a dialog);
  covered violations cost nothing and show as `✅ povoleno výjimkou …`; summary `výjimky: N žádostí, M povoleno, K použito`.
- **Rule mode `report` | `block`** (default `report` everywhere): `block` refuses a call that breaks the rule before it runs, fail-open;
  refusals are marked in the ledger and not counted by W19/W20.
- **Rule settings** default < global (`$.store`) < project (`.claude/watchdog.json` → `rules`); `/watch rules` shows state, mode and source,
  `/watch rule <id> on|off|report|block [--global]` changes them (with argument completion). `profile` still works.
- `/watch report` shows the UMA facts the model had in context (`🧠 fakty v kontextu: …`, `🧠 sezení mělo N fakty/faktů UMA v kontextu`)
  when `cc-uma-memory` wrote a `.uma.jsonl` sidecar beside the ledger (file contract in the README).
