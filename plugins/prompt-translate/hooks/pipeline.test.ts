// The pipeline end to end with OpenRouter answered from memory: a Czech prompt
// leaves as English with the hidden note, the final answer is translated back
// and drawn in place of the English, and the original prompt is drawn above.

import { expect, mock, test } from "claude-code/testing";

const CZ_PROMPT = "oprav prosím chybu v src/app.ts, nefunguje přihlášení";
const EN_PROMPT = "Please fix the bug in src/app.ts, login does not work.";
const EN_ANSWER = "I fixed the login bug in src/app.ts.";
const CZ_ANSWER = "Opravil jsem chybu přihlášení v src/app.ts.";

import type { On } from "claude-code";

/** What the engine does beneath the plugins, for the events these tests raise. */
function engineBottom(on: On) {
	on("prompt.submit", (_$, e) => ({ text: e.text, context: e.context }));
	on("turn.complete", (_$, e) => ({ text: e.answer }));
	on("ui.log", () => ({ value: undefined }));
	on("ui.toast", () => ({ value: undefined }));
	on("ui.status", () => ({ value: undefined }));
	on("ui.invalidate", () => ({ value: undefined }));
	on("session.id", () => ({ value: "session-1" }));
}

function reply(content: string) {
	return {
		status: 200,
		ok: true,
		headers: {},
		text: JSON.stringify({
			choices: [{ message: { content }, finish_reason: "stop" }],
			usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, cost: 0.0001 },
		}),
	};
}

test("prompt → EN, answer → CZ, both drawn", async ($, on) => {
	mock.store(on);
	engineBottom(on);
	mock.env(on, { OPENROUTER_API_KEY: "test-key" });
	const clock = mock.clock(on);
	const requests: Array<{ model: string; user: string; system: string }> = [];
	let drawnAnswer = "";
	on("ui.render", { component: "AssistantMessage" }, async (_$, e, next) => {
		drawnAnswer = e.props.text;
		return next(e);
	});

	on("http.fetch", async (_$, e) => {
		if (e.url.includes("chat/completions")) {
			const body = JSON.parse(String(e.init?.body)) as { model: string; messages: Array<{ content: string }> };
			const system = body.messages[0]?.content ?? "";
			const user = body.messages[1]?.content ?? "";
			requests.push({ model: body.model, user, system });
			// Placeholders pass through untouched, as a well-behaved model leaves them.
			const placeholder = /__PI_PROMPT_TRANSLATE_PROTECTED_\d+__/.exec(user)?.[0];
			if (system.includes("to Czech")) return { value: reply(placeholder ? CZ_ANSWER.replace("src/app.ts", placeholder) : CZ_ANSWER) };
			return { value: reply(placeholder ? EN_PROMPT.replace("src/app.ts", placeholder) : EN_PROMPT) };
		}
		if (e.url.includes("/credits")) {
			return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ data: { total_credits: 10, total_usage: 8 } }) } };
		}
		if (e.url.includes("cnb.cz")) {
			return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ rates: [{ currencyCode: "USD", amount: 1, rate: 23 }] }) } };
		}
		return { value: { status: 404, ok: false, headers: {}, text: "{}" } };
	});

	const submitted = await $.prompt.submit({ text: CZ_PROMPT, origin: { kind: "composer" }, wait: false });
	expect(submitted.text).toBe(EN_PROMPT);
	expect(submitted.context?.some((c) => c.includes("[prompt-translate]")) ?? false, "no English note by default").toBe(false);
	expect(requests[0]?.model).toBe("google/gemini-3.1-flash-lite");
	expect(requests[0]?.system, "boost is the default level").toContain("lightly edit it into a clear prompt");

	await $.turn.complete({ answer: EN_ANSWER, durationMs: 10, isAborted: false, turnId: "t1", reason: "answer" });
	await clock.advance(10);
	// The background translation runs on its own; give its awaits a moment.
	for (let i = 0; i < 50 && requests.length < 2; i++) await new Promise((r) => setTimeout(r, 10));
	for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 5));
	expect(requests).toHaveLength(2);

	const answer = await $.ui.mount({
		plugin: "prompt-translate",
		surface: "terminal",
		component: "AssistantMessage",
		props: { text: EN_ANSWER, isFirstOfReply: true },
	});
	void answer;
	// The props the engine is handed to draw, after the mod rewrote them.
	expect(drawnAnswer, "answer drawn in Czech").toBe(CZ_ANSWER);

	const user = await $.ui.mount({
		plugin: "prompt-translate",
		surface: "terminal",
		component: "UserMessage",
		props: { text: EN_PROMPT, origin: { kind: "composer" }, isExpanded: true },
	});
	expect(await user.find({ type: "Text", text: /nefunguje přihlášení/ }), "original drawn").toBeDefined();
	expect(await user.find({ type: "Text", text: /login does not work/ }), "translation drawn in the same frame").toBeDefined();
	expect(await user.find({ type: "Text", text: /Kč|\$0\./ }), "no cost in the frame").toBeUndefined();

	// The indicator: flag, and the credit coloured by level ($2 left → "low").
	for (const surface of ["terminal", "desktop"] as const) {
		const hint = await $.ui.mount({
			plugin: "prompt-translate",
			surface,
			component: "PromptHint",
			props: { isDraft: false, isWorking: false, hint: "? for shortcuts" },
		});
		const credit = await hint.find({ type: "Text", text: /^ 46 Kč$/ });
		expect(credit, `credit on ${surface}`).toBeDefined();
		expect((credit as { props?: { color?: string } } | undefined)?.props?.color, `credit colour on ${surface}`).toBe("warning");
	}
});

