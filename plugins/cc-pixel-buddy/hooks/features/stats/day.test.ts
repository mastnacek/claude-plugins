// Day statistics, pure.

import { expect, test } from "claude-code/testing";
import type { CallInfo } from "../../shared/classify";
import { count, dayKey, emptyDay, onDay, parseStored } from "./day";

const info = (over: Partial<CallInfo>): CallInfo => ({ key: "k", isError: false, isEdit: false, isCommit: false, test: null, ...over });

test("the day key is the local date", () => {
	expect(dayKey(new Date(2026, 0, 5, 23, 59).getTime())).toBe("2026-01-05");
	expect(dayKey(new Date(2026, 0, 6, 0, 1).getTime())).toBe("2026-01-06");
});

test("counting: turns, errors, edits, commits, tests green and red", () => {
	let s = emptyDay("2026-01-05");
	s = count(s, { kind: "turn" });
	s = count(s, { kind: "call", info: info({ isError: true }) });
	s = count(s, { kind: "call", info: info({ isEdit: true }) });
	s = count(s, { kind: "call", info: info({ isCommit: true }) });
	s = count(s, { kind: "call", info: info({ test: "pass" }) });
	s = count(s, { kind: "call", info: info({ test: "fail", isError: true }) });
	expect(s).toEqual({ day: "2026-01-05", turns: 1, toolErrors: 2, edits: 1, commits: 1, testsPass: 1, testsFail: 1 });
});

test("a new day is a new record", () => {
	const old = { ...emptyDay("2026-01-05"), turns: 9 };
	expect(onDay(old, "2026-01-05")).toBe(old);
	expect(onDay(old, "2026-01-06")).toEqual(emptyDay("2026-01-06"));
});

test("the store: today's record is read, another day or junk is a fresh day", () => {
	const today = "2026-01-05";
	expect(parseStored({ ...emptyDay(today), turns: 4, edits: 2 }, today)).toEqual({ ...emptyDay(today), turns: 4, edits: 2 });
	expect(parseStored({ ...emptyDay("2026-01-04"), turns: 4 }, today)).toEqual(emptyDay(today));
	for (const junk of [undefined, null, "x", 7, []]) expect(parseStored(junk, today)).toEqual(emptyDay(today));
});

test("an old shape of the stored record: missing or bad counters become 0, good ones stay", () => {
	const today = "2026-01-05";
	expect(parseStored({ day: today, turns: 3, edits: "many", commits: -1, testsPass: 2.7, extra: true }, today)).toEqual({ ...emptyDay(today), turns: 3, testsPass: 2 });
});
