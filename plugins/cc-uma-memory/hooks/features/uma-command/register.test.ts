// The /uma command end to end: switches, persistence, help, unknown subcommands.

import { expect, mock, test } from "claude-code/testing";
import type { On } from "claude-code";

/** An in-memory $.store; the map is what "the next session" would find. */
function setup(on: On, stored?: unknown) {
	const store = new Map<string, unknown>(stored === undefined ? [] : [["settings", stored]]);
	on("store.get", (_$, e) => ({ value: store.get(e.key) }));
	on("store.set", (_$, e) => {
		store.set(e.key, JSON.parse(JSON.stringify(e.value)));
		return { value: undefined };
	});
	mock.env(on, { HOME: "/home/t" });
	on("session.start", (_$, e) => ({ cwd: e.cwd }));
	on("session.cwd", () => ({ value: "/work" }));
	on("command.register", () => ({ value: { command: "uma" } }));
	on("ui.status", () => ({ value: undefined }));
	on("ui.log", () => ({ value: undefined }));
	on("fs.exists", () => ({ value: false }));
	return store;
}

const run = ($: { command: { run: (a: never) => Promise<unknown> } }, args: string) =>
	$.command.run({ command: "uma", args, origin: { kind: "composer" }, presentation: { isFullscreen: false, columns: 80 } } as never) as Promise<{ text?: string }>;
const start = ($: { session: { start: (a: never) => Promise<unknown> } }) => $.session.start({ cwd: "/work", surface: "terminal", isInteractive: true } as never);

test("/uma recall off is stored for later sessions and read back at the next start", async ($, on) => {
	const store = setup(on);
	await start($);
	expect((await run($, "recall")).text).toContain("zapnut");
	expect((await run($, "recall off")).text).toContain("vypnut");
	expect(store.get("settings")).toEqual({ recall: false, writeGate: "ask", append: true, immune: "warn", immuneModel: "", humility: false, shadow: "on" });
	expect((await run($, "recall")).text).toBe("Recall do promptu: vypnut");
});

test("settings stored by an earlier session are loaded at start", async ($, on) => {
	setup(on, { recall: false, writeGate: "off" });
	await start($);
	expect((await run($, "recall")).text).toContain("vypnut");
	expect((await run($, "write-gate")).text).toContain("bez dotazu");
});

test("/uma write-gate ask|off and a bad argument", async ($, on) => {
	setup(on);
	await start($);
	expect((await run($, "write-gate")).text).toContain("ptát se");
	expect((await run($, "write-gate off")).text).toContain("bez dotazu");
	expect((await run($, "write-gate maybe")).text).toContain("Neznámý argument");
	expect((await run($, "write-gate")).text).toContain("bez dotazu");
});

test("help lists the new subcommands (first line to the model, the rest in the row); an unknown one says so", async ($, on) => {
	setup(on);
	await start($);
	expect((await run($, "help")).text).toBe("/uma — paměť UMA");
	expect((await run($, "")).text).toBe("/uma — paměť UMA");
	expect((await run($, "nesmysl")).text).toContain("Neznámý podpříkaz „nesmysl“");
});

/** Runs /uma with a faked `uma` process; returns the argv/cwd/timeout seen and the commandOutput drawn. */
function withProcess(on: On, result: { exitCode: number; stdout: string; stderr: string } | "missing") {
	const seen = { argv: [] as string[][], cwd: [] as unknown[], timeout: [] as unknown[] };
	on("process.run", (_$, e) => {
		seen.argv.push([...e.argv]);
		seen.cwd.push(e.init?.cwd);
		seen.timeout.push(e.init?.timeoutMs);
		if (result === "missing") throw new Error("spawn uma ENOENT");
		return { value: { ...result, isStdoutTruncated: false, isStderrTruncated: false } } as never;
	});
	return seen;
}

test("/uma append off is stored; /uma list runs uma in the session's cwd, the model gets one summary line", async ($, on) => {
	const store = setup(on);
	const seen = withProcess(on, { exitCode: 0, stdout: "fact A\nfact B\n", stderr: "" });
	await start($);
	expect((await run($, "append off")).text).toContain("vypnuta");
	expect(store.get("settings")).toEqual({ recall: true, writeGate: "ask", append: false, immune: "warn", immuneModel: "", humility: false, shadow: "on" });
	const out = await run($, "list global");
	expect(out.text).toBe("Fakta (global): 2 řádků výpisu (ukázán uživateli)");
	expect(seen.argv).toEqual([["uma", "list", "--json", "--scope", "global"]]);
	expect(seen.cwd).toEqual(["/work"]);
	expect(seen.timeout).toEqual([30000]);
});