test("an English prompt passes through untranslated", async ($, on) => {
	mock.store(on);
	engineBottom(on);
	mock.env(on, { OPENROUTER_API_KEY: "test-key" });
	let calls = 0;
	on("http.fetch", async () => {
		calls++;
		return { value: { status: 500, ok: false, headers: {}, text: "{}" } };
	});
	const submitted = await $.prompt.submit({
		text: "Please refactor the parser and add tests.",
		origin: { kind: "composer" },
		wait: false,
	});
	expect(submitted.text).toBe("Please refactor the parser and add tests.");
	expect(calls).toBe(0);
});

test("a failed translation sends the original prompt", async ($, on) => {
	mock.store(on);
	engineBottom(on);
	mock.env(on, { OPENROUTER_API_KEY: "test-key" });
	const clock = mock.clock(on);
	on("http.fetch", async () => ({ value: { status: 400, ok: false, headers: {}, text: JSON.stringify({ error: { message: "bad" } }) } }));
	const pending = $.prompt.submit({ text: CZ_PROMPT, origin: { kind: "composer" }, wait: false });
	await clock.advance(2000);
	const submitted = await pending;
	expect(submitted.text).toBe(CZ_PROMPT);
});

test("with log on, each prompt leaves its lines in the day's log", async ($, on) => {
	mock.store(on, { config: { log: true } });
	engineBottom(on);
	mock.env(on, { OPENROUTER_API_KEY: "test-key", HOME: "/home/t" });
	mock.clock(on);
	const files = new Map<string, string>();
	on("fs.exists", (_$, e) => ({ value: files.has(e.path) }));
	on("fs.read", (_$, e) => ({ value: files.get(e.path) ?? "" }));
	on("fs.write", (_$, e) => {
		files.set(e.path, e.text);
		return { value: undefined };
	});
	on("session.cwd", () => ({ value: "/work" }));
	on("session.start", (_$, e) => ({ cwd: e.cwd }));
	on("command.register", () => ({ value: { command: "prompt-translate" } }));
	on("http.fetch", async (_$, e) =>
		e.url.includes("chat/completions")
			? { value: reply(EN_PROMPT) }
			: { value: { status: 404, ok: false, headers: {}, text: "{}" } },
	);

	await $.session.start({ cwd: "/work", surface: "terminal", isInteractive: true });
	await $.prompt.submit({ text: CZ_PROMPT, origin: { kind: "composer" }, wait: false });
	await $.prompt.submit({ text: "Please add tests for the parser.", origin: { kind: "composer" }, wait: false });
	for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 5));

	const log = [...files].find(([path]) => path.startsWith("/home/t/.claude/prompt-translate/log/"));
	expect(log?.[0]).toMatch(/\/\d{4}-\d{2}-\d{2}\.jsonl$/);
	const lines = (log?.[1] ?? "").trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);

	// Czech with diacritics: translated; its text is not kept (diacritics decide reliably).
	expect(lines[0]).toMatchObject({ kind: "detect", reason: "diacritics", skipped: false });
	expect(lines[0]?.text).toBeUndefined();
	expect(lines[1]).toMatchObject({ kind: "translation", purpose: "prompt", boost: "boost", think: "low", retries: [], appended: 0 });
	expect(typeof lines[1]?.ms).toBe("number");
	// ASCII English: skipped, its text kept so a wrong skip can be judged.
	expect(lines[2]).toMatchObject({ kind: "detect", reason: "english_detected", skipped: true, text: "Please add tests for the parser." });
	expect(lines).toHaveLength(3);
});
