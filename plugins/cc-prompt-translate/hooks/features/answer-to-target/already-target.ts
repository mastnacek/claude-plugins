// already-target.ts — is the model's answer already in Czech or Slovak?
// Then translating it would be a paid call that returns the same text.
//
// One Czech word must not decide it: an English answer often quotes a Czech
// string (`print("Ahoj světe")`, a file name). So code, paths and URLs are left
// out, and the answer counts as Czech only when enough of its words carry
// Czech/Slovak letters — in Czech prose that is roughly every third word or more.

const CZ_SK_LETTERS = /[áäčďéěíĺľňóôŕřšťúůýž]/i;
const MIN_WORDS = 4;
const MIN_SHARE = 0.15;

/** True when the answer is written in Czech or Slovak, not merely quoting it. */
export function isAlreadyCzechOrSlovak(answer: string): boolean {
	const prose = answer
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/`[^`\n]*`/g, " ")
		.replace(/\S*[/\\]\S*/g, " ");
	const words = prose.match(/\p{L}+/gu) ?? [];
	if (words.length < MIN_WORDS) return false;
	const marked = words.filter((w) => CZ_SK_LETTERS.test(w)).length;
	return marked / words.length >= MIN_SHARE;
}

/** Languages this check can recognise; for any other target the answer is always translated. */
export function canCheck(targetLanguage: string): boolean {
	return targetLanguage === "Czech" || targetLanguage === "Slovak";
}
