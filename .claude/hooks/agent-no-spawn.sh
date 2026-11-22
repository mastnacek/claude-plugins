#!/usr/bin/env bash
# agent-no-spawn.sh — PreToolUse hook (Bash, PowerShell): agenti nespouštějí další agenty.
# Agenty, sub-agenty, panely a testery spouští jen orchestrátor. Agent spuštěný přes
# scripts/agent.sh má CC_ROLE (coder, tester, …); jeho příkaz, který by SPUSTIL claude,
# agy, pi, codex …, agent.sh / kolega.sh nebo herdr agenta / panel, se zamítne.
# Zamítá se jen start: příkaz se rozdělí na segmenty (`;` `&&` `||` `|` `&` závorky, nové řádky),
# z každého se odloží obaly (VAR=…, env, exec, nohup, time, timeout N, cesta k bash/sh) a posuzuje se
# program a jeho první argumenty. Zmínka jako argument (`cat scripts/agent.sh`, `bash -n scripts/kolega.sh`,
# `rg kolega.sh`, `wc -l`, `ls scripts`) je povolená.
# Sezení bez CC_ROLE (orchestrátor, uživatel) hook nijak neomezuje.
# Zapojuje ho scripts/agent.sh (--settings pro každého agenta v každém repu).
# Nástroj Agent (sub-agenti) zakazuje agent.sh přes --disallowedTools.
# Vypínač: NO_AGENT_GUARD=1 v prostředí procesu hooku (nastaví orchestrátor při startu
# agenta: `NO_AGENT_GUARD=1 agent.sh coder`) hook vypne. Jen pro sezení, které opravuje
# samotný guard. Čte se z prostředí, nikdy z textu příkazu, takže si ho agent nezapne ani
# nevypne sám. Výchozí stav: nenastaveno.
set -euo pipefail

[[ "${NO_AGENT_GUARD:-}" == "1" ]] && exit 0

role="${CC_ROLE:-}"
[[ -z "$role" || "$role" == "orchestrator" ]] && exit 0

# Bez jq (z Git Bash nejde spustit): příkaz se vytáhne z JSON vstupu regulárním výrazem.
input="$(cat)"

deny() {
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Jsi %s: %s"}}\n' "$role" "$1"
  exit 0
}

msg="agenty, sub-agenty, panely a testery spouští jen orchestrátor. Živý test s agentem nech jako NOT VERIFIED a popiš ho ve zprávě; orchestrátor ho pustí sám."

command_re='"command"[[:space:]]*:[[:space:]]*"(([^"\\]|\\.)*)"'
[[ "$input" =~ $command_re ]] || exit 0
command="${BASH_REMATCH[1]}"

# JSON → text: \\ \" \n \r \t.
command="${command//\\\\/$'\x01'}"
command="${command//\\n/$'\n'}"
command="${command//\\r/}"
command="${command//\\t/ }"
command="${command//\\\"/\"}"
command="${command//$'\x01'/\\}"

# Segmenty: každý oddělovač je nový řádek.
segments="$(printf '%s' "$command" | sed -E 's/&&|\|\||[;|&()`]/\n/g')"

ltrim() { local s="$1"; printf '%s' "${s#"${s%%[![:space:]]*}"}"; }

dq_re='^"([^"]*)"[[:space:]]*(.*)$'
sq_re="^'([^']*)'[[:space:]]*(.*)\$"
word_re='^([^[:space:]]+)[[:space:]]*(.*)$'
assign_re="^[A-Za-z_][A-Za-z0-9_]*=(\"[^\"]*\"|'[^']*'|[^[:space:]]*)[[:space:]]*(.*)\$"
claude_ok_re='^(plugin|--help|-h|--version|-v)([[:space:]]|$)'
pi_re='^(-p|--print|--model|--exclude-tools|--mode)([[:space:]=]|$)'
herdr_re='^(agent[[:space:]]+(start|prompt|send-[a-z-]+)|pane[[:space:]]+(run|split|send-[a-z-]+|close|move)|tab[[:space:]]+(create|close)|workspace[[:space:]]+(create|close)|plugin[[:space:]]+pane)([[:space:]]|$)'

