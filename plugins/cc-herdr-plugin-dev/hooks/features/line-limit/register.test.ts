// line-limit through the engine: over 400 lines is an error (a deny after the edit), 300–400 a warning, other places nothing.

import { expect, test } from "claude-code/testing";
import type { On } from "claude-code";
import { call, fresh, setup } from "../../shared/world";

type Host = { session: { start: (a: never) => Promise<unknown> } };

const lines = (n: number): string => `${Array.from({ length: n }, (_, i) => `line ${i}`).join("\n")}\n`;

/** A session in a herdr project (or not) with the skill already read; `edit` leaves `n` lines in the file. */
async function boot($: Host, on: On, isProject = true) {
	const { files } = setup(on, fresh({ seed: isProject ? { "/work/proj/herdr-plugin.toml": "" } : {}, answer: { result: "edited", text: "The file has been updated." } }));
	await $.session.start({ cwd: "/work/proj", surface: "terminal", isInteractive: true } as never);
	await call($ as never, { tool: "Skill", skill: "herdr-plugin-dev" });
	return async (path: string, n: number) => {
		files.set(path, lines(n));
		return call($ as never, { tool: "Edit", file_path: path, old_string: "a", new_string: "b" });
	};
}

test("401 lines: the result is an error telling to split the file", async ($, on) => {
	const edit = await boot($ as never, on);
	const r = await edit("/work/proj/src/big.rs", 401);
	expect(String(r.deny)).toContain("Line limit exceeded: 401");
	expect(String(r.deny)).toContain("rozděl");
	expect(r.result).toBeUndefined();
});

test("400 lines passes with a warning; 300 starts the warning; 299 is silent", async ($, on) => {
	const edit = await boot($ as never, on);
	const at400 = await edit("/work/proj/src/a.ts", 400);
	expect(at400.isError).toBeUndefined();
	expect(JSON.stringify(at400.context)).toContain("Line length advisory");
	expect(JSON.stringify(at400.context)).toContain("400 řádků");
	expect(JSON.stringify((await edit("/work/proj/src/a.ts", 300)).context)).toContain("300 řádků");
	const at299 = await edit("/work/proj/src/a.ts", 299);
	expect(at299.isError).toBeUndefined();
	expect(at299.context).toBeUndefined();
});

test("outside a herdr project a huge file passes without a word", async ($, on) => {
	const edit = await boot($ as never, on, false);
	const r = await edit("/work/other/src/big.rs", 900);
	expect(r.isError).toBeUndefined();
	expect(r.context).toBeUndefined();
});

test("docs and generated files in a herdr project are exempt", async ($, on) => {
	const edit = await boot($ as never, on);
	for (const path of ["/work/proj/README.md", "/work/proj/node_modules/x/i.js", "/work/proj/target/x.rs", "/work/proj/package-lock.json"]) {
		const r = await edit(path, 900);
		expect(r.isError).toBeUndefined();
		expect(r.context).toBeUndefined();
	}
});
