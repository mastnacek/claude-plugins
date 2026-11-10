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
	on("ui.invalidate", () => ({ value: undefined }));
	const statuses: Array<string | undefined> = [];
	on("ui.status", (_$, e) => {
		statuses.push(e.text);
		return { value: undefined };
	});

	await $.session.start({ cwd: "/work", surface: "terminal", isInteractive: true });
	expect(statuses.at(-1)).toContain("zapnutá");

	const result = await $.command.run({ command: "uma", args: "claude-memory off --global", origin: { kind: "composer" }, presentation: { isFullscreen: false, columns: 80 } });
	expect(JSON.parse(files.get("/home/t/.claude/settings.json") ?? "{}")).toEqual({ theme: "dark", autoMemoryEnabled: false });
	expect(String(JSON.stringify(result))).toContain("vypnuta");
	expect(statuses.at(-1)).toContain("vypnuta");
	expect(statuses.at(-1)).toContain("platí od příštího sezení");
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
	on("ui.invalidate", () => ({ value: undefined }));

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
