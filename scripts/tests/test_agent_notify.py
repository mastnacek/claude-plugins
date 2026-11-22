"""Testy hooku agent-notify.sh s falešným herdr a vymyšlenými přepisy (stdlib unittest)."""
import json
import os
import subprocess
import tempfile
import time
import unittest
from pathlib import Path

HOOK = Path(__file__).resolve().parent.parent.parent / ".claude" / "hooks" / "agent-notify.sh"
FAKE = """#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$FAKE_LOG"
[[ -n "${FAKE_MODE:-}" ]] && case "$FAKE_MODE" in
  fail) exit 3;;
  hang) sleep 30;;
esac
exit 0
"""


def assistant(*blocks):
    return json.dumps({"type": "assistant", "message": {"content": list(blocks)}})


def text(t):
    return {"type": "text", "text": t}


def tool_use(uid, cmd):
    return {"type": "tool_use", "id": uid, "name": "Bash", "input": {"command": cmd}}


def user_text(t):
    return json.dumps({"type": "user", "message": {"content": [{"type": "text", "text": t}]}})


def tool_result(uid, content):
    return json.dumps({"type": "user", "message": {"content": [{"type": "tool_result", "tool_use_id": uid,
                                                                  "content": content}]}})


class AgentNotify(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.fake = root / "herdr"
        self.fake.write_text(FAKE, newline="\n")
        self.fake.chmod(0o755)
        self.calls = root / "calls.log"
        self.transcript = root / "t.jsonl"

    def tearDown(self):
        self.tmp.cleanup()

    def write(self, *lines):
        self.transcript.write_text("".join(l + "\n" for l in lines), encoding="utf-8", newline="\n")

    def run_hook(self, payload, role="coder", orch="w:p1", mode="", timeout_s="5"):
        env = dict(os.environ, HERDR_BIN=self.fake.as_posix(), FAKE_LOG=self.calls.as_posix(),
                   FAKE_MODE=mode, NOTIFY_TIMEOUT_S=timeout_s, HERDR_PANE_ID="w:p9", TEMP=self.tmp.name)
        for k in ("CC_ROLE", "ORCH_PANE"):
            env.pop(k, None)
        if role:
            env["CC_ROLE"] = role
        if orch:
            env["ORCH_PANE"] = orch
        payload = dict(payload, transcript_path=self.transcript.as_posix())
        t0 = time.time()
        r = subprocess.run(["bash", str(HOOK)], input=json.dumps(payload), env=env, capture_output=True,
                           text=True, encoding="utf-8", timeout=60)
        return r, time.time() - t0

    def sent(self):
        return self.calls.read_text(encoding="utf-8").splitlines() if self.calls.exists() else []

    def test_coder_stop_sends_done_and_toast(self):
        self.write(user_text("go"), assistant(text("OK\nmore detail")))
        r, _ = self.run_hook({"hook_event_name": "Stop"})
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(self.sent(), ["agent prompt w:p1 DONE coder w:p9: OK",
                                       "notification show coder --body DONE coder w:p9: OK"])

    def test_done_text_truncated_to_160(self):
        self.write(assistant(text("x" * 400)))
        self.run_hook({"hook_event_name": "Stop"}, role="tester")
        self.assertEqual(self.sent()[0], "agent prompt w:p1 DONE tester w:p9: " + "x" * 160)

    def test_blocked_line(self):
        self.write(assistant(text("Tried.\nBLOCKED: need the API key\nrest")))
        self.run_hook({"hook_event_name": "Stop"})
        self.assertEqual(self.sent(), ["agent prompt w:p1 BLOCKED coder w:p9: BLOCKED: need the API key",
                                       "notification show coder --body BLOCKED coder w:p9: BLOCKED: need the API key"
                                       " --sound done"])

    def test_stop_hook_active_sends_nothing(self):
        self.write(assistant(text("OK")))
        r, _ = self.run_hook({"hook_event_name": "Stop", "stop_hook_active": True})
        self.assertEqual((r.returncode, self.sent()), (0, []))

    def test_inactive_without_role_or_orch_pane(self):
        self.write(assistant(text("OK")))
        self.assertEqual(self.run_hook({"hook_event_name": "Stop"}, role="")[0].returncode, 0)
        self.assertEqual(self.run_hook({"hook_event_name": "Stop"}, orch="")[0].returncode, 0)
        self.assertEqual(self.sent(), [])

    def test_last_assistant_message_preferred(self):
        self.write(assistant(text("old")))
        self.run_hook({"hook_event_name": "Stop", "last_assistant_message": "fresh"})
        self.assertEqual(self.sent()[0], "agent prompt w:p1 DONE coder w:p9: fresh")

    def kolega_turn(self, cmd, result):
        self.write(user_text("older"), assistant(text("noise")), user_text("nudge"),
                   assistant(tool_use("tu1", cmd)), tool_result("tu1", result), assistant(text("SPAI-99")))

    def test_kolega_fundamental_sends_insight(self):
        res = json.dumps({"command": "add", "data": {"id": "SPAI-123", "title": "Hooks never fire in worktrees"},
                          "ok": True})
        self.kolega_turn("spai add --project C:/Users/x 'Hooks never fire in worktrees @claude :fundamental:'", res)
        self.run_hook({"hook_event_name": "Stop"}, role="kolega")
        self.assertEqual(self.sent(), [
            "agent prompt w:p1 INSIGHT SPAI-123 @jaroslav: Hooks never fire in worktrees",
            "notification show kolega --body INSIGHT SPAI-123 @jaroslav: Hooks never fire in worktrees"
            " --sound done"])

    def test_kolega_medium_sends_nothing(self):
        res = json.dumps({"data": {"id": "SPAI-124", "title": "Small thing"}, "ok": True})
        self.kolega_turn("spai add --project C:/Users/x '/ Small thing :medium:'", res)
        self.run_hook({"hook_event_name": "Stop"}, role="kolega")
        self.assertEqual(self.sent(), [])

    def test_kolega_fundamental_from_earlier_turn_ignored(self):
        res = json.dumps({"data": {"id": "SPAI-125", "title": "Old"}, "ok": True})
        self.write(user_text("a"), assistant(tool_use("tu1", "spai add x :fundamental:")), tool_result("tu1", res),
                   user_text("next nudge"), assistant(text("no change")))
        self.run_hook({"hook_event_name": "Stop"}, role="kolega")
        self.assertEqual(self.sent(), [])

    def test_notification_sends_waiting(self):
        r, _ = self.run_hook({"hook_event_name": "Notification", "message": "Claude needs your permission"})
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(self.sent(), [
            "agent prompt w:p1 WAITING coder w:p9: Claude needs your permission",
            "notification show coder --body WAITING coder w:p9: Claude needs your permission --sound done"])

    def test_notification_ignored_for_kolega(self):
        self.run_hook({"hook_event_name": "Notification", "message": "idle"}, role="kolega")
        self.assertEqual(self.sent(), [])

    def test_failing_herdr_exits_zero(self):
        self.write(assistant(text("OK")))
        r, _ = self.run_hook({"hook_event_name": "Stop"}, mode="fail")
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_hanging_herdr_exits_zero_within_timeout(self):
        self.write(assistant(text("OK")))
        r, dt = self.run_hook({"hook_event_name": "Stop"}, mode="hang", timeout_s="1")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertLess(dt, 15)

    def test_garbage_input_exits_zero(self):
        env = dict(os.environ, CC_ROLE="coder", ORCH_PANE="w:p1", HERDR_BIN=self.fake.as_posix(),
                   FAKE_LOG=self.calls.as_posix(), TEMP=self.tmp.name)
        r = subprocess.run(["bash", str(HOOK)], input="not json", env=env, capture_output=True, text=True,
                           timeout=60)
        self.assertEqual((r.returncode, self.sent()), (0, []))


if __name__ == "__main__":
    unittest.main()
