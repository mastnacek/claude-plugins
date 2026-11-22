"""Testy workflow-grade.py a task-link.sh na malých falešných přepisech (stdlib unittest)."""
import contextlib
import importlib.util
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

SCRIPTS = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("wg", SCRIPTS / "workflow-grade.py")
wg = importlib.util.module_from_spec(spec)
sys.modules["wg"] = wg
spec.loader.exec_module(wg)

PROJECT = "D:/x/demo"


def write_transcript(path, events):
    """events: (nástroj, vstup, chyba?) volání | ("text", "...") závěrečná zpráva. Volání = 2 řádky."""
    lines = []
    for i, e in enumerate(events):
        if e[0] == "text":
            lines.append({"type": "assistant", "message": {"content": [{"type": "text", "text": e[1]}]}})
            continue
        uid = f"u{i}"
        lines.append({"type": "assistant", "message": {"content": [{"type": "tool_use", "id": uid, "name": e[0], "input": e[1]}]}})
        lines.append({"type": "user", "message": {"content": [{"type": "tool_result", "tool_use_id": uid,
                                                            "is_error": bool(len(e) > 2 and e[2]), "content": "x"}]}})
    path.write_text("".join(json.dumps(x) + "\n" for x in lines), encoding="utf-8")
    return str(path)


def bash(cmd, err=False):
    return ("Bash", {"command": cmd}, err)


SEND = bash("spai set 7 working --project D:/x/demo; herdr agent prompt p 'Read SPAI-007 @demo and carry it out fully now.'")
GATE = bash("cd /d/x/demo-wt && git status --short && pytest -q")
MERGE = bash("cd /d/x/demo && git merge -q agent/x  # msg007")
BRIEF = ("Write", {"file_path": "/s/t007.txt", "content": "task demo"})
GOOD_ORCH = [BRIEF, SEND, bash("agent-wait.sh w1:p1"), GATE, MERGE]
CODER_OK = [("Edit", {"file_path": "/d/x/demo-wt/a.py"}), bash("set -o pipefail; pytest -q | tail -3"),
            ("text", "done. NOT VERIFIED: nothing")]


class Base(unittest.TestCase):
    def setUp(self):
        self._d = tempfile.TemporaryDirectory()
        self.addCleanup(self._d.cleanup)
        self.tmp = Path(self._d.name)

    def grade(self, orch, coder=None, body="x\n## SMOKE\n1. run", tags=("agent",)):
        op = write_transcript(self.tmp / "orch.jsonl", orch)
        log = [{"text": f"orchestrator session s transcript {op}"}]
        if coder is not None:
            log.append({"text": f"session c pane w1:p1 transcript {write_transcript(self.tmp / 'coder.jsonl', coder)}"})
        task = {"id": "SPAI-007", "body": body, "tags": list(tags), "log": log, "path": str(self.tmp / "rec.md")}
        patcher = mock.patch.object(wg, "spai_show", lambda i, p: task)
        patcher.start()
        self.addCleanup(patcher.stop)
        return {r["row"]: r for r in wg.grade("SPAI-007", PROJECT)}


