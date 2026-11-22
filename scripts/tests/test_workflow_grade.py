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
    """events: (nástroj, vstup, chyba?, text výsledku?) volání | ("text", "...") závěrečná zpráva. Volání = 2 řádky."""
    lines = []
    for i, e in enumerate(events):
        if e[0] == "text":
            lines.append({"type": "assistant", "message": {"content": [{"type": "text", "text": e[1]}]}})
            continue
        uid = f"u{i}"
        lines.append({"type": "assistant", "message": {"content": [{"type": "tool_use", "id": uid, "name": e[0], "input": e[1]}]}})
        lines.append({"type": "user", "message": {"content": [{"type": "tool_result", "tool_use_id": uid,
                                                            "is_error": bool(len(e) > 2 and e[2]),
                                                            "content": e[3] if len(e) > 3 else "x"}]}})
    path.write_text("".join(json.dumps(x) + "\n" for x in lines), encoding="utf-8")
    return str(path)


def bash(cmd, err=False, result="x"):
    return ("Bash", {"command": cmd}, err, result)


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
        self.assertEqual(call["args"], ["-p", "--model", "sonnet", "--tools", "", "--output-format", "json"])
        self.assertIn("You have no tools", call["prompt"])
        self.assertIn("repository today may differ", call["prompt"])
        self.assertIn("the trigger did not happen -> na, not unknown", call["prompt"])
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


def section(prompt, row):
    """Text výňatku jednoho řádku z promptu grader (od '### Kxx' po další '### ')."""
    return prompt.split(f"### {row} ", 1)[1].split("### K", 1)[0]


class Excerpts(LlmGrade):
    def prompt_for(self, orch, coder=CODER_OK):
        self.stub("[]")
        self.grade_llm(orch, coder)
        return json.loads((self.tmp / "stub.json").read_text(encoding="utf-8"))["prompt"]

    def test_merge_and_last_gate_windows_of_15_lines(self):
        fill = lambda i: bash(f"echo fill-{i:02d}")
        orch = [BRIEF, SEND] + [fill(i) for i in range(40)] + [GATE] + [fill(i) for i in range(40, 80)] + [MERGE]
        sec = section(self.prompt_for(orch), "K03")
        # GATE na řádku 85, merge na 167: okna ±15 řádků (volání + výsledek = 2 řádky)
        for token in ("fill-40", "fill-46", "fill-73", "fill-79", "O:167 Bash", "O:85 Bash"):
            self.assertIn(token, sec)
        for token in ("fill-00", "fill-20", "fill-60"):
            self.assertNotIn(token, sec)

    def test_live_runs_after_done_only(self):
        fill = lambda i: bash(f"echo fill-{i:02d}")
        orch = ([BRIEF, SEND, bash("run early.exe --go")] + [fill(i) for i in range(40)] + [bash("agent-wait.sh w1:p1")]
                + [fill(i) for i in range(40, 80)] + [bash("D:/x/demo/target/app.exe --scenario 2")]
                + [fill(i) for i in range(80, 120)] + [GATE] + [MERGE])
        sec = section(self.prompt_for(orch), "K03")
        self.assertIn("app.exe --scenario 2", sec)
        self.assertIn("fill-79", sec)           # těsně před živým během
        self.assertIn("fill-85", sec)           # těsně za ním
        self.assertNotIn("early.exe", sec)      # před 'done' to živý běh není
        self.assertNotIn("fill-60", sec)

    def test_hook_edit_in_coder_and_hook_in_diff_result(self):
        fill = lambda i: bash(f"echo cfill-{i:02d}")
        coder = ([fill(i) for i in range(40)] + [("Edit", {"file_path": "/d/x/demo-wt/.claude/hooks/block.sh"})]
                 + [fill(i) for i in range(40, 80)] + [("text", "done")])
        diff = bash("cd /d/x/demo-wt && git diff --stat", False, " .claude/hooks/block.sh | 9 +")
        ofill = lambda i: bash(f"echo ofill-{i:02d}")
        orch = [BRIEF, SEND] + [ofill(i) for i in range(40)] + [diff] + [ofill(i) for i in range(40, 80)] + [GATE, MERGE]
        sec = section(self.prompt_for(orch, coder), "K07")
        self.assertIn("block.sh", sec)
        self.assertIn("cfill-39", sec)
        self.assertIn("cfill-40", sec)
        self.assertNotIn("cfill-00", sec)
        self.assertIn(".claude/hooks/block.sh | 9 +", sec)   # tělo výsledku git diff
        self.assertIn("ofill-39", sec)
        self.assertNotIn("ofill-00", sec)
        self.assertIn("C1:final-report done", sec)

    def test_spai_log_entries_of_the_task(self):
        log = bash("spai log 7 --project D:/x/demo 'defect: repro'")
        other = bash("spai log 99 --project D:/x/demo 'other task'")
        fill = lambda i: bash(f"echo fill-{i:02d}")
        orch = ([BRIEF, SEND, other] + [fill(i) for i in range(40)] + [log] + [fill(i) for i in range(40, 80)]
                + [GATE, MERGE])
        sec = section(self.prompt_for(orch), "K03")
        self.assertIn("defect: repro", sec)
        self.assertIn("fill-39", sec)
        self.assertIn("fill-45", sec)
        self.assertNotIn("fill-10", sec)
        self.assertNotIn("other task", sec)

    def test_result_bodies_are_trimmed_before_calls_are_dropped(self):
        # každé volání je živý běh po 'done' = kotva; těla po 600 znacích se do 7500 znaků nevejdou, po 150 ano
        calls = [bash(f"echo smoke-{i:02d}", False, "y" * 1000) for i in range(20)]
        sec = section(self.prompt_for([BRIEF, SEND, bash("agent-wait.sh w1:p1")] + calls + [GATE, MERGE]), "K03")
        self.assertNotIn("excerpt truncated", sec)
        self.assertIn("y" * 150, sec)
        self.assertNotIn("y" * 151, sec)
        for i in range(20):
            self.assertIn(f"echo smoke-{i:02d}", sec)


