// history.ts — whether a prompt's translation gets the recent conversation
// attached, by the `history` setting: off, ask, auto (only when the prompt points
// back with "to", "tohle", "předchozí"…), always.

import type { EngineInterface } from "claude-code";
import { debug } from "../../shared/log";
import { extractRecentContext } from "../../shared/recent-context";
import type { TranslateConfig } from "../../shared/types";
import { askYesNo } from "./ask";

/** Czech words that point back into the conversation, so a pronoun needs context. */
export function hasDeicticReferences(text: string): boolean {
	return /(?<![\p{L}\p{N}_])(to|ten|ta|ti|ty|tento|tato|toto|tyto|tohle|tamto|tamten|taky|také|stejně|stejný|stejnou|druhou|druhý|druhé|další|předchozí|výše|minulý|minulou|minule|stále|pořád)(?![\p{L}\p{N}_])/iu.test(
		text.toLowerCase(),
	);
}

export async function conversationContextFor(
	$: EngineInterface,
	config: TranslateConfig,
	source: string,
): Promise<string | undefined> {
	if (config.historyMode === "always") return extractRecentContext($);
	if (config.historyMode === "auto") {
		if (!hasDeicticReferences(source)) return undefined;
		const context = await extractRecentContext($);
		if (context) await debug($, "reference words detected; attached conversation context");
		return context;
	}
	if (config.historyMode === "ask") {
		const candidate = await extractRecentContext($);
		if (!candidate) return undefined;
		const attach = await askYesNo(
			$,
			"Připojit k překladu nedávnou historii konverzace?",
			"Ano, připojit",
			"Ne, bez historie",
			"Kontext",
		);
		return attach ? candidate : undefined;
	}
	return undefined;
}