const HIT = { fact_type: "task", scope: "project:claude-plugins", id: "01M744E20JKEEJRA61M6Z11NBV", title: "Prověřit: falešné poplachy brány", score: 0.016, status: "stable", tags: ["cc-uma-memory", "write-gate"] };

/** Mounts the row of a command's output; the tree is what a person sees. */
const mountOutput = ($: { ui: { mount: (a: never) => Promise<unknown> } }, text: string, extra: object = {}) =>
	$.ui.mount({ plugin: "cc-uma-memory", surface: "terminal", component: "CommandOutput", props: { command: "uma", isErrored: false, text, ...extra } } as never) as Promise<{ find: (q: object) => Promise<{ props: Record<string, unknown>; text: string } | undefined>; findAll: (q: object) => Promise<Array<{ props: Record<string, unknown>; text: string }>> }>;

/** The innermost Text showing this text: a line's own Text, not the one that holds it. */
const leaf = async (mounted: Awaited<ReturnType<typeof mountOutput>>, text: RegExp) => (await mounted.findAll({ type: "Text", text })).at(-1);

test("a search reaches the person as a round frame: bold header, typed label, scope, id, tags, score", async ($, on) => {
	setup(on);
	const seen = withProcess(on, { exitCode: 0, stdout: JSON.stringify({ degraded: false, hits: [HIT], note: null }), stderr: "" });
	await start($);
	const out = await run($, "search Database");
	expect(out.text).toBe("Hledání „Database“: 1 výsledek (výpis ukázán uživateli)");
	expect(seen.argv[0]).toEqual(["uma", "search", "--json", "--", "Database"]);
	const mounted = await mountOutput($, out.text as string);
	const frame = await mounted.find({ type: "Box" });
	expect(frame?.props).toMatchObject({ borderStyle: "round", borderColor: "claude" });
	const header = await mounted.find({ type: "Text", text: /🧠 UMA · hledání „Database“ · 1 výsledek/ });
	expect(header?.props.bold).toBe(true);
	expect((await leaf(mounted, /^📋 task$/))?.props.color).toBe("planMode");
	expect(await mounted.find({ type: "Text", text: /📁 project:claude-plugins/ })).toBeDefined();
	expect(await mounted.find({ type: "Text", text: "🆔 01M744E20JKEEJRA61M6Z11NBV" })).toBeDefined();
	expect(await mounted.find({ type: "Text", text: /🏷️ +cc-uma-memory · write-gate/ })).toBeDefined();
	expect(await mounted.find({ type: "Text", text: "0.016" })).toBeDefined();
});

test("an empty search is a dim sentence in a frame, never an empty frame", async ($, on) => {
	setup(on);
	withProcess(on, { exitCode: 0, stdout: JSON.stringify({ degraded: false, hits: [], note: null }), stderr: "" });
	await start($);
	const out = await run($, "search nic");
	expect(out.text).toBe("Hledání „nic“: nic nenalezeno");
	const mounted = await mountOutput($, out.text as string);
	expect((await leaf(mounted, /^nic nenalezeno$/))?.props.dimColor).toBe(true);
});

test("a failing uma is drawn in an error frame with ❌; the model line is unchanged", async ($, on) => {
	setup(on);
	withProcess(on, { exitCode: 3, stdout: "", stderr: "no such fact\n" });
	await start($);
	const out = await run($, "read 01ABC");
	expect(out.text).toBe("uma read skončila kódem 3: no such fact");
	const mounted = await mountOutput($, out.text as string);
	expect((await mounted.find({ type: "Box" }))?.props).toMatchObject({ borderStyle: "round", borderColor: "error" });
	const line = await leaf(mounted, /^❌ uma read skončila kódem 3/);
	expect(line?.props.color).toBe("error");
});

test("help is label/value rows with the command names in the suggestion colour", async ($, on) => {
	setup(on);
	await start($);
	const out = await run($, "help");
	const mounted = await mountOutput($, out.text as string);
	expect((await mounted.find({ type: "Text", text: /🧠 UMA · nápověda/ }))?.props.bold).toBe(true);
	expect((await leaf(mounted, /^\/uma search <dotaz> *$/))?.props.color).toBe("suggestion");
});

/** Mounts `/uma help` at a given width. */
async function helpAt($: Parameters<typeof run>[0] & { ui: { mount: (a: never) => Promise<unknown> } }, columns: number) {
	const out = await run($, "help");
	return $.ui.mount({ plugin: "cc-uma-memory", surface: "terminal", component: "CommandOutput", viewport: { columns, rows: 40 }, props: { command: "uma", isErrored: false, text: out.text } } as never) as unknown as Awaited<ReturnType<typeof mountOutput>>;
}

