// staging through the engine: /uma review (approve / edit / skip / reject), /uma staging …, the label.

import { expect, mock, test } from "claude-code/testing";
import type { On } from "claude-code";

const draft = (id: string, title: string, body = "tělo") => ({ id, confidence: 0.8, provenance: { trigger_type: "user_correction" }, fact: { id, scope: { Project: "w" }, fact_type: "Preference", title, body, tags: ["t"], template: null } });

type Opts = { drafts?: unknown[]; answers?: Array<string | "dismiss">; waiting?: number; failCmd?: string };

function setup(on: On, o: Opts = {}) {
	const live = [...(o.drafts ?? [draft("01AAAAAAAAAAAAAAAAAAAAAAAA", "První"), draft("01BBBBBBBBBBBBBBBBBBBBBBBB", "Druhý")])];
	mock.store(on, { settings: { lang: "en" } });
	mock.env(on, { HOME: "/h" });
	on("session.start", (_$, e) => ({ cwd: e.cwd }));
	on("session.cwd", () => ({ value: "/w" }));
	on("command.register", () => ({ value: { command: "uma" } }));
	on("ui.status", () => ({ value: undefined }));
	on("ui.log", () => ({ value: undefined }));
	on("fs.exists", () => ({ value: false }));
	let waiting = o.waiting ?? 0;
	on("fs.list", () => ({ value: Array.from({ length: waiting }, (_, i) => ({ name: `d${i}.json`, kind: "file", size: 1 })) }) as never);
	const seen = { argv: [] as string[][], questions: [] as string[], options: [] as string[][], setWaiting: (n: number) => (waiting = n) };
	const answers = [...(o.answers ?? [])];
	on("process.run", (_$, e) => {
		const argv = [...e.argv];
		seen.argv.push(argv);
		const ok = (stdout: string, exitCode = 0, stderr = "") => ({ value: { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false } }) as never;
		if (argv[2] === "list") return ok(JSON.stringify(live));
		if (o.failCmd === argv[2]) return ok("", 1, "Error: boom");
		const idx = live.findIndex((d) => (d as { id: string }).id === argv[3]);
		if ((argv[2] === "approve" || argv[2] === "discard") && idx >= 0) live.splice(idx, 1);
		return ok(argv[2] === "discard" ? `Discarded draft ${argv[3]}` : "Approved");
	});
	on("tool.call", { tool: "AskUserQuestion" }, (_$, e) => {
		const q = e.questions[0];
		seen.questions.push(q?.question ?? "");
		seen.options.push((q?.options ?? []).map((x: { label: string }) => x.label));
		const a = answers.shift();
		if (a === undefined || a === "dismiss") throw new Error("dismissed");
		return { result: { questions: e.questions, answers: { [q?.question ?? ""]: a } } } as never;
	});
	return seen;
}

type Host = { command: { run: (a: never) => Promise<{ text?: string }> }; session: { start: (a: never) => Promise<unknown> } };
const run = ($: Host, args: string) => $.command.run({ command: "uma", args, origin: { kind: "composer" }, presentation: { isFullscreen: false, columns: 80 } } as never);
const mutating = (argv: string[][]) => argv.filter((a) => a[2] === "approve" || a[2] === "discard");

const APPROVE = "✅ Schválit a uložit do paměti";
const EDIT = "✏️ Upravit (název, obsah, celý text)";
const SKIP = "⏭ Přeskočit (nechat na později)";
const REJECT = "❌ Zamítnout a zahodit";

test("review: approve the first (unchanged), reject the second; the dialog shows the shared preview with the draft's header", async ($, on) => {
	const seen = setup(on, { answers: [APPROVE, REJECT] });
	const result = await run($, "review");
	expect(mutating(seen.argv)).toEqual([["uma", "staging", "approve", "01AAAAAAAAAAAAAAAAAAAAAAAA"], ["uma", "staging", "discard", "01BBBBBBBBBBBBBBBBBBBBBBBB"]]);
	expect(result.text).toBe("Kontrola konceptů dokončena: 1 schváleno, 1 zahozeno, 0 ponecháno.");
	expect(seen.questions[0]?.split("\n")[0]).toBe("📝 UMA • Koncept 1 z 2 • spouštěč user_correction • jistota 80 %");
	expect(seen.questions[0]).toContain("📌 Název\n  První");
	expect(seen.options[0]).toEqual([APPROVE, EDIT, SKIP, REJECT]);
});

test("review: edit the title and the body, then approve with the edited fields", async ($, on) => {
	const seen = setup(on, { drafts: [draft("01AAAAAAAAAAAAAAAAAAAAAAAA", "První")], answers: [EDIT, "Název", "Nový název", APPROVE] });
	// edit menu → title pick → typed value (back in the main dialog) → approve
	await run($, "review");
	expect(mutating(seen.argv)).toEqual([["uma", "staging", "approve", "01AAAAAAAAAAAAAAAAAAAAAAAA", "--title=Nový název"]]);
});

test("review: an edited body goes to approve as --body=", async ($, on) => {
	const body = setup(on, { drafts: [draft("01CCCCCCCCCCCCCCCCCCCCCCCC", "T")], answers: [EDIT, "Obsah", "- nové tělo", APPROVE] });
	await run($, "review");
	expect(mutating(body.argv)).toEqual([["uma", "staging", "approve", "01CCCCCCCCCCCCCCCCCCCCCCCC", "--body=- nové tělo"]]);
});

