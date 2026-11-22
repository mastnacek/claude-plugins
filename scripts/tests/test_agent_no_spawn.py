"""Tests for .claude/hooks/agent-no-spawn.sh (stdlib unittest)."""
import json
import os
import shutil
import subprocess
import unittest
from pathlib import Path

HOOK = Path(__file__).resolve().parents[2] / ".claude" / "hooks" / "agent-no-spawn.sh"
BASH = shutil.which("bash") or r"C:\Program Files\Git\bin\bash.exe"


def run(command, role="coder", tool="Bash"):
    env = dict(os.environ)
    env.pop("CC_ROLE", None)
    if role:
        env["CC_ROLE"] = role
    payload = json.dumps({"tool_name": tool, "tool_input": {"command": command}})
    out = subprocess.run([BASH, str(HOOK)], input=payload, capture_output=True, text=True, env=env)
    return "deny" in out.stdout


class AgentNoSpawn(unittest.TestCase):
    denied = [
        "claude -p 'hi'",
        "claude --model haiku",
        "cd x && claude",
        "& 'C:\\Users\\u\\.local\\bin\\claude.exe' --model sonnet",
        "herdr agent start t --kind claude --pane w1:p1",
        "herdr agent prompt w1:p2 'do it'",
        "herdr pane split --current --direction down",
        "herdr pane run w1:p3 'claude'",
        "bash scripts/agent.sh tester",
        "bash D:/x/claude/scripts/kolega.sh",
        "agy --mode plan",
        "codex exec 'x'",
        "pi --model x",
    ]
    allowed = [
        "claude plugin validate .",
        "claude plugin test .",
        "herdr pane list --workspace w1",
        "herdr agent get w1:p1",
        "herdr pane read w1:p1 --source visible",
        "git status",
        "cargo test --workspace",
        "grep -n claude README.md",
        "echo pipeline",
    ]

    def test_denied_for_agents(self):
        for c in self.denied:
            with self.subTest(c=c):
                self.assertTrue(run(c), c)
                self.assertTrue(run(c, tool="PowerShell"), c)

    def test_allowed_for_agents(self):
        for c in self.allowed:
            with self.subTest(c=c):
                self.assertFalse(run(c), c)

    def test_orchestrator_unrestricted(self):
        for c in self.denied:
            with self.subTest(c=c):
                self.assertFalse(run(c, role=None), c)
                self.assertFalse(run(c, role="orchestrator"), c)


if __name__ == "__main__":
    unittest.main()
