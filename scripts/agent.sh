#!/usr/bin/env bash
# agent.sh — kanonický spouštěč agenta v panelu herdr pro všechna repa (claude, spai, anon, …).
# Repa ho volají přes svůj tenký scripts/agent.sh. Postup: docs/herdr-orchestrace.md.
#
#   agent.sh coder                       programátor: Sonnet
#   agent.sh tester [--plugin-dir <p>]   tester: Haiku; nainstalovanou kopii téhož pluginu
#                                        vypne jen pro sezení
#
# Agenti běží bez cc-prompt-translate (odpovědi zůstávají anglicky, tlumočí orchestrátor).
# Role jde do CC_ROLE: hook nebo watchdog repa pak agentovi zamítne git zápis — commit,
# push a úklid dělá jen orchestrátor.
# Pravidla role: prompts/<role>.md TOHOTO repa (jedna sada pro všechna repa) + volitelně
# prompts/<role>.local.md repa, ve kterém agent běží (jeho specifika). Konstanty dává
# hlavička zadání (záznam SPAI).
#
# NO_AGENT_GUARD=1 agent.sh coder      vypne hook agent-no-spawn.sh pro toto sezení (proměnná se
#                                      dědí do claude i do procesu hooku); jen pro opravu guardu.
# Prostředí: AGENT_SCRATCH = scratchpad orchestrátora (přístup bez dotazu);
#            CODE_MODE=1 = Code Mode Claude Code (jen agenti; vypíná Remote Control).
# Windows: spouštěj přes Git Bash (& 'C:\Program Files\Git\bin\bash.exe' scripts/agent.sh coder).
set -euo pipefail

canon="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

role="${1:-}"
shift || true
case "$role" in
  coder)  model=sonnet ;;
  tester) model=haiku ;;
  *) echo "Použití: scripts/agent.sh coder|tester [volby claude]" >&2; exit 2 ;;
esac

# Režim auto: agent se neptá na každé volání; git zápis zamítá hook / watchdog.
# Agenti nespouštějí další agenty: nástroj Agent je zakázaný a hook agent-no-spawn.sh
# zamítne claude / herdr agent / herdr pane / agent.sh … (spouští jen orchestrátor).
extra=(--permission-mode auto --disallowedTools Agent)
[[ -n "${AGENT_SCRATCH:-}" ]] && extra+=(--add-dir "$AGENT_SCRATCH")

# Jedno sloučené --settings: hook agent-no-spawn, vypnutí pluginu z --plugin-dir (jinak by
# běžel dvakrát) a --settings předané volajícím (soubor nebo JSON).
settings="$(mktemp "${TMPDIR:-/tmp}/agent-settings-XXXXXX.json")"
hook="$(cygpath -m "$canon/.claude/hooks/agent-no-spawn.sh" 2>/dev/null || echo "$canon/.claude/hooks/agent-no-spawn.sh")"
pass=() disable=() user_settings=()
args=("$@")
for ((i = 0; i < ${#args[@]}; i++)); do
  case "${args[i]}" in
    --plugin-dir)
      dir="${args[i+1]:-}"
      name="$(sed -n 's/.*"name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$dir/.claude-plugin/plugin.json" 2>/dev/null | head -1 || true)"
      [[ -n "$name" ]] && disable+=("$name@mastnacek")
      pass+=("${args[i]}" "$dir"); i=$((i + 1)) ;;
    --settings) user_settings+=("${args[i+1]:-}"); i=$((i + 1)) ;;
    *) pass+=("${args[i]}") ;;
  esac
done
PYTHONUTF8=1 python - "$settings" "$hook" "${#disable[@]}" "${disable[@]}" "${user_settings[@]}" <<'PY'
import json, os, sys
out, hook, n = sys.argv[1], sys.argv[2], int(sys.argv[3])
disable, users = sys.argv[4:4 + n], sys.argv[4 + n:]
# Agenti pracují anglicky a uživateli je tlumočí orchestrátor: překlad odpovědí by jen
# stál peníze a `herdr pane read` by vracel češtinu. --settings volajícího to může zapnout.
merged = {"enabledPlugins": {"cc-prompt-translate@mastnacek": False}}
def merge(a, b):
    for k, v in b.items():
        if isinstance(v, dict) and isinstance(a.get(k), dict):
            merge(a[k], v)
        elif isinstance(v, list) and isinstance(a.get(k), list):
            a[k] = a[k] + v
        else:
            a[k] = v
for u in users:
    merge(merged, json.load(open(u, encoding="utf-8")) if os.path.isfile(u) else json.loads(u))
for name in disable:
    merged.setdefault("enabledPlugins", {})[name] = False
entry = {"matcher": "Bash|PowerShell", "hooks": [{"type": "command", "command": f'bash "{hook}"'}]}
merged.setdefault("hooks", {}).setdefault("PreToolUse", []).append(entry)
json.dump(merged, open(out, "w", encoding="utf-8"))
PY
extra+=(--settings "$settings")
set -- "${pass[@]}"

# Pravidla role: kanonická + specifika repa v jednom souboru.
rules="$(mktemp "${TMPDIR:-/tmp}/agent-$role-XXXXXX.md")"
[[ -r "$canon/prompts/$role.md" ]] && cat "$canon/prompts/$role.md" > "$rules"
[[ -r "$repo/prompts/$role.local.md" ]] && { printf '\n\n' >> "$rules"; cat "$repo/prompts/$role.local.md" >> "$rules"; }
[[ -s "$rules" ]] && extra+=(--append-system-prompt-file "$rules")

[[ -n "${CODE_MODE:-}" ]] && export CLAUDE_CODE_EXPERIMENTAL_CODE_MODE=1

# Nástroje z D:/01_programovani/_tools mají přednost (Windows blokuje nové programy v
# ~/.cargo/bin); platí i v panelu spuštěném před nastavením PATH uživatele.
export PATH="/d/01_programovani/_tools:$PATH"
export SPAI_BIN="${SPAI_BIN:-D:/01_programovani/_tools/spai.exe}"

# Kolega (pozorovatel) běží vždy, když se pracuje s agenty; kolega.sh je idempotentní.
[[ "${HERDR_ENV:-}" == 1 && -z "${NO_KOLEGA:-}" ]] && { bash "$canon/scripts/kolega.sh" >/dev/null 2>&1 || true; }

CC_ROLE="$role" exec claude --model "$model" "${extra[@]}" "$@"
