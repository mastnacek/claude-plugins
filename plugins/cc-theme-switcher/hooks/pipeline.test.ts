// The plugin end to end over an in-memory file system, clock and environment:
// session.start writes the theme of the moment, a tick in a new slot rewrites
// it, and /tts off shrinks it to its base. The real ~/.claude is never touched.

import type { On } from "claude-code";
import type { TestBody } from "claude-code/testing";
import { expect, mock, test } from "claude-code/testing";

const HOME = "/home/t";
const THEME_FILE = `${HOME}/.claude/themes/tts.json`;
const SETTINGS_FILE = `${HOME}/.claude/cc-theme-switcher.json`;
const CC_SETTINGS = `${HOME}/.claude/settings.json`;

/** Prague, 12:00 local on 10 Nov 2026: the sun is up. */
const NOON = Date.parse("2026-11-10T11:00:00Z");

/** The engine a test is handed. */
type Engine = Parameters<TestBody>[0];

interface World {
	files: Map<string, string>;
	logs: string[];
	writes: string[];
	reads: string[];
	processes: string[][];
	clock: ReturnType<typeof mock.clock>;
}

/** What the engine does beneath the plugin: files in memory, a clock, an environment, a log. */
function world(on: On, files: Record<string, string> = {}, env: Record<string, string> = {}): World {
	const state: Omit<World, "clock"> = { files: new Map(Object.entries(files)), logs: [], writes: [], reads: [], processes: [] };
	mock.env(on, { HOME, ...env });
	const clock = mock.clock(on, { now: NOON });
	on("fs.exists", (_$, e) => ({
		value: state.files.has(e.path) || [...state.files.keys()].some((p) => p.startsWith(`${e.path}/`)),
	}));
	on("fs.read", (_$, e) => {
		state.reads.push(e.path);
		const text = state.files.get(e.path);
		return text === undefined ? { deny: `ENOENT ${e.path}` } : { value: text };
	});
	on("fs.write", (_$, e) => {
		state.files.set(e.path, e.text);
		state.writes.push(e.path);
		return { value: undefined };
	});
	on("process.run", (_$, e) => {
		state.processes.push([...e.argv]);
		return { value: { exitCode: 0, stdout: "", stderr: "", isStdoutTruncated: false, isStderrTruncated: false } };
	});
	on("ui.log", (_$, e) => {
		state.logs.push(e.text);
		return { value: undefined };
	});
	on("ui.invalidate", () => ({ value: undefined }));
	on("session.cwd", () => ({ value: "/work" }));
	on("session.start", (_$, e) => ({ cwd: e.cwd }));
	on("command.register", () => ({ value: { command: "tts" } }));
	return { ...state, clock };
}

const start = ($: Engine) => $.session.start({ cwd: "/work", surface: "terminal", isInteractive: true });
const theme = (w: World) => JSON.parse(w.files.get(THEME_FILE) ?? "null") as { name: string; base: string; overrides: Record<string, string> } | null;
const tts = ($: Engine, args: string) => $.command.run({ command: "tts", args, origin: { kind: "composer" } } as never);

test("session.start writes the palette of the slot, /tts off leaves only the base", async ($, on) => {
	const w = world(on);
	await start($);

	// Noon in Prague: day → tts-day, a light theme with Solarized colours.
	const written = theme(w);
	expect(written?.name).toBe("tts");
	expect(written?.base).toBe("light");
	expect(written?.overrides.claude).toBe("#268bd2");
	expect(Object.keys(written?.overrides ?? {}).length).toBeGreaterThan(10);
	expect(w.writes.filter((p) => p === THEME_FILE)).toHaveLength(1);

	// The folder was new and the theme is not selected yet: the user is told both.
	expect(w.logs.join("\n")).toContain("vyber v /theme téma tts (jednou restartuj Claude Code)");

	const off = await tts($, "off");
	expect(off.text).toContain("tts: vypnuto");
	expect(theme(w)).toEqual({ name: "tts", base: "light", overrides: {} });
	expect(JSON.parse(w.files.get(SETTINGS_FILE) ?? "{}").enabled).toBe(false);

	// Off, the tick leaves the file alone.
	const before = w.writes.length;
	await w.clock.advance(5 * 60_000);
	expect(w.writes.length).toBe(before);
});

test("the tick writes only when the palette changed", async ($, on) => {
	const w = world(on, { [CC_SETTINGS]: JSON.stringify({ theme: "custom:tts" }) });
	await start($);
	expect(w.logs.join("\n"), "theme already selected: nothing to say").not.toContain("vyber v /theme");
	expect(theme(w)?.base).toBe("light");
	const writesAfterStart = w.writes.length;

	await w.clock.advance(10 * 60_000);
	expect(w.writes.length, "ten idle ticks, no writes").toBe(writesAfterStart);

	// Past sunset the slot turns to dusk: Catppuccin, dark.
	await w.clock.advance(5 * 3_600_000);
	expect(theme(w)?.base).toBe("dark");
	expect(theme(w)?.overrides.claude).toBe("#8aadf4");
});

test("/tts hold, slot and status", async ($, on) => {
	const w = world(on, { [CC_SETTINGS]: JSON.stringify({ theme: "custom:tts" }) });
	await start($);

	const held = await tts($, "hold dark 2h");
	expect(held.text).toContain("hold night");
	expect(theme(w)?.overrides.claude).toBe("#509475"); // tts-osaka-jade
	expect(JSON.parse(w.files.get(SETTINGS_FILE) ?? "{}").hold.slot).toBe("night");

	expect((await tts($, "status")).text).toContain("night (noc) → tts-osaka-jade");
	expect((await tts($, "hold off")).text).toContain("hold zrušen");
	expect(theme(w)?.base).toBe("light");

	expect((await tts($, "slot day tts-dusk")).text).toContain("slot day");
	expect(theme(w)?.overrides.claude).toBe("#8aadf4");
	expect((await tts($, "slot day nope")).text).toContain("Použití");
	expect((await tts($, "hold lunch")).text).toContain("Použití");
	expect((await tts($, "location 95 10")).text).toContain("Použití");
});

test("herdr is not read at all unless asked for; asked for, it follows the palette", async ($, on) => {
	const w = world(on, { [`${HOME}/.config/herdr/config.toml`]: '[ui]\nsidebar_width = 24\n' });
	await start($);
	await w.clock.advance(3 * 60_000);
	expect(w.reads.filter((p) => p.includes("herdr")), "syncHerdr is off by default").toEqual([]);
	expect(w.processes).toEqual([]);

	const on_ = await tts($, "herdr on");
	expect(on_.text).toContain("herdr: on");
	const toml = w.files.get(`${HOME}/.config/herdr/config.toml`) ?? "";
	expect(toml).toContain('name = "solarized-light"');
	expect(toml).toContain('sidebar_width = 24');
	expect(w.processes).toEqual([["herdr", "server", "reload-config"]]);

	// Next tick: nothing changed, no second reload.
	await w.clock.advance(3 * 60_000);
	expect(w.processes).toHaveLength(1);
});

test("a settings file that is not JSON is never overwritten", async ($, on) => {
	const w = world(on, { [SETTINGS_FILE]: "{ not json" });
	await start($);
	expect(w.logs.join("\n")).toContain("nejde přečíst");
	expect(theme(w)?.base, "runs on the defaults").toBe("light");

	const result = await tts($, "off");
	expect(result.text).toContain("nejde přečíst");
	expect(w.files.get(SETTINGS_FILE)).toBe("{ not json");
});
