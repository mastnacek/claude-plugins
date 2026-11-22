"""Tests for .claude/hooks/kolega-guard.sh (stdlib unittest). Only made-up paths and values."""
import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
HOOK = REPO / ".claude" / "hooks" / "kolega-guard.sh"
SCRIPT = (REPO / "scripts" / "kolega-read.py").as_posix()
BASH = shutil.which("bash") or r"C:\Program Files\Git\bin\bash.exe"

TMP = tempfile.mkdtemp(prefix="kolega-test-")
HOME = Path(TMP, "fakehome").resolve()
CLAUDE = (HOME / ".claude" / "projects").as_posix()
PI = (HOME / ".pi" / "agent" / "sessions").as_posix()
OUT = Path(TMP, "elsewhere").resolve().as_posix()
HOMEP = HOME.as_posix()
for d in (CLAUDE, PI, OUT):
    os.makedirs(d, exist_ok=True)
TR = CLAUDE + "/proj-a/aaaa-bbbb.jsonl"
SPAI = f"--project {HOMEP}"


def tearDownModule():
    shutil.rmtree(TMP, ignore_errors=True)


def run(tool, tool_input, role="kolega", off=False, cwd=None):
    env = dict(os.environ)
    for k in ("CC_ROLE", "NO_KOLEGA_GUARD"):
        env.pop(k, None)
    env["KOLEGA_HOME"] = str(HOME)
    if role:
        env["CC_ROLE"] = role
    if off:
        env["NO_KOLEGA_GUARD"] = "1"
    payload = json.dumps({"tool_name": tool, "tool_input": tool_input, "cwd": cwd or CLAUDE})
    out = subprocess.run([BASH, str(HOOK)], input=payload, capture_output=True, text=True, env=env, timeout=60)
    return "deny" in out.stdout


def bash(cmd, **kw):
    return run("Bash", {"command": cmd}, **kw)


class KolegaGuardTools(unittest.TestCase):
    def test_read_grep_glob_inside_roots(self):
        for tool, inp in (
            ("Read", {"file_path": TR}),
            ("Read", {"file_path": PI + "/x/s.jsonl"}),
            ("Grep", {"pattern": "x", "path": CLAUDE}),
            ("Grep", {"pattern": "x"}),  # výchozí cwd = kořen
            ("Glob", {"pattern": "**/*.jsonl", "path": PI}),
            ("Glob", {"pattern": CLAUDE + "/*/*.jsonl"}),
        ):
            with self.subTest(tool=tool, inp=inp):
                self.assertFalse(run(tool, inp), (tool, inp))

    def test_read_grep_glob_outside_roots(self):
        for tool, inp in (
            ("Read", {"file_path": OUT + "/a.rs"}),
            ("Read", {"file_path": HOMEP + "/.claude/settings.json"}),
            ("Read", {"file_path": CLAUDE + "/../settings.json"}),
            ("Read", {"file_path": "relative/../../x"}),
            ("Read", {"file_path": ""}),
            ("Grep", {"pattern": "x", "path": OUT}),
            ("Grep", {"pattern": "x", "path": CLAUDE, "glob": "../**"}),
            ("Glob", {"pattern": "*.rs", "path": OUT}),
            ("Glob", {"pattern": OUT + "/*.rs"}),
            ("Glob", {"pattern": "../*"}),
        ):
            with self.subTest(tool=tool, inp=inp):
                self.assertTrue(run(tool, inp), (tool, inp))
        self.assertTrue(run("Grep", {"pattern": "x"}, cwd=OUT))

    def test_other_tools_denied(self):
        for tool in ("Write", "Edit", "NotebookEdit", "Agent", "WebFetch", "WebSearch", "mcp__x__y", "TodoWrite"):
            with self.subTest(tool=tool):
                self.assertTrue(run(tool, {"file_path": TR}), tool)


