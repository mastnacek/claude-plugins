// prompt-to-english — the person's prompt leaves as English; the transcript row
// draws the original and the English as one frame.
//
//   prompt.submit                 Czech (or any) prompt → English, + optional hidden note
//   ui.render UserMessage         the frame: original (-) and English (+), tagged
//   start                         restores the frames of a resumed session
//
// Hands the answer slice `pending` in $.state: "this turn's prompt was the
// person's, translate the answer into <language>".

import type { EngineInterface, On } from "claude-code";
import { atom, read, update } from "claude-code";
import { getConfig } from "../../shared/config";
import { warn, debug } from "../../shared/log";
import { withProgress } from "../../shared/progress";
import { archiveField, restoreField } from "../../shared/session-archive";
import { clip, logEvent } from "../../shared/usage-log";
import { capRecord, textKey } from "../../shared/state";
import { detectLanguageOrCode } from "../../shared/translation/detect";
import { translate } from "../../shared/translation/translate";
import type { OriginalRecord, PendingTranslation } from "../../shared/types";
import { askYesNo } from "./ask";
import { englishOnlyNote, withNote } from "./english-note";
import { conversationContextFor } from "./history";

// Atoms are declared in every file that reads them (the validator's scan reads literals).
const pendingAtom = atom({ plugin: "cc-prompt-translate", key: "pending" } as const, null as PendingTranslation | null);
const originalsAtom = atom({ plugin: "cc-prompt-translate", key: "originals" } as const, {} as Record<string, OriginalRecord>, { shape: "originals-1" });

function preview(text: string, max = 500): string {
	return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function registerPromptToEnglish(on: On): void {
	on("prompt.submit", async ($, e, next) => {
		const config = await getConfig($);
		if (!config.enabled || e.command || e.isMeta) return next(e);
		if (e.origin.kind !== "composer" && e.origin.kind !== "bridge") return next(e);
		if (e.attachments?.some((a) => a.type === "image")) return next(e);
		const source = e.text;
		if (!source.trim() || source.trim().startsWith("/")) return next(e);

		const pending: PendingTranslation = {
			targetLanguage: config.targetLanguage,
			translateResponses: config.translateResponses,
		};

		// Holds with boost on too: an English prompt or plain code is sent as
		// written (no rewrite of what the person wrote in English, no paid call).
		const detection = detectLanguageOrCode(source);
		// Diacritics decide reliably; mistakes happen in ASCII-only text, so only that is kept.
		void logEvent($, {
			kind: "detect",
			reason: detection.reason,
			skipped: detection.isEnglishOrCode,
			...(detection.reason === "diacritics" ? {} : { text: clip(source) }),
		});
		if (detection.isEnglishOrCode) {
			await debug($, `prompt detected as ${detection.reason}; not translated`);
			await update($, pendingAtom, () => pending);
			return next(withNote(e, config.englishNote, englishOnlyNote(pending, false)));
		}

		const conversationContext = await conversationContextFor($, config, source);
		const result = await withProgress($, () => translate($, source, "English", "prompt", conversationContext));
		if (result.degraded) return next(e);
		const english = result.text;

		if (config.confirm) {
			const ok = await askYesNo(
				$,
				`Překlad (EN):\n${preview(english)}\n\nOdeslat tento překlad agentovi?`,
				"Ano, odeslat překlad",
				"Ne, poslat originál",
				"Překlad",
			);
			if (!ok) {
				warn($, "překlad zamítnut; posílám původní text");
				return next(e);
			}
		}

		const record: OriginalRecord = {
			source,
			english,
			boost: config.boost,
			conversationContext,
		};
		await update($, originalsAtom, (o) => capRecord({ ...o, [textKey(english)]: record }));
		await update($, pendingAtom, () => pending);
		void archiveField($, "originals", await read($, originalsAtom));
		return next(withNote({ ...e, text: english }, config.englishNote, englishOnlyNote(pending, true)));
	});

	on("ui.render", { component: "UserMessage" }, async ($, e, next) => {
		const config = await getConfig($);
		if (!config.showOriginal) return next(e);
		const record = (await read($, originalsAtom))[textKey(e.props.text)];
		if (!record || record.source.trim() === record.english.trim()) return next(e);
		// One frame in place of the engine's row: the original and the English
		// as a diff, each in its own colour, with a rule between them.
		const { Box, Text } = $.ui.resolve(e);
		const tags = [
			record.boost !== "off" ? `boost: ${record.boost === "boost" ? "on" : record.boost}` : "",
			record.conversationContext ? "s historií" : "",
		].filter(Boolean);
		const ruleWidth = Math.max(8, Math.min(100, (e.viewport?.columns ?? 80) - 6));
		return (
			<Box flexDirection="column" borderStyle="round" borderColor="suggestion" paddingX={1}>
				{/* Tags only: cost and model are in /prompt-translate stats. One Text of
				    nested spans wraps as one paragraph in a narrow frame. */}
				<Text>
					<Text bold color="suggestion">
						🔄 překlad
					</Text>
					{tags.length > 0 ? <Text color="warning">{` [${tags.join(", ")}]`}</Text> : null}
				</Text>
				<Box flexDirection="row" marginTop={1}>
					<Text bold color="diffRemoved">{"- "}</Text>
					<Text color="diffRemoved">{record.source}</Text>
				</Box>
				<Text dimColor>{"─".repeat(ruleWidth)}</Text>
				<Box flexDirection="row">
					<Text bold color="diffAdded">{"+ "}</Text>
					<Text color="diffAdded">{record.english}</Text>
				</Box>
				{record.conversationContext ? (
					<Text dimColor>{`\nhistorie:\n${record.conversationContext}`}</Text>
				) : null}
			</Box>
		);
	});
}

/** Session start, run by the root after the configuration is loaded. */
export async function startPromptToEnglish($: EngineInterface): Promise<void> {
	const saved = await restoreField($, "originals");
	if (saved) await update($, originalsAtom, (o) => ({ ...saved, ...o }));
}