test("fields: no blank line between rows; wide = label column + wrapping value column in a row", async ($, on) => {
	setup(on);
	await start($);
	const mounted = await helpAt($, 100);
	expect(await mounted.find({ type: "Text", text: /^ $/ })).toBeUndefined();
	const rows = await mounted.findAll({ type: "Box", key: "f0" });
	expect(rows[0]?.props.flexDirection).toBe("row");
	const widths = (await mounted.findAll({ type: "Box" })).filter((b) => typeof b.props.width === "number");
	expect(widths.length).toBeGreaterThan(20);
	expect(new Set(widths.map((b) => b.props.width)).size).toBe(1);
	expect((await mounted.findAll({ type: "Box" })).filter((b) => b.props.flexGrow === 1).length).toBe(widths.length);
});

test("fields: the label column is the longest label plus 2 columns of margin, even when a label fills it exactly", async ($, on) => {
	setup(on);
	await start($);
	const mounted = await helpAt($, 100);
	const labels = (await mounted.findAll({ type: "Text", text: /^\/uma / })).map((t) => t.text.trimEnd().length);
	// The longest help label that fits the cap defines the width; the box is 2 columns wider than its text.
	const fitting = Math.max(...labels.filter((n) => n <= 36));
	const boxes = (await mounted.findAll({ type: "Box" })).filter((b) => typeof b.props.width === "number");
	expect(new Set(boxes.map((b) => b.props.width))).toEqual(new Set([36 + 2]));
	expect(fitting).toBeLessThanOrEqual(36);
	expect(boxes.every((b) => b.props.paddingRight === 2)).toBe(true);
});

test("fields: a label exactly as long as the column keeps 2 columns before its value", async ($, on) => {
	setup(on);
	const label = "x".repeat(34);
	withProcess(on, { exitCode: 0, stdout: JSON.stringify({ findings: [{ check: label, detail: "hodnota", level: "ok", remedy: null }, { check: "kratší", detail: "v", level: "ok", remedy: null }] }), stderr: "" });
	await start($);
	const out = await run($, "doctor");
	const mounted = await mountOutput($, out.text as string);
	// Label 34 + status icon column 3 + margin 2.
	const box = (await mounted.findAll({ type: "Box" })).find((b) => typeof b.props.width === "number");
	expect(box?.props).toMatchObject({ width: 34 + 2 + 3, paddingRight: 2 });
});

test("fields: below 50 columns the value goes under its label, indented", async ($, on) => {
	setup(on);
	await start($);
	const mounted = await helpAt($, 40);
	expect((await mounted.findAll({ type: "Box", key: "f0" }))[0]?.props.flexDirection).toBe("column");
	expect((await mounted.findAll({ type: "Box" })).filter((b) => b.props.paddingLeft === 2).length).toBeGreaterThan(20);
	expect((await mounted.findAll({ type: "Box" })).filter((b) => typeof b.props.width === "number")).toHaveLength(0);
});

test("a doctor warning frames in warning colour with ⚠️ on the check, and remedies as hints", async ($, on) => {
	setup(on);
	const report = { findings: [{ check: "project store", detail: "/work/.uma", level: "ok", remedy: null }, { check: "index coverage", detail: "6 indexed row(s) but 10 file(s)", level: "warn", remedy: "Reconcile with `uma search \"\" --reindex`." }], warnings: 1, failed: 0 };
	withProcess(on, { exitCode: 0, stdout: JSON.stringify(report), stderr: "" });
	await start($);
	const out = await run($, "doctor");
	expect(out.text).toContain("Zpráva uma doctor: 2 kontroly: 1 varování, 0 selhání");
	const mounted = await mountOutput($, out.text as string);
	expect((await mounted.find({ type: "Box" }))?.props.borderColor).toBe("warning");
	expect(await mounted.find({ type: "Text", text: /⚠️ index coverage/ })).toBeDefined();
	expect(await mounted.find({ type: "Text", text: /→ Reconcile/ })).toBeDefined();
});

test("an output without data, or one stored in the older shape, falls back to the engine's own row", async ($, on) => {
	setup(on);
	// What the first version stored: a plain string per line, under the old shape tag.
	on("state.get", { plugin: "cc-uma-memory", key: "commandOutputs" }, () => ({ value: { shape: "output-1", value: { "Starý výstup": "a\nb" } }, version: 3 }) as never);
	await start($);
	for (const text of ["Hledání „x“: 1 výsledek (výpis ukázán uživateli)", "Starý výstup"]) {
		const mounted = await mountOutput($, text);
		expect(await mounted.find({ type: "Text", text: /🧠 UMA/ })).toBeUndefined();
		expect(await mounted.find({ type: "Box" })).toBeUndefined();
	}
});

