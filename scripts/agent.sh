#!/usr/bin/env bash
# agent.sh — spustí agenta v panelu herdr s jeho rolí a modelem.
#
#   scripts/agent.sh coder                       programátor: Sonnet
#   scripts/agent.sh tester [--plugin-dir <p>]   tester: Haiku; nainstalovanou kopii
#                                                téhož pluginu vypne jen pro sezení
#
# Role jde do CC_ROLE: hook .claude/hooks/orchestrator-only-git.sh pak agentovi
# zamítne git commit a git push — ty dělá jen orchestrátor.
set -euo pipefail

role="${1:-}"
shift || true
case "$role" in
  coder)  model=sonnet ;;
  tester) model=haiku ;;
  *) echo "Použití: scripts/agent.sh coder|tester [volby claude]" >&2; exit 2 ;;
esac

# A plugin loaded with --plugin-dir that is also installed from the marketplace
# would run twice: turn the installed copy off for this session only.
extra=()
args=("$@")
for ((i = 0; i < ${#args[@]}; i++)); do
  if [[ "${args[i]}" == "--plugin-dir" && -n "${args[i+1]:-}" ]]; then
    dir="${args[i+1]}"
    name="$(jq -r '.name // empty' "$dir/.claude-plugin/plugin.json" 2>/dev/null || true)"
    [[ -n "$name" ]] && extra+=(--settings "{\"enabledPlugins\":{\"$name@mastnacek\":false}}")
  fi
done

CC_ROLE="$role" exec claude --model "$model" "${extra[@]}" "$@"
