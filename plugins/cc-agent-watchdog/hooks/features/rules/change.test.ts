// /watch rule: reading the arguments and patching the project file.

import { expect, test } from "claude-code/testing";
import { parseChange, patchProjectFile, withChange } from "./change";

test("arguments: id (any case), action, --global anywhere", () => {
	expect(parseChange(["w29", "block"])).toEqual({ id: "W29", patch: { mode: "block" }, global: false });
	expect(parseChange(["--global", "W29", "on"])).toEqual({ id: "W29", patch: { enabled: true }, global: true });
	expect(parseChange(["W29", "off"])).toMatchObject({ patch: { enabled: false } });
	for (const bad of [[], ["W29"], ["W29", "loud"], ["W99", "on"], ["W29", "on", "x"]]) expect(parseChange(bad)).toHaveProperty("error");
});

test("instant-failure rules: off only with --global, and with a warning; block only where the call can be judged beforehand", () => {
	expect(parseChange(["W01", "off"])).toHaveProperty("error");
	expect(parseChange(["W01", "off", "--global"])).toMatchObject({ patch: { enabled: false }, global: true, warning: expect.stringContaining("instant failure") });
	expect(parseChange(["W01", "block"])).toMatchObject({ patch: { mode: "block" } });
	expect(parseChange(["W08", "block"])).toHaveProperty("error");
	expect(parseChange(["W14", "block"])).toHaveProperty("error");
});

test("the project file keeps every other key; a new file is created; a broken one is never rewritten", () => {
	const c = { id: "W29", patch: { mode: "block" as const }, global: false };
	const kept = patchProjectFile(JSON.stringify({ gate: ["make check"], profile: ["W29"], rules: { W04: { enabled: false }, W29: { enabled: true } } }), c);
	expect(kept).toHaveProperty("text");
	expect(JSON.parse((kept as { text: string }).text)).toEqual({ gate: ["make check"], profile: ["W29"], rules: { W04: { enabled: false }, W29: { enabled: true, mode: "block" } } });
	expect(JSON.parse((patchProjectFile(undefined, c) as { text: string }).text)).toEqual({ rules: { W29: { mode: "block" } } });
	expect(patchProjectFile("{ nope", c)).toHaveProperty("error");
	expect(patchProjectFile("[1]", c)).toHaveProperty("error");
});

test("global layer: the change merges into the stored one", () => {
	expect(withChange({ W29: { enabled: true } }, { id: "W29", patch: { mode: "block" }, global: true })).toEqual({ W29: { enabled: true, mode: "block" } });
});
