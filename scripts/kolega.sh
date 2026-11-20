#!/usr/bin/env bash
# kolega.sh [--agent agy|pi|claude] [--interval s] [--debounce-s s] — spustí (nebo jen ověří) roli
# „kolega“: agent jen ke čtení v malém panelu vpravo dole a pod ním hlídač, který mu posílá
# pobídky se sezeními ostatních agentů (orchestrátor, programátor, tester, fable …).
#   claude (výchozí) claude --model haiku; zakázané Write, Edit, NotebookEdit, Bash; povolené Read, Grep, Glob;
#          CC_ROLE=kolega (watchdog ho bere jako agenta), NO_KOLEGA=1 (nespustí dalšího kolegu)
#   agy    agy --mode plan, příkazy zakázané
#   pi     pi s modelem z KOLEGA_PI_MODEL (bez něj výchozí model pi), bez nástrojů bash/edit/write
# Hlídač: je-li zapojen plugin kolega.observer (herdr plugin list) a existuje jeho binárka,
# běží událostmi řízený `herdr-kolega watch`; jinak záložní kolega-watch.sh (polling po --interval).
# Idempotentní: běží-li panel „kolega“, nic nového nezakládá. Volá ho orchestrátor a sám
# i scripts/agent.sh při startu agenta, takže kolega běží vždy, když se pracuje s agenty.
set -euo pipefail

agent="${KOLEGA_AGENT:-claude}"; interval=600; debounce=4
while [[ $# -gt 0 ]]; do
  case "$1" in
    --agent) agent="${2:?--agent agy|pi|claude}"; shift 2 ;;
    --interval) interval="${2:-600}"; shift 2 ;;
    --debounce-s) debounce="${2:-4}"; shift 2 ;;
    *) echo "neznámý argument: $1" >&2; exit 2 ;;
  esac
done
case "$agent" in agy|pi|claude) ;; *) echo "--agent musí být agy, pi nebo claude" >&2; exit 2 ;; esac

canon="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ws="${HERDR_WORKSPACE_ID:?běží jen v herdr}"
scratch="${AGENT_SCRATCH:-${TMP:-/tmp}}"; scratch="${scratch//\\//}"
settings="$scratch/kolega-settings.json"
plugin_id="kolega.observer"
plugin_bin="${KOLEGA_PLUGIN_BIN:-D:/01_programovani/herdr/plugins/herdr-kolega/target/release/herdr-kolega.exe}"

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
herdr pane rename "$kolega" "kolega ($agent)" >/dev/null
watch="$(herdr pane split --pane "$kolega" --direction down --ratio 0.85 --cwd "D:/01_programovani" --no-focus \
  | python -c "import sys,json;print(json.load(sys.stdin)['result']['pane']['pane_id'])")"
herdr pane rename "$watch" "kolega-hlídač" >/dev/null

home="${USERPROFILE:-$HOME}"; home="${home//\\//}"
dirs="--add-dir '$home/.claude/projects' --add-dir 'D:/01_programovani' --add-dir '$scratch'"
case "$agent" in
  agy)
    printf '{"permissions":{"deny":["command(*)"]},"allowNonWorkspaceAccess":true}' > "$settings"
    cmd="agy --dangerously-skip-permissions --mode plan --settings '$settings' $dirs" ;;
  pi)
    cmd="pi ${KOLEGA_PI_MODEL:+--model '$KOLEGA_PI_MODEL'} --exclude-tools bash,edit,write" ;;
  claude)
    cmd="\$env:CC_ROLE='kolega'; \$env:NO_KOLEGA='1'; claude --model haiku --allowedTools 'Read,Grep,Glob' --disallowedTools 'Write,Edit,NotebookEdit,Bash,PowerShell,Agent,WebFetch' --settings '{\"enabledPlugins\":{\"cc-data-anonymizer@mastnacek\":false}}' $dirs" ;;
esac
herdr pane run "$kolega" "$cmd" >/dev/null
if [[ "$agent" == agy ]]; then
  herdr pane wait-output "$kolega" --match "for shortcuts" --timeout 60000 >/dev/null || true
  herdr pane send-keys "$kolega" esc >/dev/null
else
  # Startovní dialogy vlastního panelu (důvěra složce, --add-dir) odklikne skript sám.
  for _ in 1 2 3 4 5 6; do
    sleep 4
    screen="$(herdr pane read "$kolega" --source visible --lines 30 2>/dev/null || true)"
    grep -q -E "Yes, add it|trust this folder|Yes, I trust" <<<"$screen" || break
    herdr pane send-keys "$kolega" Down >/dev/null; herdr pane send-keys "$kolega" Enter >/dev/null
  done
  herdr agent wait "$kolega" --until idle --until done --timeout 60000 >/dev/null || true
fi

# Hlídač: plugin (události) když je zapojen a postavený, jinak záložní polling.
state="${HERDR_PLUGIN_STATE_DIR:-}"
[[ -z "$state" && -n "${LOCALAPPDATA:-}" ]] && state="${LOCALAPPDATA//\\//}/herdr/plugins/$plugin_id"
if [[ -n "$state" && -f "$plugin_bin" ]] && herdr plugin list 2>/dev/null | grep -q "$plugin_id"; then
  herdr pane run "$watch" "\$env:HERDR_PLUGIN_STATE_DIR='$state'; & '$plugin_bin' watch --pane '$kolega' --debounce-s $debounce" >/dev/null
  echo "kolega ($agent): $kolega, hlídač (události): $watch, debounce ${debounce} s"
else
  herdr pane run "$watch" "& 'C:\Program Files\Git\bin\bash.exe' '$canon/scripts/kolega-watch.sh' '$kolega' $interval" >/dev/null
  echo "kolega ($agent): $kolega, hlídač (záložní, polling): $watch (pobídka nejvýš jednou za ${interval} s)"
fi
