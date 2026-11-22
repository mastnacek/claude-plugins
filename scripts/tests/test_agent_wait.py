"""Testy agent-wait.sh s falešným přepisem a falešným herdr (stdlib unittest)."""
import json
import os
import subprocess
import tempfile
import threading
import time
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "agent-wait.sh"
SID = "11111111-2222-3333-4444-555555555555"
STUB = """#!/usr/bin/env bash
case "$1 $2" in
  "pane get") cat "$STUB_DIR/pane.json";;
  "pane read") touch "$STUB_DIR/started"; cat "$STUB_DIR/pane.txt";;
esac
"""


def line(kind, stop=None):
    if kind == "assistant":
        return json.dumps({"type": "assistant", "message": {"stop_reason": stop, "content": []}})
    return json.dumps({"type": kind, "message": {"content": "x"}})


class AgentWait(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.stub = root / "stub"
        self.projects = root / "projects"
        (self.projects / "D--x-demo").mkdir(parents=True)
        self.stub.mkdir()
        herdr = self.stub / "herdr"
        herdr.write_text(STUB, newline="\n")
        herdr.chmod(0o755)
        self.transcript = self.projects / "D--x-demo" / f"{SID}.jsonl"
        self.set_pane("working", session=True)
        self.panel("hello\n")

    def panel(self, text):
        (self.stub / "pane.txt").write_text(text, encoding="utf-8", newline="\n")

    def wait_started(self):
        """Skript si stav přepisu při startu zaznamená před prvním čtením panelu."""
        while not (self.stub / "started").exists():
            time.sleep(0.05)

    def tearDown(self):
        self.tmp.cleanup()

    def set_pane(self, status, session=True):
        pane = {"agent": "claude", "agent_status": status, "cwd": "D:\\x\\demo", "pane_id": "w:p1"}
        if session:
            pane["agent_session"] = {"kind": "id", "value": SID}
        (self.stub / "pane.json").write_text(json.dumps({"result": {"pane": pane}}))

    def write(self, *lines, mode="w"):
        with open(self.transcript, mode, encoding="utf-8", newline="\n") as fh:
            fh.write("".join(l + "\n" for l in lines))

    def run_wait(self, max_s=30):
        env = dict(os.environ, STUB_DIR=self.stub.as_posix(), CLAUDE_PROJECTS_DIR=self.projects.as_posix(),
                   AGENT_WAIT_POLL="0.2", AGENT_WAIT_MAX_S=str(max_s),
                   PATH=self.stub.as_posix() + os.pathsep + os.environ["PATH"])
        t0 = time.time()
        r = subprocess.run(["bash", str(SCRIPT), "w:p1"], env=env, capture_output=True, text=True,
                           encoding="utf-8", timeout=60)
        return r, time.time() - t0

    def test_no_early_return_without_new_end_turn(self):
        # starý end_turn před zadáním + nový prompt bez odpovědi; status už idle
        self.write(line("assistant", "end_turn"), line("user"))
        self.set_pane("idle")
        r, dt = self.run_wait(max_s=2)
        self.assertEqual(r.stdout.strip(), "timeout w:p1", r.stderr)
        self.assertEqual(r.returncode, 1)

    def test_returns_after_end_turn_appended_later(self):
        self.write(line("assistant", "end_turn"), line("user"))
        self.set_pane("working")

        def finish():
            self.wait_started()
            time.sleep(1.5)
            self.write(line("assistant", "tool_use"), line("user"), line("assistant", "end_turn"), mode="a")
            self.set_pane("idle")

        th = threading.Thread(target=finish)
        th.start()
        r, dt = self.run_wait()
        th.join()
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(r.stdout.strip(), f"done w:p1 {self.transcript.as_posix()}:5")
        self.assertGreaterEqual(dt, 1.4)

    def test_working_status_holds_back(self):
        self.write(line("user"))
        self.write(line("assistant", "end_turn"), mode="a")
        self.set_pane("working")
        r, _ = self.run_wait(max_s=2)
        self.assertEqual(r.stdout.strip(), "timeout w:p1")

    def test_background_shell_is_a_pause(self):
        self.write(line("user"))
        self.set_pane("idle")
        self.panel("answer\n  1 shell · still running\n")

        def finish():
            self.wait_started()
            self.write(line("assistant", "end_turn"), mode="a")

        th = threading.Thread(target=finish)
        th.start()
        r, _ = self.run_wait(max_s=4)
        th.join()
        self.assertEqual(r.stdout.strip(), "timeout w:p1")

    def test_blocked_returns_immediately(self):
        self.write(line("assistant", "end_turn"), line("user"))
        self.set_pane("blocked")
        r, dt = self.run_wait()
        self.assertEqual((r.returncode, r.stdout.strip()), (2, "blocked w:p1"), r.stderr)
        self.assertLess(dt, 10)

    def test_blocked_by_panel_dialog(self):
        self.write(line("user"))
        self.set_pane("unknown")
        self.panel("Do you want to proceed?\n❯ 1. Yes\n  2. No\n")
        r, _ = self.run_wait()
        self.assertEqual((r.returncode, r.stdout.strip()), (2, "blocked w:p1"), r.stderr)

    def test_fallback_without_transcript(self):
        self.set_pane("working", session=False)
        self.panel("old\n✻ Worked for 3s\n")

        def finish():
            self.wait_started()
            time.sleep(1.0)
            self.panel("new work\n✻ Worked for 9s\n")

        th = threading.Thread(target=finish)
        th.start()
        r, dt = self.run_wait()
        th.join()
        self.assertEqual((r.returncode, r.stdout.strip()), (0, "done w:p1 panel"), r.stderr)
        self.assertGreaterEqual(dt, 0.9)  # starý souhrn z doby před startem nestačí


if __name__ == "__main__":
    unittest.main()
