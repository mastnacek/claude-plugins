import { expect, test } from "claude-code/testing";
import { addToTail, buildBadge, light } from "./badge";

test("all four combinations", () => {
	expect(buildBadge(false, false)).toBe("[💾 🟢 UMA]");
	expect(buildBadge(true, false)).toBe("[💾 🟡 UMA ⚠ CC]");
	expect(buildBadge(false, true)).toBe("[💾 🟢 UMA ↻]");
	expect(buildBadge(true, true)).toBe("[💾 🟡 UMA ⚠ CC ↻]");
});

test("addToTail keeps another plugin's tail", () => {
	expect(addToTail(undefined, "[💾 🟢 UMA]")).toBe("[💾 🟢 UMA]");
	expect(addToTail("", "[💾 🟢 UMA]")).toBe("[💾 🟢 UMA]");
	expect(addToTail("[🇬🇧 46 Kč]", "[💾 🟢 UMA]")).toBe("[🇬🇧 46 Kč] [💾 🟢 UMA]");
});

test("open blocking debts make the light red and add ⚖N after the other marks", () => {
	expect(buildBadge(false, false, 0)).toBe("[💾 🟢 UMA]");
	expect(buildBadge(false, false, 2)).toBe("[💾 🔴 UMA ⚖2]");
	expect(buildBadge(true, true, 1)).toBe("[💾 🔴 UMA ⚠ CC ↻ ⚖1]");
});

test("waiting drafts make the light yellow and add 📝N last", () => {
	expect(buildBadge(false, false, 0, 0)).toBe("[💾 🟢 UMA]");
	expect(buildBadge(false, false, 0, 3)).toBe("[💾 🟡 UMA 📝3]");
	expect(buildBadge(true, true, 2, 1)).toBe("[💾 🔴 UMA ⚠ CC ↻ ⚖2 📝1]");
});

test("the light: red beats yellow beats green", () => {
	expect(light(false, 0, 0)).toBe("🟢");
	expect(light(true, 0, 0)).toBe("🟡");
	expect(light(false, 0, 1)).toBe("🟡");
	expect(light(true, 1, 1)).toBe("🔴");
	expect(light(false, 3, 0)).toBe("🔴");
});