class SmokeList(Excerpts):
    def test_smoke_steps_numbered_in_prompt(self):
        body = "x\n\n  ## SMOKE\n  1. run the binary live\n  2. dialog case -> blocked\n  Commit proposal: fix(x)\n- 2026-11-22 18:10 (o) log"
        self.assertEqual(wg.smoke_steps(body), ["run the binary live", "dialog case -> blocked"])
        self.assertEqual(wg.smoke_steps("no section"), [])
        self.stub("[]")
        op = write_transcript(self.tmp / "orch.jsonl", GOOD_ORCH)
        task = {"id": "SPAI-007", "title": "demo", "body": body, "tags": ["agent"], "path": "r.md",
                "log": [{"text": f"orchestrator session s transcript {op}"}]}
        with mock.patch.object(wg, "spai_show", lambda i, p: task):
            wg.grade("SPAI-007", PROJECT, llm=True)
        prompt = json.loads((self.tmp / "stub.json").read_text(encoding="utf-8"))["prompt"]
        self.assertIn("1. run the binary live\n2. dialog case -> blocked", prompt)
        self.assertIn("'not run'", prompt)


class TranscriptFiles(Base):
    def transcript(self, d, name, first, events, mtime):
        path = d / name
        write_transcript(path, events)
        path.write_text(json.dumps({"type": "user", "message": {"content": first}}) + "\n" + path.read_text(encoding="utf-8"),
                        encoding="utf-8")
        os.utime(path, (mtime, mtime))


class OrchFallback(TranscriptFiles):
    def orch_dir(self):
        d = self.tmp / "proj" / "D--x-demo"
        d.mkdir(parents=True)
        patcher = mock.patch.dict(os.environ, {"WORKFLOW_GRADE_PROJECTS": str(self.tmp / "proj")})
        patcher.start()
        self.addCleanup(patcher.stop)
        return d

    def run_grade(self, body="x\n## SMOKE\n1. run"):
        task = {"id": "SPAI-007", "body": body, "tags": ["agent"], "log": [], "path": str(self.tmp / "rec.md")}
        with mock.patch.object(wg, "spai_show", lambda i, p: task):
            return {r["row"]: r for r in wg.grade("SPAI-007", PROJECT)}

    def test_orchestrator_found_in_repo_transcripts_when_not_linked(self):
        d = self.orch_dir()
        self.transcript(d, "other.jsonl", "hi", [bash("ls")], 3000)
        self.transcript(d, "mine.jsonl", "hi", GOOD_ORCH, 2000)
        rows = self.run_grade()
        self.assertEqual(rows["K02"]["verdict"], "met")
        self.assertTrue(rows["K02"]["evidence"][0]["transcript"].endswith("mine.jsonl"))

    def test_unlinked_and_not_found_stays_unknown(self):
        d = self.orch_dir()
        self.transcript(d, "other.jsonl", "hi", [bash("ls")], 3000)
        self.assertEqual(self.run_grade()["K02"]["verdict"], "unknown")


class CoderFallback(TranscriptFiles):
    BODY = "WORKDIR D:/x/demo-wt (repo)\n## SMOKE\n1. run"

    def proj(self):
        d = self.tmp / "proj" / "D--x-demo-wt"
        d.mkdir(parents=True)
        patcher = mock.patch.dict(os.environ, {"WORKFLOW_GRADE_PROJECTS": str(self.tmp / "proj")})
        patcher.start()
        self.addCleanup(patcher.stop)
        return d

    def test_newest_transcript_mentioning_the_task_id(self):
        d = self.proj()
        bad = [("Edit", {"file_path": "/a.py"}), ("text", "done")]
        self.transcript(d, "old.jsonl", "Read SPAI-007 @demo and carry it out", bad, 1000)
        self.transcript(d, "new.jsonl", "Read SPAI-007 @demo and carry it out", CODER_OK, 2000)
        self.transcript(d, "newest-other.jsonl", "Read SPAI-099 @demo", bad, 3000)
        r = self.grade(GOOD_ORCH, body=self.BODY)["K08"]
        self.assertEqual(r["verdict"], "met")
        self.assertTrue(r["evidence"][0]["transcript"].endswith("new.jsonl"))

    def test_no_match_or_no_workdir_stays_unknown(self):
        d = self.proj()
        self.transcript(d, "o.jsonl", "Read SPAI-099", CODER_OK, 1000)
        self.assertEqual(self.grade(GOOD_ORCH, body=self.BODY)["K08"]["verdict"], "unknown")
        self.assertEqual(self.grade(GOOD_ORCH)["K08"]["verdict"], "unknown")

    def test_session_line_in_log_wins(self):
        d = self.proj()
        self.transcript(d, "fb.jsonl", "Read SPAI-007", [bash("ls"), ("text", "hi")], 3000)
        r = self.grade(GOOD_ORCH, CODER_OK, body=self.BODY)["K08"]
        self.assertEqual(r["verdict"], "met")
        self.assertTrue(r["evidence"][0]["transcript"].endswith("coder.jsonl"))


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
