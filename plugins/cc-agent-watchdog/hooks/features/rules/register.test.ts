// rules through the engine: calls and turn ends go to the ledger, the end of a turn judges it.
// The pure predicates are tested in shared/rules.test.ts; here the wiring: roles, config file, leftovers, the verdict in $.state.

import { expect, test } from "claude-code/testing";
import { call, fresh, setup } from "../../shared/world";

type Host = {
	session: { start: (a: never) => Promise<unknown> };
	turn: { complete: (a: never) => Promise<unknown> };
	ui: { mount: (a: never) => Promise<{ find: (a: never) => Promise<{ text?: string } | undefined> }> };
	command: { run: (a: never) => Promise<{ text?: string }> };
};

let n = 0;
const start = ($: Host) => $.session.start({ cwd: "/work/wt", surface: "terminal", isInteractive: true } as never);
const finish = async ($: Host, answer: string) => {
	await $.turn.complete({ answer, durationMs: 1, isAborted: false, turnId: `t${++n}`, reason: "answer" } as never);
};
const run = ($: Host, args: string) => $.command.run({ command: "watch", args, origin: { kind: "composer" }, presentation: { isFullscreen: false, columns: 80 } } as never);

/** The tag as the prompt hint would carry it, next to another plugin's tail. */
function hint($: Host, on: Parameters<typeof setup>[0]) {
	let tail: string | undefined;
	on("ui.render", { component: "PromptHint" }, async (_$, e, next) => {
		tail = e.props.tail;
		return next(e);
	});
	return async () => {
		await $.ui.mount({ plugin: "cc-agent-watchdog", surface: "terminal", component: "PromptHint", props: { isDraft: false, isWorking: false, hint: "?", tail: "[🇬🇧 46 Kč]" } } as never);
		return tail;
	};
}

test("a coder who commits: the tag turns to [👁 🔴 0 ⛔] next to the other plugin's tail", async ($, on) => {
	const w = fresh({ env: { HOME: "/h", CC_ROLE: "coder" } });
	setup(on, w);
	on("turn.complete", (_$, e) => ({ text: e.answer }));
	const tag = hint($ as never, on);
	await start($ as never);
	await finish($ as never, "Pracuji.");
	expect(await tag()).toBe("[🇬🇧 46 Kč] [👁 🟢 100]");
	await call($, { tool: "Bash", command: "git commit -m x" });
	await finish($ as never, "Pracuji.");
	expect(await tag()).toBe("[🇬🇧 46 Kč] [👁 🔴 0 ⛔]");
});

test("violations show as ⚠N with the score", async ($, on) => {
	const w = fresh({ env: { HOME: "/h", CC_ROLE: "tester" }, session: "TESTER01-x" });
	setup(on, w);
	on("turn.complete", (_$, e) => ({ text: e.answer }));
	const tag = hint($ as never, on);
	await start($ as never);
	await call($, { tool: "Write", file_path: "/home/t/other/f.txt" });
	await call($, { tool: "Bash", command: "sleep 60 && ls" });
	await finish($ as never, "Pracuji.");
	expect(await tag()).toBe("[🇬🇧 46 Kč] [👁 🟡 88 ⚠️2]");
});

test("the orchestrator is not bound by the git rules: score stays 100", async ($, on) => {
	const w = fresh({ env: { HOME: "/h" }, session: "ORCHES01-x" });
	setup(on, w);
	on("turn.complete", (_$, e) => ({ text: e.answer }));
	const tag = hint($ as never, on);
	await start($ as never);
	await call($, { tool: "Bash", command: "git commit -m x && git push" });
	await finish($ as never, "Hotovo.");
	expect(await tag()).toBe("[🇬🇧 46 Kč] [👁 🟢 100]");
});

test("a project's .claude/watchdog.json gives the gate: 'done' without it is an instant failure, with it a clean score", async ($, on) => {
	const w = fresh({ env: { HOME: "/h", CC_ROLE: "coder" }, session: "GATED001-x", seed: { "/work/wt/.claude/watchdog.json": JSON.stringify({ gate: ["make check"] }) } });
	setup(on, w);
	on("turn.complete", (_$, e) => ({ text: e.answer }));
	const tag = hint($ as never, on);
	await start($ as never);
	await call($, { tool: "Edit", file_path: "/work/wt/src/a.ts" });
	await finish($ as never, "Hotovo.");
	expect(await tag()).toBe("[🇬🇧 46 Kč] [👁 🔴 0 ⛔]");
	w.session = "GATED002-x";
	await call($, { tool: "Edit", file_path: "/work/wt/src/a.ts" });
	await call($, { tool: "Bash", command: "make check" });
	await finish($ as never, "Hotovo.");
	expect(await tag()).toBe("[🇬🇧 46 Kč] [👁 🟢 100]");
});

