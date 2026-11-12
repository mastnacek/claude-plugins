// docs-gate through the engine: refused before the docs are read, open after; silent outside a herdr project.

import { expect, test } from "claude-code/testing";
import type { On } from "claude-code";
import { call, fresh, setup, textOf } from "../../shared/world";

type Host = {
	session: { start: (a: never) => Promise<unknown> };
	tool: { call: (a: never) => Promise<Record<string, unknown>> };
	prompt: { compose: (a: never) => Promise<{ sections: Array<{ id: string; text: string }> }> };
};

const PROJECT = { "/work/proj/herdr-plugin.toml": 'id = "a.b"\n' };
const start = ($: Host) => $.session.start({ cwd: "/work/proj", surface: "terminal", isInteractive: true } as never);
const edit = ($: Host, file_path: string) => call($ as never, { tool: "Edit", file_path, old_string: "a", new_string: "b" });

function boot(on: On, over: Parameters<typeof fresh>[0] = {}) {
	return setup(on, fresh({ seed: PROJECT, ...over }));
}

test("an edit of source in a herdr project is refused until the skill's SKILL.md is read", async ($, on) => {
	boot(on);
	await start($ as never);
	const denied = await edit($ as never, "/work/proj/src/main.rs");
	expect(textOf(denied)).toContain("HERDR DOCS BEFORE EDIT");
	expect(denied.deny).toBeDefined();
	await call($ as never, { tool: "Read", file_path: "/home/u/.claude/plugins/cache/x/skills/herdr-plugin-dev/SKILL.md" });
	expect((await edit($ as never, "/work/proj/src/main.rs")).deny).toBeUndefined();
});

for (const open of [
	{ tool: "Read", file_path: "/p/skills/herdr-plugin-dev/references/herdr-plugins.md" },
	{ tool: "Read", file_path: "/work/proj/docs/herdr/herdr-plugins.md" },
	{ tool: "Skill", skill: "herdr-plugin-dev" },
	{ tool: "Skill", skill: "cc-herdr-plugin-dev:herdr-plugin-dev" },
]) {
	test(`the gate opens on ${JSON.stringify(open)}`, async ($, on) => {
		boot(on);
		await start($ as never);
		expect((await edit($ as never, "/work/proj/a.ts")).deny).toBeDefined();
		await call($ as never, open);
		expect((await edit($ as never, "/work/proj/a.ts")).deny).toBeUndefined();
	});
}

test("a plugin reload (session.start again) does not close an opened gate", async ($, on) => {
	boot(on);
	await start($ as never);
	await call($ as never, { tool: "Skill", skill: "herdr-plugin-dev" });
	await start($ as never);
	expect((await edit($ as never, "/work/proj/a.ts")).deny).toBeUndefined();
});

test("other reads do not open it: an unrelated .md, a README of this plugin, another skill", async ($, on) => {
	boot(on);
	await start($ as never);
	await call($ as never, { tool: "Read", file_path: "/work/proj/README.md" });
	await call($ as never, { tool: "Read", file_path: "/home/u/plugins/cc-herdr-plugin-dev/README.md" });
	await call($ as never, { tool: "Skill", skill: "tdd" });
	expect((await edit($ as never, "/work/proj/a.rs")).deny).toBeDefined();
});

test("Write, MultiEdit and NotebookEdit are gated; non-source files and unrelated folders are not", async ($, on) => {
	boot(on);
	await start($ as never);
	expect((await call($ as never, { tool: "Write", file_path: "/work/proj/src/x.rs", content: "" })).deny).toBeDefined();
	expect((await call($ as never, { tool: "MultiEdit", file_path: "/work/proj/src/x.rs", edits: [] })).deny).toBeDefined();
	expect((await call($ as never, { tool: "NotebookEdit", notebook_path: "/work/proj/n.py", new_source: "" })).deny).toBeDefined();
	expect((await edit($ as never, "/work/proj/README.md")).deny).toBeUndefined();
	expect((await edit($ as never, "/work/proj/herdr-plugin.toml")).deny).toBeUndefined();
	expect((await edit($ as never, "/work/proj/node_modules/x/index.js")).deny).toBeUndefined();
	expect((await edit($ as never, "/work/other/src/main.rs")).deny).toBeUndefined();
});

test("outside a herdr project nothing is refused", async ($, on) => {
	boot(on, { cwd: "/work/other", seed: {} });
	await start($ as never);
	expect((await edit($ as never, "/work/other/src/main.rs")).deny).toBeUndefined();
});

test("a nested file finds the manifest in an ancestor; a relative path is read against the session folder", async ($, on) => {
	boot(on);
	await start($ as never);
	expect((await edit($ as never, "/work/proj/src/slices/a/mod.rs")).deny).toBeDefined();
	expect((await edit($ as never, "src/main.rs")).deny).toBeDefined();
});

const COMPOSE = { model: "m", promptModel: "m", surfaces: ["terminal"], tools: [], outputStyle: null, traits: [] } as never;

test("the system prompt gets the rules only when the session's folder is in a herdr project", async ($, on) => {
	on("prompt.compose", () => ({ sections: [{ id: "intro", text: "x", scope: "shared" }] }) as never);
	boot(on);
	const sections = (await ($ as unknown as Host).prompt.compose(COMPOSE)).sections;
	expect(sections.map((s) => s.id)).toEqual(["intro", "cc-herdr-plugin-dev:rules"]);
	expect(sections[1]?.text).toContain("herdr-plugin-dev");
});

test("no rules in the system prompt outside a herdr project", async ($, on) => {
	on("prompt.compose", () => ({ sections: [{ id: "intro", text: "x", scope: "shared" }] }) as never);
	boot(on, { cwd: "/work/other", seed: {} });
	expect((await ($ as unknown as Host).prompt.compose(COMPOSE)).sections.map((s) => s.id)).toEqual(["intro"]);
});
