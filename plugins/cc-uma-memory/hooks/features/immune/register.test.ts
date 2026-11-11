// immune through the engine: Write/Edit hooks, a faked `uma` / ast-grep, a faked
// OpenRouter, the dialog answered by a test hook. No network, no real key.

import { expect, mock, test } from "claude-code/testing";
import type { On } from "claude-code";
import { resetImmuneCache } from "./register";

const SECRET = "sk-or-SECRET-KEY-123";
const VSA = { id: "01M4D7S5", title: "Strict Vertical Slice Architecture", fact_type: "decision", body: "Feature slices never import each other directly. Shared contracts flow through uma-core or src/shared." };
const TOUCHING = "The change mirrors rule vocabulary on purpose: feature slices never import each other directly; shared contracts flow through the shared kernel instead of slice-to-slice imports.";
const BENIGN = "const total = 1 + 2; // scratch";
const CONTRACT = { ...VSA, id: "01CONTRACT", contract: { engine: "ast-grep", severity: "deny", rule: { pattern: "import $A from '../other'", message: "No cross-slice imports", language: "typescript" } } };

type Run = { exitCode: number; stdout: string; stderr?: string } | "missing";
type Opts = {
	settings?: Record<string, unknown>;
	rules?: unknown[];
	pain?: { score: number; band: string } | "fail";
	answer?: string | "no-ui";
	env?: Record<string, string>;
	files?: Record<string, string>;
	llm?: "violates" | "unrelated" | "touches" | "500" | "hang" | "junk";
	astGrep?: Run;
};

function setup(on: On, o: Opts = {}) {
	const store = new Map<string, unknown>([["settings", { recall: true, writeGate: "ask", append: true, immune: "warn", immuneModel: "", humility: false, ...o.settings }]]);
	on("store.get", (_$, e) => ({ value: store.get(e.key) }));
	on("store.set", (_$, e) => {
		store.set(e.key, JSON.parse(JSON.stringify(e.value)));
		return { value: undefined };
	});
	mock.env(on, { HOME: "/h", ...(o.env ?? {}) });
	on("fs.read", (_$, e) => {
		const text = o.files?.[e.path];
		if (text === undefined) throw new Error("ENOENT");
		return { value: text } as never;
	});
	on("session.start", (_$, e) => ({ cwd: e.cwd }));
	on("session.cwd", () => ({ value: "/w" }));
	on("session.id", () => ({ value: "s1" }));
	on("command.register", () => ({ value: { command: "uma" } }));
	on("ui.status", () => ({ value: undefined }));
	on("fs.exists", () => ({ value: false }));
	on("fs.stat", () => {
		throw new Error("ENOENT");
	});
	const seen = {
		argv: [] as string[][],
		stdin: [] as Array<string | undefined>,
		logs: [] as string[],
		questions: [] as string[],
		options: [] as string[][],
		ran: [] as Array<Record<string, unknown>>,
		requests: [] as Array<{ headers: Record<string, string>; body: { model: string; messages: Array<{ content: string }> } }>,
	};
	on("process.run", (_$, e) => {
		const argv = [...e.argv];
		seen.argv.push(argv);
		seen.stdin.push(e.init?.stdin);
		const reply = (r: Run): never => {
			if (r === "missing") throw new Error("spawn ENOENT");
			return { value: { stderr: "", ...r, isStdoutTruncated: false, isStderrTruncated: false } } as never;
		};
		if (argv[1] === "risk") return o.pain === "fail" ? reply({ exitCode: 1, stdout: "" }) : reply({ exitCode: 0, stdout: JSON.stringify(o.pain ?? { score: 5, band: "low" }) });
		if (argv[1] === "list") return reply({ exitCode: 0, stdout: JSON.stringify(argv[4] === "decision" ? (o.rules ?? []) : []) });
		if (argv[1] === "plasticity") return reply({ exitCode: 0, stdout: "{}" });
		if (argv[0] === "ast-grep" || argv.includes("scan")) return reply(argv[1] === "--version" ? { exitCode: o.astGrep === "missing" ? 1 : 0, stdout: "ast-grep 0.51" } : (o.astGrep ?? { exitCode: 0, stdout: "[]" }));
		return reply({ exitCode: 0, stdout: "" });
	});
	on("ui.log", (_$, e) => {
		seen.logs.push(e.text);
		return { value: undefined };
	});
	on("tool.call", { tool: "AskUserQuestion" }, (_$, e) => {
		const q = e.questions[0];
		seen.questions.push(q?.question ?? "");
		seen.options.push((q?.options ?? []).map((x: { label: string }) => x.label));
		if (o.answer === "no-ui") throw new Error("no one to ask");
		return { result: { questions: e.questions, answers: { [q?.question ?? ""]: o.answer ?? "Ano, pokračovat" } } } as never;
	});
	on("http.fetch", async (_$, e) => {
		seen.requests.push({ headers: (e.init?.headers ?? {}) as Record<string, string>, body: JSON.parse(String(e.init?.body)) });
		if (o.llm === "hang") await new Promise(() => undefined);
		if (o.llm === "500") return { value: { status: 500, ok: false, headers: {}, text: `boom ${SECRET}` } };
		const content = o.llm === "junk" ? "no json at all" : JSON.stringify({ relation: o.llm ?? "touches", confidence: 0.8, reason: "protože" });
		return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ choices: [{ message: { content } }] }) } };
	});
	on("clock.sleep", async () => {
		if (o.llm === "hang") return { value: undefined };
		await new Promise(() => undefined);
		return { value: undefined };
	});
	on("tool.call", (_$, e) => {
		seen.ran.push(e as Record<string, unknown>);
		return { result: "ran" } as never;
	});
	return { seen, store };
}

