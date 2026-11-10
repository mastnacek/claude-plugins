// section.ts — spec/invariants.md as a system-prompt section.

import type { PromptComposeSection } from "claude-code";

/** ~8 kB: invariants are meant to be short (skill rule). */
export const MAX_CHARS = 8000;

export const SECTION_ID = "cc-reverse-spec:invariants";

/** The section for the file's text, or null when there is nothing to inject. */
export function buildSection(text: string): PromptComposeSection | null {
	const body = text.trim();
	if (!body) return null;
	const cut = body.length > MAX_CHARS;
	const shown = cut ? body.slice(0, MAX_CHARS) : body;
	const note = cut ? `\n\n[spec/invariants.md was truncated to ~8 kB — keep invariants short.]` : "";
	return { id: SECTION_ID, text: `# Project invariants (cc-reverse-spec)\n\n${shown}${note}`, scope: "session" };
}
