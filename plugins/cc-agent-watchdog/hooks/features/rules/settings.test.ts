// /watch rules and /watch rule through the engine: where the state comes from, writes to the project file and to the store,
// and the report of a session that used an exception.

import { expect, test } from "claude-code/testing";
import type { On } from "claude-code";
import { eventsOf, fresh, only, setup } from "../../shared/world";
import type { World } from "../../shared/world";

const CONFIG = "/work/wt/.claude/watchdog.json";

type Host = {
	session: { start: (a: never) => Promise<unknown> };
	turn: { complete: (a: never) => Promise<unknown> };
	tool: { call: (a: never) => Promise<Record<string, unknown>> };
	ui: { mount: (a: never) => Promise<{ find: (a: never) => Promise<unknown> }> };
	command: { run: (a: never) => Promise<{ text?: string }> };
};

function boot(on: On, over: { project?: string; global?: object; role?: "coder" | "" } = {}) {
	const w: World = fresh({ env: { HOME: "/h", CC_ROLE: over.role ?? "coder" }, session: "SETTING1-x", tick: 1000, seed: over.project === undefined ? {} : { [CONFIG]: over.project } });
	on("tool.call", { tool: "AskUserQuestion" }, (_$, e) => {
		const q = e.questions[0]?.question ?? "";
		return { result: { questions: e.questions, answers: { [q]: "✅ Povolit" } } } as never;
	});
	const store = new Map<string, unknown>(over.global ? [["rules", over.global]] : []);
	on("store.get", (_$, e) => ({ value: store.get(e.key) }));
	on("store.set", (_$, e) => {
		store.set(e.key, JSON.parse(JSON.stringify(e.value)));
		return { value: undefined };
	});
	on("tool.register", (_$, e) => ({ value: { tool: `mcp__cc-agent-watchdog__${(e as { name: string }).name}` } }) as never);
	on("turn.complete", (_$, e) => ({ text: e.answer }));
	return { w, store, ...setup(on, w) };
}

const start = ($: Host) => $.session.start({ cwd: "/work/wt", surface: "terminal", isInteractive: true } as never);
const run = ($: Host, args: string) => $.command.run({ command: "watch", args, origin: { kind: "composer" }, presentation: { isFullscreen: false, columns: 80 } } as never);

/** Does the framed output of `result` hold a line matching `re`. */
async function framed($: Host, text: string, re: RegExp): Promise<boolean> {
	const mounted = await $.ui.mount({ plugin: "cc-agent-watchdog", surface: "terminal", component: "CommandOutput", props: { command: "watch", isErrored: false, text } } as never);
	return (await mounted.find({ type: "Text", text: re } as never)) !== undefined;
}

test("/watch rule W29 block writes the project file and keeps every other key", async ($, on) => {
	const { files } = boot(on, { project: JSON.stringify({ gate: ["make check"], profile: ["W29"] }) });
	await start($ as never);
	const r = await run($ as never, "rule W29 block");
	expect(r.text).toBe("Watchdog · W29: režim block (v projektu, .claude/watchdog.json)");
	expect(JSON.parse(files.get(CONFIG) ?? "{}")).toEqual({ gate: ["make check"], profile: ["W29"], rules: { W29: { mode: "block" } } });
	expect(await framed($ as never, r.text ?? "", /✔ W29: režim block/)).toBe(true);
});

test("/watch rule creates the project file when there is none", async ($, on) => {
	const { files } = boot(on);
	await start($ as never);
	await run($ as never, "rule W29 on");
	expect(JSON.parse(files.get(CONFIG) ?? "{}")).toEqual({ rules: { W29: { enabled: true } } });
});

test("/watch rule never rewrites an invalid project file; the error is in the frame", async ($, on) => {
	const { files } = boot(on, { project: "{ not json" });
	await start($ as never);
	const r = await run($ as never, "rule W29 block");
	expect(r.text).toContain("není platný JSON");
	expect(files.get(CONFIG)).toBe("{ not json");
	expect(await framed($ as never, r.text ?? "", /❌ .*není platný JSON/)).toBe(true);
});

test("/watch rule --global writes the user's store, not the project", async ($, on) => {
	const { files, store } = boot(on, { global: { W04: { mode: "block" } } });
	await start($ as never);
	const r = await run($ as never, "rule W29 block --global");
	expect(r.text).toBe("Watchdog · W29: režim block (globálně, pro všechny projekty)");
	expect(store.get("rules")).toEqual({ W04: { mode: "block" }, W29: { mode: "block" } });
	expect(files.has(CONFIG)).toBe(false);
});