class GradeRows(Base):
    def test_every_row_present_and_llm_unknown(self):
        rows = self.grade(GOOD_ORCH)
        self.assertEqual(list(rows), [f"K{n:02d}" for n in range(1, 11)])
        for r in ("K03", "K05", "K07", "K09"):
            self.assertEqual(rows[r]["verdict"], "unknown")
            self.assertEqual(rows[r]["note"], "needs llm/human")
        self.assertTrue(all(len(r["key"]) == 40 and r["checker"] == "script" for r in rows.values()))

    def test_k01(self):
        self.assertEqual(self.grade(GOOD_ORCH)["K01"]["verdict"], "met")
        r = self.grade(GOOD_ORCH, body="no smoke here")["K01"]
        self.assertEqual(r["verdict"], "not_met")
        self.assertEqual(r["evidence"][0]["line"], 1)
        self.assertEqual(self.grade(GOOD_ORCH, body="no smoke", tags=("docs",))["K01"]["verdict"], "na")

    def test_k02(self):
        r = self.grade(GOOD_ORCH)["K02"]
        self.assertEqual(r["verdict"], "met")
        self.assertEqual(r["evidence"][0]["line"], 7)
        r = self.grade([BRIEF, SEND, bash("agent-wait.sh w1:p1"), MERGE])["K02"]
        self.assertEqual(r["verdict"], "not_met")
        self.assertTrue(r["evidence"])
        failed = [BRIEF, SEND, bash("agent-wait.sh w1:p1"), bash("cd /d/x/demo-wt && pytest -q", True), MERGE]
        self.assertEqual(self.grade(failed)["K02"]["verdict"], "not_met")
        self.assertEqual(self.grade([BRIEF, SEND])["K02"]["verdict"], "na")

    def test_k04(self):
        self.assertEqual(self.grade(GOOD_ORCH)["K04"]["verdict"], "met")
        r = self.grade([BRIEF, SEND, bash("pytest -q"), MERGE])["K04"]
        self.assertEqual(r["verdict"], "not_met")
        self.assertTrue(r["evidence"])
        self.assertEqual(self.grade([BRIEF, SEND])["K04"]["verdict"], "na")

    def test_k06(self):
        self.assertEqual(self.grade(GOOD_ORCH)["K06"]["verdict"], "met")
        r = self.grade([BRIEF, bash("herdr agent prompt p 'Do SPAI-007 @demo: spai show'"), GATE, MERGE])["K06"]
        self.assertEqual(r["verdict"], "not_met")
        self.assertTrue(r["evidence"])
        no_working = bash("herdr agent prompt p 'Read SPAI-007 @demo and carry it out fully now.'")
        r = self.grade([BRIEF, no_working, GATE, MERGE])["K06"]
        self.assertEqual(r["verdict"], "not_met")
        self.assertIn("working", r["note"])

    def test_k10(self):
        ok = bash('MSYS_NO_PATHCONV=1 herdr pane send-text w1:p1 "/exit"')
        bad = bash('herdr pane send-text w1:p1 "/exit"')
        self.assertEqual(self.grade([BRIEF, SEND, ok, GATE, MERGE])["K10"]["verdict"], "met")
        r = self.grade([BRIEF, SEND, bad, GATE, MERGE])["K10"]
        self.assertEqual(r["verdict"], "not_met")
        self.assertEqual(r["evidence"][0]["line"], 5)
        self.assertEqual(self.grade(GOOD_ORCH)["K10"]["verdict"], "na")

    def test_k08(self):
        r = self.grade(GOOD_ORCH, CODER_OK)["K08"]
        self.assertEqual(r["verdict"], "met")
        self.assertEqual(len(r["evidence"]), 2)
        masked = [("Edit", {"file_path": "/a.py"}), bash("pytest -q | tail -3"), ("text", "done")]
        r = self.grade(GOOD_ORCH, masked)["K08"]
        self.assertEqual(r["verdict"], "not_met")
        self.assertTrue(r["evidence"])
        stale = [bash("pytest -q"), ("Write", {"file_path": "/a.py", "content": "x"}), ("text", "done")]
        self.assertEqual(self.grade(GOOD_ORCH, stale)["K08"]["verdict"], "not_met")
        self.assertEqual(self.grade(GOOD_ORCH, [bash("ls"), ("text", "hi")])["K08"]["verdict"], "na")
        self.assertEqual(self.grade(GOOD_ORCH)["K08"]["verdict"], "unknown")

    def test_other_project_mentions_ignored(self):
        rows = self.grade([bash("spai set 7 working --project D:/x/other")] + GOOD_ORCH)
        self.assertEqual(rows["K01"]["evidence"][0]["line"], 3)

    def test_missing_task_is_unknown_not_not_met(self):
        self.assertEqual(self.grade([bash("ls")])["K02"]["verdict"], "unknown")

    def test_main_writes_file_and_never_not_met_without_evidence(self):
        self.grade([BRIEF, SEND, bash("pytest -q"), MERGE], body="none")
        out = self.tmp / "out"
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            wg.main(["SPAI-007", "--project", PROJECT, "--out-dir", str(out)])
        rows = [json.loads(x) for x in (out / "SPAI-007.jsonl").read_text(encoding="utf-8").splitlines()]
        self.assertEqual(len(rows), 10)
        self.assertTrue(any(r["verdict"] == "not_met" for r in rows))
        self.assertTrue(all(r["evidence"] for r in rows if r["verdict"] == "not_met"))
        self.assertIn("K01", buf.getvalue())


STUB_PY = """import json, os, sys
prompt = sys.stdin.read()
open(os.environ["STUB_LOG"], "w", encoding="utf-8").write(json.dumps({"args": sys.argv[1:], "prompt": prompt}))
if os.environ.get("STUB_FAIL"):
    sys.exit(3)
print(json.dumps({"type": "result", "result": open(os.environ["STUB_REPLY"], encoding="utf-8").read()}))
"""


