// /herdr-plugin through the engine: scaffold, validate, docs, usage; the framed drawing; completion.

import { expect, test } from "claude-code/testing";
import { fresh, setup } from "../../shared/world";
import { completions, nameOf, parseArgs } from "./parse";

type Host = {
	session: { start: (a: never) => Promise<unknown> };
	ui: { mount: (a: never) => Promise<{ find: (a: never) => Promise<{ text?: string; props?: Record<string, unknown> } | undefined> }> };
	command: { run: (a: never) => Promise<{ text?: string }> };
};

const start = ($: Host) => $.session.start({ cwd: "/work", surface: "terminal", isInteractive: true } as never);
const run = ($: Host, args: string) => $.command.run({ command: "herdr-plugin", args, origin: { kind: "composer" }, presentation: { isFullscreen: false, columns: 80 } } as never);
const draw = ($: Host, text: string) => $.ui.mount({ plugin: "cc-herdr-plugin-dev", surface: "terminal", component: "CommandOutput", props: { command: "herdr-plugin", isErrored: false, text } } as never);

test("scaffold: one line for the model, a green frame for the person, the files on disk", async ($, on) => {
	const { files } = setup(on, fresh());
	const h = $ as unknown as Host;
	await start(h);
	const { text } = await run(h, "scaffold rust /work/lab-plugin lab.test");
	expect(text).toBe("kostra rust pluginu lab.test vytvořena v /work/lab-plugin (11 souborů)");
	expect(files.has("/work/lab-plugin/herdr-plugin.toml")).toBe(true);
	expect(files.get("/work/lab-plugin/herdr-plugin.toml")).toContain('name = "Test"');
	const card = await draw(h, text as string);
	expect((await card.find({ type: "Box" } as never))?.props).toMatchObject({ borderStyle: "round", borderColor: "success" });
	expect(await card.find({ type: "Text", text: /^🧩 Herdr · kostra pluginu/ } as never)).toBeDefined();
	expect(await card.find({ type: "Text", text: /herdr plugin link/ } as never)).toBeDefined();
});

test("validate: a valid manifest is green, a broken one red with the faults; the default is the current folder", async ($, on) => {
	setup(on, fresh({ seed: { "/work/good/herdr-plugin.toml": 'id = "a"\nname = "A"\nversion = "1.0.0"\nmin_herdr_version = "0.7.0"\nplatforms = ["linux"]\n', "/work/bad/herdr-plugin.toml": 'id = "a"\n' } }));
	const h = $ as unknown as Host;
	await start(h);
	const good = await run(h, "validate /work/good");
	expect(good.text).toBe("manifest /work/good/herdr-plugin.toml je platný (0 varování)");
	expect((await (await draw(h, good.text as string)).find({ type: "Box" } as never))?.props).toMatchObject({ borderColor: "success" });
	const bad = await run(h, "validate /work/bad");
	expect(bad.text).toContain("3 chyb");
	const card = await draw(h, bad.text as string);
	expect((await card.find({ type: "Box" } as never))?.props).toMatchObject({ borderColor: "error" });
	expect((await card.find({ type: "Text", text: /❌ Missing required top-level field: 'name'/ } as never))?.props).toMatchObject({ color: "error" });
	expect((await run(h, "validate")).text).toContain("Manifest not found at ./herdr-plugin.toml");
});

test("usage for nothing, unknown words and unknown languages; docs points at the skill", async ($, on) => {
	setup(on, fresh());
	const h = $ as unknown as Host;
	await start(h);
	expect((await run(h, "")).text).toContain("Použití: /herdr-plugin");
	expect((await run(h, "scaffold cobol")).text).toContain("Neznámý jazyk „cobol“");
	expect((await run(h, "docs")).text).toContain("skills/herdr-plugin-dev");
});

test("the arguments: defaults, name from the id, completion of subcommands and languages", () => {
	expect(parseArgs("scaffold")).toEqual({ sub: "scaffold", language: "rust", dir: "./my-herdr-plugin", id: "custom.herdr-tool", name: "Herdr Tool" });
	expect(nameOf("lab.test")).toBe("Test");
	expect(completions("/herdr-plugin ", "").map((s) => s.text)).toEqual(["scaffold", "validate", "docs"]);
	expect(completions("/herdr-plugin sc", "sc").map((s) => s.text)).toEqual(["scaffold"]);
	expect(completions("/herdr-plugin scaffold ", "").map((s) => s.text)).toEqual(["rust", "typescript", "bash"]);
	expect(completions("/herdr-plugin scaffold ty", "ty").map((s) => s.text)).toEqual(["typescript"]);
	expect(completions("/watch ", "")).toEqual([]);
});
