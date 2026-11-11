import { expect, test } from "claude-code/testing";
import { DEFAULTS, appendCommand, immuneCommand, immuneModelCommand, parseStored, recallCommand, writeGateCommand } from "./settings";

test("stored value: junk and missing keys fall back to the defaults", () => {
	expect(parseStored(undefined)).toEqual(DEFAULTS);
	expect(parseStored("x")).toEqual(DEFAULTS);
	expect(parseStored({ recall: "no", writeGate: "maybe" })).toEqual(DEFAULTS);
	expect(parseStored({ recall: false, writeGate: "off" })).toEqual({ ...DEFAULTS, recall: false, writeGate: "off" });
});

test("recall: report, switch, refuse", () => {
	expect(recallCommand(DEFAULTS, undefined, 0).text).toContain("zapnut");
	const off = recallCommand(DEFAULTS, "off", 0);
	expect(off.settings).toEqual({ ...DEFAULTS, recall: false });
	expect(recallCommand(off.settings, "on", 0).settings.recall).toBe(true);
	expect(recallCommand(DEFAULTS, "maybe", 0).settings).toEqual(DEFAULTS);
	expect(recallCommand(DEFAULTS, "off", 1).settings).toEqual(DEFAULTS);
});

test("write-gate: report, switch, refuse", () => {
	expect(writeGateCommand(DEFAULTS, undefined, 0).text).toContain("ptát se");
	expect(writeGateCommand(DEFAULTS, "off", 0).settings).toEqual({ ...DEFAULTS, writeGate: "off" });
	expect(writeGateCommand(DEFAULTS, "on", 0).settings).toEqual(DEFAULTS);
});

test("append: report, switch, refuse; stored value is read back", () => {
	expect(appendCommand(DEFAULTS, undefined, 0).text).toContain("zapnuta");
	const off = appendCommand(DEFAULTS, "off", 0);
	expect(off.settings.append).toBe(false);
	expect(appendCommand(off.settings, "on", 0).settings.append).toBe(true);
	expect(appendCommand(DEFAULTS, "maybe", 0).settings).toEqual(DEFAULTS);
	expect(parseStored({ append: false }).append).toBe(false);
});

test("immune: default warn, report, switch, refuse; stored value is read back", () => {
	expect(DEFAULTS.immune).toBe("warn");
	expect(immuneCommand(DEFAULTS, undefined, 0).text).toContain("warn");
	for (const mode of ["off", "ask", "auto"] as const) expect(immuneCommand(DEFAULTS, mode, 0).settings.immune).toBe(mode);
	expect(immuneCommand(DEFAULTS, "block", 0).settings).toEqual(DEFAULTS);
	expect(immuneCommand(DEFAULTS, "ask", 1).settings).toEqual(DEFAULTS);
	expect(parseStored({ immune: "ask" }).immune).toBe("ask");
	expect(parseStored({ immune: "block" }).immune).toBe("warn");
});

test("immune-model: default, custom id, junk refused", () => {
	expect(immuneModelCommand(DEFAULTS, undefined, 0).text).toContain("google/gemini-3.5-flash-lite (výchozí)");
	const custom = immuneModelCommand(DEFAULTS, "anthropic/claude-haiku-4.5", 0);
	expect(custom.settings.immuneModel).toBe("anthropic/claude-haiku-4.5");
	expect(immuneModelCommand(custom.settings, "default", 0).settings.immuneModel).toBe("");
	expect(immuneModelCommand(DEFAULTS, "not a model", 0).settings).toEqual(DEFAULTS);
	expect(immuneModelCommand(DEFAULTS, "novendor", 0).settings).toEqual(DEFAULTS);
	expect(parseStored({ immuneModel: "x/y:free" }).immuneModel).toBe("x/y:free");
	expect(parseStored({ immuneModel: "junk" }).immuneModel).toBe("");
});
