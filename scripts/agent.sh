#!/usr/bin/env bash
# agent.sh — spustí agenta v panelu herdr s jeho rolí a modelem.
#
#   scripts/agent.sh coder                       programátor: Sonnet
#   scripts/agent.sh tester [--plugin-dir <p>]   tester: Haiku
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

CC_ROLE="$role" exec claude --model "$model" "$@"
