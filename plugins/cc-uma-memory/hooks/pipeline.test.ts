// /uma claude-memory off --global end to end over an in-memory file system.

import { expect, mock, test } from "claude-code/testing";

test("/uma claude-memory off --global writes the key, keeps the rest, status says vypnuta", async ($, on) => {
	mock.store(on);
	mock.env(on, { HOME: "/home/t" });
	const files = new Map<string, string>([["/home/t/.claude/settings.json", '{"theme":"dark"}']]);
	on("fs.exists", (_$, e) => ({ value: files.has(e.path) }));
	on("fs.read", (_$, e) => ({ value: files.get(e.path) ?? "" }));
	on("fs.write", (_$, e) => {
		files.set(e.path, e.text);
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
	on("fs.exists", (_$, e) => ({ value: files.has(e.path) }));
	on("fs.read", (_$, e) => ({ value: files.get(e.path) ?? "" }));
	on("fs.write", (_$, e) => {
		files.set(e.path, e.text);
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
