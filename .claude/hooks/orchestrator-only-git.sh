#!/usr/bin/env bash
# orchestrator-only-git.sh — PreToolUse hook (Bash): commit a push dělá jen
# orchestrátor. Agenti spuštění přes scripts/agent.sh mají CC_ROLE (coder,
# tester…); jejich `git commit` / `git push` se zamítne s vysvětlením.
# Sezení bez CC_ROLE (orchestrátor, uživatel) hook nijak neomezuje.
set -euo pipefail

role="${CC_ROLE:-}"
[[ -z "$role" || "$role" == "orchestrator" ]] && exit 0

# Bez jq: jq z WinGet Links v Git Bash nejde spustit (exit 126 = hook nic
# neblokoval). Prohledává se celý JSON vstup; příkaz je v něm doslova.
command="$(cat)"

# git commit / git push i s volbami před podpříkazem (git -C dir commit),
# kdekoli v řetězci příkazů (a && git commit, …).
# `"` na začátku = začátek hodnoty "command" v JSON.
if grep -qE '(^|[";&|(]|[[:space:]])git([[:space:]]+-[^[:space:]]+([[:space:]]+[^-[:space:]"][^[:space:]"]*)?)*[[:space:]]+(commit|push)([[:space:]"]|$)' <<<"$command"; then
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Jsi %s: commit a push dělá jen orchestrátor. Nech změny v pracovním stromu a v závěrečné zprávě navrhni zprávu commitu."}}
' "$role"
fi
exit 0
