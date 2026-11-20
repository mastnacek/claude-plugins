// The manifest rules and the scaffold, without the engine: every scaffolded manifest validates, bad ones list their faults.

import { expect, test } from "claude-code/testing";
import { validateManifest } from "./manifest";
import { LANGUAGES, scaffoldFiles } from "./scaffold";
import { parseToml } from "./toml";

const MIN = `id = "example.test"
name = "Test"
version = "0.1.0"
min_herdr_version = "0.7.0"
platforms = ["linux"]
`;

test("every scaffolded manifest (rust, typescript, bash) is valid, even with a hostile name", () => {
	for (const language of LANGUAGES) {
		for (const name of ["Lab Tool", `Q"uote \\ 'x'`]) {
			const files = scaffoldFiles({ id: "lab.test", name, language, description: "d" });
			expect(files["herdr-plugin.toml"]).toBeDefined();
			expect(validateManifest(files["herdr-plugin.toml"] as string)).toEqual({ errors: [], warnings: [] });
			expect(parseToml(files["herdr-plugin.toml"] as string).name).toBe(name);
		}
	}
});

test("each language brings its own sources", () => {
	expect(Object.keys(scaffoldFiles({ id: "a.b", name: "N", language: "rust" }))).toEqual(expect.arrayContaining(["Cargo.toml", "src/main.rs", "src/shared/client.rs", "src/slices/dashboard/mod.rs"]));
	expect(Object.keys(scaffoldFiles({ id: "a.b", name: "N", language: "typescript" }))).toEqual(expect.arrayContaining(["package.json", "tsconfig.json", "src/index.ts"]));
	expect(Object.keys(scaffoldFiles({ id: "a.b", name: "N", language: "bash" }))).toContain("action.sh");
});

test("a valid minimal manifest passes; a missing platforms is only a warning", () => {
	expect(validateManifest(MIN)).toEqual({ errors: [], warnings: [] });
	const r = validateManifest(MIN.replace(/platforms.*\n/, ""));
	expect(r.errors).toEqual([]);
	expect(r.warnings[0]).toContain("platforms");
});

test("missing fields, a bad id and a bad version are listed", () => {
	expect(validateManifest(`id = "a b/c"\nversion = "x"\n`).errors).toEqual([
		"Missing required top-level field: 'name'",
		"Missing required top-level field: 'min_herdr_version'",
		`Invalid 'id': "a b/c" (letters, digits, '.', ':', '_', '-')`,
		`'version' must be a version like "0.7.0"`,
	]);
});

test("sections: dots in local ids, duplicates, empty argv, bad placement, unknown link action", () => {
	const bad = `${MIN}
[[actions]]
id = "a.b"
title = "T"
command = ["x"]

[[actions]]
id = "ok"
title = "T"
command = []

[[actions]]
id = "ok"
title = "T"
command = ["x"]

[[panes]]
id = "p"
title = "P"
placement = "floating"
width = "wide"
command = ["x"]

[[link_handlers]]
id = "h"
pattern = "^https://x"
action = "nope"
`;
	const { errors } = validateManifest(bad);
	expect(errors).toEqual(
		expect.arrayContaining([
			"[[actions]] #1: invalid id 'a.b' (letters, digits, ':', '_', '-'; no dots)",
			"[[actions]] #2: 'command' must be a non-empty argv array of strings",
			"[[actions]] #3: duplicate id 'ok'",
			"[[panes]] #1: 'placement' must be one of overlay, popup, split, tab, zoomed",
			`[[panes]] #1: 'width' must be a number of cells or a percentage string like "80%"`,
			"[[link_handlers]] #1: 'action' 'nope' is not an action declared in this manifest",
		]),
	);
	expect(errors).toHaveLength(6);
});

test("text that is not TOML is one error with a line number", () => {
	const r = validateManifest(`id = "a"\nthis is not toml\n`);
	expect(r.errors).toEqual(['TOML: line 2: expected "key = value"']);
});

test("the TOML reader: comments, multi-line arrays, literal strings, nested tables, duplicates", () => {
	const t = parseToml(`# c\nid = 'x#y' # tail\nlist = [\n  "a", # one\n  "b",\n]\nn = 2\nok = true\n[t.u]\nk = "v\\u00e9"\n`);
	expect(t).toEqual({ id: "x#y", list: ["a", "b"], n: 2, ok: true, t: { u: { k: "vé" } } });
	expect(() => parseToml(`a = 1\na = 2\n`)).toThrow("duplicate key");
});
