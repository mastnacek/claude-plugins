#!/usr/bin/env bash
# agent.sh — kanonický spouštěč agenta v panelu herdr pro všechna repa (claude, spai, anon, …).
# Repa ho volají přes svůj tenký scripts/agent.sh. Postup: docs/herdr-orchestrace.md.
#
#   agent.sh coder                       programátor: Sonnet
#   agent.sh tester [--plugin-dir <p>]   tester: Haiku; nainstalovanou kopii téhož pluginu
#                                        vypne jen pro sezení
#
# Role jde do CC_ROLE: hook nebo watchdog repa pak agentovi zamítne git zápis — commit,
# push a úklid dělá jen orchestrátor.
# Pravidla role: prompts/<role>.md TOHOTO repa (jedna sada pro všechna repa) + volitelně
# prompts/<role>.local.md repa, ve kterém agent běží (jeho specifika). Konstanty dává
# hlavička zadání (záznam SPAI).
#
# Prostředí: AGENT_SCRATCH = scratchpad orchestrátora (přístup bez dotazu);
#            CODE_MODE=1 = Code Mode Claude Code (jen agenti; vypíná Remote Control).
# Windows: spouštěj přes Git Bash (& 'C:\Program Files\Git\bin\bash.exe' scripts/agent.sh coder).
set -euo pipefail

canon="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

role="${1:-}"
shift || true
case "$role" in
  coder)  model=sonnet ;;
  tester) model=haiku ;;
  *) echo "Použití: scripts/agent.sh coder|tester [volby claude]" >&2; exit 2 ;;
esac

# Režim auto: agent se neptá na každé volání; git zápis zamítá hook / watchdog.
extra=(--permission-mode auto)
[[ -n "${AGENT_SCRATCH:-}" ]] && extra+=(--add-dir "$AGENT_SCRATCH")

# Plugin z --plugin-dir, který je i nainstalovaný z marketplace, by běžel dvakrát.
args=("$@")
for ((i = 0; i < ${#args[@]}; i++)); do
  if [[ "${args[i]}" == "--plugin-dir" && -n "${args[i+1]:-}" ]]; then
    dir="${args[i+1]}"
    name="$(sed -n 's/.*"name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$dir/.claude-plugin/plugin.json" 2>/dev/null | head -1 || true)"
    [[ -n "$name" ]] && extra+=(--settings "{\"enabledPlugins\":{\"$name@mastnacek\":false}}")
  fi
done

# Pravidla role: kanonická + specifika repa v jednom souboru.
rules="$(mktemp "${TMPDIR:-/tmp}/agent-$role-XXXXXX.md")"
[[ -r "$canon/prompts/$role.md" ]] && cat "$canon/prompts/$role.md" > "$rules"
[[ -r "$repo/prompts/$role.local.md" ]] && { printf '\n\n' >> "$rules"; cat "$repo/prompts/$role.local.md" >> "$rules"; }
[[ -s "$rules" ]] && extra+=(--append-system-prompt-file "$rules")

[[ -n "${CODE_MODE:-}" ]] && export CLAUDE_CODE_EXPERIMENTAL_CODE_MODE=1

CC_ROLE="$role" exec claude --model "$model" "${extra[@]}" "$@"
