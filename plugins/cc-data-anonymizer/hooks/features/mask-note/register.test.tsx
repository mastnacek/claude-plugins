import { expect, test } from "claude-code/testing";
import type { TestBody } from "claude-code/testing";

type On = Parameters<TestBody>[1];

// Made-up values, built from parts so no scanner (or this plugin) takes them for real ones.
const SECRET = ["Zk9m", "Q2vLxTt"].join("");
const PERSON = ["Jan", " Novak"].join("");
const SHOWN_SECRET = SECRET.slice(0, 2) + "*".repeat(SECRET.length - 4) + SECRET.slice(-2);

type Calls = { argvs: string[][] };

// A stand-in for anon: mask swaps SECRET and PERSON for tags and reports them; scan --with-values
// returns the raw values (as the real flag does).
const anonDouble = (on: On, env: Record<string, string> = {}): Calls => {
	const calls: Calls = { argvs: [] };
	on("env.get", (_$, e) => ({ value: env[e.name] }));
	on("fs.stat", () => ({ value: { kind: "file", size: 1, mtimeMs: 0, isLink: false } }));
	on("process.run", (_$, e) => {
		calls.argvs.push([...e.argv]);
		const [, command] = e.argv;
		const reply = (stdout: string, exitCode = 0) => ({
			value: { exitCode, stdout, stderr: "", isStdoutTruncated: false, isStderrTruncated: false },
		});
		if (command === "help") return reply("{}");
		const stdin = e.init?.stdin ?? "";
		if (command === "scan") {
			return reply(
				JSON.stringify({
					ok: true,
					findings: [
						{ kind: "password", rule: "r", chars: SECRET.length, value: SECRET, places: [{ path: "/p/s.txt", line: 1, column: 1 }] },
						{ kind: "name", rule: "r", chars: PERSON.length, value: PERSON, places: [{ path: "/p/s.txt", line: 2, column: 1 }] },
					],
				}),
				3,
			);
		}
		if (command === "mask") {
			const text = stdin.replaceAll(SECRET, "<pw>").replaceAll(PERSON, "<name>");
			const hit = (kind: string, n: number) => ({ fake: "<" + kind + ">", kind, style: "tag", count: n });
			const replacements = [
				...(stdin.includes(SECRET) ? [hit("password", 1)] : []),
				...(stdin.includes(PERSON) ? [hit("name", 1)] : []),
			];
			return reply(JSON.stringify({ ok: true, style: "tag", text, replacements }));
		}
		return reply(JSON.stringify({ ok: true, text: stdin }));
	});
	return calls;
};

const TOOL_ID = "toolu_note";
const TOOL_USE = {
	plugin: "cc-data-anonymizer",
	component: "ToolUse",
	requestId: TOOL_ID,
	props: { tool_use_id: TOOL_ID, tool: "Read", input: {}, isRunning: false, isErrored: false, isInterrupted: false },
	surface: "terminal",
} as const;

const readIt = ($: Parameters<TestBody>[0], on: On) => {
	on("tool.call", { tool: "Read" }, () => ({ result: { type: "text", file: { content: `pw ${SECRET} by ${PERSON}` } } }));
	return $.tool.call({ tool: "Read", file_path: "/p/s.txt", tool_use_id: TOOL_ID });
};

const rowDouble = (on: On) =>
	on("ui.render", ($, e) => {
		const { Text } = $.ui.resolve(e);
		return <Text>row</Text>;
	});

test("a masked Read draws a frame under its row: count, kinds, style, values cut by kind", async ($, on) => {
	anonDouble(on, { CC_ROLE: "coder" }); // an agent session: no dialog, the file is masked all the same
	rowDouble(on);
	const out = await readIt($, on);
	// the model's side: nothing but the masked text
	expect(JSON.stringify(out)).not.toContain(SECRET);
	expect(JSON.stringify(out)).not.toContain(PERSON);
	expect(JSON.stringify(out)).not.toContain(SHOWN_SECRET);
	const ui = await $.ui.mount({ ...TOOL_USE });
	const summary = await ui.find({ type: "Text", text: /zamaskováno/ });
	expect(summary?.text).toContain("zamaskováno 2 hodnot");
	expect(summary?.text).toContain("password");
	expect(summary?.text).toContain("name");
	expect(summary?.text).toContain("styl tag");
	expect((await ui.find({ type: "Text", text: new RegExp(PERSON) }))?.text).toContain(PERSON);
	expect((await ui.find({ type: "Text", text: /\*\*\*/ }))?.text).toContain(SHOWN_SECRET);
	expect(await ui.find({ type: "Text", text: new RegExp(SECRET) })).toBeUndefined();
	expect((await ui.find({ type: "Text", text: /^row$/ }))?.text).toBe("row");
	await ui.unmount();
});

