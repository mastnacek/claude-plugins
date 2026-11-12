// scaffold + manifest through the engine: both tools are registered; a scaffolded project validates; a broken manifest is reported.

import { expect, test } from "claude-code/testing";
import { call, fresh, setup, textOf } from "../../shared/world";
import type { Registered } from "../../shared/world";

type Host = { session: { start: (a: never) => Promise<unknown> } };

const SCAFFOLD = "mcp__cc-herdr-plugin-dev__herdr_scaffold_plugin";
const VALIDATE = "mcp__cc-herdr-plugin-dev__herdr_validate_manifest";
const start = ($: Host) => $.session.start({ cwd: "/work", surface: "terminal", isInteractive: true } as never);

test("both tools are registered with required inputs", async ($, on) => {
	const { registered } = setup(on, fresh());
	await start($ as never);
	const by = (n: string): Registered | undefined => registered.find((r) => r.name === n);
	expect(registered.map((r) => r.name).sort()).toEqual(["herdr_scaffold_plugin", "herdr_validate_manifest"]);
	expect(by("herdr_scaffold_plugin")?.inputSchema).toMatchObject({ required: ["targetDir", "id", "name", "language"] });
	expect(by("herdr_validate_manifest")?.inputSchema).toMatchObject({ required: ["path"] });
});

test("rust, typescript and bash projects are written and their manifests validate", async ($, on) => {
	const { files } = setup(on, fresh());
	await start($ as never);
	for (const language of ["rust", "typescript", "bash"]) {
		const dir = `/work/lab-${language}`;
		const made = textOf(await call($ as never, { tool: SCAFFOLD, targetDir: dir, id: "lab.test", name: "Lab Test", language, description: "x" }));
		expect(made).toContain(`Created herdr plugin 'lab.test' (${language})`);
		expect(files.has(`${dir}/herdr-plugin.toml`)).toBe(true);
		expect(textOf(await call($ as never, { tool: VALIDATE, path: dir }))).toContain("is valid for herdr");
		expect(textOf(await call($ as never, { tool: VALIDATE, path: `${dir}/herdr-plugin.toml` }))).toContain("is valid for herdr");
	}
	expect(files.has("/work/lab-rust/src/slices/dashboard/mod.rs")).toBe(true);
	expect(files.has("/work/lab-typescript/src/index.ts")).toBe(true);
	expect(files.has("/work/lab-bash/action.sh")).toBe(true);
});

test("scaffold refuses an existing manifest and bad input, and writes nothing then", async ($, on) => {
	const { files } = setup(on, fresh({ seed: { "/work/old/herdr-plugin.toml": "keep" } }));
	await start($ as never);
	expect(textOf(await call($ as never, { tool: SCAFFOLD, targetDir: "/work/old", id: "a.b", name: "N", language: "rust" }))).toContain("already exists");
	expect(files.get("/work/old/herdr-plugin.toml")).toBe("keep");
	expect(textOf(await call($ as never, { tool: SCAFFOLD, targetDir: "/work/x", id: "a b", name: "N", language: "rust" }))).toContain("Invalid id");
	expect(textOf(await call($ as never, { tool: SCAFFOLD, targetDir: "/work/x", id: "a.b", name: "N", language: "cobol" }))).toContain("Unknown language");
	expect(textOf(await call($ as never, { tool: SCAFFOLD, id: "a.b", name: "N", language: "rust" }))).toContain("Missing 'targetDir'");
	expect([...files.keys()]).toEqual(["/work/old/herdr-plugin.toml"]);
});

test("validating a broken manifest lists the errors; a missing one says so", async ($, on) => {
	setup(on, fresh({ seed: { "/work/bad/herdr-plugin.toml": 'id = "x"\n', "/work/warn/herdr-plugin.toml": 'id = "x"\nname = "X"\nversion = "1.0.0"\nmin_herdr_version = "0.7.0"\n' } }));
	await start($ as never);
	const bad = textOf(await call($ as never, { tool: VALIDATE, path: "/work/bad" }));
	expect(bad).toContain("failed validation with 3 error(s)");
	for (const f of ["name", "version", "min_herdr_version"]) expect(bad).toContain(`Missing required top-level field: '${f}'`);
	const warn = textOf(await call($ as never, { tool: VALIDATE, path: "/work/warn" }));
	expect(warn).toContain("is valid for herdr");
	expect(warn).toContain("Warnings:");
	expect(textOf(await call($ as never, { tool: VALIDATE, path: "/work/none" }))).toContain("Manifest not found at /work/none/herdr-plugin.toml");
	expect(textOf(await call($ as never, { tool: VALIDATE }))).toContain("Missing 'path'");
});
