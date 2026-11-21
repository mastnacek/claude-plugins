import { expect, test } from "claude-code/testing";
import type { TestBody } from "claude-code/testing";

type On = Parameters<TestBody>[1];

const PASSWORD = "«REDACTED:password:1»";
const USERNAME = "«REDACTED:username:2»";

// A stand-in for the anon CLI: unmask turns a tag into a made-up original.
const anonDouble = (on: On, role?: string) => {
	on("env.get", (_$, e) => ({ value: e.name === "CC_ROLE" ? role : undefined }));
	on("process.run", (_$, e) => {
		const command = e.argv[1];
		const reply = (stdout: string) => ({
			value: { exitCode: 0, stdout, stderr: "", isStdoutTruncated: false, isStderrTruncated: false },
		});
		if (command === "help") return reply("{}");
		const stdin = e.init?.stdin ?? "";
		const text =
			command === "mask"
				? stdin.replaceAll("pw-REAL", PASSWORD).replaceAll("user-REAL", USERNAME)
				: stdin.replaceAll(PASSWORD, "pw-REAL").replaceAll(USERNAME, "user-REAL");
		return reply(JSON.stringify({ ok: true, text }));
	});
};

// The session reads a masked result first: that issues both tags to it.
const issue = async ($: Parameters<TestBody>[0]) => {
	await $.tool.call({ tool: "Grep", pattern: "key" });
};

const run = (on: On) => {
	const seen: string[] = [];
	on("tool.call", { tool: /^(Bash|PowerShell|Write|Grep)$/ }, (_$, e) => {
		if (e.tool === "Grep") return { result: { content: "pw-REAL user-REAL" } };
		seen.push(e.tool === "Bash" || e.tool === "PowerShell" ? e.command : e.tool === "Write" ? e.content : "");
		return { result: { stdout: "ok" } };
	});
	return seen;
};

test("a password tag in a Bash command is denied", async ($, on) => {
	anonDouble(on);
	const seen = run(on);
	await issue($);
	const out = await $.tool.call({ tool: "Bash", command: `login -p ${PASSWORD}` });
	expect(out.deny ?? out.text).toContain("Hesla a tajemství se do příkazů nevracejí");
	expect(seen.length).toBe(0);
});

test("a username tag in a Bash command is restored", async ($, on) => {
	anonDouble(on);
	const seen = run(on);
	await issue($);
	await $.tool.call({ tool: "Bash", command: `ssh ${USERNAME}@host` });
	expect(seen).toEqual(["ssh user-REAL@host"]);
});

test("a password tag in PowerShell is denied", async ($, on) => {
	anonDouble(on);
	const seen = run(on);
	await issue($);
	const out = await $.tool.call({ tool: "PowerShell", command: `x ${PASSWORD}` });
	expect(out.deny ?? out.text).toContain("Hesla a tajemství");
	expect(seen.length).toBe(0);
});

test("ask: a dismissed dialog denies", { options: { shellSecrets: "ask" } }, async ($, on) => {
	anonDouble(on);
	const seen = run(on);
	let asked = "";
	on("tool.call", { tool: "AskUserQuestion" }, (_$, e) => {
		asked = JSON.stringify(e);
		return { deny: "dismissed" };
	});
	await issue($);
	const out = await $.tool.call({ tool: "Bash", command: `login ${PASSWORD}` });
	expect(asked).toContain("password");
	expect(out.deny ?? out.text).toContain("Hesla a tajemství");
	expect(seen.length).toBe(0);
});

test("ask: a confirmed dialog restores the secret", { options: { shellSecrets: "ask" } }, async ($, on) => {
	anonDouble(on);
	const seen = run(on);
	on("tool.call", { tool: "AskUserQuestion" }, (_$, e) => {
		const q = (e as { questions?: { question: string; options: { label: string }[] }[] }).questions?.[0];
		return { result: { questions: (e as { questions?: unknown }).questions, answers: { [q?.question ?? ""]: q?.options[0]?.label ?? "" } } };
	});
	await issue($);
	const out = await $.tool.call({ tool: "Bash", command: `login ${PASSWORD}` });
	expect(out.deny).toBeUndefined();
	expect(seen).toEqual(["login pw-REAL"]);
});

test("ask: an agent session is denied without a dialog", { options: { shellSecrets: "ask" } }, async ($, on) => {
	anonDouble(on, "coder");
	run(on);
	let asked = false;
	on("tool.call", { tool: "AskUserQuestion" }, () => {
		asked = true;
		return { deny: "dismissed" };
	});
	await issue($);
	const out = await $.tool.call({ tool: "Bash", command: `login ${PASSWORD}` });
	expect(asked).toBe(false);
	expect(out.deny ?? out.text).toContain("Hesla a tajemství");
});

test("allow: the secret is restored", { options: { shellSecrets: "allow" } }, async ($, on) => {
	anonDouble(on);
	const seen = run(on);
	await issue($);
	await $.tool.call({ tool: "Bash", command: `login ${PASSWORD}` });
	expect(seen).toEqual(["login pw-REAL"]);
});

test("Write is unchanged: the password is restored in a file", async ($, on) => {
	anonDouble(on);
	const seen = run(on);
	await issue($);
	await $.tool.call({ tool: "Write", file_path: "/p/a", content: `pw=${PASSWORD}` });
	expect(seen).toEqual(["pw=pw-REAL"]);
});
