#!/usr/bin/env bash
# agent-wait.sh <pane> [max_minut] — čeká, až agent v panelu herdr opravdu dokončí tah.
# Vypíše jeden řádek a skončí:
#   done <pane> <přepis>:<řádek>   exit 0   tah skončil (viz níže)
#   blocked <pane>                 exit 2   agent čeká na dialog (ukaž ho uživateli)
#   timeout <pane>                 exit 1   vypršel limit
# Claude: přepis = ~/.claude/projects/<slug cwd>/<ID sezení>.jsonl (ID a cwd z `herdr pane get`).
#   Hotovo = poslední zpráva asistenta má stop_reason end_turn, je NOVĚJŠÍ než stav přepisu
#   při startu skriptu (počet řádků), po ní nenásleduje řádek uživatele a herdr nehlásí "working".
# Bez přepisu (jiný agent): záloha podle panelu — "✻ … for …" bez "esc to interrupt",
#   nebo stav idle / done, ale až po změně obsahu panelu proti startu.
# Ladění: AGENT_WAIT_POLL (s, výchozí 5), AGENT_WAIT_MAX_S (přepíše max_minut), CLAUDE_PROJECTS_DIR.
set -uo pipefail
export MSYS_NO_PATHCONV=1
pane="$1"; max="${2:-240}"
poll="${AGENT_WAIT_POLL:-5}"
max_s="${AGENT_WAIT_MAX_S:-$(( max * 60 ))}"
projects="${CLAUDE_PROJECTS_DIR:-${USERPROFILE:-$HOME}/.claude/projects}"
projects="${projects//\\//}"

# probe <n0> — stdin: JSON z `herdr pane get`; vypíše status|přepis|řádků|end_turn_řádek|ok
# ok=1: poslední zpráva asistenta je end_turn, je za řádkem n0 a nenásleduje uživatel.
probe() {
  python -c '
import json, os, re, sys
projects, n0 = sys.argv[1], int(sys.argv[2])
try:
    p = json.load(sys.stdin)["result"]["pane"]
except Exception:
    print("||0|0|0"); sys.exit()
status = p.get("agent_status") or ""
sid = (p.get("agent_session") or {}).get("value") or ""
cwd = (p.get("cwd") or "").rstrip("\\/")
path = ""
if sid:
    cand = os.path.join(projects, re.sub(r"[^A-Za-z0-9]", "-", cwd), sid + ".jsonl")
    if not os.path.isfile(cand) and os.path.isdir(projects):
        cand = next((os.path.join(projects, d, sid + ".jsonl") for d in os.listdir(projects)
                     if os.path.isfile(os.path.join(projects, d, sid + ".jsonl"))), "")
    path = cand if cand and os.path.isfile(cand) else ""
total = last_asst = end_line = last_user = 0
if path:
    with open(path, encoding="utf-8", errors="replace") as fh:
        for i, raw in enumerate(fh, 1):
            total = i
            try:
                e = json.loads(raw)
            except ValueError:
                continue
            if not isinstance(e, dict) or e.get("isSidechain"):
                continue
            if e.get("type") == "assistant":
                last_asst = i
                if (e.get("message") or {}).get("stop_reason") == "end_turn":
                    end_line = i
            elif e.get("type") == "user":
                last_user = i
ok = int(end_line > n0 and end_line == last_asst and last_user < end_line)
print("|".join([status, path.replace(chr(92), "/"), str(total), str(end_line), str(ok)]))
' "$projects" "$1" | tr -d '\r'   # python na Windows končí řádek CRLF
}

now() { date +%s; }
get() { herdr pane get "$pane" 2>/dev/null; }

IFS='|' read -r _ tx n0 _ _ < <(get | probe -1)
start_txt=$(herdr pane read "$pane" 2>/dev/null)
end=$(( $(now) + max_s ))

while (( $(now) < end )); do
  IFS='|' read -r st tx_now total endl ok < <(get | probe "${n0:-0}")
  [[ -z "$tx" && -n "$tx_now" ]] && { tx="$tx_now"; n0=0; ok=0; }  # přepis vznikl až po startu
  txt=$(herdr pane read "$pane" 2>/dev/null)
  busy=0; grep -q "esc to interrupt" <<<"$txt" && busy=1
  [[ "$st" == blocked ]] && { echo "blocked $pane"; exit 2; }
  if (( ! busy )) && tail -25 <<<"$txt" | grep -qE "Do you want|❯ 1\. Yes"; then
    echo "blocked $pane"; exit 2
  fi
  if [[ -n "$tx" ]]; then
    # Tah s běžícími monitory / shelly na pozadí je pauza: agent se po jejich hlášení probudí.
    bg=0; tail -25 <<<"$txt" | grep -qE "still running|monitors? ·|shells? ·" && bg=1
    if [[ "$ok" == 1 && "$st" != working && "$bg" == 0 ]]; then echo "done $pane $tx_now:$endl"; exit 0; fi
  elif [[ "$txt" != "$start_txt" ]] && (( ! busy )); then
    case "$st" in idle|done) echo "done $pane panel"; exit 0;; esac
    # Tah, který končí běžícími monitory / shelly, je pauza, ne konec.
    if ! tail -25 <<<"$txt" | grep -qE "still running|monitors? ·|shells? ·" \
       && tail -25 <<<"$txt" | grep -qE "✻ .* for [0-9]"; then
      echo "done $pane panel"; exit 0
    fi
  fi
  sleep "$poll"
done
echo "timeout $pane"; exit 1
