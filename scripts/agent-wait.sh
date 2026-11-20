#!/usr/bin/env bash
# agent-wait.sh <pane> [max_minut] — čeká, až agent Claude v panelu herdr dokončí tah.
# herdr u agentů spuštěných přes scripts/agent.sh (Git Bash) často hlásí agent_status
# "unknown", proto se kromě stavu čte i obsah panelu: hotovo = žádné "esc to interrupt"
# a v posledních řádcích "✻ … for …" (souhrn tahu), nebo stav idle / done / blocked.
# Vypíše "stav: <důvod>" a posledních 40 řádků panelu.
set -uo pipefail
export MSYS_NO_PATHCONV=1
pane="$1"; max="${2:-240}"
sleep 20
end=$(( $(date +%s) + max * 60 ))
while (( $(date +%s) < end )); do
  st=$(herdr pane get "$pane" 2>/dev/null | grep -o '"agent_status":"[^"]*"' | cut -d'"' -f4)
  txt=$(herdr pane read "$pane" 2>/dev/null)
  case "$st" in idle|done|blocked) echo "stav: $st"; break;; esac
  if ! grep -q "esc to interrupt" <<<"$txt"; then
    # A turn that ends with its own monitors / shells still running is a
    # pause, not the end: the agent wakes again when they report.
    if tail -25 <<<"$txt" | grep -qE "still running|monitors? ·|shells? ·"; then sleep 10; continue; fi
    if tail -25 <<<"$txt" | grep -qE "✻ .* for [0-9]"; then echo "stav: hotovo (panel)"; break; fi
    if tail -25 <<<"$txt" | grep -qE "Do you want|❯ 1\. Yes"; then echo "stav: čeká na schválení"; break; fi
  fi
  sleep 10
done
herdr pane read "$pane" 2>/dev/null | tail -40
