// translate.ts — the deep module for showing English facts to the person in Czech
// (port of pi's slices/translate, over OpenRouter instead of the session's model).
//
// TRANSLATION IS DISPLAY-ONLY. Facts are stored in English, exactly as proposed; the
// reviewer and the output frames see Czech. Nothing here returns a translated text
// to be stored or sent to the model: callers keep the original beside what they show,
// and the text a tool call, a deny reason or a `command.run` result hands the model
// is always the original. If a translated body ever reaches `uma_write`, this module's
// reason for existing is broken.
//
// The interface is two calls: `translateTexts` (a few texts, ONE question to the
// model) and `displayOf` (a proposal's title + body for the approval dialog). Both hide
// the model, the key, the deadline, the segment markers and the session cache, and
// neither throws: a failure is the originals plus a short note saying why. `lang: "en"`
// is "show as stored" — no question is asked at all.

import type { EngineInterface } from "claude-code";
import { complete } from "./openrouter";

type $ = EngineInterface;

export type Lang = "cs" | "en";

/** The model that translates (OpenRouter). Its own constant: the immune model is a different knob. */
export const TRANSLATE_MODEL = "google/gemini-3.5-flash-lite";

/** Deadline of one translation: later than this the original is shown with a note. */
export const TRANSLATE_TIMEOUT_MS = 8000;

/** Room for the translated answer (a fact body, a list of titles). */
const MAX_TOKENS = 3000;

/** At most this many translations are kept for the session (oldest dropped first). */
const CACHE_LIMIT = 300;

/** pi's translate prompt, word for word (slices/translate/prompt.ts). */
export const TRANSLATE_SYSTEM = [
	"You are a translation engine for AI-memory fact records.",
	"Translate the user's Markdown text into Czech.",
	"Preserve exactly: Markdown structure (## / ### headings, lists, blank lines),",
	"code spans and code blocks, file paths, identifiers, ULID identifiers,",
	"tag names (#tag), and technical terms that are commonly used in English.",
	"Translate only the prose.",
	"Return ONLY the translated Markdown — no preamble, no commentary, no code fence around the whole output.",
].join(" ");

/** Added only when several texts travel in one question (the one-question-per-command rule). */
export const SEGMENTS_NOTE = "The text has several parts, each introduced by a line like <<<UMA-1>>>. Keep every such line exactly as it is, in the same order, and translate the text between them.";

const marker = (n: number): string => `<<<UMA-${n}>>>`;

/** What the person is told when the original is shown instead of a translation. */
export const LABEL_TRANSLATED = "🌐 překlad, uloží se anglický originál";
/** The same fact, in a listing (`/uma search|list|read|timeline`): there is nothing to approve there. */
export const LABEL_LISTING = "🌐 přeloženo pro zobrazení, uložený originál je anglicky";
export const noteUnavailable = (why: string): string => `⚠ překlad nedostupný (${why}) — ukázán originál`;

/** The session's translations, by the English text they were made from. */
const cache = new Map<string, string>();

/** For tests: nothing leaks between cases. */
export function resetTranslateCache(): void {
	cache.clear();
}

function remember(original: string, translated: string): void {
	cache.set(original, translated);
	if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
}

/** A failure of the question, in words for the person; never the request, a header or the key. */
export function whyNot(reason: string): string {
	if (reason === "no-key") return "chybí klíč OpenRouteru";
	if (reason === "timeout") return "vypršel čas";
	if (reason === "empty") return "prázdná odpověď";
	if (reason.startsWith("HTTP ")) return `OpenRouter ${reason}`;
	return "chyba spojení";
}

/** The answer split back into the parts that were sent; undefined when the model broke the markers. */
export function splitSegments(answer: string, count: number): string[] | undefined {
	const parts = answer.split(/^[ \t]*<<<UMA-(\d+)>>>[ \t]*$/m);
	if ((parts[0] ?? "").trim() !== "" || parts.length !== 1 + 2 * count) return undefined;
	const out: string[] = [];
	for (let i = 0; i < count; i++) {
		if (parts[1 + 2 * i] !== String(i + 1)) return undefined;
		out.push((parts[2 + 2 * i] ?? "").trim());
	}
	return out.every((t) => t !== "") ? out : undefined;
}

/** Asks the model for the texts not yet cached, in one question; fills the cache. Undefined = done, otherwise why not. */
async function fetchMissing($: $, missing: string[]): Promise<string | undefined> {
	const single = missing.length === 1;
	const user = single ? (missing[0] as string) : missing.map((t, i) => `${marker(i + 1)}\n${t}`).join("\n");
	const answer = await complete($, {
		model: TRANSLATE_MODEL,
		system: single ? TRANSLATE_SYSTEM : `${TRANSLATE_SYSTEM} ${SEGMENTS_NOTE}`,
		user,
		timeoutMs: TRANSLATE_TIMEOUT_MS,
		maxTokens: MAX_TOKENS,
	});
	if (!answer.ok) return whyNot(answer.reason);
	const parts = single ? [answer.text.trim()] : splitSegments(answer.text, missing.length);
	if (parts === undefined) return "překlad nesouhlasí s originálem";
	missing.forEach((original, i) => remember(original, parts[i] as string));
	return undefined;
}

export type Shown = {
	/** One per input, same order: the translation, or the input itself (empty, `lang: "en"`, a failure). */
	texts: string[];
	/** Set only when a translation was wanted and could not be had; the texts are then the originals. */
	note?: string;
	/** At least one text is a translation. */
	translated: boolean;
};

/**
 * The texts as the person should see them. One question for everything not yet in the
 * session cache; `lang: "en"` asks nothing. Never throws.
 */
export async function translateTexts($: $, texts: readonly string[], lang: Lang): Promise<Shown> {
	const originals = [...texts];
	if (lang !== "cs") return { texts: originals, translated: false };
	const wanted = [...new Set(originals.filter((t) => t.trim() !== ""))];
	const missing = wanted.filter((t) => !cache.has(t));
	if (missing.length > 0) {
		let why: string | undefined;
		try {
			why = await fetchMissing($, missing);
		} catch {
			why = "chyba spojení";
		}
		if (why !== undefined) return { texts: originals, note: noteUnavailable(why), translated: false };
	}
	return { texts: originals.map((t) => cache.get(t) ?? t), translated: wanted.length > 0 };
}

/** A proposal's title and body as the approval dialog shows them, and what they were made from. */
export type Display = {
	title: string;
	body: string;
	/** The originals this display was made from: a change of either makes it stale. */
	forTitle: string;
	forBody: string;
	translated: boolean;
	note?: string;
};

/**
 * The dialog's display for the current title and body. `previous` is kept while neither
 * changed (a failed translation is not retried on every redraw of the dialog); after an
 * edit the old translation is dropped and the new text is translated.
 */
export async function displayOf($: $, previous: Display | undefined, title: string, body: string, lang: Lang): Promise<Display> {
	if (previous && previous.forTitle === title && previous.forBody === body) return previous;
	const shown = await translateTexts($, [title, body], lang);
	const display: Display = { title: shown.texts[0] as string, body: shown.texts[1] as string, forTitle: title, forBody: body, translated: shown.translated };
	return shown.note === undefined ? display : { ...display, note: shown.note };
}
