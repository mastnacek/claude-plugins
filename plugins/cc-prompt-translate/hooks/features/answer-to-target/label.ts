// label.ts — the marker drawn above a translated answer, so the person can see
// the plugin translated it (the model wrote English).

const LABELS: Record<string, string> = {
	czech: "Přeloženo",
	slovak: "Preložené",
	german: "Übersetzt",
	polish: "Przetłumaczono",
};

/** The marker line for `targetLanguage`; English "Translated" for languages without one. */
export function translatedLabel(targetLanguage: string): string {
	return `🌐 *${LABELS[targetLanguage.trim().toLowerCase()] ?? "Translated"}:*`;
}

/** `translation` with the marker on its own line above it. */
export function withLabel(translation: string, targetLanguage: string): string {
	return `${translatedLabel(targetLanguage)}\n\n${translation}`;
}
