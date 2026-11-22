import { expect, test } from "claude-code/testing";
import type { TestBody } from "claude-code/testing";

type On = Parameters<TestBody>[1];

// Made-up values. A stand-in for a LOCKED anon: it masks by rules only (the password), reports
// locked: true, leaves vault-only values alone, and refuses a tag from the main map on unmask.
const SECRET = ["Zk9m", "Q2vLxTt"].join("");
const VAULT_ONLY = ["Zeleny", " Dum"].join("");
const OLD_TAG = "«REDACTED:password:3»";
const NEW_TAG = "«REDACTED:password:100001»";

const reply = (stdout: string, exitCode = 0, stderr = "") => ({
	value: { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false },
});

const lockedAnon = (on: On, toasts: string[] = []) => {
	on("env.get", (_$, e) => ({ value: e.name === "CC_ROLE" ? "coder" : undefined }));
	on("ui.toast", (_$, e) => {
		toasts.push(e.text);
		return { value: undefined };
	});
	on("fs.stat", () => ({ value: { kind: "file", size: 1, mtimeMs: 0, isLink: false } }));
	on("process.run", (_$, e) => {
		const [, command] = e.argv;
		const stdin = e.init?.stdin ?? "";
		if (command === "help") return reply("{}");
		if (command === "scan") return reply("", 0);
		if (command === "mask") {
			const text = stdin.replaceAll(SECRET, NEW_TAG);
			const replacements = stdin.includes(SECRET) ? [{ fake: NEW_TAG, kind: "password", style: "tag", count: 1 }] : [];
			return reply(JSON.stringify({ ok: true, style: "tag", text, replacements, locked: true, skipped: ["vault", "map"] }));
		}
		if (stdin.includes(OLD_TAG)) {
			return reply("", 1, "anon: trezor je zamčený: tuto značku vrátí až anon unlock (" + OLD_TAG + ")");
		}
		return reply(JSON.stringify({ ok: true, text: stdin.replaceAll(NEW_TAG, SECRET), locked: true }));
	});
};

const ID = "toolu_locked";
const TOOL_USE = {
	plugin: "cc-data-anonymizer",
	component: "ToolUse",
	requestId: ID,
	props: { tool_use_id: ID, tool: "Read", input: {}, isRunning: false, isErrored: false, isInterrupted: false },
	surface: "terminal",
} as const;

test("locked anon: the read goes on masked by rules, the row says what is missing, one toast", async ($, on) => {
	const toasts: string[] = [];
	lockedAnon(on, toasts);
	on("ui.render", ($, e) => {
		const { Text } = $.ui.resolve(e);
		return <Text>row</Text>;
	});
	on("tool.call", { tool: "Read" }, () => ({ result: { type: "text", file: { content: `pw ${SECRET} and ${VAULT_ONLY}` } } }));
	const out = await $.tool.call({ tool: "Read", file_path: "/p/s.txt", tool_use_id: ID });
	expect(out.deny).toBeUndefined();
	expect(JSON.stringify(out.result)).not.toContain(SECRET);
	expect(JSON.stringify(out.result)).toContain(NEW_TAG);
	// documented risk: a value only the vault knows is not masked while locked
	expect(JSON.stringify(out.result)).toContain(VAULT_ONLY);
	await $.tool.call({ tool: "Read", file_path: "/p/s.txt", tool_use_id: ID });
	expect(toasts.length).toBe(1);
	expect(toasts[0]).toContain("anon je zamčený: maskuje se jen podle pravidel (trezor a mapa nejsou k dispozici). Spusť anon unlock.");
	const ui = await $.ui.mount({ ...TOOL_USE });
	const note = await ui.find({ type: "Text", text: /anon je zamčený/ });
	expect(note?.text).toContain("Spusť anon unlock");
	expect(note?.text).toContain("Hodnoty jen z trezoru se nemaskují");
	await ui.unmount();
});

test("locked anon: a read that masks nothing still carries the note", async ($, on) => {
	lockedAnon(on);
	on("ui.render", ($, e) => {
		const { Text } = $.ui.resolve(e);
		return <Text>row</Text>;
	});
	on("tool.call", { tool: "Read" }, () => ({ result: { type: "text", file: { content: "nothing here" } } }));
	const out = await $.tool.call({ tool: "Read", file_path: "/p/s.txt", tool_use_id: ID });
	expect(out.deny).toBeUndefined();
	const ui = await $.ui.mount({ ...TOOL_USE });
	expect(await ui.find({ type: "Text", text: /anon je zamčený/ })).toBeDefined();
	expect(await ui.find({ type: "Text", text: /zamaskováno/ })).toBeUndefined();
	await ui.unmount();
});

test("locked anon: a write with a tag of this session's temporary map is restored", async ($, on) => {
	lockedAnon(on);
	let seen = "";
	on("tool.call", { tool: "Read" }, () => ({ result: { type: "text", file: { content: `pw ${SECRET}` } } }));
	on("tool.call", { tool: "Write" }, (_$, e) => {
		seen = JSON.stringify(e);
		return { result: { filePath: "/p/o.txt" } };
	});
	await $.tool.call({ tool: "Read", file_path: "/p/s.txt", tool_use_id: ID });
	const out = await $.tool.call({ tool: "Write", file_path: "/p/o.txt", content: `pw ${NEW_TAG}` });
	expect(out.deny).toBeUndefined();
	expect(seen).toContain(SECRET);
});