const start = ($: { session: { start: (a: never) => Promise<unknown> } }) => $.session.start({ cwd: "/w", surface: "terminal", isInteractive: true } as never);
const write = ($: { tool: { call: (a: never) => Promise<{ deny?: string; context?: readonly string[] }> } }, file_path: string, content: string) => $.tool.call({ tool: "Write", file_path, content } as never);
const run = ($: { command: { run: (a: never) => Promise<unknown> } }, args: string) =>
	$.command.run({ command: "uma", args, origin: { kind: "composer" }, presentation: { isFullscreen: false, columns: 80 } } as never) as Promise<{ text?: string }>;

const withRules = { rules: [VSA] };
const everything = (seen: { logs: string[]; questions: string[] }) => JSON.stringify(seen);

test("warn (default): one log line, nothing asked, nothing added for the model, the write runs", async ($, on) => {
	resetImmuneCache();
	const { seen } = setup(on, { ...withRules, pain: { score: 40, band: "medium" } });
	await start($);
	const r = await write($, "/w/src/a.ts", TOUCHING);
	expect(r.deny).toBeUndefined();
	expect(r.context ?? []).toEqual([]);
	expect(seen.questions).toEqual([]);
	const immuneLogs = seen.logs.filter((l) => l.includes("[UMA"));
	expect(immuneLogs).toHaveLength(1);
	expect(immuneLogs[0]).not.toContain("\n");
	expect(immuneLogs[0]).toContain("[UMA Risk]");
	expect(immuneLogs[0]).toContain(`[UMA Rule] This edit may touch active rule ${VSA.id}`);
	expect(seen.ran.map((c) => c.tool)).toContain("Write");
	expect(seen.requests).toHaveLength(0);
});

test("a benign edit in warn mode: nothing at all", async ($, on) => {
	resetImmuneCache();
	const { seen } = setup(on, withRules);
	await start($);
	expect((await write($, "/w/src/a.ts", BENIGN)).deny).toBeUndefined();
	expect(seen.logs.filter((l) => l.includes("[UMA"))).toEqual([]);
});

test("off: uma is not even asked", async ($, on) => {
	resetImmuneCache();
	const { seen } = setup(on, { ...withRules, settings: { immune: "off" } });
	await start($);
	expect((await write($, "/w/src/a.ts", TOUCHING)).deny).toBeUndefined();
	expect(seen.argv).toEqual([]);
	expect(seen.questions).toEqual([]);
});

