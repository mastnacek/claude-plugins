#!/usr/bin/env bash
# kolega-guard.sh — PreToolUse hook (matcher .*): kolega je analytik sezení jen ke čtení.
# Aktivní jen při CC_ROLE=kolega (nastavuje scripts/kolega.sh); jiná sezení hook nijak neomezuje.
#   Read / Grep / Glob   jen uvnitř čtených kořenů: ~/.claude/projects a ~/.pi/agent/sessions
#   Bash / PowerShell    jen pipeline povolených příkazů pro čtení (rg grep jq head tail wc ls
#                        sed -n cat sort uniq cut), `python <repo>/scripts/kolega-read.py` a
#                        `spai add|log|similar|show|list|search --project <domovský backlog>`;
#                        každá cesta uvnitř čtených kořenů; bez přesměrování, expanzí a cizích příkazů
#   vše ostatní          Write, Edit, NotebookEdit, Agent, WebFetch, WebSearch, mcp__* … zamítnuto
# Chyba hooku nebo nečitelný vstup = zamítnutí (fail closed).
# Vypínač: NO_KOLEGA_GUARD=1 v prostředí procesu hooku (nastaví orchestrátor při startu kolegy,
# stejně jako NO_AGENT_GUARD u agent-no-spawn.sh). Čte se z prostředí, nikdy z textu příkazu.
# Test: KOLEGA_HOME přepíše domovský adresář (jen v prostředí hooku).
set -uo pipefail

[[ "${NO_KOLEGA_GUARD:-}" == "1" ]] && exit 0
[[ "${CC_ROLE:-}" == "kolega" ]] || exit 0

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
here="$(cygpath -m "$here" 2>/dev/null || echo "$here")"

IFS= read -r -d '' py <<'PY' || true
import json, os, re, sys

HOOK_DIR = sys.argv[1]
HOME = (os.environ.get("KOLEGA_HOME") or os.path.expanduser("~")).replace("\\", "/").rstrip("/")
ALLOWED = ("Read/Grep/Glob only inside ~/.claude/projects and ~/.pi/agent/sessions; Bash only pipelines of "
           "rg grep jq head tail wc ls sed -n cat sort uniq cut, 'python <repo>/scripts/kolega-read.py "
           "<transcript> <from> <to> [--chars N] or <transcript> --tokens' and 'spai add|log|similar|show|list|search --project "
           + HOME + "'; no redirection, expansion or other commands")


class Deny(Exception):
    pass


def deny(why):
    raise Deny(why)


def canon(p):
    return os.path.normcase(os.path.realpath(p)).replace("\\", "/")


def norm(p):
    if not p:
        deny("empty path")
    p = p.replace("\\", "/")
    m = re.match(r"^/([A-Za-z])(?:/(.*))?$", p)
    if m:
        p = m.group(1).upper() + ":/" + (m.group(2) or "")
    if p == "~" or p.startswith("~/"):
        p = HOME + p[1:]
    elif p.startswith("~"):
        deny("unsupported ~ form: " + p)
    if ".." in p.split("/"):
        deny("'..' in path: " + p)
    if not (re.match(r"^[A-Za-z]:/", p) or p.startswith("/")):
        p = CWD_RAW.rstrip("/") + "/" + p
    return canon(p)


ROOTS = [canon(HOME + "/.claude/projects"), canon(HOME + "/.pi/agent/sessions")]
HOME_N = canon(HOME)
SCRIPT_N = canon(os.path.join(HOOK_DIR, "..", "..", "scripts", "kolega-read.py"))
CWD_RAW = ""


def inside(r):
    return any(r == x or r.startswith(x + "/") for x in ROOTS)


def check(p):
    if not inside(norm(p)):
        deny("path outside read roots: " + p)


def check_glob_pattern(pat):
    if ".." in re.split(r"[\\/]", pat):
        deny("'..' in glob pattern")
    if re.match(r"^([A-Za-z]:|[/\\~])", pat):
        prefix = re.split(r"[*?\[{]", pat)[0]
        check(prefix.rstrip("/\\") or prefix)


