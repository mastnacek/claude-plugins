// Hint rules, pure: when a hint is due, and which one wins.

import { expect, test } from "claude-code/testing";
import type { Hint } from "claude-code";
import type { CallInfo } from "../../shared/classify";
import { BREAK_MS, FRESH, onCall, onContext, onElapsed, replaces } from "./rules";
import type { Memory } from "./rules";

const info = (key: string, over: Partial<CallInfo> = {}): CallInfo => ({ key, isError: false, isEdit: false, isCommit: false, test: null, ...over });
const bad = (key: string): CallInfo => info(key, { isError: true });

function feed(calls: CallInfo[]): { mem: Memory; hints: Hint[] } {
	let mem = FRESH;
	const hints: Hint[] = [];
	for (const c of calls) {
		const v = onCall(mem, c);
		mem = v.mem;
		if (v.hint) hints.push(v.hint);
	}
	return { mem, hints };
}

test("the same command failing 3× in a row: one hint, on the third", () => {
	const { hints } = feed([bad("make"), bad("make"), bad("make"), bad("make"), bad("make")]);
	expect(hints).toHaveLength(1);
	expect(hints[0]).toMatchObject({ id: "repeat", text: "3× stejná chyba — zkus jiný postup", tone: "error" });
});

test("three different failures, or a success in between: no hint", () => {
	expect(feed([bad("a"), bad("b"), bad("c")]).hints).toEqual([]);
	expect(feed([bad("a"), bad("a"), info("ok"), bad("a")]).hints).toEqual([]);
	expect(feed([bad("a"), bad("a"), bad("b"), bad("a")]).hints).toEqual([]);
});

test("a fresh streak after the first one hints again", () => {
	const { hints } = feed([bad("a"), bad("a"), bad("a"), info("ok"), bad("a"), bad("a"), bad("a")]);
	expect(hints).toHaveLength(2);
});

test("a commit that went through congratulates, a failed one does not", () => {
	expect(onCall(FRESH, info("git commit", { isCommit: true })).hint).toMatchObject({ id: "commit", tone: "success" });
	expect(onCall(FRESH, bad("git commit")).hint).toBeUndefined();
});

test("context at 80 % or more: once, again only after it dropped below", () => {
	const a = onContext(FRESH, 79);
	expect(a.hint).toBeUndefined();
	const b = onContext(a.mem, 80);
	expect(b.hint).toMatchObject({ id: "context", text: "kontext 80 % — zvaž /compact", tone: "warning" });
	expect(onContext(b.mem, 91).hint).toBeUndefined();
	const c = onContext(b.mem, 30);
	expect(onContext(c.mem, 85).hint?.text).toBe("kontext 85 % — zvaž /compact");
});

test("no context figure from the engine: no hint", () => {
	expect(onContext(FRESH, undefined).hint).toBeUndefined();
});

test("every 2 hours of the session, once per mark", () => {
	expect(onElapsed(FRESH, BREAK_MS - 1).hint).toBeUndefined();
	const a = onElapsed(FRESH, BREAK_MS);
	expect(a.hint).toMatchObject({ id: "break", text: "2 h práce — dej si pauzu ☕" });
	expect(onElapsed(a.mem, BREAK_MS + 60_000).hint).toBeUndefined();
	expect(onElapsed(a.mem, 2 * BREAK_MS).hint?.text).toBe("4 h práce — dej si pauzu ☕");
});

test("priority: a more important hint replaces, a less important one does not", () => {
	const h = (id: Hint["id"]): Hint => ({ id, text: id, tone: "warning" });
	expect(replaces(null, h("commit"))).toBe(true);
	expect(replaces(h("commit"), h("break"))).toBe(true);
	expect(replaces(h("break"), h("commit"))).toBe(false);
	expect(replaces(h("context"), h("repeat"))).toBe(true);
	expect(replaces(h("repeat"), h("context"))).toBe(false);
});
