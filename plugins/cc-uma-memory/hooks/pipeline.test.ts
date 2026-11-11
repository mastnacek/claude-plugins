// /uma claude-memory off --global end to end over an in-memory file system.

import type { On } from "claude-code";
import type { TestBody } from "claude-code/testing";
import { expect, mock, test } from "claude-code/testing";

/** The engine hands the plugin `X:\…` paths on Windows; the files are kept under POSIX keys. */
const norm = (p: string): string => p.replace(/\\/g, "/").replace(/^[A-Za-z]:/, "");

test("/uma claude-memory off --global writes the key, keeps the rest, status says vypnuta", async ($, on) => {
	mock.store(on);
	mock.env(on, { HOME: "/home/t" });
	const files = new Map<string, string>([["/home/t/.claude/settings.json", '{"theme":"dark"}']]);
	on("fs.exists", (_$, e) => ({ value: files.has(norm(e.path)) }));
	on("fs.read", (_$, e) => ({ value: files.get(norm(e.path)) ?? "" }));
	on("fs.write", (_$, e) => {
		files.set(norm(e.path), e.text);
		return { value: undefined };
	});
	on("session.cwd", () => ({ value: "/work" }));
	on("session.start", (_$, e) => ({ cwd: e.cwd }));
	on("command.register", () => ({ value: { command: "uma" } }));
	on("ui.log", () => ({ value: undefined }));
	const statuses: Array<string | undefined> = [];
	on("ui.status", (_$, e) => {
		statuses.push(e.text);
		return { value: undefined };
	});
	// Registered in the test, so it sits beneath the plugin and sees the props after its hook ran.
	let tail: string | undefined;
	on("ui.render", { component: "PromptHint" }, async (_$, e, next) => {
		tail = e.props.tail;
		return next(e);
	});
	const mountHint = () =>
		$.ui.mount({
			plugin: "cc-uma-memory",
			surface: "terminal",
			component: "PromptHint",
			props: { isDraft: false, isWorking: false, hint: "? for shortcuts", tail: "[other]" },
		});

	await $.session.start({ cwd: "/work", surface: "terminal", isInteractive: true });
	expect(statuses).toEqual([undefined]); // only the clean-up of the 0.1.0 line
	await mountHint();
	expect(tail).toBe("[other] [UMA ⚠ CC]");

	const result = await $.command.run({ command: "uma", args: "claude-memory off --global", origin: { kind: "composer" }, presentation: { isFullscreen: false, columns: 80 } });
	expect(JSON.parse(files.get("/home/t/.claude/settings.json") ?? "{}")).toEqual({ theme: "dark", autoMemoryEnabled: false });
	expect(String(JSON.stringify(result))).toContain("vypnuta");
	expect(statuses).toEqual([undefined]);
	await mountHint();
	expect(tail).toContain("[UMA");
	expect(tail).toContain("↻");
	expect(tail?.startsWith("[other] ")).toBe(true);
});

test("a write overridden by another layer says so in the first line", async ($, on) => {
	mock.store(on);
	mock.env(on, { HOME: "/home/t" });
	const files = new Map<string, string>([["/work/.claude/settings.local.json", '{"autoMemoryEnabled": true}']]);
	on("fs.exists", (_$, e) => ({ value: files.has(norm(e.path)) }));
	on("fs.read", (_$, e) => ({ value: files.get(norm(e.path)) ?? "" }));
	on("fs.write", (_$, e) => {
		files.set(norm(e.path), e.text);
		return { value: undefined };
	});
	on("session.cwd", () => ({ value: "/work" }));
	on("ui.status", () => ({ value: undefined }));

	const result = await $.command.run({
		command: "uma",
		args: "claude-memory off --global",
		origin: { kind: "composer" },
		presentation: { isFullscreen: false, columns: 80 },
	});
	const text = JSON.stringify(result);
	expect(text).toContain("přebíjí");
	expect(text).toContain("platí zapnuto");
	expect(text).toContain("/work/.claude/settings.local.json");
});

