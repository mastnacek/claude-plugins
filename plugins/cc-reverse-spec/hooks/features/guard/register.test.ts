import { expect, test } from "claude-code/testing";

test("migration project: legacy/ write denied, src/ passes", async ($, on) => {
	on("session.cwd", () => ({ value: "/w" }));
	on("fs.stat", () => ({ value: { kind: "dir", size: 0, mtimeMs: 0, isLink: false } }));
	on("tool.call", () => ({ result: {} }));

	const denied = await $.tool.call({ tool: "Write", file_path: "/w/legacy/a.bas", content: "x" });
	expect(denied.deny).toContain("read-only oracle");
	const ok = await $.tool.call({ tool: "Write", file_path: "/w/src/a.py", content: "x" });
	expect(ok.deny).toBeUndefined();
});

test("not a migration project: legacy/ is just a folder", async ($, on) => {
	on("session.cwd", () => ({ value: "/w" }));
	on("fs.stat", () => {
		throw new Error("ENOENT");
	});
	on("tool.call", () => ({ result: {} }));

	const r = await $.tool.call({ tool: "Write", file_path: "/w/legacy/a.bas", content: "x" });
	expect(r.deny).toBeUndefined();
});
