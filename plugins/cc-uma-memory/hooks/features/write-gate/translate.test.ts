// write-gate's dialog shows the Czech translation; what is approved and saved is the English original.
// The network is faked at http.fetch (no real request); the "model" answers `CS[<text>]` for every text.

import { expect, mock, test } from "claude-code/testing";
import type { On } from "claude-code";
import { resetTranslateCache } from "../../shared/translate";

const WRITE = "mcp__plugin_cc-uma-memory_uma__uma_write";
const APPROVE = "✅ Schválit a uložit do paměti";
const EDIT = "✏️ Upravit (název, obsah, tagy, celý text)";
const SECRET = "sk-secret-key-123";
const cs = (t: string): string => `CS[${t}]`;

/** What the fake model answers: each text (or each `<<<UMA-n>>>` part) in `CS[…]`. */
function answerTo(user: string): string {
	if (!/^<<<UMA-1>>>/m.test(user)) return cs(user);
	const parts = user.split(/^<<<UMA-(\d+)>>>\n/m);
	let out = "";
	for (let i = 1; i < parts.length; i += 2) out += `<<<UMA-${parts[i]}>>>\n${cs((parts[i + 1] ?? "").replace(/\n$/, ""))}\n`;
	return out;
}

type Opts = { lang?: "cs" | "en"; fetch?: "ok" | "500" | "hang"; key?: boolean; answers: string[] };

function setup(on: On, o: Opts) {
	resetTranslateCache();
	mock.store(on, { settings: { recall: true, writeGate: "ask", lang: o.lang ?? "cs" } });
	mock.env(on, o.key === false ? { HOME: "/h" } : { HOME: "/h", OPENROUTER_API_KEY: SECRET });
	on("fs.read", () => {
		throw new Error("ENOENT");
	});
	on("session.start", (_$, e) => ({ cwd: e.cwd }));
	on("command.register", () => ({ value: { command: "uma" } }));
	on("session.cwd", () => ({ value: "/w" }));
	on("session.id", () => ({ value: "s1" }));
	on("ui.status", () => ({ value: undefined }));
	on("fs.exists", () => ({ value: false }));
	on("fs.stat", () => {
		throw new Error("ENOENT");
	});
	const seen = { questions: [] as string[], logs: [] as string[], requests: [] as Array<{ system: string; user: string }>, ran: [] as Array<Record<string, unknown>> };
	on("ui.log", (_$, e) => {
		seen.logs.push(e.text);
		return { value: undefined };
	});
	const script = [...o.answers];
	on("tool.call", { tool: "AskUserQuestion" }, (_$, e) => {
		const q = e.questions[0];
		seen.questions.push(q?.question ?? "");
		return { result: { questions: e.questions, answers: { [q?.question ?? ""]: script.shift() ?? "no" } } } as never;
	});
	on("http.fetch", async (_$, e) => {
		const body = JSON.parse(String(e.init?.body)) as { messages: Array<{ content: string }> };
		seen.requests.push({ system: body.messages[0]?.content ?? "", user: body.messages[1]?.content ?? "" });
		if (o.fetch === "hang") await new Promise(() => undefined);
		if (o.fetch === "500") return { value: { status: 500, ok: false, headers: {}, text: `boom ${SECRET}` } };
		return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ choices: [{ message: { content: answerTo(body.messages[1]?.content ?? "") } }] }) } };
	});
	on("clock.sleep", async () => {
		if (o.fetch === "hang") return { value: undefined };
		await new Promise(() => undefined);
		return { value: undefined };
	});
	on("tool.call", (_$, e) => {
		seen.ran.push(e as Record<string, unknown>);
		return { result: "ran" } as never;
	});
	return seen;
}

const start = ($: { session: { start: (a: never) => Promise<unknown> } }) => $.session.start({ cwd: "/w", surface: "terminal", isInteractive: true } as never);
const propose = (title = "Use VSA", body = "Slices own their code.") => ({ tool: WRITE, title, body, type: "decision", scope: "global" }) as never;
const stored = (seen: { ran: Array<Record<string, unknown>> }) => seen.ran.find((i) => i.tool === WRITE) as Record<string, unknown>;

