// report through the engine: /watch report (session, last, all, <id>), the framed drawing, usage.

import { expect, test } from "claude-code/testing";
import { call, fresh, setup } from "../../shared/world";
import type { Entry } from "../../shared/world";

type Host = {
	session: { start: (a: never) => Promise<unknown> };
	ui: { mount: (a: never) => Promise<{ find: (a: never) => Promise<{ text?: string; props?: Record<string, unknown> } | undefined> }> };
	command: { run: (a: never) => Promise<{ text?: string }> };
};

const start = ($: Host) => $.session.start({ cwd: "/work/wt", surface: "terminal", isInteractive: true } as never);
const run = ($: Host, args: string) => $.command.run({ command: "watch", args, origin: { kind: "composer" }, presentation: { isFullscreen: false, columns: 80 } } as never);
const draw = ($: Host, text: string) => $.ui.mount({ plugin: "cc-agent-watchdog", surface: "terminal", component: "CommandOutput", props: { command: "watch", isErrored: false, text } } as never);

test("the scorecard of this session: one line for the model, a framed card for the person", async ($, on) => {
	const w = fresh({ env: { HOME: "/h", CC_ROLE: "coder" }, session: "REPORT01-aaaa" });
	setup(on, w);
	const h = $ as unknown as Host;
	await start(h);
	await call($, { tool: "Bash", command: "git commit -m 'x'" });
	await call($, { tool: "Bash", command: "sleep 60 && ls" });
	const { text } = await run(h, "report");
	expect(text).toBe("Watchdog · sezení REPORT01 (coder): skóre 0/100, 2 porušení, 1× instant failure");
	expect(text).not.toContain("\n");

	const card = await draw(h, text as string);
	expect((await card.find({ type: "Box" } as never))?.props).toMatchObject({ borderStyle: "round", borderColor: "error" });
	expect((await card.find({ type: "Text", text: /^👁 Watchdog · coder · 2026-01-05 · REPORT01 · skóre 0\/100/ } as never))?.text).toBeDefined();
	const instant = await card.find({ type: "Text", text: /⛔ INSTANT FAIL · W01 · \d\d:\d\d:\d\d · git commit — Bash git commit -m 'x'/ } as never);
	expect(instant?.props).toMatchObject({ color: "error" });
	const warn = await card.find({ type: "Text", text: /⚠ −2 · W18 · \d\d:\d\d:\d\d · Bash sleep 60 && ls/ } as never);
	expect(warn?.props).toMatchObject({ color: "warning" });
	expect(await card.find({ type: "Text", text: /Souhrn: 2 volání · 2 porušení \(1 instant\) · odečet −2 · W01×1 W18×1/ } as never)).toBeDefined();
});

test("a clean session is a green frame; an empty ledger says so", async ($, on) => {
	const w = fresh({ env: { HOME: "/h", CC_ROLE: "tester" }, session: "CLEAN001-aaaa" });
	setup(on, w);
	const h = $ as unknown as Host;
	await start(h);
	expect((await run(h, "report")).text).toContain("deník tohoto sezení je zatím prázdný");
	await call($, { tool: "Bash", command: "ls" });
	const { text } = await run(h, "report session");
	expect(text).toBe("Watchdog · sezení CLEAN001 (tester): skóre 100/100, bez porušení");
	const card = await draw(h, text as string);
	expect((await card.find({ type: "Box" } as never))?.props).toMatchObject({ borderColor: "success" });
	expect(await card.find({ type: "Text", text: /✔ žádné porušení/ } as never)).toBeDefined();
});

test("report all / last / <id> read other sessions of the project from the same folder", async ($, on) => {
	const old = JSON.stringify({ kind: "tool", ts: 1_700_000_000_000, session: "OLDOLDOL-1111", role: "coder", cwd: "/work/wt", tool: "Bash", command: "git push", isError: false, denied: false, durationMs: 1, exitCode: 0 });
	const dir = "/h/.local/share/uma/agent-watchdog/main";
	const listing: Entry[] = [{ name: "2025-12-31_coder_OLDOLDOL.jsonl", kind: "file", size: 1, mtimeMs: 5, isLink: false }];
	const w = fresh({ env: { HOME: "/h", CC_ROLE: "coder" }, session: "NEWNEWNE-2222", listing, seed: { [`${dir}/2025-12-31_coder_OLDOLDOL.jsonl`]: `${old}\n` } });
	setup(on, w);
	const h = $ as unknown as Host;
	await start(h);
	await call($, { tool: "Bash", command: "ls" });
	expect((await run(h, "report last")).text).toBe("Watchdog · sezení OLDOLDOL (coder): skóre 0/100, 1 porušení, 1× instant failure");
	expect((await run(h, "report oldoldol")).text).toContain("OLDOLDOL");
	expect((await run(h, "report 9999zzzz")).text).toContain("jsem nenašel");
	expect((await run(h, "report all")).text).toBe("Watchdog · 2 sezení, 1 s instant failure");
	const card = await draw(h, "Watchdog · 2 sezení, 1 s instant failure");
	expect(await card.find({ type: "Text", text: /⛔ 2025-12-31 · coder · OLDOLDOL · skóre 0 · 1 volání · 1 porušení/ } as never)).toBeDefined();
});

