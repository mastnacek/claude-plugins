import { expect, test } from "claude-code/testing";

test("a refused command registration does not crash session.start", async ($, on) => {
	const logged: string[] = [];
	on("command.register", () => {
		throw new Error('"/spec-check" refused:\nconflict');
	});
	on("ui.log", (_$, e) => (logged.push(e.text), { value: undefined }));
	on("session.cwd", () => ({ value: "/w" }));
	on("fs.stat", () => {
		throw new Error("ENOENT");
	});
	on("ui.status", () => ({ value: undefined }));
	on("session.start", (_$, e) => ({ cwd: e.cwd }));

	await $.session.start({ cwd: "/w", surface: "terminal", isInteractive: true });
	expect(logged.some((l) => l.startsWith("drift: start failed") && !l.includes("\n"))).toBe(true);
});
