import { expect, test } from "claude-code/testing";
import { DEFAULTS, parseStored, recallCommand, writeGateCommand } from "./settings";

test("stored value: junk and missing keys fall back to the defaults", () => {
	expect(parseStored(undefined)).toEqual(DEFAULTS);
	expect(parseStored("x")).toEqual(DEFAULTS);
	expect(parseStored({ recall: "no", writeGate: "maybe" })).toEqual(DEFAULTS);
	expect(parseStored({ recall: false, writeGate: "off" })).toEqual({ recall: false, writeGate: "off" });
});

test("recall: report, switch, refuse", () => {
	expect(recallCommand(DEFAULTS, undefined, 0).text).toContain("zapnut");
	const off = recallCommand(DEFAULTS, "off", 0);
	expect(off.settings).toEqual({ recall: false, writeGate: "ask" });
	expect(recallCommand(off.settings, "on", 0).settings.recall).toBe(true);
	expect(recallCommand(DEFAULTS, "maybe", 0).settings).toEqual(DEFAULTS);
	expect(recallCommand(DEFAULTS, "off", 1).settings).toEqual(DEFAULTS);
});

test("write-gate: report, switch, refuse", () => {
	expect(writeGateCommand(DEFAULTS, undefined, 0).text).toContain("ptát se");
	expect(writeGateCommand(DEFAULTS, "off", 0).settings).toEqual({ recall: true, writeGate: "off" });
	expect(writeGateCommand(DEFAULTS, "on", 0).settings).toEqual(DEFAULTS);
});