class KolegaGuardShell(unittest.TestCase):
    allowed = [
        f"rg -n 'error' {CLAUDE}",
        f"rg -n --hidden -g '*.jsonl' -A 2 -e boom {CLAUDE}/proj-a",
        "rg -i foo",  # implicitně cwd = kořen
        f"grep -rn 'is_error' {PI}",
        f"grep -c x {TR}",
        f"jq -r '.type' {TR}",
        f"head -n 5 {TR}",
        f"head -5 {TR} | wc -l",
        f"tail -n 3 {TR}",
        f"wc -l {TR}",
        f"ls -la {CLAUDE}",
        "ls",
        f"sed -n '5,20p' {TR}",
        f"cat {TR} | sort | uniq -c | cut -d: -f1",
        f"rg x {CLAUDE} | head -n 3 && wc -l {TR}",
        f"cat '{TR}'",
        f"cat ~/.claude/projects/proj-a/aaaa-bbbb.jsonl",
        f"python {SCRIPT} {TR} 10 20",
        f"python {SCRIPT} {TR} 10 20 --chars 200",
        f"spai add \"- note line\\nbody\" {SPAI} --source kolega --json",
        f"spai similar 'some text' {SPAI} --json",
        f"spai log SPAI-001 'new evidence' {SPAI}",
        f"spai show SPAI-001 {SPAI} --json",
        f"spai list {SPAI} --tag insight",
        f"spai search 'handoff' {SPAI} --limit 5",
        f"spai show SPAI-001 --project={HOMEP}",
    ]
    denied = [
        f"rg x {OUT}",
        "rg x D:/01_programovani",
        f"rg x {CLAUDE} > {OUT}/r.txt",
        f"cat {TR} >> {OUT}/r.txt",
        f"cat {TR} < {OUT}/in",
        f"cat {OUT}/a.rs",
        f"cat {CLAUDE}/../settings.json",
        f"cat {HOMEP}/.claude/settings.json",
        f"cat {TR} | tee {OUT}/x",
        f"rg x {CLAUDE} --pre cat",
        f"rg -z x {CLAUDE}",
        f"grep -f {OUT}/pat x {TR}",
        f"sed -i s/a/b/ {TR}",
        f"sed -n 'w {OUT}/x' {TR}",
        f"sed -n '1e id' {TR}",
        f"sort -o {OUT}/x {TR}",
        f"uniq {TR} {OUT}/x",
        f"tail -f {TR}",
        f"jq -n env",
        f"jq -r '$ENV' {TR}",
        f"find {CLAUDE} -delete",
        f"find {CLAUDE} -exec cat {{}} ;",
        f"cat $(echo {TR})",
        f"cat `echo {TR}`",
        f"cat \"$HOME/x\"",
        f"cat ${{HOME}}/x",
        f"ls {CLAUDE}; rm -rf {CLAUDE}",
        f"ls {CLAUDE} && git status",
        f"ls {CLAUDE} | git log",
        f"ls {CLAUDE} || curl http://x",
        f"ls {CLAUDE} &",
        f"ls & rm x",
        "git status",
        f"rm {TR}",
        f"mv {TR} {OUT}",
        f"cp {TR} {OUT}",
        "claude -p x",
        "herdr pane list",
        "pi --model x",
        "curl http://example.invalid",
        f"python -c 'print(1)'",
        f"python {OUT}/other.py",
        f"python {SCRIPT} {OUT}/x.jsonl 1 2",
        f"python {SCRIPT} {TR} 1",
        f"python {SCRIPT} {TR} a b",
        f"python3 -m http.server",
        f"FOO=1 ls {CLAUDE}",
        f"/usr/bin/ls {CLAUDE}",
        f"./ls {CLAUDE}",
        f"spai add 'x' --project {OUT}",
        "spai add 'x'",
        f"spai add 'x' --project {HOMEP}/sub",
        f"spai set SPAI-001 done {SPAI}",
        f"spai delete SPAI-001 {SPAI}",
        f"spai reindex {SPAI}",
        f"spai list {SPAI} --all",
        f"spai add \"text $HOME\" {SPAI}",
        f"cat {TR}\nrm {TR}",
        f"(ls {CLAUDE})",
        f"ls {{a,b}}",
    ]

    def test_allowed(self):
        for c in self.allowed:
            with self.subTest(c=c):
                self.assertFalse(bash(c), c)

    def test_denied(self):
        for c in self.denied:
            with self.subTest(c=c):
                self.assertTrue(bash(c), c)

    def test_powershell_same_rules(self):
        for c in self.allowed[:6] + self.allowed[-3:]:
            with self.subTest(c=c):
                self.assertFalse(run("PowerShell", {"command": c}), "PS " + c)
        for c in self.denied[:8] + self.denied[-12:-4]:
            with self.subTest(c=c):
                self.assertTrue(run("PowerShell", {"command": c}), "PS " + c)

    def test_powershell_backslash_in_double_quotes_denied(self):
        # v PowerShellu \" neukončuje řetězec jako v bashi: `"a\"; rm x; "` by spustilo rm
        c = 'ls "a\\"; rm x; "'
        self.assertTrue(run("PowerShell", {"command": c}))

    def test_cwd_outside_roots_denies_implicit(self):
        self.assertTrue(bash("ls", cwd=OUT))
        self.assertTrue(bash("rg x", cwd=OUT))

    def test_deny_message_lists_allowed(self):
        env = dict(os.environ, CC_ROLE="kolega", KOLEGA_HOME=str(HOME))
        env.pop("NO_KOLEGA_GUARD", None)
        payload = json.dumps({"tool_name": "Write", "tool_input": {}, "cwd": CLAUDE})
        out = subprocess.run([BASH, str(HOOK)], input=payload, capture_output=True, text=True, env=env).stdout
        reason = json.loads(out)["hookSpecificOutput"]["permissionDecisionReason"]
        self.assertIn("Allowed:", reason)
        self.assertIn("kolega-read.py", reason)

    def test_invalid_input_fails_closed(self):
        env = dict(os.environ, CC_ROLE="kolega", KOLEGA_HOME=str(HOME))
        env.pop("NO_KOLEGA_GUARD", None)
        out = subprocess.run([BASH, str(HOOK)], input="not json", capture_output=True, text=True, env=env).stdout
        self.assertIn("deny", out)


class KolegaGuardSwitches(unittest.TestCase):
    def test_role_unset_or_other_no_effect(self):
        for role in (None, "orchestrator", "coder"):
            with self.subTest(role=role):
                self.assertFalse(run("Write", {"file_path": OUT + "/x"}, role=role))
                self.assertFalse(bash("git commit -m x", role=role))

    def test_off_switch_in_env(self):
        self.assertFalse(run("Write", {"file_path": OUT + "/x"}, off=True))
        self.assertFalse(bash("rm -rf x", off=True))

    def test_off_switch_in_command_text_denied(self):
        self.assertTrue(bash("NO_KOLEGA_GUARD=1 ls"))
        self.assertTrue(bash("export NO_KOLEGA_GUARD=1; ls"))
        self.assertTrue(bash("CC_ROLE=x ls"))


if __name__ == "__main__":
    unittest.main()