test("/watch rule: unknown rule, bad action, instant rule off (project refused, --global with a warning), block on a report-only rule", async ($, on) => {
	const { files, store } = boot(on);
	await start($ as never);
	expect((await run($ as never, "rule W77 on")).text).toContain("neexistuje");
	expect((await run($ as never, "rule W29 loud")).text).toContain("Použití");
	expect((await run($ as never, "rule W01 off")).text).toContain("jen osobně pro všechny projekty");
	expect((await run($ as never, "rule W08 block")).text).toContain("jen report");
	expect(files.has(CONFIG)).toBe(false);
	const r = await run($ as never, "rule W01 off --global");
	expect(r.text).toContain("W01: vypnuto");
	expect(await framed($ as never, r.text ?? "", /⚠ W01 je pravidlo s instant failure/)).toBe(true);
	expect(store.get("rules")).toEqual({ W01: { enabled: false } });
});

test("/watch rules shows state, mode and the SOURCE of each: default, global, project", async ($, on) => {
	boot(on, { global: { W04: { mode: "block" }, W29: { enabled: true } }, project: JSON.stringify({ rules: { W29: { mode: "block" }, W16: { enabled: false } } }) });
	await start($ as never);
	const r = await run($ as never, "rules");
	expect(r.text).toBe("Watchdog · 17 aktivních pravidel pro roli coder");
	const has = (re: RegExp) => framed($ as never, r.text ?? "", re);
	expect(await has(/🟢 W01 · ⛔ instant · zapnuto · report · zdroj: výchozí/)).toBe(true);
	expect(await has(/🟢 W04 · −10 \(max −30\) · zapnuto · 🛑 block · zdroj: globální/)).toBe(true);
	expect(await has(/🟢 W29 · −2 \(max −10\) · zapnuto · 🛑 block · zdroj: stav globální, režim projekt/)).toBe(true);
	expect(await has(/⚪ W16 · −5 \(max −15\) · vypnuto · report · zdroj: projekt/)).toBe(true);
	expect(await has(/🟢 W08 .* · jen report · /)).toBe(true);
	expect(await has(/Výjimky v sezení: žádná otevřená/)).toBe(true);
});

test("/watch rules lists the exceptions open in this session, with what is left", async ($, on) => {
	boot(on, { project: JSON.stringify({ rules: { W29: { enabled: true } } }) });
	await start($ as never);
	await $.tool.call({ tool: "mcp__cc-agent-watchdog__watchdog_waiver", rule: "W29", reason: "hromadná úprava", scope: { calls: 5 } } as never);
	await $.tool.call({ tool: "Bash", command: "ls" } as never);
	const r = await run($ as never, "rules");
	expect(await framed($ as never, r.text ?? "", /✅ výjimka W29 · zbývá 4 z 5 volání, nejdéle do konce tahu · „hromadná úprava“/)).toBe(true);
	await $.turn.complete({ answer: "Pracuji.", durationMs: 1, isAborted: false, turnId: "t1", reason: "answer" } as never);
	expect(await framed($ as never, (await run($ as never, "rules")).text ?? "", /Výjimky v sezení: žádná otevřená/)).toBe(true);
});

test("/watch report: a violation covered by an exception is shown as allowed and costs nothing; the summary counts requests", async ($, on) => {
	const { w, files } = boot(on, { project: JSON.stringify({ rules: { W29: { enabled: true } } }) });
	await start($ as never);
	await $.tool.call({ tool: "Bash", command: "sed -i 's/a/b/' /work/wt/src/before.ts" } as never);
	await $.tool.call({ tool: "mcp__cc-agent-watchdog__watchdog_waiver", rule: "W29", reason: "hromadná úprava" } as never);
	await $.tool.call({ tool: "Bash", command: "sed -i 's/a/b/' /work/wt/src/a.ts" } as never);
	await $.tool.call({ tool: "mcp__cc-agent-watchdog__watchdog_waiver", rule: "W01", reason: "chci commitnout" } as never);
	await $.turn.complete({ answer: "Pracuji.", durationMs: 1, isAborted: false, turnId: "t1", reason: "answer" } as never);
	const r = await run($ as never, "report");
	expect(r.text).toBe("Watchdog · sezení SETTING1 (coder): skóre 98/100, 1 porušení");
	const has = (re: RegExp) => framed($ as never, r.text ?? "", re);
	expect(await has(/⚠ −2 · W29 · .* · Bash sed -i 's\/a\/b\/' \/work\/wt\/src\/before.ts/)).toBe(true);
	expect(await has(/✅ povoleno výjimkou W29 \(\d\d:\d\d:\d\d\) · Bash sed -i .*a\.ts · „hromadná úprava“/)).toBe(true);
	expect(await has(/výjimky: 2 žádostí, 1 povoleno, 1 použito/)).toBe(true);
	expect(w.session).toBe("SETTING1-x");
	expect(eventsOf(files, only(files)).some((e) => (e as { kind: string }).kind === "waiver")).toBe(true);
});
