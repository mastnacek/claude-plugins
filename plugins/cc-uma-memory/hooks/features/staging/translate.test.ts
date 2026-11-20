// /uma review shows a draft translated; approving saves the English original (or the edit as typed).

import { expect, mock, test } from "claude-code/testing";
import type { On } from "claude-code";
import { resetTranslateCache } from "../../shared/translate";

const APPROVE = "✅ Schválit a uložit do paměti";
const EDIT = "✏️ Upravit (název, obsah, celý text)";
const SECRET = "sk-secret-key-123";
const ID = "01AAAAAAAAAAAAAAAAAAAAAAAA";
const cs = (t: string): string => `CS[${t}]`;

function answerTo(user: string): string {
	if (!/^<<<UMA-1>>>/m.test(user)) return cs(user);
	const parts = user.split(/^<<<UMA-(\d+)>>>\n/m);
	let out = "";
	for (let i = 1; i < parts.length; i += 2) out += `<<<UMA-${parts[i]}>>>\n${cs((parts[i + 1] ?? "").replace(/\n$/, ""))}\n`;
	return out;
}

const draft = { id: ID, confidence: 0.8, provenance: { trigger_type: "user_correction" }, fact: { id: ID, scope: { Project: "w" }, fact_type: "Preference", title: "Prefer tabs", body: "Use tabs for indentation.", tags: ["t"], template: "" } };

function setup(on: On, o: { lang: "cs" | "en"; fetch?: "ok" | "500"; answers: string[] }) {
	resetTranslateCache();
	mock.store(on, { settings: { lang: o.lang } });
	mock.env(on, { HOME: "/h", OPENROUTER_API_KEY: SECRET });
	on("fs.read", () => {
		throw new Error("ENOENT");
	});
	on("session.start", (_$, e) => ({ cwd: e.cwd }));
	on("session.cwd", () => ({ value: "/w" }));
	on("command.register", () => ({ value: { command: "uma" } }));
	on("ui.status", () => ({ value: undefined }));
	on("ui.log", () => ({ value: undefined }));
	on("fs.exists", () => ({ value: false }));
	on("fs.list", () => ({ value: [] }) as never);
	const seen = { argv: [] as string[][], questions: [] as string[], requests: 0 };
	on("process.run", (_$, e) => {
		const argv = [...e.argv];
		seen.argv.push(argv);
		return { value: { exitCode: 0, stdout: argv[2] === "list" ? JSON.stringify([draft]) : "ok", stderr: "", isStdoutTruncated: false, isStderrTruncated: false } } as never;
	});
	const script = [...o.answers];
	on("tool.call", { tool: "AskUserQuestion" }, (_$, e) => {
		const q = e.questions[0];
		seen.questions.push(q?.question ?? "");
		return { result: { questions: e.questions, answers: { [q?.question ?? ""]: script.shift() ?? "dismiss" } } } as never;
	});
	on("http.fetch", async (_$, e) => {
		seen.requests++;
		const body = JSON.parse(String(e.init?.body)) as { messages: Array<{ content: string }> };
		if (o.fetch === "500") return { value: { status: 500, ok: false, headers: {}, text: `boom ${SECRET}` } };
		return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ choices: [{ message: { content: answerTo(body.messages[1]?.content ?? "") } }] }) } };
	});
	on("clock.sleep", async () => {
		await new Promise(() => undefined);
		return { value: undefined };
	});
	return seen;
}

type Host = { command: { run: (a: never) => Promise<{ text?: string }> }; session: { start: (a: never) => Promise<unknown> } };
const started = new WeakSet<object>();
const run = async ($: Host, args: string) => {
	if (!started.has($)) {
		started.add($);
		await $.session.start({ cwd: "/w", surface: "terminal", isInteractive: true } as never); // loads the stored settings (lang)
	}
	return $.command.run({ command: "uma", args, origin: { kind: "composer" }, presentation: { isFullscreen: false, columns: 80 } } as never);
};
const approves = (argv: string[][]) => argv.filter((a) => a[2] === "approve");

test("the draft is shown translated, approving it passes no override: the stored English is saved", async ($, on) => {
	const seen = setup(on, { lang: "cs", answers: [APPROVE] });
	await run($, "review");
	expect(seen.questions[0]).toContain(cs("Prefer tabs"));
	expect(seen.questions[0]).toContain(cs("Use tabs for indentation."));
	expect(seen.questions[0]).toContain("🌐 překlad, uloží se anglický originál");
	expect(approves(seen.argv)).toEqual([["uma", "staging", "approve", ID]]);
});

test("an edited body drops the old translation; the typed English is what approve gets", async ($, on) => {
	const seen = setup(on, { lang: "cs", answers: [EDIT, "Obsah", "Use spaces.", APPROVE] });
	await run($, "review");
	const last = seen.questions[seen.questions.length - 1] as string;
	expect(last).toContain(cs("Use spaces."));
	expect(last).not.toContain(cs("Use tabs for indentation."));
	expect(approves(seen.argv)).toEqual([["uma", "staging", "approve", ID, "--body=Use spaces."]]);
});

test("a failed translation shows the original with a note, and approving still saves the original; no key leaks", async ($, on) => {
	const seen = setup(on, { lang: "cs", fetch: "500", answers: [APPROVE] });
	await run($, "review");
	expect(seen.questions[0]).toContain("Use tabs for indentation.");
	expect(seen.questions[0]).toContain("⚠ překlad nedostupný (OpenRouter HTTP 500) — ukázán originál");
	expect(approves(seen.argv)).toEqual([["uma", "staging", "approve", ID]]);
	expect(JSON.stringify(seen)).not.toContain(SECRET);
});

test("lang en: no request", async ($, on) => {
	const seen = setup(on, { lang: "en", answers: [APPROVE] });
	await run($, "review");
	expect(seen.requests).toBe(0);
	expect(seen.questions[0]).not.toContain("CS[");
});