def tokenize(s, ps):
    segs, words, cur = [], [], None
    i, n = 0, len(s)

    def end_word():
        nonlocal cur
        if cur is not None:
            words.append(cur)
            cur = None

    def end_seg(strict):
        nonlocal words
        end_word()
        if words:
            segs.append(words)
        elif strict:
            deny("empty command around operator")
        words = []

    while i < n:
        c = s[i]
        if c == "'":
            j = s.find("'", i + 1)
            if j < 0:
                deny("unterminated quote")
            cur = (cur or "") + s[i + 1:j]
            i = j + 1
            continue
        if c == '"':
            i += 1
            buf = ""
            while True:
                if i >= n:
                    deny("unterminated quote")
                d = s[i]
                if d == '"':
                    i += 1
                    break
                if d in "$`":
                    deny("expansion ($ or backtick) inside double quotes; use single quotes")
                if d == "\\":
                    if ps:
                        deny("backslash inside double quotes (PowerShell)")
                    nxt = s[i + 1] if i + 1 < n else ""
                    if nxt in ('"', "\\"):
                        buf += nxt
                        i += 2
                        continue
                    if nxt == "\n":
                        deny("line continuation")
                buf += d
                i += 1
            cur = (cur or "") + buf
            continue
        if c in " \t\r":
            end_word()
            i += 1
            continue
        if c in "\n;":
            end_seg(False)
            i += 1
            continue
        if c == "|":
            i += 2 if s[i + 1:i + 2] == "|" else 1
            end_seg(True)
            continue
        if c == "&":
            if s[i + 1:i + 2] != "&":
                deny("background '&'")
            i += 2
            end_seg(True)
            continue
        if c in "<>(){}`$\\!@#":
            deny("forbidden character outside single quotes: " + c)
        cur = (cur or "") + c
        i += 1
    end_seg(False)
    return segs


# Specifikace příkazů: short_no/short_arg = znaky voleb -x, long_no/long_arg = --volby.
SPECS = {
    "rg": dict(short_no="inlcvwFosSUaqHNIu", short_arg="egtTABCmdrMjf", digits=False,
               long_no="hidden files count files-with-matches files-without-match ignore-case line-number "
                       "no-line-number no-heading heading with-filename no-filename word-regexp fixed-strings "
                       "only-matching smart-case case-sensitive multiline text invert-match json no-ignore "
                       "no-messages stats count-matches trim vimgrep no-config null".split(),
               long_arg="glob type type-not max-count max-depth context after-context before-context regexp "
                        "replace color sort sortr threads max-columns file".split(),
               pat=("-e", "--regexp", "-f", "--file"), pathflags=("-f", "--file"), pattern=True, implicit=True),
    "grep": dict(short_no="inrRlcvwFEoHhsaIqLP", short_arg="eAmBCdf", digits=False,
                 long_no="ignore-case line-number recursive dereference-recursive files-with-matches count "
                         "invert-match word-regexp fixed-strings extended-regexp only-matching with-filename "
                         "no-filename no-messages text perl-regexp".split(),
                 long_arg="regexp after-context before-context context max-count include exclude exclude-dir "
                          "binary-files color file".split(),
                 pat=("-e", "--regexp", "-f", "--file"), pathflags=("-f", "--file"), pattern=True, implicit=False),
    "jq": dict(short_no="rcsnRMSej", short_arg="", digits=False,
               long_no="raw-output compact-output slurp null-input raw-input monochrome-output sort-keys tab "
                       "exit-status join-output".split(),
               long_arg="arg argjson".split(), pat=(), pathflags=(), pattern=True, implicit=False, arg2=("--arg", "--argjson")),
    "head": dict(short_no="qv", short_arg="nc", digits=True, long_no="quiet silent verbose".split(),
                 long_arg="lines bytes".split(), pat=(), pathflags=(), pattern=False, implicit=False),
    "tail": dict(short_no="qv", short_arg="nc", digits=True, long_no="quiet silent verbose".split(),
                 long_arg="lines bytes".split(), pat=(), pathflags=(), pattern=False, implicit=False),
    "wc": dict(short_no="lwcmL", short_arg="", digits=False, long_no="lines words bytes chars".split(),
               long_arg=[], pat=(), pathflags=(), pattern=False, implicit=False),
    "ls": dict(short_no="lahArRtSd1FiL", short_arg="", digits=False, long_no="all human-readable recursive".split(),
               long_arg=[], pat=(), pathflags=(), pattern=False, implicit=True),
    "cat": dict(short_no="nbsAvET", short_arg="", digits=False, long_no=["number"], long_arg=[], pat=(),
                pathflags=(), pattern=False, implicit=False),
    "sort": dict(short_no="nrufhVbidMgR", short_arg="kt", digits=False,
                 long_no="numeric-sort reverse unique ignore-case human-numeric-sort version-sort".split(),
                 long_arg="key field-separator".split(), pat=(), pathflags=(), pattern=False, implicit=False),
    "uniq": dict(short_no="cdui", short_arg="fsw", digits=False, long_no="count repeated unique ignore-case".split(),
                 long_arg=[], pat=(), pathflags=(), pattern=False, implicit=False, maxpos=1),
    "cut": dict(short_no="s", short_arg="dfcb", digits=False, long_no=["only-delimited"],
                long_arg="delimiter fields characters bytes".split(), pat=(), pathflags=(), pattern=False,
                implicit=False),
}


