import { describe, expect, test } from "claude-code/testing";
import { effectiveState, setAutoMemory } from "./settings";

const off = '{"autoMemoryEnabled": false}';
const on = '{"autoMemoryEnabled": true}';

describe("effectiveState", () => {
	test("nikde nedefinováno = zapnuto, výchozí", () => {
		expect(effectiveState({ global: null, project: null, local: null })).toEqual({ enabled: true, source: "výchozí" });
		expect(effectiveState({ global: "{}", project: "{}", local: "{}" })).toEqual({ enabled: true, source: "výchozí" });
	});

	test("jedna vrstva rozhoduje a nese zdroj", () => {
		expect(effectiveState({ global: off, project: null, local: null })).toEqual({ enabled: false, source: "globální" });
		expect(effectiveState({ global: null, project: off, local: null })).toEqual({ enabled: false, source: "projekt" });
		expect(effectiveState({ global: null, project: null, local: off })).toEqual({ enabled: false, source: "lokální" });
	});

	test("poslední definovaná vrstva vyhrává", () => {
		expect(effectiveState({ global: off, project: on, local: null })).toEqual({ enabled: true, source: "projekt" });
		expect(effectiveState({ global: on, project: on, local: off })).toEqual({ enabled: false, source: "lokální" });
	});

	test("null, nebool a nevalidní JSON nedefinují nic", () => {
		expect(effectiveState({ global: off, project: '{"autoMemoryEnabled": null}', local: "{" })).toEqual({
			enabled: false,
			source: "globální",
		});
		expect(effectiveState({ global: off, project: null, local: '{"autoMemoryEnabled": "no"}' }).source).toBe("globální");
	});
});

describe("setAutoMemory", () => {
	test("chybějící soubor začíná od {}", () => {
		expect(setAutoMemory(null, false)).toEqual({ ok: true, text: '{\n  "autoMemoryEnabled": false\n}\n' });
	});

	test("zachová ostatní klíče a pořadí", () => {
		const result = setAutoMemory('{"b":1,"autoMemoryEnabled":true,"a":{"x":[1]}}', false);
		expect(result.ok && result.text).toBe('{\n  "b": 1,\n  "autoMemoryEnabled": false,\n  "a": {\n    "x": [\n      1\n    ]\n  }\n}\n');
	});

	test("nový klíč jde na konec", () => {
		const result = setAutoMemory('{"theme":"dark"}', true);
		expect(result.ok && Object.keys(JSON.parse(result.text) as object)).toEqual(["theme", "autoMemoryEnabled"]);
	});

	test("nevalidní JSON nebo ne-objekt = chyba", () => {
		for (const bad of ["{", "", "[]", "null", "42"]) expect(setAutoMemory(bad, false).ok, bad).toBe(false);
	});
});
