// answer-to-target — the model's final English answer, drawn in the person's
// language. The stored message stays English, so the model's context is never mixed.
//
//   turn.complete                 starts the translation in the background
//   ui.render AssistantMessage    draws the translation in place of the English
//   session.end                   drops a handoff no turn will finish
//   start                         restores a resumed session's translations and
//                                 translates an answer a reload cut off
//
// Takes `pending` in $.state from the prompt slice: set when this turn's prompt
// was the person's; read and cleared here.

import type { EngineInterface, On } from "claude-code";
import { atom, read, update } from "claude-code";
import { getConfig } from "../../shared/config";
import { debug, warn } from "../../shared/log";
import { withProgress } from "../../shared/progress";
import { archiveField, restoreField } from "../../shared/session-archive";
import { capRecord, textKey } from "../../shared/state";
import { translate } from "../../shared/translation/translate";
import { logEvent } from "../../shared/usage-log";
import type { OriginalRecord, PendingTranslation } from "../../shared/types";
import { canCheck, isAlreadyCzechOrSlovak } from "./already-target";

// Atoms are declared in every file that reads them (the validator's scan reads literals).
const pendingAtom = atom({ plugin: "cc-prompt-translate", key: "pending" } as const, null as PendingTranslation | null);
const finalsAtom = atom({ plugin: "cc-prompt-translate", key: "finals" } as const, {} as Record<string, string>, { shape: "finals-1" });
const originalsAtom = atom({ plugin: "cc-prompt-translate", key: "originals" } as const, {} as Record<string, OriginalRecord>, { shape: "originals-1" });

type $ = EngineInterface;

async function translateAnswer($: $, answer: string, pending: PendingTranslation): Promise<void> {
	// A model told to answer in Czech (Claude Code's `language` setting) already did:
	// a translation would be a paid call returning the same text.
	if (canCheck(pending.targetLanguage) && isAlreadyCzechOrSlovak(answer)) {
		void logEvent($, { kind: "answer", skipped: "already-target", chars: answer.length });
		await debug($, "answer already in the target language; not translated");
		return;
	}
	try {
		const result = await withProgress($, () => translate($, answer, pending.targetLanguage, "answer"));
		if (result.degraded) return;
		await update($, finalsAtom, (f) => capRecord({ ...f, [textKey(answer)]: result.text }));
		$.ui.invalidate("ui.render");
		await archiveField($, "finals", await read($, finalsAtom));
	} catch (error) {
		warn($, `překlad odpovědi selhal, zůstává anglicky: ${error instanceof Error ? error.message : String(error)}`);
	}
}

/**
 * After a reload (or a restart) the background translation of the last answer
 * may have been cut off: the module's timers die with it. If the last answer
 * followed a translated prompt and has no translation yet, translate it now.
 */
async function recoverMissedAnswer($: $): Promise<void> {
	const config = await getConfig($);
	if (!config.enabled || !config.translateResponses) return;
	let messages: Array<{ role?: string; text?: string }>;
	try {
		const got = await $.session.messages();
		if (!Array.isArray(got)) return;
		messages = got as Array<{ role?: string; text?: string }>;
	} catch {
		return;
	}
	const lastAssistant = messages.map((m, i) => ({ m, i })).filter(({ m }) => m.role === "assistant" && (m.text ?? "").trim()).at(-1);
	if (!lastAssistant) return;
	const answer = lastAssistant.m.text ?? "";
	if ((await read($, finalsAtom))[textKey(answer)]) return;
	const prompt = messages.slice(0, lastAssistant.i).filter((m) => m.role === "user" && (m.text ?? "").trim()).at(-1);
	// The prompt slice's record says whether that prompt was a translated one.
	const originals = await read($, originalsAtom);
	if (!prompt || !originals[textKey(prompt.text ?? "")]) return;
	await debug($, "translating an answer a reload cut off");
	await translateAnswer($, answer, { targetLanguage: config.targetLanguage, translateResponses: true });
}

export function registerAnswerToTarget(on: On): void {
	on("turn.complete", async ($, e, next) => {
		if (e.agentId !== undefined) return next(e);
		const pending = await read($, pendingAtom);
		if (!pending) return next(e);
		await update($, pendingAtom, () => null);
		const answer = e.answer;
		if (e.reason !== "answer" || !pending.translateResponses || !answer.trim()) return next(e);
		// Outlives this dispatch: the turn ends now and the translation lands when ready.
		$.clock.after(0, () => {
			void translateAnswer($, answer, pending);
		});
		return next(e);
	});

	on("ui.render", { component: "AssistantMessage" }, async ($, e, next) => {
		if (e.props.isSummary) return next(e);
		const translated = (await read($, finalsAtom))[textKey(e.props.text)];
		if (!translated) return next(e);
		return next({ ...e, props: { ...e.props, text: translated } });
	});

	on("session.end", async ($, e, next) => {
		await update($, pendingAtom, () => null);
		return next(e);
	});
}

/** Session start, run by the root after the configuration is loaded. */
export async function startAnswerToTarget($: EngineInterface): Promise<void> {
	const saved = await restoreField($, "finals");
	if (saved) await update($, finalsAtom, (f) => ({ ...saved, ...f }));
	// After the prompt slice's start (the root runs starts in order), so the
	// originals this reads are restored too.
	$.clock.after(0, () => {
		void recoverMissedAnswer($);
	});
}