test("without a watchdog.json the usual test/build commands are the gate: 'Hotovo, vše ověřeno.' after an edit alone is an instant failure", async ($, on) => {
	const w = fresh({ env: { HOME: "/h", CC_ROLE: "coder" }, session: "NOGATE01-x" });
	setup(on, w);
	on("turn.complete", (_$, e) => ({ text: e.answer }));
	const tag = hint($ as never, on);
	await start($ as never);
	await call($, { tool: "Edit", file_path: "/work/wt/src/a.ts" });
	await finish($ as never, "Hotovo, vše ověřeno.");
	expect(await tag()).toBe("[🇬🇧 46 Kč] [👁 🔴 0 ⛔]");
	w.session = "NOGATE02-x";
	await call($, { tool: "Edit", file_path: "/work/wt/src/a.ts" });
	await finish($ as never, "Není hotovo, zbývá spustit testy.");
	expect(await tag()).toBe("[🇬🇧 46 Kč] [👁 🟢 100]");
	w.session = "NOGATE03-x";
	await call($, { tool: "Edit", file_path: "/work/wt/src/a.ts" });
	await call($, { tool: "Bash", command: "cargo test" });
	await finish($ as never, "Hotovo, vše ověřeno.");
	expect(await tag()).toBe("[🇬🇧 46 Kč] [👁 🟢 100]");
});

test("a broken watchdog.json leaves the defaults", async ($, on) => {
	const w = fresh({ env: { HOME: "/h", CC_ROLE: "coder" }, session: "BROKENC1-x", seed: { "/work/wt/.claude/watchdog.json": "{ nope" } });
	setup(on, w);
	on("turn.complete", (_$, e) => ({ text: e.answer }));
	const tag = hint($ as never, on);
	await start($ as never);
	await call($, { tool: "Write", file_path: "/data/out/x" });
	await finish($ as never, "Pracuji.");
	expect(await tag()).toBe("[🇬🇧 46 Kč] [👁 🟡 90 ⚠️1]");
});

test("a path the project allows, and the project's own protected path", async ($, on) => {
	const w = fresh({ env: { HOME: "/h", CC_ROLE: "coder" }, session: "ALLOWED1-x", seed: { "/work/wt/.claude/watchdog.json": JSON.stringify({ allowed: ["/data/out"], protected: ["/work/wt/CONTRACT.md"] }) } });
	setup(on, w);
	on("turn.complete", (_$, e) => ({ text: e.answer }));
	const tag = hint($ as never, on);
	await start($ as never);
	await call($, { tool: "Write", file_path: "/data/out/x" });
	await finish($ as never, "Pracuji.");
	expect(await tag()).toBe("[🇬🇧 46 Kč] [👁 🟢 100]");
	await call($, { tool: "Edit", file_path: "/work/wt/CONTRACT.md" });
	await finish($ as never, "Pracuji.");
	expect(await tag()).toBe("[🇬🇧 46 Kč] [👁 🔴 0 ⛔]");
});

test("debugging leftovers in the work tree cost 5 (and are written to the ledger once)", async ($, on) => {
	const w = fresh({ env: { HOME: "/h", CC_ROLE: "coder" }, session: "LEFTOVR1-x", status: "?? probe-1.ts\n M src/a.ts\n" });
	const { files } = setup(on, w);
	on("turn.complete", (_$, e) => ({ text: e.answer }));
	const tag = hint($ as never, on);
	await start($ as never);
	await finish($ as never, "Pracuji.");
	await finish($ as never, "Pracuji.");
	expect(await tag()).toBe("[🇬🇧 46 Kč] [👁 🟡 95 ⚠️1]");
	const ledger = [...files].find(([p]) => p.endsWith(".jsonl"))?.[1] ?? "";
	expect(ledger.split("\n").filter((l) => l.includes('"kind":"scan"')).length).toBe(1);
	w.status = " M src/a.ts\n";
	await finish($ as never, "Pracuji.");
	expect(await tag()).toBe("[🇬🇧 46 Kč] [👁 🟢 100]");
});

test("/watch rules lists the active rules of the role; the model gets one line", async ($, on) => {
	const w = fresh({ env: { HOME: "/h", CC_ROLE: "coder" }, session: "RULESCM1-x" });
	setup(on, w);
	await start($ as never);
	const result = await run($ as never, "rules");
	expect(result.text).toBe("Watchdog · 17 aktivních pravidel pro roli coder");
	expect(result.text).not.toContain("\n");
	const mounted = await ($ as unknown as Host).ui.mount({ plugin: "cc-agent-watchdog", surface: "terminal", component: "CommandOutput", props: { command: "watch", isErrored: false, text: result.text } } as never);
	expect(await mounted.find({ type: "Text", text: /🟢 W01 · ⛔ instant · zapnuto · report · zdroj: výchozí/ } as never)).toBeDefined();
	expect(await mounted.find({ type: "Text", text: /W20 · −3 \(max −15\)/ } as never)).toBeDefined();
	expect(await mounted.find({ type: "Text", text: /⚪ W29 .*vypnuto · report · zdroj: výchozí/ } as never)).toBeDefined();
	expect(await mounted.find({ type: "Text", text: /W08 .*jen report/ } as never)).toBeDefined();

	w.env.CC_ROLE = "";
	expect((await run($ as never, "rules")).text).toBe("Watchdog · 0 aktivních pravidel pro roli orchestrator");
});