# Program a zbytek segmentu: tok = první slovo bez uvozovek, base = jeho jméno bez cesty a přípony.
tok="" rest="" base=""
split_program() {
  local seg="$1"
  tok="" rest=""
  if [[ "$seg" =~ $dq_re || "$seg" =~ $sq_re || "$seg" =~ $word_re ]]; then
    tok="${BASH_REMATCH[1]}"
    rest="${BASH_REMATCH[2]}"
  fi
  tok="${tok%[\"\']}"
  tok="${tok#[\"\']}"
  base="${tok##*[/\\]}"
  base="${base,,}"
  base="${base%.exe}"
  base="${base%.cmd}"
  return 0
}

# Je slovo skript spouštěče rolí (agent.sh, kolega.sh)?
is_launcher() {
  local w="${1%%[[:space:]]*}"
  w="${w%[\"\']}"
  w="${w#[\"\']}"
  w="${w##*[/\\]}"
  [[ "${w,,}" == "agent.sh" || "${w,,}" == "kolega.sh" ]]
}

check_segment() {
  local seg="$1" depth="${2:-0}" n opt args
  (( depth > 3 )) && return 0
  for (( n = 0; n < 16; n++ )); do
    seg="$(ltrim "$seg")"
    [[ -z "$seg" ]] && return 0
    if [[ "$seg" =~ $assign_re ]]; then
      seg="${BASH_REMATCH[2]}"
      continue
    fi
    split_program "$seg"
    case "$base" in
      env|exec|command|nohup|time|nice|sudo)
        seg="$rest"
        while [[ "$seg" == -* ]]; do
          [[ "$seg" == *[[:space:]]* ]] || { seg=""; break; }
          seg="$(ltrim "${seg#*[[:space:]]}")"
        done
        ;;
      timeout)
        seg="$rest"
        while [[ "$seg" == -* ]]; do
          [[ "$seg" == *[[:space:]]* ]] || { seg=""; break; }
          seg="$(ltrim "${seg#*[[:space:]]}")"
        done
        # doba trvání
        [[ "$seg" == *[[:space:]]* ]] && seg="$(ltrim "${seg#*[[:space:]]}")" || seg=""
        ;;
      bash|sh|zsh|dash|ksh)
        args="$rest"
        while [[ "$args" == -* || "$args" == +o* ]]; do
          opt="${args%%[[:space:]]*}"
          if [[ "$args" == *[[:space:]]* ]]; then args="$(ltrim "${args#*[[:space:]]}")"; else args=""; fi
          case "$opt" in
            --*) ;;
            -o|+o) if [[ "$args" == *[[:space:]]* ]]; then args="$(ltrim "${args#*[[:space:]]}")"; else args=""; fi ;;
            -*c*)
              args="${args#[\"\']}"
              check_segment "$args" $(( depth + 1 ))
              return 0
              ;;
            -*n*) return 0 ;; # jen kontrola syntaxe, nic se nespustí
          esac
        done
        is_launcher "$args" && deny "$msg"
        return 0
        ;;
      source|.)
        is_launcher "$rest" && deny "$msg"
        return 0
        ;;
      agent.sh|kolega.sh)
        deny "$msg"
        ;;
      claude)
        # `claude plugin …` (brána pluginů) a nápověda nespouštějí agenta.
        [[ "$rest" =~ $claude_ok_re ]] && return 0
        deny "$msg"
        ;;
      agy|codex|opencode|copilot|hermes|omp)
        deny "$msg"
        ;;
      pi)
        [[ "$rest" =~ $pi_re ]] && deny "$msg"
        return 0
        ;;
      herdr)
        # čtení stavu přes list/get/read je povolené
        [[ "${rest,,}" =~ $herdr_re ]] && deny "$msg"
        return 0
        ;;
      *)
        return 0
        ;;
    esac
  done
  return 0
}

while IFS= read -r segment; do
  check_segment "$segment" 0
done <<<"$segments"
exit 0
