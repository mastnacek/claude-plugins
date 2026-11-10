/**
 * Length guard: a model that silently drops most of the input (a "drop filler"
 * boost instruction swallowing a pasted block) does not report it — the reply is
 * not `finish_reason: length`, it is simply short. A translation is about as
 * long as its source, so a far shorter reply means lost text.
 */
import type { ProtectedSegment } from "../types";

/**
 * Below this many characters of translatable text the ratio says nothing: a
 * short prompt legitimately collapses ("Prosím tě, mohl bys…" → "Please…").
 */
export const MIN_CHECKED_CHARS = 400;

/**
 * Reply shorter than this share of the input counts as lost text. Czech to
 * English shrinks by a fifth or so and boost removes filler; half is far
 * outside that, while the observed failure kept 5 %.
 */
export const MIN_OUTPUT_RATIO = 0.5;

const PLACEHOLDER = /__PI_PROMPT_TRANSLATE_PROTECTED_\d+__/g;

export type LengthVerdict = {
	short: boolean;
	/** Translatable characters in the masked input (placeholders removed). */
	inChars: number;
	/** Translated characters in the reply (protected segments removed). */
	outChars: number;
};

/**
 * Compare what the model actually had to translate with what it returned.
 * Protected segments are removed from both sides, so a huge code block or
 * pasted table neither inflates the input nor props up the output.
 */
export function checkTranslationLength(
	maskedInput: string,
	restoredOutput: string,
	segments: readonly ProtectedSegment[],
): LengthVerdict {
	const inChars = maskedInput.replace(PLACEHOLDER, "").trim().length;
	let bare = restoredOutput;
	for (const segment of segments) bare = bare.split(segment.value).join("");
	const outChars = bare.replace(PLACEHOLDER, "").trim().length;
	return {
		short: inChars >= MIN_CHECKED_CHARS && outChars < inChars * MIN_OUTPUT_RATIO,
		inChars,
		outChars,
	};
}
