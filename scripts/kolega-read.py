#!/usr/bin/env python3
"""kolega-read.py <transcript> <from> <to> [--chars N]
kolega-read.py <transcript> --tokens

Vypíše řádky <from>..<to> (včetně, číslováno od 1 jako Read/Grep) přepisu sezení JSONL jako
kompaktní text s PŮVODNÍM číslem řádku: role/typ, text zprávy, název nástroje + klíčový vstup,
prvních N (výchozí 400) znaků výsledku nástroje (+ jeho celková délka), is_error a u odpovědi
modelu tokeny [tok ctx=… out=…]. Zná formáty Claude Code i pi.
--tokens: souhrn sezení pro hledání zbytečných tokenů (základ prvního tahu, růst kontextu,
největší výsledky nástrojů, opakovaná čtení, kompakce).
Jen čte, jen stdlib; obrovské řádky nenačítá do výstupu celé.
"""
import json
import sys
from collections import Counter

DEFAULT_CHARS = 400
KEY_INPUT = ("command", "file_path", "path", "pattern", "url", "query", "description", "prompt", "text")


def clip(s, n):
    s = " ".join(str(s).split())
    return s if len(s) <= n else s[:n] + "…(+%d)" % (len(s) - n)


def key_input(inp, n):
    if not isinstance(inp, dict):
        return clip(inp, n)
    for k in KEY_INPUT:
        if k in inp:
            return "%s=%s" % (k, clip(inp[k], n))
    return clip(json.dumps(inp, ensure_ascii=False), n)


def result_text(content, n):
    if isinstance(content, str):
        return clip(content, n)
    parts = []
    for c in content or []:
        if isinstance(c, dict):
            parts.append(c.get("text") or "[%s]" % c.get("type", "?"))
        else:
            parts.append(str(c))
    return clip(" ".join(parts), n)


def blocks(msg, n):
    """Bloky zprávy jako seznam textů; role určuje volající."""
    content = msg.get("content")
    if isinstance(content, str):
        return [clip(content, n * 4)]
    out = []
    for c in content or []:
        if not isinstance(c, dict):
            out.append(clip(c, n))
            continue
        t = c.get("type")
        if t == "text":
            out.append(clip(c.get("text", ""), n * 4))
        elif t in ("tool_use", "toolCall"):
            inp = c.get("arguments") if t == "toolCall" else c.get("input")
            out.append("CALL %s %s" % (c.get("name"), key_input(inp, n)))
        elif t == "tool_result":
            err = " is_error" if c.get("is_error") else ""
            size = result_size(c.get("content"))
            out.append("RESULT%s (%d chars) %s" % (err, size, result_text(c.get("content"), n)))
        elif t == "thinking":
            out.append("(thinking)")
        else:
            out.append("[%s]" % t)
    return out


def result_size(content):
    if isinstance(content, str):
        return len(content)
    return sum(len(c.get("text") or "") if isinstance(c, dict) else len(str(c)) for c in content or [])


def usage_of(msg):
    """(kontext, výstup) tokenů odpovědi modelu, nebo None. Kontext = vstup + cache čtení + zápis."""
    u = msg.get("usage") if isinstance(msg, dict) else None
    if not isinstance(u, dict):
        return None
    ctx = sum(int(u.get(k) or 0) for k in ("input_tokens", "cache_read_input_tokens", "cache_creation_input_tokens",
                                             "input", "cacheRead", "cacheWrite"))
    out = int(u.get("output_tokens") or u.get("output") or 0)
    return ctx, out


def render(obj, n):
    typ = obj.get("type")
    msg = obj.get("message")
    if typ == "message" and isinstance(msg, dict):  # pi
        role = msg.get("role")
        if role == "toolResult":
            err = " is_error" if msg.get("isError") else ""
            size = result_size(msg.get("content"))
            return "toolResult %s%s (%d chars) %s" % (msg.get("toolName"), err, size, result_text(msg.get("content"), n))
        return "%s%s %s" % (role, tok_tag(msg), " | ".join(blocks(msg, n)))
    if typ in ("user", "assistant") and isinstance(msg, dict):  # Claude Code
        return "%s%s %s" % (typ, tok_tag(msg), " | ".join(blocks(msg, n)))
    return "[%s]" % typ


