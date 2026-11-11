# Changelog

## Unreleased

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
