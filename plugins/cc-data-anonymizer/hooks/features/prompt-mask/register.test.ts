import { expect, test } from "claude-code/testing";
import type { TestBody } from "claude-code/testing";

type On = Parameters<TestBody>[1];

// A stand-in for the anon CLI: REAL <-> FAKE, scan finds REAL.
const anonDouble = (on: On, options: { isMissing?: boolean; scanFound?: boolean } = {}) => {
	on("env.get", () => ({ value: undefined }));
	on("fs.stat", () => ({ value: { kind: "file", size: 1, mtimeMs: 0, isLink: false } }));
	on("process.run", (_$, e) => {
		const [bin, command] = e.argv;
		if (options.isMissing) throw new Error(`spawn ${bin} ENOENT`);
		const reply = (stdout: string, exitCode = 0) => ({
			value: { exitCode, stdout, stderr: "", isStdoutTruncated: false, isStderrTruncated: false },
		});
		if (command === "help") return reply("{}");
		if (command === "scan") return options.scanFound ? reply(JSON.stringify({ ok: true, findings: [{ kind: "secret", rule: "vault", chars: 4, places: [{ path: "/p/s.txt", line: 1, column: 1 }] }] }), 3) : reply("");
		const swap = command === "mask" ? (s: string) => s.replaceAll("REAL", "FAKE") : (s: string) => s.replaceAll("FAKE", "REAL");
		return reply(JSON.stringify({ ok: true, text: swap(e.init?.stdin ?? "") }));
	});
};

test("the submitted prompt is masked", async ($, on) => {
	anonDouble(on);
	let entered = "";
	on("prompt.submit", (_$, e) => {
		entered = e.text;
		return { text: e.text };
	});
	await $.prompt.submit({ text: "mail REAL", wait: false, origin: { kind: "composer" } });
	expect(entered).toBe("mail FAKE");
});

test("a mentioned file with secrets is denied when the dialog is dismissed", async ($, on) => {
	anonDouble(on, { scanFound: true });
	on("session.cwd", () => ({ value: "/p" }));
	on("tool.call", { tool: "AskUserQuestion" }, () => ({ deny: "dismissed" }));
	on("prompt.mention", () => ({ type: "file" }));
	const out = await $.prompt.mention({ mention: "s.txt", path: "/p/s.txt" });
	expect(out.deny).toContain("not allowed");
});

test("anon missing: the prompt is dropped, never sent as typed", async ($, on) => {
	anonDouble(on, { isMissing: true });
	let entered = "";
	on("prompt.submit", (_$, e) => {
		entered = e.text;
		return { text: e.text };
	});
	const out = await $.prompt.submit({ text: "mail REAL", wait: false, origin: { kind: "composer" } });
	expect(entered).toBe("");
	expect(out.drop).toContain("anon was not found");
});

test("a mentioned file's attachment is masked", async ($, on) => {
	anonDouble(on);
	on("prompt.attachment", (_$, e) => ({ text: e.text }));
	const out = await $.prompt.attachment({ type: "file", text: "file REAL", origin: { kind: "engine" } });
	expect(out.text).toBe("file FAKE");
});
