import { describe, expect, test } from "claude-code/testing";
import { argumentLiterals, commandContext, literalsSurvive, needsTranslation } from "./metadata";

const lit = (hint?: string, description?: string) => argumentLiterals(hint, description);

describe("argumentLiterals", () => {
	test("alternatives joined by | are literals", () => {
		expect([...lit("on | off | status")].sort()).toEqual(["off", "on", "status"]);
		expect([...lit("[on|off]")].sort()).toEqual(["off", "on"]);
	});
	test("a bracketed or angled name is a placeholder, not a literal", () => {
		expect(lit("<lat> <lon>").size).toBe(0);
		expect(lit("[co udělat]").size).toBe(0);
		expect(lit("[what to do]").size).toBe(0);
	});
	test("bare words outside brackets are literals", () => {
		expect([...lit("add <name>")]).toEqual(["add"]);
		expect([...lit("help | model <m> | …")].sort()).toEqual(["help", "model"]);
	});
	test("the description gives alternatives only", () => {
		expect([...lit(undefined, "Switch sound on|off for the session")].sort()).toEqual(["off", "on"]);
		expect(lit(undefined, "Reads text aloud").size).toBe(0);
	});
	test("nothing known", () => {
		expect(lit(undefined, undefined).size).toBe(0);
	});
});

describe("needsTranslation", () => {
	test("known literal alone stays", () => {
		expect(needsTranslation("off", lit("on | off | status"))).toBe(false);
	});
	test("numbers and an unknown plain word stay", () => {
		expect(needsTranslation("location 50.1 14.4", lit("<lat> <lon>"))).toBe(false);
	});
	test("code, paths and flags stay", () => {
		expect(needsTranslation("--force src/app.ts fooBar", lit())).toBe(false);
	});
	test("a Czech sentence is translated", () => {
		expect(needsTranslation("udělej to a to", lit("[co udělat]"))).toBe(true);
		expect(needsTranslation("oprav chybu", lit())).toBe(true);
	});
	test("a literal mixed with Czech is translated", () => {
		expect(needsTranslation("off a vypni zvuk, prosím", lit("on | off"))).toBe(true);
	});
});

describe("literalsSurvive", () => {
	const literals = lit("on | off");
	test("verbatim passes", () => {
		expect(literalsSurvive("off a vypni zvuk", "off and turn the sound off", literals)).toBe(true);
	});
	test("changed case or added punctuation fails", () => {
		expect(literalsSurvive("off a vypni zvuk", "Off. and turn the sound down", literals)).toBe(false);
		expect(literalsSurvive("off a vypni", "Off and turn", literals)).toBe(false);
		expect(literalsSurvive("off a on", "off and off", literals), "a literal dropped").toBe(false);
	});
	test("without literals anything passes", () => {
		expect(literalsSurvive("udělej to", "do it", lit())).toBe(true);
	});
});

test("commandContext names what is known", () => {
	expect(commandContext("x", undefined)).toBe("Command: /x");
	expect(commandContext("x", { description: "d", argumentHint: "[h]" })).toBe("Command: /x\nDescription: d\nArgument hint: [h]");
});
