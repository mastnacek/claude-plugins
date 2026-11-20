// waiver through the engine: the tool is registered, the dialog asks, the decision lands in the ledger.

import { expect, mock, test } from "claude-code/testing";
import type { On } from "claude-code";
import { eventsOf, fresh, only, setup } from "../../shared/world";
import type { World } from "../../shared/world";
import type { WaiverEv } from "../../shared/types";

const TOOL = "mcp__cc-agent-watchdog__watchdog_waiver";

type Host = {
	session: { start: (a: never) => Promise<unknown> };
	tool: { call: (a: never) => Promise<Record<string, unknown>> };
};

/** The dialog answers `answer` (a label, free text, or "no-ui" like a -p run) and records what it showed. */
function dialog(on: On, answer: string) {
	const seen: { questions: string[]; options: string[][]; headers: string[] } = { questions: [], options: [], headers: [] };
	on("tool.call", { tool: "AskUserQuestion" }, (_$, e) => {
		const q = e.questions[0];
		seen.questions.push(q?.question ?? "");
		seen.options.push((q?.options ?? []).map((o: { label: string }) => o.label));
		seen.headers.push(q?.header ?? "");
		if (answer === "no-ui") throw new Error("no one to ask");
		return { result: { questions: e.questions, answers: { [q?.question ?? ""]: answer } } } as never;
	});
	return seen;
}

const registered: Array<{ name: string; description: string; inputSchema?: Record<string, unknown> }> = [];

function world(role: "coder" | "tester" | "" = "coder", over: Partial<World> = {}) {
	return fresh({ env: { HOME: "/h", CC_ROLE: role }, session: "WAIVER01-x", tick: 1000, seed: { "/work/wt/.claude/watchdog.json": JSON.stringify({ rules: { W29: { enabled: true } } }) }, ...over });
}

/** The dialog hook goes before the world's catch-all `tool.call`, as in the engine's own tests. */
function boot(on: On, w: World, answer = "✅ Povolit") {
	const seen = dialog(on, answer);
	mock.store(on, {});
	registered.length = 0;
	on("tool.register", (_$, e) => {
		registered.push(e as never);
		return { value: { tool: `mcp__cc-agent-watchdog__${(e as { name: string }).name}` } } as never;
	});
	return { ...setup(on, w), seen };
}

const start = ($: Host) => $.session.start({ cwd: "/work/wt", surface: "terminal", isInteractive: true } as never);
const ask = ($: Host, input: Record<string, unknown>) => $.tool.call({ tool: TOOL, ...input } as never);
const text = (r: Record<string, unknown>): string => String(r.text ?? r.result ?? r.deny ?? "");
const waivers = (files: Map<string, string>) => (eventsOf(files, only(files)) as unknown as Array<{ kind: string }>).filter((e): e is WaiverEv => e.kind === "waiver");

test("the tool is registered for the model with a description of when to use it", async ($, on) => {
	boot(on, world());
	await start($ as never);
	expect(registered.map((r) => r.name)).toEqual(["watchdog_waiver"]);
	expect(registered[0]?.description).toContain("PŘED vědomým porušením");
	expect(registered[0]?.description).toContain("potvrdí člověk");
	expect(registered[0]?.inputSchema).toMatchObject({ required: ["rule", "reason"] });
});

test("request → dialog (header, rule, role, reason, scope; two choices) → allow is written to the ledger", async ($, on) => {
	const w = world();
	const { files, seen } = boot(on, w, "✅ Povolit");
	await start($ as never);
	const r = await ask($ as never, { rule: "W29", reason: "mechanická hromadná úprava 40 souborů", scope: { calls: 5 } });
	expect(text(r)).toContain("Výjimka W29 povolena: dalších 5 volání");
	expect(seen.options[0]).toEqual(["✅ Povolit", "❌ Zamítnout"]);
	expect(seen.questions[0]).toContain("👁 Watchdog • žádost o výjimku");
	for (const part of ["W29", "úprava souboru přes Bash", "coder", "mechanická hromadná úprava 40 souborů", "dalších 5 volání"]) expect(seen.questions[0]).toContain(part);
	const [ev] = waivers(files);
	expect(ev).toMatchObject({ kind: "waiver", rule: "W29", reason: "mechanická hromadná úprava 40 souborů", scope: { calls: 5 }, decision: "allow", decidedBy: "dialog", role: "coder" });
	expect(typeof ev?.ts).toBe("number");
});