test("/uma claude-memory is drawn: a status frame with the three paths, a success frame after a change", async ($, on) => {
	mock.store(on);
	mock.env(on, { HOME: "/home/t" });
	const files = new Map<string, string>();
	on("fs.exists", (_$, e) => ({ value: files.has(norm(e.path)) }));
	on("fs.read", (_$, e) => ({ value: files.get(norm(e.path)) ?? "" }));
	on("fs.write", (_$, e) => {
		files.set(norm(e.path), e.text);
		return { value: undefined };
	});
	on("session.cwd", () => ({ value: "/work" }));
	on("session.start", (_$, e) => ({ cwd: e.cwd }));
	on("command.register", () => ({ value: { command: "uma" } }));
	on("ui.log", () => ({ value: undefined }));
	on("ui.status", () => ({ value: undefined }));
	await $.session.start({ cwd: "/work", surface: "terminal", isInteractive: true });
	const draw = async (args: string) => {
		const { text } = (await $.command.run({ command: "uma", args, origin: { kind: "composer" }, presentation: { isFullscreen: false, columns: 80 } })) as { text: string };
		return $.ui.mount({ plugin: "cc-uma-memory", surface: "terminal", component: "CommandOutput", props: { command: "uma", isErrored: false, text } } as never);
	};
	const status = await draw("claude-memory");
	expect((await status.find({ type: "Box" }))?.props).toMatchObject({ borderStyle: "round", borderColor: "claude" });
	expect(await status.find({ type: "Text", text: /🧠 UMA · automatická paměť Claude/ })).toBeDefined();
	expect(await status.find({ type: "Text", text: "/work/.claude/settings.local.json" })).toBeDefined();
	const changed = await draw("claude-memory off");
	expect((await changed.find({ type: "Box" }))?.props.borderColor).toBe("success");
	const bad = await draw("claude-memory maybe");
	expect((await bad.find({ type: "Box" }))?.props.borderColor).toBe("warning");
});

/** `/uma claude-memory off --global` with the given environment; returns the settings files written (POSIX keys). */
async function globalWrite($: Parameters<TestBody>[0], on: On, env: Record<string, string>): Promise<Map<string, string>> {
	mock.store(on);
	mock.env(on, env);
	const files = new Map<string, string>();
	on("fs.exists", (_$, e) => ({ value: files.has(norm(e.path)) }));
	on("fs.read", (_$, e) => ({ value: files.get(norm(e.path)) ?? "" }));
	on("fs.write", (_$, e) => {
		files.set(norm(e.path), e.text);
		return { value: undefined };
	});
	on("session.cwd", () => ({ value: "/work" }));
	on("ui.status", () => ({ value: undefined }));
	await $.command.run({ command: "uma", args: "claude-memory off --global", origin: { kind: "composer" }, presentation: { isFullscreen: false, columns: 80 } });
	return files;
}

test("global settings: HOME gives HOME/.claude/settings.json", async ($, on) => {
	const files = await globalWrite($, on, { HOME: "/home/t", USERPROFILE: "C:/Users/u" });
	expect([...files.keys()]).toEqual(["/home/t/.claude/settings.json"]);
});

test("global settings: without HOME, USERPROFILE/.claude/settings.json", async ($, on) => {
	const files = await globalWrite($, on, { HOME: "", USERPROFILE: "/Users/u" });
	expect([...files.keys()]).toEqual(["/Users/u/.claude/settings.json"]);
});

test("global settings: CLAUDE_CONFIG_DIR wins", async ($, on) => {
	const files = await globalWrite($, on, { HOME: "/home/t", CLAUDE_CONFIG_DIR: "/cfg" });
	expect([...files.keys()]).toEqual(["/cfg/settings.json"]);
});

test("global settings: no home at all writes nothing", async ($, on) => {
	const files = await globalWrite($, on, { HOME: "" });
	expect(files.size).toBe(0);
});