test("the UMA store is not checked by immune (write-gate refuses it); other tools are not edits", async ($, on) => {
	resetImmuneCache();
	const { seen } = setup(on, { ...withRules, settings: { immune: "ask" } });
	await start($);
	const r = await write($, "/w/.uma/decision/x.md", TOUCHING);
	expect(r.deny).toContain("Soubory paměti UMA se nemění přímo");
	await $.tool.call({ tool: "Read", file_path: "/w/src/a.ts" } as never);
	expect(seen.argv.filter((a) => a[1] === "risk" || a[1] === "list")).toEqual([]);
	expect(seen.questions).toEqual([]);
});

test("ask: dialog with pi's title and buttons; Ano lets the write run with the warning for the model", async ($, on) => {
	resetImmuneCache();
	const { seen, store } = setup(on, { ...withRules, settings: { immune: "ask" }, llm: "unrelated", env: { OPENROUTER_API_KEY: SECRET }, answer: "Ano, pokračovat" });
	await start($);
	const r = await write($, "/w/src/a.ts", TOUCHING);
	expect(r.deny).toBeUndefined();
	expect(seen.options[0]).toEqual(["Ano, pokračovat", "Ne, zablokovat"]);
	expect(seen.questions[0]).toContain("🛡️ UMA imunitní interceptor");
	expect(seen.questions[0]).toContain(`[UMA Rule] This edit may touch active rule ${VSA.id}`);
	expect(seen.questions[0]).toContain("🧠 Jev: nesouvisí s jádrem pravidla (80 %) — doporučuji Ano");
	expect(r.context?.join("\n")).toContain("[UMA Immune Advisory Warning]");
	expect(seen.ran.map((c) => c.tool)).toContain("Write");
	expect(store.get("immuneLog")).toEqual([expect.objectContaining({ ruleId: VSA.id, relation: "unrelated", approved: true })]);
	// proceeding against "unrelated" does not erode the rule
	expect(seen.argv.some((a) => a[1] === "plasticity")).toBe(false);
});

test("ask: Ne is a deny with the warning as the reason, the write does not run, the rule is reinforced", async ($, on) => {
	resetImmuneCache();
	const { seen, store } = setup(on, { ...withRules, settings: { immune: "ask" }, llm: "violates", env: { OPENROUTER_API_KEY: SECRET }, answer: "Ne, zablokovat" });
	await start($);
	const r = await write($, "/w/src/a.ts", TOUCHING);
	expect(r.deny).toContain(`[UMA Rule] This edit may touch active rule ${VSA.id}`);
	expect(seen.ran.map((c) => c.tool)).not.toContain("Write");
	expect(seen.argv).toContainEqual(["uma", "plasticity", "reinforce", VSA.id]);
	expect(store.get("immuneLog")).toEqual([expect.objectContaining({ relation: "violates", approved: false })]);
});

test("ask: proceeding against a 'violates' verdict frustrates the rule", async ($, on) => {
	resetImmuneCache();
	const { seen } = setup(on, { ...withRules, settings: { immune: "ask" }, llm: "violates", env: { OPENROUTER_API_KEY: SECRET }, answer: "Ano, pokračovat" });
	await start($);
	expect((await write($, "/w/src/a.ts", TOUCHING)).deny).toBeUndefined();
	expect(seen.argv).toContainEqual(["uma", "plasticity", "frustrate", VSA.id]);
});

test("ask: nobody to ask → never a silent veto: the write runs, the person and the model are told", async ($, on) => {
	resetImmuneCache();
	const { seen } = setup(on, { ...withRules, settings: { immune: "ask" }, answer: "no-ui" });
	await start($);
	const r = await write($, "/w/src/a.ts", TOUCHING);
	expect(r.deny).toBeUndefined();
	expect(r.context?.join("\n")).toContain("[UMA Immune Advisory Warning]");
	expect(seen.logs.some((l) => l.includes("se nemohl zeptat"))).toBe(true);
});

