// Mood rules as data: a signal changes the memory, a table of conditions picks the face.

import type { Face, MoodState, Tone } from "claude-code";
import type { CallInfo } from "../../shared/classify";

export type Signal =
	| { kind: "turn-start" }
	| { kind: "turn-end" }
	| { kind: "call"; info: CallInfo }
	| { kind: "idle" };

type Memory = Pick<MoodState, "errorStreak" | "test" | "party" | "working" | "asleep">;

export const WORRY_AT = 3;
export const SLEEP_AFTER_MS = 10 * 60_000;

/** Look of each face: emoji, Czech word, colour. */
export const LOOK: Record<Face, { emoji: string; label: string; tone: Tone }> = {
	neutral: { emoji: "🙂", label: "v klidu", tone: "normal" },
	happy: { emoji: "😊", label: "spokojený", tone: "success" },
	worried: { emoji: "😰", label: "ustaraný", tone: "warning" },
	party: { emoji: "🎉", label: "slaví", tone: "success" },
	asleep: { emoji: "😴", label: "spí", tone: "dim" },
	thinking: { emoji: "🤔", label: "přemýšlí", tone: "normal" },
};

/** First row whose condition holds wins. */
const FACE_RULES: ReadonlyArray<readonly [Face, (m: Memory) => boolean]> = [
	["asleep", (m) => m.asleep],
	["thinking", (m) => m.working],
	["party", (m) => m.party],
	["worried", (m) => m.errorStreak >= WORRY_AT],
	["happy", (m) => m.test === "pass"],
];

export const FRESH: Memory = { errorStreak: 0, test: null, party: false, working: false, asleep: false };

function remember(m: Memory, s: Signal): Memory {
	switch (s.kind) {
		case "turn-start":
			return { ...m, working: true, asleep: false, party: false };
		case "turn-end":
			return { ...m, working: false, asleep: false };
		case "idle":
			return m.working ? m : { ...m, asleep: true };
		case "call":
			return {
				...m,
				asleep: false,
				errorStreak: s.info.isError ? m.errorStreak + 1 : 0,
				test: s.info.test ?? m.test,
				party: m.party || s.info.isCommit,
			};
	}
}

export function step(prev: MoodState | null, s: Signal): MoodState {
	const m = remember(prev ?? FRESH, s);
	const face = FACE_RULES.find(([, when]) => when(m))?.[0] ?? "neutral";
	return { ...m, face, ...LOOK[face] };
}
