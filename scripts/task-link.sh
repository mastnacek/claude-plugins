#!/usr/bin/env bash
# task-link.sh — připíše k úkolu SPAI ID sezení a přepis agenta (a přepis orchestrátora).
#
#   task-link.sh <ID> <projekt> <panel>
#
# Vstup: <ID> např. SPAI-017, <projekt> cesta hlavního repa (spai --project), <panel> panel herdr.
# Zapíše dva řádky do logu úkolu (čte je scripts/workflow-grade.py):
#   session <sid> pane <panel> transcript <cesta>          přepis agenta
#   orchestrator session <sid> transcript <cesta>          přepis orchestrátora
# Přepis agenta = ~/.claude/projects/<cwd-slug>/<sid>.jsonl; <sid> a cwd dává `herdr agent get`.
# Přepis orchestrátora: env CLAUDE_SESSION (ID sezení) -> ~/.claude/projects/*/<sid>.jsonl;
# bez něj nejnovější *.jsonl v adresáři projektu aktuální složky (cwd-slug z `pwd`).
set -euo pipefail

if [[ $# -ne 3 ]]; then
  echo "Použití: task-link.sh <ID> <projekt> <panel>" >&2
  exit 2
fi
id="$1"; project="$2"; pane="$3"

# spai jako agent.sh: SPAI_BIN, jinak nástroj v _tools, jinak z PATH
spai_bin="${SPAI_BIN:-}"
if [[ -z "$spai_bin" ]]; then
  if [[ -x /d/01_programovani/_tools/spai.exe ]]; then spai_bin=/d/01_programovani/_tools/spai.exe; else spai_bin=spai; fi
fi

home="$(cygpath -m "$HOME" 2>/dev/null || echo "$HOME")"
projects="$home/.claude/projects"
slug() { printf '%s' "$1" | sed 's/[^A-Za-z0-9]/-/g'; }

info="$(herdr agent get "$pane")"
sid="$(printf '%s' "$info" | grep -o '"agent_session":{[^}]*}' | grep -o '"value":"[^"]*"' | head -1 | sed 's/^"value":"//; s/"$//')"
cwd="$(printf '%s' "$info" | grep -o '"cwd":"[^"]*"' | head -1 | sed 's/^"cwd":"//; s/"$//; s/\\\\/\\/g')"
if [[ -z "$sid" || -z "$cwd" ]]; then
  echo "task-link: herdr agent get $pane nevrátil sezení nebo cwd" >&2
  exit 1
fi
transcript="$projects/$(slug "$cwd")/$sid.jsonl"
# Po restartu agenta v panelu herdr chvíli hlásí ID předchozího sezení (SPAI-022): přepis
# nového sezení vzniká až s prvním promptem. Volej proto task-link.sh až PO odeslání zadání;
# skript počká (nejvýš 30 s), dokud v adresáři projektu nebude přepis novější než ten
# z herdr, a vezme nejnovější. Jinak zůstane přepis podle ID z herdr.
dir_t="$projects/$(slug "$cwd")"
for _ in $(seq 1 15); do
  newest="$(ls -t "$dir_t"/*.jsonl 2>/dev/null | head -1 || true)"
  if [[ -n "$newest" && "$newest" != "$transcript" && ( ! -e "$transcript" || "$newest" -nt "$transcript" ) ]]; then
    transcript="$newest"; sid="$(basename "$newest" .jsonl)"; break
  fi
  [[ -e "$transcript" && "$transcript" -nt "$0" ]] && [[ $(( $(date +%s) - $(stat -c %Y "$transcript") )) -lt 60 ]] && break
  sleep 2
done
"$spai_bin" log "$id" "session $sid pane $pane transcript $transcript" --project "$project" --source orchestrator

orch=""
if [[ -n "${CLAUDE_SESSION:-}" ]]; then
  orch="$(ls "$projects"/*/"$CLAUDE_SESSION".jsonl 2>/dev/null | head -1 || true)"
fi
if [[ -z "$orch" ]]; then
  here="$(pwd -W 2>/dev/null || pwd)"
  dir="$projects/$(slug "$here")"
  orch="$(ls -t "$dir"/*.jsonl 2>/dev/null | head -1 || true)"
fi
if [[ -n "$orch" ]]; then
  osid="$(basename "$orch" .jsonl)"
  "$spai_bin" log "$id" "orchestrator session $osid transcript $orch" --project "$project" --source orchestrator
else
  echo "task-link: přepis orchestrátora nenalezen (nastav CLAUDE_SESSION)" >&2
fi
