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
# kdekoli v řetězci příkazů (a && git commit, …). `"` = začátek či konec
# hodnoty "command" v JSON.
git_sub='(^|[";&|(]|[[:space:]])git([[:space:]]+-[^[:space:]]+([[:space:]]+[^-[:space:]"][^[:space:]"]*)?)*[[:space:]]+'
deny() {
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Jsi %s: %s"}}\n' "$role" "$1"
  exit 0
}

if grep -qE "${git_sub}(commit|push)([[:space:]\"]|\$)" <<<"$command"; then
  deny "commit a push dělá jen orchestrátor. Nech změny v pracovním stromu a v závěrečné zprávě navrhni zprávu commitu."
fi
# Úklid po sloučení (worktree, větve) taky jen orchestrátor; uživatelské
# nastavení ho povoluje všem sezením, tady se agentům zakazuje.
if grep -qE "${git_sub}(worktree[[:space:]]+(remove|prune)|branch[[:space:]]+(.*[[:space:]])?(-d|-D|--delete)([[:space:]\"]|\$))" <<<"$command"; then
  deny "mazání worktree a větví dělá jen orchestrátor. Napiš do zprávy, co by se mělo uklidit."
fi
exit 0