test("no scope = until the end of the turn; more than 20 calls is cut to 20 and the model is told", async ($, on) => {
	const { files } = boot(on, world(), "✅ Povolit");
	await start($ as never);
	expect(text(await ask($ as never, { rule: "W29", reason: "hromadná úprava" }))).toContain("do konce tahu");
	expect(text(await ask($ as never, { rule: "W29", reason: "hromadná úprava", scope: { calls: 99 } }))).toContain("zkrátil na nejvýš 20");
	expect(waivers(files).map((e) => e.scope)).toEqual([{}, { calls: 20 }]);
});

test("denied: by the button, and by free text (its words go to the model); both are written as deny", async ($, on) => {
	const w = world();
	const { files, seen } = boot(on, w, "❌ Zamítnout");
	await start($ as never);
	expect(text(await ask($ as never, { rule: "W29", reason: "hromadná úprava" }))).toContain("Výjimka W29 zamítnuta");
	expect(waivers(files)[0]).toMatchObject({ decision: "deny", decidedBy: "dialog" });
	expect(seen.questions).toHaveLength(1);
});

test("free text typed under Other is a refusal with the person's reason", async ($, on) => {
	const { files } = boot(on, world(), "Radši použij Edit, je to jen pět souborů");
	await start($ as never);
	const t = text(await ask($ as never, { rule: "W29", reason: "hromadná úprava" }));
	expect(t).toContain("zamítnuta: Radši použij Edit");
	expect(waivers(files)[0]).toMatchObject({ decision: "deny" });
});

test("-p (no one to ask) is a refusal, written as policy", async ($, on) => {
	const { files } = boot(on, world(), "no-ui");
	await start($ as never);
	expect(text(await ask($ as never, { rule: "W29", reason: "hromadná úprava" }))).toContain("zamítnuta");
	expect(waivers(files)[0]).toMatchObject({ decision: "deny", decidedBy: "policy" });
});

test("instant-failure rules are refused without a dialog", async ($, on) => {
	const { files, seen } = boot(on, world(), "✅ Povolit");
	await start($ as never);
	for (const rule of ["W01", "W02", "W05", "W06", "W07", "W08", "W14", "W19", "W21", "W26"]) {
		expect(text(await ask($ as never, { rule, reason: "opravdu to potřebuju" }))).toContain("výjimku nelze udělit");
	}
	expect(seen.questions).toEqual([]); // not once did the dialog open
	expect(waivers(files).every((e) => e.decision === "deny" && e.decidedBy === "policy")).toBe(true);
	expect(waivers(files)).toHaveLength(10);
});

test("bad requests: no dialog, no ledger line; an unknown rule", async ($, on) => {
	const { files, seen } = boot(on, world(), "✅ Povolit");
	await start($ as never);
	expect(text(await ask($ as never, { reason: "x".repeat(10) }))).toContain("id pravidla");
	expect(text(await ask($ as never, { rule: "W29" }))).toContain("Chybí důvod");
	expect(text(await ask($ as never, { rule: "W29", reason: "hromadná úprava", scope: { calls: 0 } }))).toContain("aspoň 1");
	expect(text(await ask($ as never, { rule: "W77", reason: "hromadná úprava" }))).toContain("neexistuje");
	expect(seen.questions).toEqual([]);
	expect(waivers(files)).toEqual([]);
});

test("a rule that is switched off or does not bind the role needs no exception: no dialog", async ($, on) => {
	const w = world("tester");
	const { files, seen } = boot(on, w, "✅ Povolit");
	await start($ as never);
	expect(text(await ask($ as never, { rule: "W29", reason: "hromadná úprava" }))).toContain("neplatí");
	expect(seen.questions).toEqual([]);
	expect([...files.keys()].filter((k) => k.endsWith(".jsonl"))).toHaveLength(1); // the ledger line of the call itself only
	expect(waivers(files)).toEqual([]);
});