def parse_generic(cmd, args, sp):
    pos, flags, has_pat = [], set(), False
    i, rest = 0, False
    while i < len(args):
        a = args[i]
        i += 1
        if rest or a == "-" or not a.startswith("-"):
            pos.append(a)
            continue
        if a == "--":
            rest = True
            continue
        if a.startswith("--"):
            name, eq, val = a.partition("=")
            if name[2:] in sp["long_no"] and not eq:
                flags.add(name)
                continue
            if name[2:] in sp["long_arg"]:
                n = 2 if name in sp.get("arg2", ()) else 1
                vals = [val] if eq else []
                while len(vals) < n:
                    if i >= len(args):
                        deny(cmd + ": missing value for " + name)
                    vals.append(args[i])
                    i += 1
                if name in sp["pathflags"]:
                    check(vals[0])
                if name in sp["pat"]:
                    has_pat = True
                flags.add(name)
                continue
            deny(cmd + ": option not allowed: " + name)
        if sp["digits"] and re.fullmatch(r"-\d+", a):
            continue
        j = 1
        while j < len(a):
            ch = a[j]
            if ch in sp["short_no"]:
                flags.add("-" + ch)
                j += 1
                continue
            if ch in sp["short_arg"]:
                val = a[j + 1:]
                if not val:
                    if i >= len(args):
                        deny(cmd + ": missing value for -" + ch)
                    val = args[i]
                    i += 1
                if "-" + ch in sp["pathflags"]:
                    check(val)
                if "-" + ch in sp["pat"]:
                    has_pat = True
                break
            deny(cmd + ": option not allowed: -" + ch)
    return pos, flags, has_pat


def chk_generic(cmd, args):
    sp = SPECS[cmd]
    pos, flags, has_pat = parse_generic(cmd, args, sp)
    if cmd == "jq":
        for p in pos[:1]:
            if re.search(r"\benv\b|\$ENV|\$__prog", p):
                deny("jq: env access not allowed")
    if sp["pattern"] and not has_pat and "--files" not in flags and pos:
        pos = pos[1:]
    if "maxpos" in sp and len(pos) > sp["maxpos"]:
        deny(cmd + ": output file argument not allowed")
    for p in pos:
        check(p)
    implicit = sp["implicit"] or (cmd == "grep" and (flags & {"-r", "-R", "--recursive", "--dereference-recursive"}))
    if not pos and implicit:
        check(CWD_RAW)


def chk_sed(args):
    if len(args) < 2 or args[0] != "-n":
        deny("sed: only 'sed -n <N[,M]p> [files]' allowed")
    if not re.fullmatch(r"(\d+|\$)(,(\d+|\$))?p", args[1]):
        deny("sed: script must be like 5p or 5,20p")
    for p in args[2:]:
        check(p)