class LlmGrade(Base):
    def stub(self, reply, fail=False):
        py = self.tmp / "stub.py"
        py.write_text(STUB_PY, encoding="utf-8")
        if os.name == "nt":
            exe = self.tmp / "claude-stub.cmd"
            exe.write_text(f'@"{sys.executable}" "{py}" %*\n', encoding="utf-8")
        else:
            exe = self.tmp / "claude-stub"
            exe.write_text(f'#!/bin/sh\nexec "{sys.executable}" "{py}" "$@"\n', encoding="utf-8")
            exe.chmod(0o755)
        (self.tmp / "reply.txt").write_text(reply, encoding="utf-8")
        env = {"WORKFLOW_GRADE_CLAUDE": str(exe), "STUB_LOG": str(self.tmp / "stub.json"),
               "STUB_REPLY": str(self.tmp / "reply.txt")}
        if fail:
            env["STUB_FAIL"] = "1"
        patcher = mock.patch.dict(os.environ, env)
        patcher.start()
        self.addCleanup(patcher.stop)

    def grade_llm(self, orch=GOOD_ORCH, coder=CODER_OK):
        op = write_transcript(self.tmp / "orch.jsonl", orch)
        log = [{"text": f"orchestrator session s transcript {op}"},
               {"text": f"session c pane w1:p1 transcript {write_transcript(self.tmp / 'coder.jsonl', coder)}"}]
        task = {"id": "SPAI-007", "title": "demo", "body": "x\n## SMOKE\n1. run", "tags": ["agent"], "log": log,
                "path": str(self.tmp / "rec.md")}
        patcher = mock.patch.object(wg, "spai_show", lambda i, p: task)
        patcher.start()
        self.addCleanup(patcher.stop)
        return {r["row"]: r for r in wg.grade("SPAI-007", PROJECT, llm=True)}

    def test_verdicts_evidence_and_readonly_call(self):
        reply = json.dumps([
            {"row": "K03", "verdict": "not_met", "evidence": [{"transcript": "O", "line": 7}], "note": "no live run"},
            {"row": "K05", "verdict": "na", "evidence": [], "note": "no defect"},
            {"row": "K07", "verdict": "na", "evidence": [], "note": "no hook"},
            {"row": "K09", "verdict": "met", "evidence": [{"transcript": str(self.tmp / "coder.jsonl"), "line": 1}],
             "note": "chain test"}])
        self.stub(reply)
        rows = self.grade_llm()
        self.assertEqual(rows["K03"]["verdict"], "not_met")
        self.assertEqual(rows["K03"]["evidence"], [{"transcript": str(self.tmp / "orch.jsonl"), "line": 7}])
        self.assertEqual((rows["K05"]["verdict"], rows["K07"]["verdict"], rows["K09"]["verdict"]), ("na", "na", "met"))
        self.assertTrue(all(rows[r]["checker"] == "llm" for r in ("K03", "K05", "K07", "K09")))
        self.assertEqual(rows["K01"]["checker"], "script")
        call = json.loads((self.tmp / "stub.json").read_text(encoding="utf-8"))
        self.assertEqual(call["args"], ["-p", "--model", "sonnet", "--allowedTools", "Read,Grep,Glob",
                                        "--output-format", "json"])
        self.assertIn("O:7 Bash", call["prompt"])  # řádky přepisu jsou citovatelné
        self.assertLess(len(call["prompt"]), 70000)

    def test_not_met_without_evidence_becomes_unknown(self):
        reply = json.dumps([
            {"row": "K03", "verdict": "not_met", "evidence": [], "note": "claims missing"},
            {"row": "K05", "verdict": "not_met", "evidence": [{"transcript": "nope", "line": 3}], "note": "bad label"},
            {"row": "K07", "verdict": "wat", "evidence": [], "note": ""}])
        self.stub(reply)
        rows = self.grade_llm()
        self.assertEqual(rows["K03"]["verdict"], "unknown")
        self.assertIn("without evidence", rows["K03"]["note"])
        self.assertEqual(rows["K05"]["verdict"], "unknown")
        self.assertEqual(rows["K07"]["verdict"], "unknown")
        self.assertIn("invalid verdict", rows["K07"]["note"])
        self.assertIn("no verdict", rows["K09"]["note"])
        self.assertFalse(any(r["verdict"] == "not_met" and not r["evidence"] for r in rows.values()))

    def test_not_json_or_failed_call_is_unknown(self):
        self.stub("sorry, here is prose")
        rows = self.grade_llm()
        for r in ("K03", "K05", "K07", "K09"):
            self.assertEqual((rows[r]["verdict"], rows[r]["note"]), ("unknown", "grader output not JSON"))
        self.stub("[]", fail=True)
        self.assertEqual(self.grade_llm()["K03"]["note"], "grader call failed")

    def test_excerpt_is_capped(self):
        many = [BRIEF, SEND] + [bash("echo smoke " + "x" * 400) for _ in range(400)] + [MERGE]
        self.stub("[]")
        self.grade_llm(many)
        call = json.loads((self.tmp / "stub.json").read_text(encoding="utf-8"))
        self.assertLess(len(call["prompt"]), 70000)
        self.assertIn("excerpt truncated", call["prompt"])

    def test_no_llm_flag_makes_no_call(self):
        self.stub("[]")
        self.grade([BRIEF, SEND, GATE, MERGE])
        self.assertFalse((self.tmp / "stub.json").exists())

    def test_main_hand_agreement(self):
        reply = json.dumps([{"row": r, "verdict": "na", "evidence": [], "note": ""} for r in ("K03", "K05", "K07", "K09")])
        self.stub(reply)
        self.grade_llm()
        hand = self.tmp / "hand.jsonl"
        hand.write_text(json.dumps({"task": "SPAI-007", "row": "K03", "verdict": "na"}) + "\n"
                        + json.dumps({"task": "SPAI-007", "row": "K05", "verdict": "met"}) + "\n", encoding="utf-8")
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            wg.main(["SPAI-007", "--project", PROJECT, "--llm", "--hand", str(hand), "--out-dir", str(self.tmp / "o")])
        out = buf.getvalue()
        self.assertRegex(out, r"K03 .*AGREE")
        self.assertRegex(out, r"K05 .*DIFFER")
        self.assertRegex(out, r"K07 .*no hand verdict")


