#!/usr/bin/env bash
# kolega.sh [--interval s] — spustí (nebo jen ověří) roli „kolega“: agy jen ke čtení v malém
# panelu vpravo dole a pod ním hlídač (kolega-watch.sh), který mu posílá pobídky se seznamem
# všech sezení Claude ve workspace (orchestrátor, programátor, tester, fable …).
# Idempotentní: běží-li panel „kolega“, nic nového nezakládá. Volá ho orchestrátor a sám
# i scripts/agent.sh při startu agenta, takže kolega běží vždy, když se pracuje s agenty.
set -euo pipefail

interval=600
[[ "${1:-}" == "--interval" ]] && interval="${2:-600}"
canon="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ws="${HERDR_WORKSPACE_ID:?běží jen v herdr}"
scratch="${AGENT_SCRATCH:-${TMP:-/tmp}}"; scratch="${scratch//\\//}"
settings="$scratch/kolega-settings.json"

tab="${HERDR_TAB_ID:-}"
export PYTHONUTF8=1
# Panely jen v aktuálním tabu (orchestrátorův), ne v cizích.
panes() { herdr pane list --workspace "$ws" | python -c "import sys,json;d=json.load(sys.stdin);d['result']['panes']=[p for p in d['result']['panes'] if not '$tab' or p.get('tab_id')=='$tab'];print(json.dumps(d))"; }
find_pane() { panes | python -c "import sys,json;print(next((p['pane_id'] for p in json.load(sys.stdin)['result']['panes'] if (p.get('label') or '').startswith(sys.argv[1])),''))" "$1"; }

kolega="$(find_pane kolega)"
if [[ -n "$kolega" ]]; then echo "kolega už běží: $kolega"; exit 0; fi

# Umístění: pod programátorem, jinak pod nejpravějším panelem; orchestrátor zůstává na celou výšku.
target="$(find_pane programátor)"
[[ -z "$target" ]] && target="$(panes | python -c "import sys,json;P=json.load(sys.stdin)['result']['panes'];print(P[-1]['pane_id'])")"
kolega="$(herdr pane split --pane "$target" --direction down --ratio 0.7 --cwd "D:/01_programovani" --no-focus \
  | python -c "import sys,json;print(json.load(sys.stdin)['result']['pane']['pane_id'])")"
herdr pane rename "$kolega" "kolega (agy)" >/dev/null
watch="$(herdr pane split --pane "$kolega" --direction down --ratio 0.85 --cwd "D:/01_programovani" --no-focus \
  | python -c "import sys,json;print(json.load(sys.stdin)['result']['pane']['pane_id'])")"
herdr pane rename "$watch" "kolega-hlídač" >/dev/null

printf '{"permissions":{"deny":["command(*)"]},"allowNonWorkspaceAccess":true}' > "$settings"
home="${USERPROFILE:-$HOME}"; home="${home//\\//}"
herdr pane run "$kolega" "agy --dangerously-skip-permissions --mode plan --settings '$settings' --add-dir '$home/.claude/projects' --add-dir 'D:/01_programovani' --add-dir '$scratch'" >/dev/null
herdr pane wait-output "$kolega" --match "for shortcuts" --timeout 60000 >/dev/null || true
herdr pane send-keys "$kolega" esc >/dev/null
herdr pane run "$watch" "& 'C:\Program Files\Git\bin\bash.exe' '$canon/scripts/kolega-watch.sh' '$kolega' $interval" >/dev/null
echo "kolega: $kolega, hlídač: $watch (pobídka nejvýš jednou za ${interval} s)"
