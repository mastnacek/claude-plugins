#!/usr/bin/env python3
"""kolega-read.py <transcript> <from> <to> [--chars N]

Vypíše řádky <from>..<to> (včetně, číslováno od 1 jako Read/Grep) přepisu sezení JSONL jako
kompaktní text s PŮVODNÍM číslem řádku: role/typ, text zprávy, název nástroje + klíčový vstup,
prvních N (výchozí 400) znaků výsledku nástroje, is_error. Zná formáty Claude Code i pi.
Jen čte, jen stdlib; obrovské řádky nenačítá do výstupu celé.
"""
import json
import sys

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
            out.append("RESULT%s %s" % (err, result_text(c.get("content"), n)))
        elif t == "thinking":
            out.append("(thinking)")
        else:
            out.append("[%s]" % t)
    return out


def render(obj, n):
    typ = obj.get("type")
    msg = obj.get("message")
    if typ == "message" and isinstance(msg, dict):  # pi
        role = msg.get("role")
        if role == "toolResult":
            err = " is_error" if msg.get("isError") else ""
            return "toolResult %s%s %s" % (msg.get("toolName"), err, result_text(msg.get("content"), n))
        return "%s %s" % (role, " | ".join(blocks(msg, n)))
    if typ in ("user", "assistant") and isinstance(msg, dict):  # Claude Code
        return "%s %s" % (typ, " | ".join(blocks(msg, n)))
    return "[%s]" % typ


def main(argv):
    args, chars, i = [], DEFAULT_CHARS, 0
    while i < len(argv):
        if argv[i] == "--chars" and i + 1 < len(argv):
            chars = int(argv[i + 1])
            i += 2
        elif argv[i].startswith("--chars="):
            chars = int(argv[i].split("=", 1)[1])
            i += 1
        else:
            args.append(argv[i])
            i += 1
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