class SpaiBinary(unittest.TestCase):
    def test_spai_bin_env_wins(self):
        with mock.patch.dict(os.environ, {"SPAI_BIN": "C:/fake/spai.exe"}):
            self.assertEqual(wg.spai_bin(), "C:/fake/spai.exe")

    def test_spai_show_runs_binary_from_env(self):
        done = mock.Mock(stdout=json.dumps({"data": {"id": "SPAI-007"}}))
        with mock.patch.dict(os.environ, {"SPAI_BIN": "C:/fake/spai.exe"}), \
                mock.patch.object(wg.subprocess, "run", return_value=done) as run:
            self.assertEqual(wg.spai_show("SPAI-007", PROJECT)["id"], "SPAI-007")
        self.assertEqual(run.call_args.args[0][0], "C:/fake/spai.exe")

    def test_spai_bin_default_is_tools_or_path(self):
        env = {k: v for k, v in os.environ.items() if k != "SPAI_BIN"}
        with mock.patch.dict(os.environ, env, clear=True):
            expected = "D:/01_programovani/_tools/spai.exe" if Path("D:/01_programovani/_tools/spai.exe").exists() else "spai"
            self.assertEqual(wg.spai_bin(), expected)


def find_bash():
    git_bash = Path("C:/Program Files/Git/bin/bash.exe")
    if git_bash.exists():
        return str(git_bash)
    return shutil.which("bash")


@unittest.skipUnless(find_bash(), "bash není k dispozici")
class TaskLink(unittest.TestCase):
    def test_task_link_logs_session_and_orchestrator_with_spai_bin(self):
        with tempfile.TemporaryDirectory() as d:
            tmp = Path(d)
            fake = tmp / "bin"
            fake.mkdir()
            (fake / "herdr").write_text('#!/usr/bin/env bash\necho \'{"result":{"agent":{"agent_session":{"kind":"id","value":"sid-1"},"cwd":"D:\\\\01_x\\\\wt"}}}\'\n')
            (fake / "myspai").write_text('#!/usr/bin/env bash\necho "$@" >> "$SPAI_LOG"\n')
            home = tmp / "home"
            (home / ".claude" / "projects" / "proj").mkdir(parents=True)
            (home / ".claude" / "projects" / "proj" / "orch-1.jsonl").write_text("{}\n")
            env = dict(os.environ, PATH=f"{fake}{os.pathsep}{os.environ['PATH']}", HOME=str(home),
                       SPAI_LOG=str(tmp / "log.txt"), CLAUDE_SESSION="orch-1", SPAI_BIN=str(fake / "myspai"))
            r = subprocess.run([find_bash(), str(SCRIPTS / "task-link.sh"), "SPAI-007", "D:/x/demo", "w1:p1"],
                               env=env, capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)
            log = (tmp / "log.txt").read_text().splitlines()
            self.assertIn("session sid-1 pane w1:p1 transcript", log[0])
            self.assertIn("/D--01-x-wt/sid-1.jsonl", log[0])
            self.assertIn("orchestrator session orch-1 transcript", log[1])
            self.assertIn("/proj/orch-1.jsonl", log[1])


if __name__ == "__main__":
    unittest.main()
