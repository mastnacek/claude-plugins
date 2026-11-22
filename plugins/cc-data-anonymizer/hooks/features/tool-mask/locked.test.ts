import { expect, test } from "claude-code/testing";
import type { TestBody } from "claude-code/testing";

type On = Parameters<TestBody>[1];

// A locked anon: mask works (and issues this session the tag), unmask of a tag from the main map is refused.
const TAG = "«REDACTED:password:3»";
const MESSAGE = "anon je zamčený: tuto značku vrátí až anon unlock";

const reply = (stdout: string, exitCode = 0, stderr = "") => ({
	value: { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false },
});

const lockedAnon = (on: On) => {
	on("env.get", () => ({ value: undefined }));
	on("ui.toast", () => ({ value: undefined }));
	on("fs.stat", () => ({ value: { kind: "file", size: 1, mtimeMs: 0, isLink: false } }));
	on("process.run", (_$, e) => {
		const [, command] = e.argv;
		const stdin = e.init?.stdin ?? "";
		if (command === "help") return reply("{}");
		if (command === "scan") return reply("", 0);
		if (command === "mask") return reply(JSON.stringify({ ok: true, style: "tag", text: stdin.replaceAll("REAL", TAG), replacements: [], locked: true }));
		if (stdin.includes(TAG)) return reply("", 1, "anon: trezor je zamčený: tuto značku vrátí až anon unlock (" + TAG + ")");
		return reply(JSON.stringify({ ok: true, text: stdin, locked: true }));
	});
};

test("locked anon: a write holding a main-map tag is denied with the unlock message, never passed through", async ($, on) => {
	lockedAnon(on);
	let ran = false;
	on("tool.call", { tool: "Read" }, () => ({ result: { type: "text", file: { content: "key REAL" } } }));
	on("tool.call", { tool: "Write" }, () => {
		ran = true;
		return { result: { filePath: "/p/o.txt" } };
	});
	await $.tool.call({ tool: "Read", file_path: "/p/a.txt", tool_use_id: "t1" });
	const out = await $.tool.call({ tool: "Write", file_path: "/p/o.txt", content: `key ${TAG}` });
	expect(out.deny ?? out.text).toContain(MESSAGE);
	expect(ran).toBe(false);
});

test("locked anon: a write without tags and a plain read still work", async ($, on) => {
	lockedAnon(on);
	let ran = false;
	on("tool.call", { tool: "Write" }, () => {
		ran = true;
		return { result: { filePath: "/p/o.txt" } };
	});
	const out = await $.tool.call({ tool: "Write", file_path: "/p/o.txt", content: "no tags here" });
	expect(out.deny).toBeUndefined();
	expect(ran).toBe(true);
});
