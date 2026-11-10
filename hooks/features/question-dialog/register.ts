// question-dialog — an AskUserQuestion dialog the model opens, shown in the
// person's language. The tool input is rewritten before the dialog draws; all
// fields go through one request as <<<n>>>-marked blocks (./blocks.ts), and any
// breach of that contract leaves the whole dialog as the model wrote it.

import type { On } from "claude-code";
import { getConfig } from "../../shared/config";
import { debug } from "../../shared/log";
import { detectLanguageOrCode } from "../../shared/translation/detect";
import { translate } from "../../shared/translation/translate";
import { collectQuestionFields, formatBlocks, labelsDistinct, parseBlocks } from "./blocks";

export function registerQuestionDialog(on: On): void {
	on("tool.call", { tool: "AskUserQuestion" }, async ($, e, next) => {
		const config = await getConfig($);
		if (!config.enabled || !config.translateToolUi) return next(e);
		const questions = (e as { questions?: unknown }).questions;
		if (!Array.isArray(questions) || questions.length === 0) return next(e);
		const { copy, fields } = collectQuestionFields(questions);
		if (fields.length === 0) return next(e);
		const texts = fields.map((f) => f.get());
		if (texts.every((t) => !detectLanguageOrCode(t).isEnglishOrCode)) return next(e); // already not English
		try {
			const result = await translate($, formatBlocks(texts), config.targetLanguage, "tool");
			if (result.degraded) return next(e);
			const parsed = parseBlocks(result.text, fields.length);
			if (!parsed) {
				await debug($, "AskUserQuestion left untranslated (marker contract broken)");
				return next(e);
			}
			fields.forEach((f, i) => f.set(parsed[i] as string));
			if (!labelsDistinct(copy)) {
				await debug($, "AskUserQuestion left untranslated (labels collided)");
				return next(e);
			}
			return next({ ...e, questions: copy } as typeof e);
		} catch (error) {
			await debug($, `AskUserQuestion left untranslated: ${String(error)}`);
			return next(e);
		}
	});
}
