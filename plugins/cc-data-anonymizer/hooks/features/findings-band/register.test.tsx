import { expect, test } from "claude-code/testing";
import type { TestBody } from "claude-code/testing";

type On = Parameters<TestBody>[1];

const PANE = {
	plugin: "cc-data-anonymizer",
	component: "Pane",
	requestId: "anon-consent",
	props: { title: "anon: citlivé hodnoty", isFocused: true, bodyColumns: 60, placement: "dock", scroll: { offset: 0, bodyRows: 20 }, view: {} },
	surface: "terminal",
} as const;

const BAND = {
	plugin: "cc-data-anonymizer",
	component: "AbovePrompt",
	props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 5, bodyColumns: 80, scroll: { offset: 0, bodyRows: 5 }, view: {} },
	surface: "terminal",
} as const;

const stored = (value: unknown) => ({ value: { value, version: 1 } });

// Fake placeholder values only: scan reports places, never the value.
const FINDING = { kind: "secret", rule: "vault", chars: 4, places: [{ path: "/p/s.txt", line: 1, column: 2 }] };

const anonDouble = (on: On) => {
	on("env.get", () => ({ value: undefined }));
	on("fs.stat", () => ({ value: { kind: "file", size: 1, mtimeMs: 0, isLink: false } }));
	on("session.cwd", () => ({ value: "/p" }));
	on("process.run", (_$, e) => {
		const reply = (stdout: string, exitCode = 0) => ({
			value: { exitCode, stdout, stderr: "", isStdoutTruncated: false, isStderrTruncated: false },
		});
		return e.argv[1] === "scan" ? reply(JSON.stringify({ ok: true, findings: [FINDING] }), 3) : reply(JSON.stringify({ ok: true, text: e.init?.stdin ?? "" }));
	});
};

/** Runs a mention of /p/s.txt; `act` drives the pane once it is open. Resolves the mention's result. */
async function mention($: Parameters<TestBody>[0], on: On, act: (isOpen: Promise<void>) => Promise<void>) {
	anonDouble(on);
	on("prompt.mention", () => ({ type: "file" }));
	on("session.surfaces", () => ({ value: ["terminal"] }));
	let opened!: () => void;
	const isOpen = new Promise<void>((resolve) => (opened = resolve));
	on("ui.open", () => {
		opened();
		return { value: { isPlaced: true } };
	});
	on("ui.close", () => ({ value: undefined }));
	const result = $.prompt.mention({ mention: "s.txt", path: "/p/s.txt" });
	await act(isOpen);
	return { out: await result };
}

test("the pane lists each file once with colored kinds, two buttons and no value", async ($, on) => {
	on("state.get", () =>
		stored([{ path: "src/a.txt", lines: [{ line: 3, column: 1, kind: "password", rule: "vault", chars: 8 }] }]),
	);
	const ui = await $.ui.mount({ ...PANE });
	expect((await ui.find({ type: "Text", text: /src\/a\.txt/ }))?.text).toBe("src/a.txt");
	expect((await ui.find({ type: "Text", text: /^password$/ }))?.props?.color).toBe("error");
	expect((await ui.findAll({ type: "Button" })).map((b) => b.text)).toEqual(["Povolit (Enter)", "Zamítnout (Esc)"]);
	await ui.unmount();
});

test("Povolit allows the file", async ($, on) => {
	const { out } = await mention($, on, async (isOpen) => {
		await isOpen;
		const ui = await $.ui.mount({ ...PANE });
		expect((await ui.find({ type: "Text", text: /s\.txt/ }))?.text).toBe("s.txt");
		await ui.press({ key: "allow" });
		await ui.unmount();
	});
	expect(out.deny).toBeUndefined();
});

test("Zamítnout denies the file", async ($, on) => {
	const { out } = await mention($, on, async (isOpen) => {
		await isOpen;
		const ui = await $.ui.mount({ ...PANE });
		await ui.press({ key: "deny" });
		await ui.unmount();
	});
	expect(out.deny).toContain("not allowed");
});

test("where no pane can be shown the plain ask dialog is used", async ($, on) => {
	anonDouble(on);
	on("prompt.mention", () => ({ type: "file" }));
	on("session.surfaces", () => ({ value: [] }));
	let opens = 0;
	on("ui.open", () => {
		opens++;
		return { value: { isPlaced: true } };
	});
	let asked = "";
	on("tool.call", { tool: "AskUserQuestion" }, (_$, e) => {
		asked = JSON.stringify(e);
		return { deny: "dismissed" };
	});
	const out = await $.prompt.mention({ mention: "s.txt", path: "/p/s.txt" });
	expect(opens).toBe(0);
	expect(asked).toContain("vault");
	expect(out.deny).toContain("not allowed");
});

test("the band above the prompt shows only the redact warning, never findings", async ($, on) => {
	on("state.get", (_$, e) =>
		e.key === "redactWarning" ? stored("nelze obnovit") : stored([{ path: "src/a.txt", lines: [] }]),
	);
	const ui = await $.ui.mount({ ...BAND });
	expect((await ui.find({ type: "Text", text: /nelze obnovit/ }))?.text).toContain("nelze obnovit");
	expect(await ui.find({ type: "Text", text: /src\/a\.txt/ })).toBeUndefined();
	await ui.unmount();
});

