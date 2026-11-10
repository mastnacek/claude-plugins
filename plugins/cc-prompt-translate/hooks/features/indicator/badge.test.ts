import { expect, test } from "claude-code/testing";
import { addToTail, balanceLevel, buildBadge } from "./badge";
import type { TranslateConfig } from "../../shared/types";

const on = { enabled: true } as TranslateConfig;
const off = { enabled: false } as TranslateConfig;

test("credit in crowns, ⚠ only when critical", () => {
	expect(buildBadge(on, { rate: 23, remainingUsd: 2 }, false)).toBe("[🇬🇧 46 Kč]");
	expect(buildBadge(on, { rate: 23, remainingUsd: 10 }, false)).toBe("[🇬🇧 230 Kč]");
	expect(buildBadge(on, { rate: 23, remainingUsd: 0.5 }, false)).toBe("[🇬🇧 ⚠ 12 Kč]");
	expect(buildBadge(on, { remainingUsd: 2.134 }, false)).toBe("[🇬🇧 $2.13]");
});

test("translating, Claude model, off", () => {
	expect(buildBadge(on, { rate: 23, remainingUsd: 2 }, true)).toBe("[🇬🇧 ⟳ překládám…]");
	expect(buildBadge(on, {}, false)).toBe("[🇬🇧]");
	expect(buildBadge(off, { remainingUsd: 2 }, false)).toBeNull();
});

test("levels and tail", () => {
	expect([balanceLevel(1), balanceLevel(3), balanceLevel(3.1)]).toEqual(["critical", "low", "ok"]);
	expect(addToTail(undefined, "[x]")).toBe("[x]");
	expect(addToTail("[a]", "[x]")).toBe("[a] [x]");
});
