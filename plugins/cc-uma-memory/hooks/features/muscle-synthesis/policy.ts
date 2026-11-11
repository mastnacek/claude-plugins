// policy.ts — pure logic of muscle synthesis (port of pi's slices/muscle/policy.ts,
// Proposal 05): detection of a repeated command sequence and the draft proposed for it.
// The worker may only PROPOSE: a repetition becomes a staged draft; turning it into a
// runnable routine is the person's act in `/uma review`.

/** A normalized command: "cmd first-arg" (shape, not exact values). */
export type NormalizedCommand = string;

/** Commands that never belong in a routine (interactive / one-off / destructive). */
const EXCLUDED = new Set([
	"git push",
	"git pull",
	"git reset",
	"git rebase",
	"git checkout",
	"rm",
	"rmdir",
	"del",
	"sudo",
	"npm publish",
	"cargo publish",
	"pi install",
]);

/** Normalizes a raw command line to its repeatable shape. */
export function normalizeCommand(raw: string): string | undefined {
	// A routine step is ONE command with arguments. A compound line
	// (`cd "core" && cargo test`, `a; b`, `a | b`) cannot be one: it became a
	// step running `cd` with `&&` among its arguments (live finding).
	if (/&&|\|\||[;|]/.test(raw)) return undefined;
	const tokens = raw.trim().split(/\s+/).filter(Boolean);
	if (tokens.length === 0) return undefined;
	const shape = tokens.slice(0, 2).join(" ").toLowerCase();
	if (EXCLUDED.has(shape) || EXCLUDED.has((tokens[0] ?? "").toLowerCase())) return undefined;
	return shape;
}

/** Routine-name slug from a sequence: kebab-case of the distinct words,
 *  letters and digits only (`node --version` → `node-version`, never
 *  `node---version` or a quoted `"core"`). */
export function routineName(sequence: NormalizedCommand[]): string {
	const words: string[] = [];
	for (const cmd of sequence) {
		for (const raw of cmd.split(/\s+/)) {
			const word = raw.toLowerCase().replace(/[^a-z0-9]+/g, "");
			if (word && !words.includes(word)) words.push(word);
		}
	}
	return words.slice(0, 3).join("-");
}

export interface RepetitionHit {
	sequence: NormalizedCommand[];
	occurrences: number;
	name: string;
	/** The raw command lines of the last occurrence (for the proposal body). */
	rawLines: string[];
}

/**
 * Finds the FIRST repeated 3-step subsequence in the recent history.
 * Occurrences must be non-overlapping; 2 occurrences of the same shape count.
 */
export function detectRepeatedSequence(
	history: NormalizedCommand[],
	rawLines: string[],
	window = 30,
	minLength = 3,
	minOccurrences = 2,
): RepetitionHit | undefined {
	const recent = history.slice(-window);
	const recentRaw = rawLines.slice(-window);

	for (let start = 0; start + minLength <= recent.length; start++) {
		const candidate = recent.slice(start, start + minLength);
		if (candidate.every((c) => c === candidate[0])) continue; // same command thrice is not a sequence

		let occurrences = 0;
		let consumed = -1;
		const occurrenceStarts: number[] = [];
		for (let i = 0; i + minLength <= recent.length; i++) {
			if (i <= consumed) continue;
			if (recent.slice(i, i + minLength).join("→") === candidate.join("→")) {
				occurrences += 1;
				occurrenceStarts.push(i);
				consumed = i + minLength - 1;
			}
		}

		if (occurrences >= minOccurrences) {
			const raw = occurrenceStarts
				.flatMap((s) => recentRaw.slice(s, s + minLength))
				.filter(Boolean);
			return {
				sequence: candidate,
				occurrences,
				name: routineName(candidate),
				rawLines: raw,
			};
		}
	}
	return undefined;
}

/** Builds the staged-proposal payload for a detected repetition. */
export function buildRoutineProposal(hit: RepetitionHit): {
	title: string;
	body: string;
	template: string;
	tags: string[];
} {
	const steps = hit.rawLines
		.slice(-hit.sequence.length * hit.occurrences)
		.slice(0, hit.sequence.length)
		.map((line) => {
			const tokens = line.trim().split(/\s+/).filter(Boolean);
			return { command: tokens[0], args: tokens.slice(1), label: line.trim().slice(0, 60) };
		});

	const title = `muscle:${hit.name}`;
	const body =
		`### Context\nThe same ${hit.sequence.length}-command sequence was observed ` +
		`${hit.occurrences}× in this session (shadow-worker repetition detection).\n\n` +
		`### Steps\n${hit.rawLines.map((l) => `- ${l}`).join("\n")}\n\n` +
		`### Rule\nRun the sequence as one motor chunk with \`uma muscle run ${hit.name} --confirm\`.`;

	return {
		title,
		body,
		template: JSON.stringify(steps),
		tags: ["muscle", "routine", "routine-proposal", "shadow-worker"],
	};
}

/** Rolling window of successful Bash commands kept per session. */
export const HISTORY_LIMIT = 40;

/** The memory of this session's commands: normalized shapes, the raw lines beside them, the sequences already proposed. */
export type History = { shapes: string[]; raw: string[]; proposed: string[] };

/** The history with one more command, cut to the window. */
export function pushCommand(history: History, shape: string, raw: string): History {
	return {
		...history,
		shapes: [...history.shapes, shape].slice(-HISTORY_LIMIT),
		raw: [...history.raw, raw.trim()].slice(-HISTORY_LIMIT),
	};
}

/** `uma staging create` for a routine proposal: a `skill` draft carrying the step template, never `uma muscle new`. */
export function createArgv(proposal: { title: string; body: string; template: string; tags: string[] }): string[] {
	return [
		"uma", "staging", "create",
		"--type", "skill",
		"--title", proposal.title,
		"--body", proposal.body,
		"--template", proposal.template,
		"--trigger", "muscle_synthesis",
		"--confidence", "0.8",
		"--tags", proposal.tags.join(","),
	];
}

/** The line shown once a proposal is staged. */
export const stagedLine = (name: string): string => `💪 Detekována opakovaná sekvence příkazů — návrh rutiny čeká na /uma review (${name})`;
