import { expect, test } from "claude-code/testing";
import { addToTail, buildBadge } from "./badge";

test("all four combinations", () => {
	expect(buildBadge(false, false)).toBe("[UMA]");
	expect(buildBadge(true, false)).toBe("[UMA ⚠ CC]");
	expect(buildBadge(false, true)).toBe("[UMA ↻]");
	expect(buildBadge(true, true)).toBe("[UMA ⚠ CC ↻]");
});

test("addToTail keeps another plugin's tail", () => {
	expect(addToTail(undefined, "[UMA]")).toBe("[UMA]");
	expect(addToTail("", "[UMA]")).toBe("[UMA]");
	expect(addToTail("[🇬🇧 46 Kč]", "[UMA]")).toBe("[🇬🇧 46 Kč] [UMA]");
});
