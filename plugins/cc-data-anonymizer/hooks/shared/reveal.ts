// reveal.ts — pure: how much of a detected value the person may see on screen.
// The screen only; nothing here feeds the model. Kinds that are names or addresses
// show in full, secrets show first 2 and last 2 characters with stars between.

import type { Register } from "claude-code";

export type Reveal = "partial" | "full" | "none";

/** The `reveal` option; anything but full or none is partial. */
export function revealOf(options: Parameters<Register>[1]): Reveal {
	const value = options.reveal;
	return value === "full" || value === "none" ? value : "partial";
}

const IN_FULL = new Set(["name", "email", "username", "host", "ip"]);
const MAX_SHOWN = 60;

/** First 2 and last 2 characters, stars between, same length; 4 or fewer characters are all stars. */
export function partial(value: string): string {
	const chars = [...value];
	if (chars.length <= 4) return "*".repeat(chars.length);
	return chars.slice(0, 2).join("") + "*".repeat(chars.length - 4) + chars.slice(-2).join("");
}

/** The text to draw for a detected value, or undefined when nothing may be shown. */
export function shown(kind: string, value: string, mode: Reveal): string | undefined {
	if (mode === "none") return undefined;
	const text = (mode === "full" || IN_FULL.has(kind) ? value : partial(value)).replace(/\s+/g, " ");
	return text.length > MAX_SHOWN ? text.slice(0, MAX_SHOWN - 1) + "…" : text;
}