test("/watch without a known subcommand says how to use it", async ($, on) => {
	setup(on, fresh({ env: { HOME: "/h" }, session: "USAGE001-x" }));
	const h = $ as unknown as Host;
	await start(h);
	expect((await run(h, "")).text).toBe("Použití: /watch report [last | all | <id sezení>] · /watch rules · /watch rule <id> on|off|report|block [--global]");
});

test("the orchestrator's scorecard says no rule applies to it", async ($, on) => {
	setup(on, fresh({ env: { HOME: "/h" }, session: "ORCHEST1-x" }));
	const h = $ as unknown as Host;
	await start(h);
	await call($, { tool: "Bash", command: "git push" });
	const { text } = await run(h, "report");
	expect(text).toBe("Watchdog · sezení ORCHEST1 (orchestrator): skóre 100/100, bez porušení");
	const card = await draw(h, text as string);
	expect(await card.find({ type: "Text", text: /pravidla se na tuto roli nevztahují/ } as never)).toBeDefined();
});

const SIDECAR = (dir: string, sid8: string) => `${dir}/2026-01-05_coder_${sid8}.uma.jsonl`;
const umaLine = (ts: number, source: string, ids: string[]) => `${JSON.stringify({ ts, session: "S", kind: "uma-context", source, factIds: ids, scope: "session" })}\n`;

test("with a sidecar of cc-uma-memory each violation gets the facts in context and the summary counts them", async ($, on) => {
	const dir = "/h/.local/share/uma/agent-watchdog/main";
	const w = fresh({ env: { HOME: "/h", CC_ROLE: "coder" }, session: "UMACTX01-aaaa" });
	// A fact delivered long before and one in the far future (after the violation): only the first is "in context".
	w.seed[SIDECAR(dir, "UMACTX01")] = umaLine(1, "rules", ["01AAAAAAAAAAAAAAAAAAAAAAAA", "01BBBBBBBBBBBBBBBBBBBBBBBB"]) + umaLine(9_999_999_999_999, "recall", ["01CCCCCCCCCCCCCCCCCCCCCCCC"]) + "torn line\n";
	setup(on, w);
	const h = $ as unknown as Host;
	await start(h);
	await call($, { tool: "Bash", command: "git commit -m 'x'" });
	const { text } = await run(h, "report");
	expect(text).not.toContain("\n");
	const card = await draw(h, text as string);
	const facts = await card.find({ type: "Text", text: /^ {3}🧠 fakty v kontextu: 01AAAAAA, 01BBBBBB$/ } as never);
	expect(facts?.props).toMatchObject({ dimColor: true });
	expect(await card.find({ type: "Text", text: /🧠 sezení mělo 3 fakty UMA v kontextu/ } as never)).toBeDefined();
});

test("Windows: the sidecar beside the ledger under %APPDATA%\\uma\\agent-watchdog is found", async ($, on) => {
	const w = fresh({ env: { APPDATA: "C:\\Users\\t\\AppData\\Roaming", USERPROFILE: "C:\\Users\\t", CC_ROLE: "coder" }, session: "UMACTX02-aaaa" });
	const { files } = setup(on, w);
	const h = $ as unknown as Host;
	await start(h);
	await call($, { tool: "Bash", command: "git commit -m 'x'" });
	// The mock fs keys paths with the drive letter kept as a folder; the sidecar goes beside the ledger the plugin wrote.
	const ledger = [...files.keys()].find((k) => k.endsWith("/uma/agent-watchdog/main/2026-01-05_coder_UMACTX02.jsonl")) as string;
	expect(ledger).toBeDefined();
	files.set(ledger.replace(/\.jsonl$/, ".uma.jsonl"), umaLine(1, "recall", ["01DDDDDDDDDDDDDDDDDDDDDDDD"]));
	const card = await draw(h, ((await run(h, "report")).text) as string);
	expect(await card.find({ type: "Text", text: /🧠 fakty v kontextu: 01DDDDDD/ } as never)).toBeDefined();
	expect(await card.find({ type: "Text", text: /🧠 sezení mělo 1 fakt UMA v kontextu/ } as never)).toBeDefined();
});

test("without a sidecar the report is as it was: no UMA lines", async ($, on) => {
	const w = fresh({ env: { HOME: "/h", CC_ROLE: "coder" }, session: "NOUMA001-aaaa" });
	setup(on, w);
	const h = $ as unknown as Host;
	await start(h);
	await call($, { tool: "Bash", command: "git commit -m 'x'" });
	const card = await draw(h, ((await run(h, "report")).text) as string);
	expect(await card.find({ type: "Text", text: /🧠/ } as never)).toBeUndefined();
});
