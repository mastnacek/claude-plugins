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
	expect(store.get("settings")).toEqual({ recall: false, writeGate: "ask" });
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