test("the preview shows the Czech translation, the approved call carries the English original", async ($, on) => {
	const seen = setup(on, { answers: [APPROVE] });
	await start($);
	const r = await $.tool.call(propose());
	expect(r.deny).toBeUndefined();
	expect(seen.questions[0]).toContain(cs("Use VSA"));
	expect(seen.questions[0]).toContain(cs("Slices own their code."));
	expect(seen.questions[0]).toContain("🌐 překlad, uloží se anglický originál");
	expect(stored(seen).title).toBe("Use VSA");
	expect(stored(seen).body).toBe("Slices own their code.");
	expect(seen.requests).toHaveLength(1); // title and body in one question
});

test("the prompt is pi's, word for word; several parts add only the note about the markers", async ($, on) => {
	const seen = setup(on, { answers: [APPROVE] });
	await start($);
	await $.tool.call(propose());
	expect(seen.requests[0]?.system).toBe(
		"You are a translation engine for AI-memory fact records. Translate the user's Markdown text into Czech. Preserve exactly: Markdown structure (## / ### headings, lists, blank lines), code spans and code blocks, file paths, identifiers, ULID identifiers, tag names (#tag), and technical terms that are commonly used in English. Translate only the prose. Return ONLY the translated Markdown — no preamble, no commentary, no code fence around the whole output. The text has several parts, each introduced by a line like <<<UMA-1>>>. Keep every such line exactly as it is, in the same order, and translate the text between them.",
	);
});

test("an edited body drops the old translation and the new text is translated; the edit is what is saved", async ($, on) => {
	const seen = setup(on, { answers: [EDIT, "Obsah", "Brand new body.", APPROVE] });
	await start($);
	await $.tool.call(propose());
	const last = seen.questions[seen.questions.length - 1] as string;
	expect(last).toContain(cs("Brand new body."));
	expect(last).not.toContain(cs("Slices own their code."));
	expect(stored(seen).body).toBe("Brand new body.");
	expect(stored(seen).body).not.toContain("CS[");
});

test("📜 Celý text shows the stored English original", async ($, on) => {
	const seen = setup(on, { answers: [EDIT, "📜 Celý text", "↩ Zpět", APPROVE] });
	await start($);
	await $.tool.call(propose());
	const full = seen.questions.find((q) => q.startsWith("📜")) as string;
	expect(full).toContain("(originál, tak se uloží)");
	expect(full).toContain("Slices own their code.");
	expect(full).not.toContain("CS[");
});

test("a failed translation: the original and a note why, approval still saves the original, the key is nowhere", async ($, on) => {
	const seen = setup(on, { fetch: "500", answers: [APPROVE] });
	await start($);
	const r = await $.tool.call(propose());
	expect(r.deny).toBeUndefined();
	expect(seen.questions[0]).toContain("Slices own their code.");
	expect(seen.questions[0]).toContain("⚠ překlad nedostupný (OpenRouter HTTP 500) — ukázán originál");
	expect(stored(seen).body).toBe("Slices own their code.");
	expect(JSON.stringify([seen.questions, seen.logs, seen.ran])).not.toContain(SECRET);
});

test("a timeout shows the original with a note", async ($, on) => {
	const seen = setup(on, { fetch: "hang", answers: [APPROVE] });
	await start($);
	await $.tool.call(propose());
	expect(seen.questions[0]).toContain("překlad nedostupný (vypršel čas)");
	expect(seen.questions[0]).toContain("Slices own their code.");
});

test("no OpenRouter key: no request, the original and a note", async ($, on) => {
	const seen = setup(on, { key: false, answers: [APPROVE] });
	await start($);
	await $.tool.call(propose());
	expect(seen.requests).toHaveLength(0);
	expect(seen.questions[0]).toContain("překlad nedostupný (chybí klíč OpenRouteru)");
});

test("/uma lang en: no request at all, no label", async ($, on) => {
	const seen = setup(on, { lang: "en", answers: [APPROVE] });
	await start($);
	await $.tool.call(propose());
	expect(seen.requests).toHaveLength(0);
	expect(seen.questions[0]).not.toContain("🌐 překlad");
	expect(seen.questions[0]).toContain("Slices own their code.");
});

test("the same fact is not translated twice in a session", async ($, on) => {
	const seen = setup(on, { answers: [APPROVE, APPROVE] });
	await start($);
	await $.tool.call(propose());
	await $.tool.call(propose());
	expect(seen.requests).toHaveLength(1);
	expect(seen.questions[1]).toContain(cs("Use VSA"));
});
