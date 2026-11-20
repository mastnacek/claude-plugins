#!/usr/bin/env bash
# kolega-watch.sh <panel kolegy> [interval s] — hlídač: kolega (agy) sám nepokračuje, tak mu
# hlídač pravidelně pošle pobídku se seznamem sezení (kolega-sessions.sh), ale jen když:
#   - kolega je nečinný (v panelu není „esc to cancel“), a
#   - od minulé pobídky přibyly řádky v některém přepisu, nebo se změnil seznam sezení.
# Běží ve vlastním malém panelu pod kolegou; Ctrl+C ho ukončí.
set -uo pipefail

pane="${1:?panel kolegy}"
interval="${2:-600}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
last=""

while true; do
  now="$(bash "$here/kolega-sessions.sh" 2>/dev/null | grep -v "|$pane|" || true)"
  state="$(herdr pane read "$pane" --source visible --lines 4 2>/dev/null || true)"
  if [[ -z "$state" ]]; then
    echo "$(date +%H:%M) kolega $pane neexistuje — konec"; exit 0
  fi
  if [[ "$now" != "$last" ]] && ! grep -q "esc to cancel" <<<"$state"; then
    # Od kterého řádku číst: od minulé pobídky; poprvé jen posledních 400 řádků.
    list="$(awk -F'|' -v prev="$last" 'BEGIN{n=split(prev,L,"
");for(i=1;i<=n;i++){split(L[i],f,"|");seen[f[3]]=f[4]}}
      {from=($3 in seen)?seen[$3]+1:(($4>400)?$4-399:1); printf "%s | %s | %s | čti řádky %d–%d; ", $1, $2, $3, from, $4}' <<<"$now")"
    herdr pane send-text "$pane" "Pobídka hlídače ($(date +%H:%M)): pokračuj v pozorování podle D:/01_programovani/claude/prompts/kolega.md. Sezení: ${list} Čti jen uvedené řádky (nečti celé přepisy) a napiš další záznam." >/dev/null \
      && sleep 1 && herdr pane send-keys "$pane" Enter >/dev/null
    echo "$(date +%H:%M) pobídka: $(wc -l <<<"$now") sezení"
    last="$now"
  fi
  sleep "$interval"
done