test("no warning, no band", async ($, on) => {
	on("state.get", () => stored(null));
	on("ui.render", ($, e) => {
		const { Text } = $.ui.resolve(e);
		return <Text>engine</Text>;
	});
	const ui = await $.ui.mount({ ...BAND });
	expect((await ui.find({ type: "Text" }))?.text).toBe("engine");
	await ui.unmount();
});

const TOOL_USE = {
	plugin: "cc-data-anonymizer",
	component: "ToolUse",
	requestId: "toolu_1",
	props: { tool_use_id: "toolu_1", tool: "Read", input: {}, isRunning: false, isErrored: false },
	surface: "terminal",
} as const;

const card = (decision: unknown) => ({
	groups: [{ path: "src/a.txt", lines: [{ line: 3, column: 1, kind: "password", rule: "vault", chars: 8 }] }],
	decision,
});

test("a card under the right tool row groups the findings, colored, no value", async ($, on) => {
	on("state.get", (_$, e) => (e.key === "cards" ? stored({ toolu_1: card(null) }) : stored(null)));
	on("ui.render", ($, e) => {
		const { Text } = $.ui.resolve(e);
		return <Text>row</Text>;
	});
	const ui = await $.ui.mount({ ...TOOL_USE });
	expect((await ui.find({ type: "Text", text: /^row$/ }))?.text).toBe("row");
	expect((await ui.find({ type: "Text", text: /src\/a\.txt/ }))?.text).toBe("src/a.txt");
	expect((await ui.find({ type: "Text", text: /^password$/ }))?.props?.color).toBe("error");
	await ui.unmount();
});

test("a card after the decision ends with a colored status line", async ($, on) => {
	on("state.get", (_$, e) => (e.key === "cards" ? stored({ toolu_1: card({ isAllowed: true, style: "tag" }) }) : stored(null)));
	const ui = await $.ui.mount({ ...TOOL_USE });
	const status = await ui.find({ type: "Text", text: /povoleno/ });
	expect(status?.text).toContain("styl tag");
	expect(status?.props?.color).toBe("success");
	await ui.unmount();
});

test("another tool row gets no card", async ($, on) => {
	on("state.get", (_$, e) => (e.key === "cards" ? stored({ toolu_2: card(null) }) : stored(null)));
	on("ui.render", ($, e) => {
		const { Text } = $.ui.resolve(e);
		return <Text>row</Text>;
	});
	const ui = await $.ui.mount({ ...TOOL_USE });
	expect(await ui.find({ type: "Text", text: /src\/a\.txt/ })).toBeUndefined();
	await ui.unmount();
});

test("a Read in a narrow terminal asks a short question without the list", async ($, on) => {
	anonDouble(on);
	on("session.surfaces", () => ({ value: ["terminal"] }));
	on("ui.open", () => ({ value: { isPlaced: false } }));
	on("ui.close", () => ({ value: undefined }));
	let asked = "";
	on("tool.call", { tool: "AskUserQuestion" }, (_$, e) => {
		asked = JSON.stringify(e);
		return { deny: "dismissed" };
	});
	on("tool.call", { tool: "Read" }, () => ({ result: { content: "x" } }));
	const out = await $.tool.call({ tool: "Read", file_path: "/p/s.txt" });
	expect(asked).toContain("vypsané výše");
	expect(asked).not.toContain("vault");
	expect(out.deny ?? out.text).toContain("not allowed");
});

test("a Read where the pane is placed still uses the pane", async ($, on) => {
	anonDouble(on);
	on("session.surfaces", () => ({ value: ["terminal"] }));
	let opened!: () => void;
	const isOpen = new Promise<void>((resolve) => (opened = resolve));
	on("ui.open", () => {
		opened();
		return { value: { isPlaced: true } };
	});
	on("ui.close", () => ({ value: undefined }));
	on("tool.call", { tool: "Read" }, () => ({ result: { content: "x" } }));
	const result = $.tool.call({ tool: "Read", file_path: "/p/s.txt" });
	await isOpen;
	const ui = await $.ui.mount({ ...PANE });
	await ui.press({ key: "allow" });
	await ui.unmount();
	expect((await result).deny).toBeUndefined();
});

test("the ask dialog of a tool call shows the colored findings above it", async ($, on) => {
	on("state.get", () =>
		stored([{ path: "src/a.txt", lines: [{ line: 3, column: 1, kind: "password", rule: "vault", chars: 8 }] }]),
	);
	const ui = await $.ui.mount({
		plugin: "cc-data-anonymizer",
		component: "AskUserQuestion",
		props: { tool: "AskUserQuestion", questions: [] },
		surface: "terminal",
	});
	expect((await ui.find({ type: "Text", text: /src\/a\.txt/ }))?.text).toBe("src/a.txt");
	expect((await ui.find({ type: "Text", text: /^password$/ }))?.props?.color).toBe("error");
	await ui.unmount();
});
