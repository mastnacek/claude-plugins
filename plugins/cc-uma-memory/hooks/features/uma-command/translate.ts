// translate.ts — display translation of the fact views (`/uma search|list|read|timeline`).
//
// DISPLAY ONLY: the titles and the body in the frame's data are shown in Czech; the line the
// model reads (`Result.text`) is returned untouched, and nothing is stored. One question to the
// model per command (shared/translate): all titles, and for `read` the body, travel together.
// A failure leaves the original frame with a dim note saying why.

import type { EngineInterface } from "claude-code";
import { LABEL_TRANSLATED, translateTexts } from "../../shared/translate";
import type { Lang } from "../../shared/translate";
import type { Out, Result } from "./output";

/** What of a frame is prose: the item titles, or the titles and the item's lines (a fact's body). */
export type Prose = "titles" | "titles-body";

type Item = NonNullable<Out["items"]>[number];

/** The result with its items translated for the person; `text` for the model is the original. */
export async function translateResult($: EngineInterface, result: Result, prose: Prose, lang: Lang): Promise<Result> {
	const out = result.out;
	if (lang !== "cs" || !out?.items || out.items.length === 0) return result;
	const withBody = (it: Item): boolean => prose === "titles-body" && (it.lines?.length ?? 0) > 0;
	const parts: string[] = [];
	for (const it of out.items) {
		parts.push(it.title);
		if (withBody(it)) parts.push((it.lines as string[]).join("\n"));
	}
	const shown = await translateTexts($, parts, lang);
	const lines = [...(out.lines ?? [])];
	if (shown.note !== undefined) return { text: result.text, out: { ...out, lines: [...lines, { text: shown.note, tone: "dim" }] } };
	if (!shown.translated) return result;
	let k = 0;
	const items = out.items.map((it): Item => {
		const title = shown.texts[k++] as string;
		if (!withBody(it)) return { ...it, title };
		return { ...it, title, lines: (shown.texts[k++] as string).split("\n") };
	});
	return { text: result.text, out: { ...out, items, lines: [...lines, { text: LABEL_TRANSLATED, tone: "dim" }] } };
}
