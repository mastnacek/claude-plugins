#!/usr/bin/env bash
# agent-no-spawn.sh — PreToolUse hook (Bash, PowerShell): agenti nespouštějí další agenty.
# Agenty, sub-agenty, panely a testery spouští jen orchestrátor. Agent spuštěný přes
# scripts/agent.sh má CC_ROLE (coder, tester, …); jeho příkaz, který by spustil claude,
# agy, pi, codex …, agent.sh / kolega.sh nebo herdr agenta / panel, se zamítne.
# Sezení bez CC_ROLE (orchestrátor, uživatel) hook nijak neomezuje.
# Zapojuje ho scripts/agent.sh (--settings pro každého agenta v každém repu).
# Nástroj Agent (sub-agenti) zakazuje agent.sh přes --disallowedTools.
set -euo pipefail

role="${CC_ROLE:-}"
[[ -z "$role" || "$role" == "orchestrator" ]] && exit 0

# Bez jq (z Git Bash nejde spustit); prohledává se celý JSON vstup.
input="$(cat)"

deny() {
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Jsi %s: %s"}}\n' "$role" "$1"
  exit 0
}

start='(^|[";&|(]|[[:space:]]|[\\/])'
msg="agenty, sub-agenty, panely a testery spouští jen orchestrátor. Živý test s agentem nech jako NOT VERIFIED a popiš ho ve zprávě; orchestrátor ho pustí sám."

# claude: interaktivně, -p, --model, --resume …; `claude plugin …` (brána pluginů) je povolené.
if grep -qiE "${start}claude(\.exe)?['\"]?([[:space:]]+(-p|--print|--model|--resume|-r|--continue|-c|--agent|--agents|--settings|--permission-mode|--dangerously|--append-system-prompt|--add-dir)|[[:space:]]*(\$|[;&|)\"]))" <<<"$input"; then
  deny "$msg"
fi
# Jiní agenti.
if grep -qiE "${start}(agy|codex|opencode|copilot|hermes|omp)(\.exe)?([[:space:]]|['\"]|\$)" <<<"$input"; then
  deny "$msg"
fi
if grep -qiE "${start}pi(\.exe)?[[:space:]]+(-p|--print|--model|--exclude-tools|--mode)" <<<"$input"; then
  deny "$msg"
fi
# Spouštěče rolí.
if grep -qiE "(agent|kolega)\.sh" <<<"$input"; then
  deny "$msg"
fi
# herdr: agenti, panely, taby, workspacy (čtení stavu přes list/get/read je povolené).
if grep -qiE "${start}herdr(\.exe)?[[:space:]]+(agent[[:space:]]+(start|prompt|send-keys|send-text)|pane[[:space:]]+(run|split|send-keys|send-text|close|move)|tab[[:space:]]+(create|close)|workspace[[:space:]]+(create|close)|plugin[[:space:]]+pane)" <<<"$input"; then
  deny "$msg"
fi
exit 0
