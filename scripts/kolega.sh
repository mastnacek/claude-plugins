#!/usr/bin/env bash
# kolega.sh [--agent agy|pi|claude] [--interval s] [--debounce-s s] — spustí (nebo jen ověří) roli
# „kolega“: agent jen ke čtení v malém panelu vpravo dole a pod ním hlídač, který mu posílá
# pobídky se sezeními ostatních agentů (orchestrátor, programátor, tester, fable …).
#   claude (výchozí) claude --model sonnet; zakázané Write, Edit, NotebookEdit, Bash; povolené Read, Grep, Glob;
#          CC_ROLE=kolega (watchdog ho bere jako agenta), NO_KOLEGA=1 (nespustí dalšího kolegu),
#          ANON_MASK_AGENT_STATE=1 (cc-data-anonymizer maskuje i čtené přepisy sezení)
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
# Scratchpad orchestrátora jen z AGENT_SCRATCH; nikdy celé %TEMP% (kolega by četl cizí
# dočasné soubory). Pomocné soubory skriptu jdou do vlastní podsložky TEMP.
scratch="${AGENT_SCRATCH:-}"; scratch="${scratch//\\//}"
work="${TMP:-/tmp}"; work="${work//\\//}/kolega"; mkdir -p "$work"
settings="$work/kolega-settings.json"
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

home="${USERPROFILE:-$HOME}"; home="${home//\\//}"
dirs="--add-dir '$home/.claude/projects' --add-dir 'D:/01_programovani'"
[[ -n "$scratch" ]] && dirs+=" --add-dir '$scratch'"
case "$agent" in
  agy)
    printf '{"permissions":{"deny":["command(*)"]},"allowNonWorkspaceAccess":true}' > "$settings"
    cmd="agy --dangerously-skip-permissions --mode plan --settings '$settings' $dirs" ;;
  pi)
    cmd="pi ${KOLEGA_PI_MODEL:+--model '$KOLEGA_PI_MODEL'} --exclude-tools bash,edit,write" ;;
  claude)
    cmd="\$env:CC_ROLE='kolega'; \$env:NO_KOLEGA='1'; \$env:ANON_MASK_AGENT_STATE='1'; claude --model sonnet --append-system-prompt-file '$(cygpath -m "$canon")/prompts/kolega.md' --allowedTools 'Read,Grep,Glob' --disallowedTools 'Write,Edit,NotebookEdit,Bash,PowerShell,Agent,WebFetch' $dirs" ;;
esac
herdr pane run "$kolega" "$cmd" >/dev/null
if [[ "$agent" == agy ]]; then
  herdr pane wait-output "$kolega" --match "for shortcuts" --timeout 60000 >/dev/null || true
  herdr pane send-keys "$kolega" esc >/dev/null
else
  # Startovní dialogy vlastního panelu (důvěra složce, --add-dir) odklikne skript sám.
  # Čeká, dokud není vidět výzva Claude Code; dialog pozná i podle „Adding:“ / „No, exit“
  # (možnost „Yes, add it“ bývá odrolovaná mimo obrazovku). Pořadí voleb nepředpokládá:
  # Enter jen tehdy, když je podsvícená volba Yes („❯ … Yes“); jinak posune výběr o jednu dolů.
  for _ in $(seq 1 30); do
    sleep 2
    screen="$(herdr pane read "$kolega" --source visible --lines 40 2>/dev/null || true)"
    if grep -q -E "Yes, add it|trust this folder|Yes, I trust|Adding: |No, exit" <<<"$screen"; then
      if grep -q -E "❯[^a-zA-Z]*Yes" <<<"$screen"; then
        herdr pane send-keys "$kolega" Enter >/dev/null
      else
        herdr pane send-keys "$kolega" Down >/dev/null
      fi
      continue
    fi
    grep -q -E "Try \"|for shortcuts|/effort" <<<"$screen" && break
  done
  herdr agent wait "$kolega" --until idle --until done --timeout 60000 >/dev/null || true
  # Úvodní pobídka: role je v systémovém promptu; první záznam hned, ať je vidět, že běží.
  if [[ "$agent" == claude ]]; then
    live="$(bash "$canon/scripts/kolega-sessions.sh" 2>/dev/null | grep -v '^kolega|' | awk -F'|' '{printf "%s | %s | %s | řádků %s; ", $1, $2, $3, $4}')"
    herdr agent prompt "$kolega" "Začni: přečti souvislosti (postup orchestrace, prompty rolí, zadání SPAI) a konec přepisů právě běžících sezení: ${live:-žádné nenalezeno}. Napiš první záznam podle své role. Jiné přepisy v ~/.claude/projects nehodnoť." >/dev/null || true
  fi
fi

# Hlídač: běží skrytě na pozadí bez vlastního panelu (je to program bez rozhraní);
# výpis jde do logu ve stavové složce pluginu. Plugin (události), když je zapojen a postavený,
# jinak záložní polling. Starý hlídač pro jiný panel kolegy se nejdřív ukončí.
state="${HERDR_PLUGIN_STATE_DIR:-}"
[[ -z "$state" && -n "${LOCALAPPDATA:-}" ]] && state="${LOCALAPPDATA//\\//}/herdr/plugins/$plugin_id"
log="${state:-$work}/watch.log"
taskkill //F //IM herdr-kolega.exe >/dev/null 2>&1 || true
if [[ -n "$state" && -f "$plugin_bin" ]] && herdr plugin list 2>/dev/null | grep -q "$plugin_id"; then
  powershell -NoProfile -Command "\$env:HERDR_PLUGIN_STATE_DIR='$state'; Start-Process -WindowStyle Hidden -FilePath '$plugin_bin' -ArgumentList 'watch','--pane','$kolega','--debounce-s','$debounce' -RedirectStandardOutput '$log' -RedirectStandardError '$log.err'" >/dev/null
  echo "kolega ($agent): $kolega, hlídač (události) skrytě na pozadí, log $log, debounce ${debounce} s"
else
  powershell -NoProfile -Command "Start-Process -WindowStyle Hidden -FilePath 'C:\Program Files\Git\bin\bash.exe' -ArgumentList '$canon/scripts/kolega-watch.sh','$kolega','$interval' -RedirectStandardOutput '$log' -RedirectStandardError '$log.err'" >/dev/null
  echo "kolega ($agent): $kolega, hlídač (záložní, polling) skrytě na pozadí, log $log"
fi