test("reveal full shows the whole secret on screen, still not in the result", { options: { reveal: "full", consent: "never" } }, async ($, on) => {
	anonDouble(on);
	rowDouble(on);
	const out = await readIt($, on);
	expect(JSON.stringify(out)).not.toContain(SECRET);
	const ui = await $.ui.mount({ ...TOOL_USE });
	expect((await ui.find({ type: "Text", text: new RegExp(SECRET) }))?.text).toContain(SECRET);
	await ui.unmount();
});

test("reveal none shows the summary and no value, and asks anon for none", { options: { reveal: "none", consent: "never" } }, async ($, on) => {
	const calls = anonDouble(on);
	rowDouble(on);
	await readIt($, on);
	const ui = await $.ui.mount({ ...TOOL_USE });
	expect((await ui.find({ type: "Text", text: /zamaskováno 2 hodnot/ }))?.text).toContain("password");
	expect(await ui.find({ type: "Text", text: new RegExp(PERSON) })).toBeUndefined();
	expect(calls.argvs.some((a) => a.includes("--with-values"))).toBe(false);
	await ui.unmount();
});

test("with consent never or in an agent session there is no scan and no question", { options: { consent: "never" } }, async ($, on) => {
	const calls = anonDouble(on);
	rowDouble(on);
	let asked = false;
	on("tool.call", { tool: "AskUserQuestion" }, () => {
		asked = true;
		return { deny: "no" };
	});
	const out = await readIt($, on);
	expect(out.deny).toBeUndefined();
	expect(asked).toBe(false);
	expect(calls.argvs.some((a) => a[1] === "scan" && a[2] === "/p/s.txt")).toBe(false);
});

test("a Read of a session transcript passes untouched and unasked", async ($, on) => {
	const calls = anonDouble(on);
	on("tool.call", { tool: "Read" }, () => ({ result: { type: "text", file: { content: `pw ${SECRET}` } } }));
	const out = await $.tool.call({ tool: "Read", file_path: "C:/Users/x/.claude/projects/p/s.jsonl" });
	expect(JSON.stringify(out.result)).toContain(SECRET);
	expect(calls.argvs.some((a) => a[1] === "mask" || a[1] === "scan")).toBe(false);
});

test("the findings list of the consent shows the values cut by kind", async ($, on) => {
	const calls = anonDouble(on);
	on("session.cwd", () => ({ value: "/p" }));
	on("tool.call", { tool: "AskUserQuestion" }, (_$, e) => {
		asked = JSON.stringify(e);
		return { deny: "dismissed" };
	});
	let asked = "";
	await $.prompt.mention({ mention: "s.txt", path: "/p/s.txt" }).catch(() => undefined);
	expect(calls.argvs.some((a) => a[1] === "scan" && a.includes("--with-values"))).toBe(true);
	expect(asked).toContain(PERSON);
	expect(asked).toContain(SHOWN_SECRET);
	expect(asked).not.toContain(SECRET);
});

const USER_MESSAGE = (text: string) =>
	({
		plugin: "cc-data-anonymizer",
		component: "UserMessage",
		props: { text, origin: { kind: "composer" }, isExpanded: false },
		surface: "terminal",
	}) as const;

test("a prompt and its @ file get a frame under the user message, from the submitted text", async ($, on) => {
	anonDouble(on);
	rowDouble(on);
	on("prompt.submit", (_$, e) => ({ text: e.text }));
	on("prompt.attachment", (_$, e) => ({ text: e.text }));
	await $.prompt.submit({ text: `mail ${PERSON}`, wait: false, origin: { kind: "composer" } });
	await $.prompt.attachment({ type: "file", text: `file ${SECRET}`, origin: { kind: "engine" } });
	const ui = await $.ui.mount({ ...USER_MESSAGE("mail <name>") });
	expect((await ui.find({ type: "Text", text: /zamaskováno 2 hodnot/ }))?.text).toContain("styl tag");
	expect((await ui.find({ type: "Text", text: new RegExp(PERSON) }))?.text).toContain(PERSON);
	await ui.unmount();
	const other = await $.ui.mount({ ...USER_MESSAGE("something else") });
	expect(await other.find({ type: "Text", text: /zamaskováno/ })).toBeUndefined();
	await other.unmount();
});