def tok_tag(msg):
    u = usage_of(msg)
    return " [tok ctx=%d out=%d]" % u if u else ""


def tokens_summary(path):
    """Souhrn: kde sezení pálí tokeny. Čísla jsou z přepisu (usage), ne odhad."""
    first = None
    peak = (0, 0)
    calls = {}          # tool_use id -> (název, klíčový vstup, řádek)
    results = []        # (znaků, řádek, nástroj, vstup)
    reads = Counter()
    compactions = 0
    turns = 0
    with open(path, encoding="utf-8", errors="replace") as f:
        for no, line in enumerate(f, 1):
            try:
                obj = json.loads(line)
            except ValueError:
                continue
            if obj.get("isCompactSummary") or obj.get("type") == "compaction":
                compactions += 1
            msg = obj.get("message") if isinstance(obj.get("message"), dict) else {}
            u = usage_of(msg)
            if u:
                turns += 1
                if first is None:
                    first = (no, u[0])
                if u[0] > peak[1]:
                    peak = (no, u[0])
            content = msg.get("content") if isinstance(msg.get("content"), list) else []
            for c in content:
                if not isinstance(c, dict):
                    continue
                if c.get("type") in ("tool_use", "toolCall"):
                    inp = c.get("arguments") if c.get("type") == "toolCall" else c.get("input")
                    calls[c.get("id")] = (c.get("name"), key_input(inp, 80), no)
                    if c.get("name") == "Read" and isinstance(inp, dict):
                        reads[(inp.get("file_path"), inp.get("offset"), inp.get("limit"))] += 1
                elif c.get("type") == "tool_result":
                    name, inp, _ = calls.get(c.get("tool_use_id"), ("?", "", 0))
                    results.append((result_size(c.get("content")), no, name, inp))
            if msg.get("role") == "toolResult":
                results.append((result_size(msg.get("content")), no, msg.get("toolName"), ""))
    print("model turns: %d, compactions: %d" % (turns, compactions))
    if first:
        print("baseline (first turn context): %d tokens at line %d" % (first[1], first[0]))
        print("peak context: %d tokens at line %d" % (peak[1], peak[0]))
    print("largest tool results (chars, line, tool, input):")
    for size, no, name, inp in sorted(results, reverse=True)[:10]:
        print("  %d  %d  %s  %s" % (size, no, name, inp))
    rep = [(k, v) for k, v in reads.items() if v > 1]
    print("repeated identical Reads: %d" % len(rep))
    for (fp, off, lim), v in sorted(rep, key=lambda x: -x[1])[:10]:
        print("  %dx  %s offset=%s limit=%s" % (v, fp, off, lim))
    return 0


def main(argv):
    args, chars, i, tokens = [], DEFAULT_CHARS, 0, False
    while i < len(argv):
        if argv[i] == "--tokens":
            tokens = True
            i += 1
        elif argv[i] == "--chars" and i + 1 < len(argv):
            chars = int(argv[i + 1])
            i += 2
        elif argv[i].startswith("--chars="):
            chars = int(argv[i].split("=", 1)[1])
            i += 1
        else:
            args.append(argv[i])
            i += 1
    if tokens and len(args) == 1:
        return tokens_summary(args[0])
    if len(args) != 3:
        print(__doc__, file=sys.stderr)
        return 2
    path, lo, hi = args[0], int(args[1]), int(args[2])
    with open(path, encoding="utf-8", errors="replace") as f:
        for no, line in enumerate(f, 1):
            if no < lo:
                continue
            if no > hi:
                break
            try:
                text = render(json.loads(line), chars)
            except (ValueError, AttributeError):
                text = "[unparsable] " + clip(line, chars)
            print("%d: %s" % (no, text))
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main(sys.argv[1:]))