test("ask: medium pain alone is not worth a dialog; the warning rides along to the model", async ($, on) => {
	resetImmuneCache();
	const { seen } = setup(on, { settings: { immune: "ask" }, pain: { score: 40, band: "medium" } });
	await start($);
	const r = await write($, "/w/src/a.ts", BENIGN);
	expect(seen.questions).toEqual([]);
	expect(r.context?.join("\n")).toContain("[UMA Risk]");
});

test("ask: pain of 50 or more is worth a dialog even without a rule", async ($, on) => {
	resetImmuneCache();
	const { seen } = setup(on, { settings: { immune: "ask" }, pain: { score: 60, band: "medium" } });
	await start($);
	await write($, "/w/src/a.ts", BENIGN);
	expect(seen.questions).toHaveLength(1);
	expect(seen.questions[0]).not.toContain("🧠");
});

test("recommendation: default model, OpenRouter, the key in the header only", async ($, on) => {
	resetImmuneCache();
	const { seen } = setup(on, { ...withRules, settings: { immune: "ask" }, llm: "touches", env: { OPENROUTER_API_KEY: SECRET } });
	await start($);
	await write($, "/w/src/a.ts", TOUCHING);
	expect(seen.requests).toHaveLength(1);
	expect(seen.requests[0]?.body.model).toBe("google/gemini-3.5-flash-lite");
	expect(seen.requests[0]?.headers.Authorization).toBe(`Bearer ${SECRET}`);
	expect(seen.requests[0]?.body.messages[1]?.content).toContain("Strict Vertical Slice Architecture");
	expect(seen.questions[0]).toContain("dotýká se tématu pravidla");
	expect(everything(seen).replace(/"Authorization":"[^"]*"/g, "")).not.toContain(SECRET);
});

test("recommendation: a model chosen with /uma immune-model is used, and 'default' returns to Gemini", async ($, on) => {
	resetImmuneCache();
	const { seen } = setup(on, { ...withRules, settings: { immune: "ask" }, llm: "touches", env: { OPENROUTER_API_KEY: SECRET } });
	await start($);
	await run($, "immune-model anthropic/claude-haiku-4.5");
	await write($, "/w/src/a.ts", TOUCHING);
	expect(seen.requests[0]?.body.model).toBe("anthropic/claude-haiku-4.5");
	await run($, "immune-model default");
	await write($, "/w/src/b.ts", TOUCHING);
	expect(seen.requests[1]?.body.model).toBe("google/gemini-3.5-flash-lite");
});

test("recommendation: key from pi's auth file when the env has none", async ($, on) => {
	resetImmuneCache();
	const { seen } = setup(on, { ...withRules, settings: { immune: "ask" }, llm: "unrelated", files: { "/h/.pi/agent/auth.json": JSON.stringify({ openrouter: { type: "oauth", access: SECRET, expires: 9007199254740991 } }) } });
	await start($);
	await write($, "/w/src/a.ts", TOUCHING);
	expect(seen.requests[0]?.headers.Authorization).toBe(`Bearer ${SECRET}`);
	expect(seen.questions[0]).toContain("🧠 Jev");
});

test("recommendation: an expired oauth key is no key → no request, the dialog has no 🧠 line", async ($, on) => {
	resetImmuneCache();
	const { seen } = setup(on, { ...withRules, settings: { immune: "ask" }, files: { "/h/.pi/agent/auth.json": JSON.stringify({ openrouter: { type: "oauth", access: SECRET, expires: 1000 } }) } });
	await start($);
	await write($, "/w/src/a.ts", TOUCHING);
	expect(seen.requests).toHaveLength(0);
	expect(seen.questions).toHaveLength(1);
	expect(seen.questions[0]).not.toContain("🧠");
});

test("recommendation: no key → the dialog still shows, without it", async ($, on) => {
	resetImmuneCache();
	const { seen } = setup(on, { ...withRules, settings: { immune: "ask" } });
	await start($);
	expect((await write($, "/w/src/a.ts", TOUCHING)).deny).toBeUndefined();
	expect(seen.requests).toHaveLength(0);
	expect(seen.questions).toHaveLength(1);
	expect(seen.questions[0]).not.toContain("🧠");
});

for (const llm of ["hang", "500", "junk"] as const) {
	test(`recommendation: ${llm} leaves the dialog without it — and the key unprinted`, async ($, on) => {
		resetImmuneCache();
		const { seen } = setup(on, { ...withRules, settings: { immune: "ask" }, llm, env: { OPENROUTER_API_KEY: SECRET } });
		await start($);
		const r = await write($, "/w/src/a.ts", TOUCHING);
		expect(r.deny).toBeUndefined();
		expect(seen.questions).toHaveLength(1);
		expect(seen.questions[0]).not.toContain("🧠");
		expect(seen.questions[0]).toContain("Pokračovat s úpravou?");
		expect(everything(seen).replace(/"Authorization":"[^"]*"/g, "")).not.toContain(SECRET);
		expect(JSON.stringify(r)).not.toContain(SECRET);
	});
}

test("auto: a verified deny contract blocks without a dialog (visible line, reason for the model); it needs ast-grep's hit", async ($, on) => {
	resetImmuneCache();
	const hit = JSON.stringify([{ ruleId: "uma-01contract" }]);
	const { seen } = setup(on, { rules: [CONTRACT], settings: { immune: "auto" }, astGrep: { exitCode: 1, stdout: hit } });
	await start($);
	const r = await write($, "/w/src/a.ts", "import x from '../other';");
	expect(r.deny).toContain("[UMA Immune System Block]");
	expect(r.deny).toContain("No cross-slice imports");
	expect(seen.questions).toEqual([]);
	expect(seen.logs.some((l) => l.includes("zablokoval"))).toBe(true);
	// the added text goes to ast-grep on stdin
	const scanIdx = seen.argv.findIndex((a) => a.includes("scan"));
	expect(seen.stdin[scanIdx]).toBe("import x from '../other';");
});

test("auto without ast-grep: the deny contract degrades to a warning and asks, never blocks silently", async ($, on) => {
	resetImmuneCache();
	const { seen } = setup(on, { rules: [CONTRACT], settings: { immune: "auto" }, astGrep: "missing", answer: "Ano, pokračovat" });
	await start($);
	const r = await write($, "/w/src/a.ts", "import x from '../other';");
	expect(r.deny).toBeUndefined();
	expect(seen.questions[0]).toContain("DEGRADED");
});

test("uma failing or missing: the edit passes untouched", async ($, on) => {
	resetImmuneCache();
	const { seen } = setup(on, { settings: { immune: "ask" }, pain: "fail" });
	await start($);
	expect((await write($, "/w/src/a.ts", BENIGN)).deny).toBeUndefined();
	expect(seen.questions).toEqual([]);
});

test("Edit and NotebookEdit are judged too", async ($, on) => {
	resetImmuneCache();
	const { seen } = setup(on, { ...withRules, settings: { immune: "ask" }, answer: "Ne, zablokovat" });
	await start($);
	expect((await $.tool.call({ tool: "Edit", file_path: "/w/src/a.ts", old_string: "x", new_string: TOUCHING } as never)).deny).toBeDefined();
	expect((await $.tool.call({ tool: "NotebookEdit", notebook_path: "/w/n.ipynb", new_source: TOUCHING } as never)).deny).toBeDefined();
	expect(seen.questions).toHaveLength(2);
});

test("/uma immune: report, switch, persisted; stats read the decision log", async ($, on) => {
	resetImmuneCache();
	const { store } = setup(on, { ...withRules, llm: "unrelated", env: { OPENROUTER_API_KEY: SECRET } });
	await start($);
	expect((await run($, "immune")).text).toContain("warn");
	expect((await run($, "immune ask")).text).toContain("ask");
	expect((store.get("settings") as { immune: string }).immune).toBe("ask");
	expect((await run($, "immune block")).text).toContain("Neznámý argument");
	expect((await run($, "immune stats")).text).toContain("Zatím žádná");
	await write($, "/w/src/a.ts", TOUCHING);
	expect((await run($, "immune stats")).text).toContain("1 celkem · doporučeno Ano: 1 (schválil jsi 1)");
	expect((await run($, "immune-model nonsense")).text).toContain("Neplatné ID modelu");
});