def chk_python(args):
    if not args or canon_arg(args[0]) != SCRIPT_N:
        deny("python: only the kolega-read.py script of this repo is allowed")
    rest, pos, i, tokens = args[1:], [], 0, False
    while i < len(rest):
        if rest[i] == "--tokens":
            tokens = True
            i += 1
        elif rest[i] == "--chars":
            if i + 1 >= len(rest) or not re.fullmatch(r"\d+", rest[i + 1]):
                deny("kolega-read.py: --chars needs a number")
            i += 2
        elif re.fullmatch(r"--chars=\d+", rest[i]):
            i += 1
        else:
            pos.append(rest[i])
            i += 1
    if tokens:
        if len(pos) != 1:
            deny("kolega-read.py: usage <transcript> --tokens")
    elif len(pos) != 3 or not all(re.fullmatch(r"\d+", x) for x in pos[1:]):
        deny("kolega-read.py: usage <transcript> <from> <to> [--chars N] | <transcript> --tokens")
    check(pos[0])


def canon_arg(p):
    p = p.replace("\\", "/")
    m = re.match(r"^/([A-Za-z])(?:/(.*))?$", p)
    if m:
        p = m.group(1).upper() + ":/" + (m.group(2) or "")
    if not (re.match(r"^[A-Za-z]:/", p) or p.startswith("/")):
        p = CWD_RAW.rstrip("/") + "/" + p
    return canon(p)


SPAI_SUBS = {"add", "log", "similar", "show", "list", "search"}
SPAI_VAL = {"--project", "--source", "--lang", "--tag", "--status", "--limit", "--after"}
SPAI_BOOL = {"--json", "--force"}


def chk_spai(args):
    if not args or args[0] not in SPAI_SUBS:
        deny("spai: only add|log|similar|show|list|search allowed")
    proj, i = None, 1
    while i < len(args):
        a = args[i]
        i += 1
        if not a.startswith("--"):
            continue
        name, eq, val = a.partition("=")
        if name in SPAI_VAL:
            if not eq:
                if i >= len(args):
                    deny("spai: missing value for " + name)
                val = args[i]
                i += 1
            if name == "--project":
                proj = val
        elif not (name in SPAI_BOOL and not eq):
            deny("spai: option not allowed: " + name)
    if proj is None or norm(proj) != HOME_N:
        deny("spai: --project must be the home backlog " + HOME)


def chk_shell(cmdline, ps):
    segs = tokenize(cmdline, ps)
    if not segs:
        deny("empty command")
    for w in segs:
        name, args = w[0], w[1:]
        low = name.lower()
        if low.endswith(".exe"):
            low = low[:-4]
        if "/" in name or "\\" in name or "=" in name:
            deny("command must be a bare allowlisted name: " + name)
        if low in SPECS:
            chk_generic(low, args)
        elif low == "sed":
            chk_sed(args)
        elif low in ("python", "python3"):
            chk_python(args)
        elif low == "spai":
            chk_spai(args)
        else:
            deny("command not allowed: " + name)


def decide(data):
    global CWD_RAW
    tool = data.get("tool_name") or ""
    ti = data.get("tool_input") or {}
    CWD_RAW = (data.get("cwd") or os.getcwd()).replace("\\", "/")
    if tool == "Read":
        check(ti.get("file_path") or "")
    elif tool in ("Grep", "Glob"):
        check(ti.get("path") or CWD_RAW)
        if tool == "Glob":
            check_glob_pattern(ti.get("pattern") or "")
        elif ti.get("glob"):
            check_glob_pattern(ti["glob"])
    elif tool in ("Bash", "PowerShell"):
        chk_shell(ti.get("command") or "", tool == "PowerShell")
    else:
        deny("tool not allowed: " + tool)


try:
    decide(json.loads(sys.stdin.read()))
    print("ALLOW")
except Deny as e:
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny",
                      "permissionDecisionReason": "kolega is read-only: %s. Allowed: %s." % (e, ALLOWED)}}))
except Exception as e:
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny",
                      "permissionDecisionReason": "kolega-guard error (fail closed): %r" % (e,)}}))
PY

input="$(cat)"
out="$(printf '%s' "$input" | MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' PYTHONUTF8=1 python -I -c "$py" "$here" 2>/dev/null)" || out=""
case "$out" in
  ALLOW) exit 0 ;;
  "") printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"kolega-guard could not run (fail closed)"}}' ;;
  *) printf '%s\n' "$out" ;;
esac
exit 0
