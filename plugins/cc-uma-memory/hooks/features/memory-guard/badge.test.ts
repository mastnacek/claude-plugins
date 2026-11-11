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

test("open blocking debts add ⚖N after the other marks; none leaves the tag as it was", () => {
	expect(buildBadge(false, false, 0)).toBe("[UMA]");
	expect(buildBadge(false, false, 2)).toBe("[UMA ⚖2]");
	expect(buildBadge(true, true, 1)).toBe("[UMA ⚠ CC ↻ ⚖1]");
});
