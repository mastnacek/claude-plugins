// /uma lang and the display translation of /uma search|list|read: the person sees Czech,
// the model's line and the engine's data stay as they are. Network faked at http.fetch.

import { expect, mock, test } from "claude-code/testing";
import type { On } from "claude-code";
import { resetTranslateCache } from "../../shared/translate";

const SECRET = "sk-secret-key-123";
const cs = (t: string): string => `CS[${t}]`;

function answerTo(user: string): string {
	if (!/^<<<UMA-1>>>/m.test(user)) return cs(user);
	const parts = user.split(/^<<<UMA-(\d+)>>>\n/m);
	let out = "";
	for (let i = 1; i < parts.length; i += 2) out += `<<<UMA-${parts[i]}>>>\n${cs((parts[i + 1] ?? "").replace(/\n$/, ""))}\n`;
	return out;
}

function setup(on: On, o: { stored?: unknown; fetch?: "ok" | "500"; stdout?: string; key?: boolean } = {}) {
	resetTranslateCache();
	const store = new Map<string, unknown>(o.stored === undefined ? [] : [["settings", o.stored]]);
	on("store.get", (_$, e) => ({ value: store.get(e.key) }));
	on("store.set", (_$, e) => {
		store.set(e.key, JSON.parse(JSON.stringify(e.value)));
		return { value: undefined };
	});
	mock.env(on, o.key === false ? { HOME: "/h" } : { HOME: "/h", OPENROUTER_API_KEY: SECRET });
	on("fs.read", () => {
		throw new Error("ENOENT");
	});
	on("session.start", (_$, e) => ({ cwd: e.cwd }));
	on("session.cwd", () => ({ value: "/work" }));
	on("command.register", () => ({ value: { command: "uma" } }));
	on("ui.status", () => ({ value: undefined }));
	on("ui.log", () => ({ value: undefined }));
	on("fs.exists", () => ({ value: false }));
	const seen = { argv: [] as string[][], requests: [] as string[] };
	on("process.run", (_$, e) => {
		seen.argv.push([...e.argv]);
		return { value: { exitCode: 0, stdout: o.stdout ?? "[]", stderr: "", isStdoutTruncated: false, isStderrTruncated: false } } as never;
	});
	on("http.fetch", async (_$, e) => {
		const body = JSON.parse(String(e.init?.body)) as { messages: Array<{ content: string }> };
		seen.requests.push(body.messages[1]?.content ?? "");
		if (o.fetch === "500") return { value: { status: 500, ok: false, headers: {}, text: `boom ${SECRET}` } };
		return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ choices: [{ message: { content: answerTo(body.messages[1]?.content ?? "") } }] }) } };
	});
	on("clock.sleep", async () => {
		await new Promise(() => undefined);
		return { value: undefined };
	});
	return { store, seen };
}

const run = ($: { command: { run: (a: never) => Promise<unknown> } }, args: string) =>
	$.command.run({ command: "uma", args, origin: { kind: "composer" }, presentation: { isFullscreen: false, columns: 80 } } as never) as Promise<{ text?: string }>;
const start = ($: { session: { start: (a: never) => Promise<unknown> } }) => $.session.start({ cwd: "/work", surface: "terminal", isInteractive: true } as never);
const mountOutput = ($: { ui: { mount: (a: never) => Promise<unknown> } }, text: string) =>
	$.ui.mount({ plugin: "cc-uma-memory", surface: "terminal", component: "CommandOutput", props: { command: "uma", isErrored: false, text } } as never) as Promise<{ find: (q: object) => Promise<{ props: Record<string, unknown>; text: string } | undefined> }>;

const FACT = { fact_type: "decision", scope: "Global", id: "01M744E20JKEEJRA61M6Z11NBV", title: "Use deep modules", body: "First line.\nSecond line.", tags: ["arch"], status: "stable" };
const LIST = JSON.stringify([FACT]);

test("/uma lang: reports cs by default, switches, is stored; an old stored value without lang reads as cs", async ($, on) => {
	const { store } = setup(on, { stored: { recall: false } });
	await start($);
	expect((await run($, "lang")).text).toContain("Jazyk zobrazení faktů: cs");
	expect((await run($, "lang en")).text).toContain("Jazyk zobrazení faktů: en");
	expect((store.get("settings") as { lang: string }).lang).toBe("en");
	expect((await run($, "lang")).text).toContain("en —");
	expect((await run($, "lang de")).text).toBe("Neznámý argument. Zkus /uma lang [cs|en].");
	expect((await run($, "lang cs")).text).toContain("cs —");
});

test("a list is shown translated; the model's line and the engine's call are untouched; one request", async ($, on) => {
	const { seen } = setup(on, { stdout: LIST });
	await start($);
	const out = await run($, "list");
	expect(out.text).toBe("Fakta: 1 fakt (výpis ukázán uživateli)");
	expect(out.text).not.toContain("CS[");
	expect(seen.argv).toEqual([["uma", "list", "--json"]]);
	expect(seen.requests).toHaveLength(1);
	const mounted = await mountOutput($, out.text as string);
	expect(await mounted.find({ type: "Text", text: cs("Use deep modules") })).toBeDefined();
	expect(await mounted.find({ type: "Text", text: /🌐 překlad, uloží se anglický originál/ })).toBeDefined();
});

test("a read translates the title and the body in ONE request", async ($, on) => {
	const { seen } = setup(on, { stdout: JSON.stringify(FACT) });
	await start($);
	const out = await run($, "read 01M744E20JKEEJRA61M6Z11NBV");
	expect(out.text).toContain("Use deep modules");
	expect(seen.requests).toHaveLength(1);
	const mounted = await mountOutput($, out.text as string);
	expect(await mounted.find({ type: "Text", text: /CS\[First line\./ })).toBeDefined();
});

test("lang en: nothing is asked, the facts are shown as stored", async ($, on) => {
	const { seen } = setup(on, { stored: { lang: "en" }, stdout: LIST });
	await start($);
	const out = await run($, "list");
	expect(seen.requests).toHaveLength(0);
	const mounted = await mountOutput($, out.text as string);
	expect(await mounted.find({ type: "Text", text: "1. Use deep modules" })).toBeDefined();
});

test("a failure: the original facts and a dim note why; the key is nowhere in the frame", async ($, on) => {
	setup(on, { fetch: "500", stdout: LIST });
	await start($);
	const out = await run($, "list");
	const mounted = await mountOutput($, out.text as string);
	expect(await mounted.find({ type: "Text", text: "1. Use deep modules" })).toBeDefined();
	const note = await mounted.find({ type: "Text", text: /překlad nedostupný \(OpenRouter HTTP 500\) — ukázán originál/ });
	expect(note).toBeDefined();
	expect(JSON.stringify([out, note])).not.toContain(SECRET);
});

test("no key: no request, original and a note", async ($, on) => {
	const { seen } = setup(on, { key: false, stdout: LIST });
	await start($);
	const out = await run($, "list");
	expect(seen.requests).toHaveLength(0);
	const mounted = await mountOutput($, out.text as string);
	expect(await mounted.find({ type: "Text", text: /chybí klíč OpenRouteru/ })).toBeDefined();
});
