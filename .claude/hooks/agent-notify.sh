#!/usr/bin/env bash
# agent-notify.sh — hook Stop + Notification: agent sám ohlásí orchestrátorovi dokončení / blokaci.
# Aktivní jen při CC_ROLE i ORCH_PANE (nastavuje orchestrátor při startu agenta); jinak mlčí.
#   Stop, coder|tester   DONE <role> <pane>: <první řádek poslední odpovědi, ≤160 znaků>
#                        řádek „BLOCKED:“ v odpovědi → BLOCKED <role> <pane>: <ten řádek>
#   Stop, kolega         INSIGHT <SPAI-ID> @jaroslav: <název>, jen když tah (přepis za poslední zprávou
#                        uživatele) přidal poznámku `spai add` se štítkem :fundamental:; jinak nic
#   Notification         WAITING <role> <pane>: <zpráva> (coder|tester: výzva ke schválení / nečinnost)
# Doručení: `herdr agent prompt <ORCH_PANE> <text>` (bez --wait) + `herdr notification show <role>`
# (zvuk jen u BLOCKED/WAITING/INSIGHT). Každé volání je omezené (NOTIFY_TIMEOUT_S, výchozí 5 s).
# Hook nikdy neblokuje ani nezneplatní tah agenta: vždy exit 0, chyby jdou do $TEMP/agent-notify.log.
# Test: HERDR_BIN = falešný herdr.
set -uo pipefail
trap 'exit 0' EXIT

[[ -n "${CC_ROLE:-}" && -n "${ORCH_PANE:-}" ]] || exit 0

log="${TEMP:-${TMPDIR:-/tmp}}/agent-notify.log"
herdr_bin="${HERDR_BIN:-herdr}"
limit="${NOTIFY_TIMEOUT_S:-5}"
input="$(cat 2>/dev/null)" || input=""

IFS= read -r -d '' py <<'PY' || true
import json, os, re, sys

role = os.environ.get("CC_ROLE", "")
pane = os.environ.get("HERDR_PANE_ID", "")
data = json.loads(sys.stdin.read())
event = data.get("hook_event_name", "")


def one_line(s, n=160):
    return re.sub(r"\s+", " ", s).strip()[:n]


def read_transcript(p):
    out = []
    try:
        with open(p, encoding="utf-8") as fh:
            for ln in fh:
                try:
                    out.append(json.loads(ln))
                except ValueError:
                    pass
    except (OSError, TypeError):
        pass
    return out


def blocks(entry):
    c = (entry.get("message") or {}).get("content")
    if isinstance(c, str):
        return [{"type": "text", "text": c}]
    return c if isinstance(c, list) else []


def is_real_user(entry):
    # tool_result je také záznam typu user; zprávou uživatele je jen text
    return entry.get("type") == "user" and any(b.get("type") == "text" for b in blocks(entry) if isinstance(b, dict))


def last_assistant_text(entries):
    for e in reversed(entries):
        if e.get("type") == "assistant":
            texts = [b.get("text", "") for b in blocks(e) if isinstance(b, dict) and b.get("type") == "text"]
            if texts and texts[-1].strip():
                return texts[-1]
    return ""


sys.stdout.reconfigure(newline="\n")  # Windows: bez \r\n, jinak by bash dostal druh s \r


def emit(kind, text):
    print(kind)
    print(text)


def stop_agent():
    text = data.get("last_assistant_message") or ""
    if not text.strip():
        text = last_assistant_text(read_transcript(data.get("transcript_path")))
    for ln in text.splitlines():
        if re.match(r"\s*BLOCKED:", ln):
            emit("BLOCKED", "BLOCKED %s %s: %s" % (role, pane, one_line(ln)))
            return
    first = next((l for l in text.splitlines() if l.strip()), "")
    emit("DONE", "DONE %s %s: %s" % (role, pane, one_line(first)))


def stop_kolega():
    entries = read_transcript(data.get("transcript_path"))
    start = max([i for i, e in enumerate(entries) if is_real_user(e)] or [-1]) + 1
    turn = entries[start:]
    results = {}
    for e in turn:
        if e.get("type") == "user":
            for b in blocks(e):
                if isinstance(b, dict) and b.get("type") == "tool_result":
                    c = b.get("content")
                    if isinstance(c, list):
                        c = " ".join(x.get("text", "") for x in c if isinstance(x, dict))
                    results[b.get("tool_use_id")] = c if isinstance(c, str) else ""
    for e in turn:
        if e.get("type") != "assistant":
            continue
        for b in blocks(e):
            if not (isinstance(b, dict) and b.get("type") == "tool_use"):
                continue
            cmd = (b.get("input") or {}).get("command") or ""
            if not (re.search(r"\bspai\b[^\n]*\badd\b", cmd) and ":fundamental:" in cmd):
                continue
            res = results.get(b.get("id"), "")
            sid, title = None, None
            try:
                d = (json.loads(res).get("data") or {})
                sid, title = d.get("id"), d.get("title")
            except (ValueError, AttributeError):
                pass
            if not sid:
                m = re.search(r"SPAI-\d+", res)
                sid = m.group(0) if m else None
            if not sid:
                continue
            if not title:
                m = re.search(r"^[^\n]*?\s*(?:/|[*!?+~-])\s+([^\n]*?)\s*(?:@\S+\s*)*(?::[\w:-]+:)?\s*$", cmd, re.M)
                title = m.group(1) if m else ""
            emit("INSIGHT", "INSIGHT %s @jaroslav: %s" % (sid, one_line(title)))
            return


if event == "Stop":
    if data.get("stop_hook_active"):
        sys.exit(0)
    if role in ("coder", "tester"):
        stop_agent()
    elif role == "kolega":
        stop_kolega()
elif event == "Notification" and role in ("coder", "tester"):
    # Jen výzva ke schválení; hlášení nečinnosti („waiting for your input“) po DONE je šum.
    msg = data.get("message") or ""
    if data.get("notification_type") == "idle_prompt" or "waiting for your input" in msg.lower():
        sys.exit(0)
    emit("WAITING", "WAITING %s %s: %s" % (role, pane, one_line(data.get("message") or "")))
PY

out="$(printf '%s' "$input" | PYTHONUTF8=1 python -I -c "$py" 2>>"$log")" || { echo "$(date +%T) parse failed" >>"$log"; exit 0; }
[[ -n "$out" ]] || exit 0
kind="${out%%$'\n'*}"
text="${out#*$'\n'}"
[[ -n "$kind" && "$text" != "$out" ]] || exit 0

sound=()
[[ "$kind" != DONE ]] && sound=(--sound done)
timeout "$limit" "$herdr_bin" agent prompt "$ORCH_PANE" "$text" >/dev/null 2>>"$log" </dev/null \
  || echo "$(date +%T) agent prompt failed ($?)" >>"$log"
timeout "$limit" "$herdr_bin" notification show "$CC_ROLE" --body "$text" "${sound[@]}" >/dev/null 2>>"$log" </dev/null \
  || echo "$(date +%T) notification show failed ($?)" >>"$log"
exit 0
