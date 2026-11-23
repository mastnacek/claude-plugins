"""Tests for scripts/kolega-read.py (stdlib unittest). Fixtures use made-up values only."""
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "kolega-read.py"
HUGE = "X" * 200_000


def run(path, lo, hi, *extra):
    out = subprocess.run([sys.executable, str(SCRIPT), str(path), str(lo), str(hi), *extra],
                         capture_output=True, text=True, encoding="utf-8",
                         env=dict(os.environ, PYTHONIOENCODING="utf-8"))
    return out.returncode, out.stdout, out.stderr


def write(lines):
    f = tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False, encoding="utf-8")
    for obj in lines:
        f.write((obj if isinstance(obj, str) else json.dumps(obj)) + "\n")
    f.close()
    return f.name


class KolegaRead(unittest.TestCase):
    def tearDown(self):
        for p in getattr(self, "files", []):
            os.unlink(p)

    def fixture(self, lines):
        p = write(lines)
        self.files = getattr(self, "files", []) + [p]
        return p

    def test_claude_format_huge_result_truncated(self):
        p = self.fixture([
            {"type": "mode", "mode": "x"},
            {"type": "user", "message": {"role": "user", "content": "do the thing"}},
            {"type": "assistant", "message": {"role": "assistant", "content": [
                {"type": "text", "text": "ok"},
                {"type": "tool_use", "id": "t1", "name": "Bash", "input": {"command": "ls -la", "description": "d"}}]}},
            {"type": "user", "message": {"role": "user", "content": [
                {"type": "tool_result", "tool_use_id": "t1", "is_error": True, "content": HUGE}]}},
        ])
        rc, out, _ = run(p, 1, 4)
        self.assertEqual(rc, 0)
        self.assertLess(len(out), 2000)
        lines = out.splitlines()
        self.assertEqual([l.split(":")[0] for l in lines], ["1", "2", "3", "4"])
        self.assertIn("user do the thing", lines[1])
        self.assertIn("CALL Bash command=ls -la", lines[2])
        self.assertIn("RESULT is_error", lines[3])
        self.assertIn("…(+", lines[3])

    def test_range_keeps_original_line_numbers(self):
        p = self.fixture([{"type": "user", "message": {"role": "user", "content": "line %d" % i}} for i in range(1, 8)])
        rc, out, _ = run(p, 3, 5)
        self.assertEqual([l.split(":")[0] for l in out.splitlines()], ["3", "4", "5"])
        self.assertIn("line 3", out)
        self.assertNotIn("line 6", out)

    def test_chars_option(self):
        p = self.fixture([{"type": "user", "message": {"role": "user", "content": [
            {"type": "tool_result", "tool_use_id": "t", "content": [{"type": "text", "text": "A" * 100}]}]}}])
        _, short, _ = run(p, 1, 1, "--chars", "10")
        _, long, _ = run(p, 1, 1, "--chars", "50")
        self.assertIn("A" * 10 + "…(+90)", short)
        self.assertIn("A" * 50 + "…(+50)", long)

    def test_pi_format(self):
        p = self.fixture([
            {"type": "session", "id": "s1", "cwd": "/fake"},
            {"type": "message", "message": {"role": "user", "content": [{"type": "text", "text": "hello pi"}]}},
            {"type": "message", "message": {"role": "assistant", "content": [
                {"type": "thinking", "thinking": "secret"},
                {"type": "toolCall", "id": "c1", "name": "bash", "arguments": {"command": "echo hi"}}]}},
            {"type": "message", "message": {"role": "toolResult", "toolName": "bash", "isError": True,
                                             "content": [{"type": "text", "text": HUGE}]}},
        ])
        rc, out, _ = run(p, 1, 4)
        self.assertEqual(rc, 0)
        self.assertLess(len(out), 2000)
        self.assertIn("1: [session]", out)
        self.assertIn("2: user hello pi", out)
        self.assertIn("CALL bash command=echo hi", out)
        self.assertNotIn("secret", out)
        self.assertIn("toolResult bash is_error", out)

    def test_tokens_summary_and_per_line_usage(self):
        u1 = {"input_tokens": 10, "cache_read_input_tokens": 1000, "cache_creation_input_tokens": 90, "output_tokens": 5}
        u2 = {"input_tokens": 20, "cache_read_input_tokens": 3000, "cache_creation_input_tokens": 0, "output_tokens": 7}
        read = {"type": "tool_use", "id": "t1", "name": "Read", "input": {"file_path": "/x/a.txt"}}
        read2 = {"type": "tool_use", "id": "t2", "name": "Read", "input": {"file_path": "/x/a.txt"}}
        p = self.fixture([
            {"type": "assistant", "message": {"role": "assistant", "usage": u1, "content": [read]}},
            {"type": "user", "message": {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "t1", "content": "Y" * 5000}]}},
            {"type": "assistant", "message": {"role": "assistant", "usage": u2, "content": [read2]}},
            {"type": "user", "message": {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "t2", "content": "Z" * 50}]}},
        ])
        out = subprocess.run([sys.executable, str(SCRIPT), p, "--tokens"], capture_output=True, text=True, encoding="utf-8",
                             env=dict(os.environ, PYTHONIOENCODING="utf-8"))
        self.assertEqual(out.returncode, 0, out.stderr)
        self.assertIn("baseline (first turn context): 1100 tokens at line 1", out.stdout)
        self.assertIn("peak context: 3020 tokens at line 3", out.stdout)
        self.assertIn("5000  2  Read  file_path=/x/a.txt", out.stdout)
        self.assertIn("2x  /x/a.txt", out.stdout)
        code, text, _ = run(p, 1, 2)
        self.assertIn("1: assistant [tok ctx=1100 out=5]", text)
        self.assertIn("RESULT (5000 chars)", text)

    def test_unparsable_line_and_bad_usage(self):
        p = self.fixture(["{broken", {"type": "mode"}])
        rc, out, _ = run(p, 1, 2)
        self.assertEqual(rc, 0)
        self.assertIn("1: [unparsable]", out)
        self.assertIn("2: [mode]", out)
        rc, _, err = run(p, 1, 2, "extra")
        self.assertEqual(rc, 2)
        self.assertIn("kolega-read.py", err)


if __name__ == "__main__":
    unittest.main()
