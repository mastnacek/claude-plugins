import { expect, test } from "claude-code/testing";

test("file tools and Bash: record writes denied, the rest passes", async ($, on) => {
	on("tool.call", () => ({ result: {} }));
	const deny = "jen `spai`";
	expect((await $.tool.call({ tool: "Write", file_path: "/w/docs/spai/a.md", content: "x" })).deny).toContain(deny);
	expect((await $.tool.call({ tool: "Edit", file_path: "D:\\w\\docs\\spai\\a.md", old_string: "a", new_string: "b" })).deny).toContain(deny);
	expect((await $.tool.call({ tool: "Bash", command: "echo x > docs/spai/a.md" })).deny).toContain(deny);
	expect((await $.tool.call({ tool: "Write", file_path: "/w/src/a.md", content: "x" })).deny).toBeUndefined();
	expect((await $.tool.call({ tool: "Bash", command: "cat docs/spai/a.md" })).deny).toBeUndefined();
});
