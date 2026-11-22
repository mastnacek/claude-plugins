"""Tests for .claude/hooks/agent-no-spawn.sh (stdlib unittest)."""
import json
import os
import shutil
import subprocess
import unittest
from pathlib import Path

HOOK = Path(__file__).resolve().parents[2] / ".claude" / "hooks" / "agent-no-spawn.sh"
BASH = shutil.which("bash") or r"C:\Program Files\Git\bin\bash.exe"


def run(command, role="coder", tool="Bash", guard_off=False):
    env = dict(os.environ)
    env.pop("CC_ROLE", None)
    env.pop("NO_AGENT_GUARD", None)
    if role:
        env["CC_ROLE"] = role
    if guard_off:
        env["NO_AGENT_GUARD"] = "1"
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

    def test_switch_in_env_allows(self):
        for c in self.denied:
            with self.subTest(c=c):
                self.assertFalse(run(c, guard_off=True), c)

    def test_switch_in_command_text_denied(self):
        for c in ("NO_AGENT_GUARD=1 claude -p x", "export NO_AGENT_GUARD=1; herdr pane split --current"):
            with self.subTest(c=c):
                self.assertTrue(run(c), c)

    def test_default_denied(self):
        self.assertTrue(run("claude -p x"))


if __name__ == "__main__":
    unittest.main()
