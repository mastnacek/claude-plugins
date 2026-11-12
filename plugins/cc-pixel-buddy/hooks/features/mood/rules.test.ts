// The mood table: every rule on its own, in order of priority.

import { expect, test } from "claude-code/testing";
import type { MoodState } from "claude-code";
import type { CallInfo } from "../../shared/classify";
import { step } from "./rules";
import type { Signal } from "./rules";

const call = (over: Partial<CallInfo> = {}): Signal => ({ kind: "call", info: { key: "k", isError: false, isEdit: false, isCommit: false, test: null, ...over } });
const run = (...signals: Signal[]): MoodState => signals.reduce<MoodState | null>((m, s) => step(m, s), null) as MoodState;

test("nothing yet: the default 🙂", () => {
	const m = run({ kind: "turn-end" });
	expect([m.face, m.emoji]).toEqual(["neutral", "🙂"]);
});

test("a passing test or build: 😊 happy; a later failing one takes it back", () => {
	expect(run(call({ test: "pass" })).face).toBe("happy");
	expect(run(call({ test: "pass" }), call({ test: "fail", isError: true })).face).toBe("neutral");
	expect(run(call({ test: "fail", isError: true }), call({ test: "pass" })).face).toBe("happy");
});

test("a run of failing tool calls: 😰 worried from the third, one success calms it", () => {
	const bad = call({ isError: true });
	expect(run(bad, bad).face).toBe("neutral");
	expect(run(bad, bad, bad).face).toBe("worried");
	expect(run(bad, bad, bad, call()).face).toBe("neutral");
});

test("a commit or push that went through: 🎉 until the next turn starts", () => {
	expect(run(call({ isCommit: true })).face).toBe("party");
	expect(run(call({ isCommit: true }), { kind: "turn-end" }).face).toBe("party");
	expect(run(call({ isCommit: true }), { kind: "turn-start" }).face).toBe("thinking");
	expect(run(call({ isCommit: true }), { kind: "turn-start" }, { kind: "turn-end" }).face).toBe("neutral");
});

test("a running turn: 🤔 over everything but sleep; its end gives the face back", () => {
	const bad = call({ isError: true });
	expect(run({ kind: "turn-start" }).face).toBe("thinking");
	expect(run(bad, bad, bad, { kind: "turn-start" }).face).toBe("thinking");
	expect(run(bad, bad, bad, { kind: "turn-start" }, { kind: "turn-end" }).face).toBe("worried");
});

test("idle: 😴 asleep, but never in the middle of a turn; any activity wakes it", () => {
	expect(run({ kind: "idle" }).face).toBe("asleep");
	expect(run({ kind: "turn-start" }, { kind: "idle" }).face).toBe("thinking");
	expect(run({ kind: "idle" }, call()).face).toBe("neutral");
	expect(run({ kind: "idle" }, { kind: "turn-start" }).face).toBe("thinking");
});
