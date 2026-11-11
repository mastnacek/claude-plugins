// The buddy's head drawn from box characters: eyes and mouth per face, two sizes.

import type { Face } from "claude-code";

const PARTS: Record<Face, { eye: string; mouth: string }> = {
	neutral: { eye: "•", mouth: "_" },
	happy: { eye: "^", mouth: "‿" },
	worried: { eye: "o", mouth: "~" },
	party: { eye: "*", mouth: "O" },
	asleep: { eye: "-", mouth: "z" },
	thinking: { eye: "•", mouth: "…" },
};

/** One-line head for the strip: `[•_•]`. */
export function mini(face: Face): string {
	const { eye, mouth } = PARTS[face];
	return `[${eye}${mouth}${eye}]`;
}

/** The big head for the panel, five rows, 13 columns. */
export function big(face: Face): string[] {
	const { eye, mouth } = PARTS[face];
	return [
		"┌───────────┐",
		"│           │",
		`│  ${eye}     ${eye}  │`,
		"│           │",
		`└─────${mouth}─────┘`,
	];
}