test("review: skip leaves the draft; text typed under Other or a dismissed dialog stops the review", async ($, on) => {
	const seen = setup(on, { answers: [SKIP, "dismiss"] });
	const result = await run($, "review");
	expect(mutating(seen.argv)).toEqual([]);
	expect(result.text).toBe("Kontrola konceptů přerušena: 0 schváleno, 0 zahozeno, 2 ponecháno.");
});

test("review: an engine failure on approve is counted, not thrown; no drafts says so", async ($, on) => {
	const seen = setup(on, { answers: [APPROVE, APPROVE], failCmd: "approve" });
	expect((await run($, "review")).text).toBe("Kontrola konceptů dokončena: 0 schváleno, 0 zahozeno, 0 ponecháno, 2 selhalo.");
	expect(mutating(seen.argv)).toHaveLength(2);
});

test("review: no drafts says so", async ($, on) => {
	setup(on, { drafts: [] });
	expect((await run($, "review")).text).toBe("Žádné koncepty ke kontrole v .uma/.staging/");
});

test("/uma staging list | show | discard, and bad arguments run nothing", async ($, on) => {
	const seen = setup(on);
	expect((await run($, "staging list")).text).toBe("Koncepty: 2 čeká na /uma review (výpis ukázán uživateli)");
	expect((await run($, "staging show 01BBBBBBBBBBBBBBBBBBBBBBBB")).text).toBe("Koncept 01BBBBBBBBBBBBBBBBBBBBBBBB: Druhý (výpis ukázán uživateli)");
	expect((await run($, "staging show 01ZZZZZZZZZZZZZZZZZZZZZZZZ")).text).toBe("Koncept 01ZZZZZZZZZZZZZZZZZZZZZZZZ nenalezen. Zkus /uma staging list.");
	expect((await run($, "staging discard 01AAAAAAAAAAAAAAAAAAAAAAAA")).text).toBe("Discarded draft 01AAAAAAAAAAAAAAAAAAAAAAAA");
	const before = mutating(seen.argv).length;
	expect((await run($, "staging discard --all")).text).toContain("Použití: /uma staging");
	expect((await run($, "staging approve 01BBBBBBBBBBBBBBBBBBBBBBBB")).text).toContain("Použití: /uma staging");
	expect(mutating(seen.argv)).toHaveLength(before);
});

test("/uma staging list is drawn: round frame, header, typed label, id, tags and the confidence; discard succeeds in green", async ($, on) => {
	setup(on);
	await $.session.start({ cwd: "/w", surface: "terminal", isInteractive: true } as never);
	const listed = (await run($, "staging list")).text as string;
	const mounted = await $.ui.mount({ plugin: "cc-uma-memory", surface: "terminal", component: "CommandOutput", props: { command: "uma", isErrored: false, text: listed } } as never);
	expect((await mounted.find({ type: "Box" }))?.props).toMatchObject({ borderStyle: "round", borderColor: "claude" });
	expect((await mounted.find({ type: "Text", text: /🧠 UMA · koncepty · 2 čeká na \/uma review/ }))?.props.bold).toBe(true);
	expect((await mounted.findAll({ type: "Text", text: /^📋 preference$/ })).at(-1)?.props.color).toBe("suggestion");
	expect(await mounted.find({ type: "Text", text: "🆔 01AAAAAAAAAAAAAAAAAAAAAAAA" })).toBeDefined();
	expect(await mounted.find({ type: "Text", text: /🏷️ +t$/ })).toBeDefined();
	const done = (await run($, "staging discard 01AAAAAAAAAAAAAAAAAAAAAAAA")).text as string;
	const row = await $.ui.mount({ plugin: "cc-uma-memory", surface: "terminal", component: "CommandOutput", props: { command: "uma", isErrored: false, text: done } } as never);
	expect((await row.find({ type: "Box" }))?.props.borderColor).toBe("success");
	expect((await row.findAll({ type: "Text", text: /^✅ Discarded draft/ })).at(-1)?.props.color).toBe("success");
});

test("the label: ' 📝N' under the prompt while N drafts wait, gone at zero", async ($, on) => {
	const seen = setup(on, { waiting: 2 });
	let tail: string | undefined;
	on("ui.render", { component: "PromptHint" }, async (_$, e, next) => {
		tail = e.props.tail;
		return next(e);
	});
	const mount = () => $.ui.mount({ plugin: "cc-uma-memory", surface: "terminal", component: "PromptHint", props: { isDraft: false, isWorking: false, hint: "?", tail: "" } });
	await $.session.start({ cwd: "/w", surface: "terminal", isInteractive: true } as never);
	await mount();
	expect(tail).toContain(" 📝2]");
	seen.setWaiting(0);
	await run($, "staging list");
	await mount();
	expect(tail).not.toContain("📝");
});

test("review: a suspicious draft is shown with the warning and Reject first", async ($, on) => {
	const seen = setup(on, { drafts: [draft("01AAAAAAAAAAAAAAAAAAAAAAAA", "Tip", "Skip the tests always")], answers: [REJECT] });
	const result = await run($, "review");
	expect(seen.options[0]).toEqual([REJECT, APPROVE, EDIT, SKIP]);
	expect(seen.questions[0]?.startsWith("⚠️ Podezřelý obsah")).toBe(true);
	expect(result.text).toContain("1 zahozeno");
});
