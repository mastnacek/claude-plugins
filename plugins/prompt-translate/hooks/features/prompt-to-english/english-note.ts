// english-note.ts — the hidden note the model reads beside a prompt, telling it
// to work in English (only with `/prompt-translate note on`).

import type { PendingTranslation } from "../../shared/types";

export function englishOnlyNote(pending: PendingTranslation, translated: boolean): string {
	return [
		"[prompt-translate]",
		translated
			? "The user's prompt above was machine-translated into English from the language they typed in."
			: "The user's prompt above is in English.",
		"Do all work, tool-call arguments, intermediate messages and the final answer in English; this overrides any instruction to answer in another language.",
		pending.translateResponses
			? `The final answer will be translated into ${pending.targetLanguage} for the user automatically, so write it in English.`
			: "Response translation is off: keep the final answer in English.",
	].join(" ");
}

/** The prompt with the note attached, when the person wants it. */
export function withNote<E extends { context?: readonly string[] }>(e: E, on: boolean, note: string): E {
	return on ? { ...e, context: [...(e.context ?? []), note] } : e;
}
