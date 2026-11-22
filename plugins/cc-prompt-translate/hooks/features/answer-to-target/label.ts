// label.ts — the badge drawn above a translated answer, so the person can see
// the plugin translated it (the model wrote English).

const LABELS: Record<string, string> = {
	czech: "Přeloženo",
	slovak: "Preložené",
	german: "Übersetzt",
	polish: "Przetłumaczono",
};

/**
 * The badge text for `targetLanguage`; English "Translated" for languages without one.
 * U+FE0F asks the terminal for the coloured emoji, not the monochrome glyph.
 */
export function translatedLabel(targetLanguage: string): string {
	return `🌐️ ${LABELS[targetLanguage.trim().toLowerCase()] ?? "Translated"}`;
}