test("every query subcommand builds its argv; reindex and export answer one sentence", async ($, on) => {
	setup(on);
	const seen = withProcess(on, { exitCode: 0, stdout: "x\ny", stderr: "" });
	await start($);
	for (const args of ["search dotaz", "read 01ABC", "timeline --id 01ABC --all", "doctor", "reindex", "export --out /tmp/o"]) await run($, args);
	expect(seen.argv).toEqual([
		["uma", "search", "--json", "--", "dotaz"],
		["uma", "read", "--json", "--", "01ABC"],
		["uma", "timeline", "--json", "--id", "01ABC", "--all"],
		["uma", "doctor", "--json"],
		["uma", "search", "", "--reindex"],
		["uma", "export", "--okf", "--out", "/tmp/o"],
	]);
	expect((await run($, "reindex")).text).toBe("Index UMA byl přebudován.");
});

test("bad arguments run nothing; a missing binary says how to install uma", async ($, on) => {
	setup(on);
	const seen = withProcess(on, "missing");
	await start($);
	expect((await run($, "export")).text).toContain("Použití");
	expect((await run($, "doctor --confirm")).text).toContain("Použití");
	expect(seen.argv).toEqual([]);
	const text = (await run($, "doctor")).text;
	expect(text).toContain("binárka `uma`");
	expect(text).toContain("github.com/mastnacek/claude-plugins");
});

test("a failing uma is reported with its exit code", async ($, on) => {
	setup(on);
	withProcess(on, { exitCode: 3, stdout: "", stderr: "no such fact\n" });
	await start($);
	expect((await run($, "read 01ABC")).text).toBe("uma read skončila kódem 3: no such fact");
});

const DEBTS = JSON.stringify([
	{ id: "debt-1", sourceAction: "změna API", requiredAction: "upravit volající", blocking: true, origin: "claude-code", createdAt: "2026-11-11T09:12:00Z", settledAt: null },
	{ id: "debt-2", sourceAction: "a", requiredAction: "b", blocking: false, origin: "pi", createdAt: "2026-11-10T08:00:00Z", settledAt: "2026-11-10T09:00:00Z" },
]);

test("/uma debt lists all debts as one summary line for the model and a listing for the person", async ($, on) => {
	setup(on);
	const seen = withProcess(on, { exitCode: 0, stdout: DEBTS, stderr: "" });
	await start($);
	const out = await run($, "debt list");
	expect(out.text).toBe("Dluhy: otevřených 1 (blokujících 1), vyrovnaných 1 (výpis ukázán uživateli)");
	expect(seen.argv[0]).toEqual(["uma", "debt", "list", "--all", "--json"]);
	expect(seen.cwd[0]).toBe("/work");
	const mounted = await mountOutput($, out.text as string);
	expect((await mounted.find({ type: "Box" }))?.props.borderColor).toBe("warning");
	expect(await mounted.find({ type: "Text", text: /1\. změna API → upravit volající/ })).toBeDefined();
	expect((await leaf(mounted, /^⚠️ BLOKUJÍCÍ$/))?.props.color).toBe("warning");
	expect((await leaf(mounted, /^✅ vyrovnán 2026-11-10 09:00$/))?.props.color).toBe("success");
	expect(await mounted.find({ type: "Text", text: "🆔 debt-2" })).toBeDefined();
	expect((await run($, "debt")).text).toContain("Dluhy: otevřených 1");
});

test("/uma debt clear runs `uma debt clear` directly (no bash) and relays the engine's line", async ($, on) => {
	setup(on);
	const seen = withProcess(on, { exitCode: 0, stdout: "Cleared 2 debt(s).\n", stderr: "" });
	await start($);
	expect((await run($, "debt clear")).text).toBe("Cleared 2 debt(s).");
	expect(seen.argv[0]).toEqual(["uma", "debt", "clear"]);
});

test("/uma debt: bad argument runs nothing; empty ledger and a failing uma say so", async ($, on) => {
	setup(on);
	const seen = withProcess(on, { exitCode: 0, stdout: "[]", stderr: "" });
	await start($);
	expect((await run($, "debt nic")).text).toBe("Použití: /uma debt [list|clear]");
	// Only the debt slice's label refresh ran (check); neither list nor clear.
	expect(seen.argv.filter((a) => a[2] !== "check")).toEqual([]);
	expect((await run($, "debt list")).text).toBe("Dluhy: žádné");
});

test("/uma debt in a directory without git: the engine's error is reported with the exit code", async ($, on) => {
	setup(on);
	withProcess(on, { exitCode: 1, stdout: "", stderr: "Error: not a git repository" });
	await start($);
	expect((await run($, "debt list")).text).toBe("uma debt skončila kódem 1: Error: not a git repository");
});
