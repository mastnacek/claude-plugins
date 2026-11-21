// tags.ts — the «REDACTED:kind:n» tags anon issued to this session, and what looks like a tag.
// A tag the model writes back is restored by `anon unmask` only when this session got it from anon:
// a tag it guessed (another project's n) or mangled never reaches a tool.

import { atom, read, update } from "claude-code";
import type { EngineInterface } from "claude-code";

type $ = EngineInterface;

// Declared in each file that touches it: the engine's scan reads the ref where it is used.
const issued = atom({ plugin: "cc-data-anonymizer", key: "issuedTags" } as const, null);

const KEEP = 5000;

const FULL = /«REDACTED:[^\s«»]*:\d+»/gi;
// A real tag has digits for n, in whatever brackets or letter case. A generic form in documentation
// (kind and n as letters or placeholders) is text.
const LIKE = /REDACTED:[A-Za-z_-]+:\d+/i;

/** The tags in anon's masked text. */
export function tagsIn(text: string): string[] {
	return [...text.matchAll(/«REDACTED:[^\s«»]*:\d+»/g)].map((m) => m[0]);
}

/** Remembers the tags of masked text as issued to this session. */
export async function rememberTags($: $, text: string): Promise<void> {
	const found = tagsIn(text);
	if (found.length === 0) return;
	await update($, issued, (all) => [...new Set([...(all ?? []), ...found])].slice(-KEEP));
}

/** The kinds (lower case) of the tags in the texts that this session was issued; a foreign or mangled tag has no kind here. */
export async function issuedKinds($: $, texts: string[]): Promise<Set<string>> {
	const have = new Set((await read($, issued)) ?? []);
	const kinds = new Set<string>();
	for (const text of texts) {
		for (const m of text.matchAll(/«REDACTED:([^\s«»:]*):\d+»/g)) if (have.has(m[0])) kinds.add((m[1] ?? "").toLowerCase());
	}
	return kinds;
}

/** The first full tag in the texts that this session was not given (another letter case is another tag). */
export async function foreignTag($: $, texts: string[]): Promise<string | undefined> {
	const have = new Set((await read($, issued)) ?? []);
	for (const text of texts) {
		for (const m of text.matchAll(FULL)) if (!have.has(m[0])) return m[0];
	}
	return undefined;
}

/** The first tag in the texts (kind and digits, any brackets or letter case). */
export function tagLike(texts: string[]): string | undefined {
	for (const text of texts) {
		const m = LIKE.exec(text);
		if (m) return m[0].slice(0, 60);
	}
	return undefined;
}

export const unknownTagMessage = (tag: string) =>
	`Neznámá nebo poškozená značka ${tag}. Přečti soubor znovu a značku opiš přesně.`;
