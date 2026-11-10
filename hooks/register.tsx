// register.tsx — wiring: every hook the mod adds, and the glue between them.
//
// Port of pi-prompt-translate-czk. The pipeline:
//   prompt.submit   the person's prompt → English (+ a hidden note telling the model
//                   to work in English); the original is kept for display
//   turn.complete   the final English answer is translated in the background
//   ui.render       AssistantMessage draws the translation in place of the English
//                   (the stored message, which the model reads, stays English);
//                   UserMessage draws the original prompt above the English one
//   tool.call       AskUserQuestion dialogs are translated before they open
//   command.run     /prompt-translate; a skill's or command's arguments → English

import type { EngineInterface, Register } from "claude-code";
import { atom, read, update } from "claude-code";
import { cachedBalance, cachedUsdToCzkRate, getOpenRouterBalance, getUsdToCzkRate } from "./lib/balance";
import { COMMAND, completions, runCommand } from "./lib/commands";
import { effectiveModel, expireTemporaryModel, getConfig, loadConfig, modelBackend } from "./lib/config";
import { formatCost, formatTokens, shortModelLabel, statusLine } from "./lib/format";
import { detectLanguageOrCode } from "./lib/language";
import { capRecord, textKey } from "./lib/state";
import { collectQuestionFields, formatBlocks, labelsDistinct, parseBlocks } from "./lib/tool-ui";
import { debug, extractRecentContext, hasDeicticReferences, translate, warn } from "./lib/translate";
import { DEFAULT_CONFIG } from "./lib/types";
import type { Badge, OriginalRecord, PendingTranslation, TranslateConfig } from "./lib/types";

// Atoms are declared in every file that reads them (the validator's scan reads literals).
const configAtom = atom({ plugin: "prompt-translate", key: "config" } as const, DEFAULT_CONFIG as TranslateConfig, { shape: "config-1" });
const pendingAtom = atom({ plugin: "prompt-translate", key: "pending" } as const, null as PendingTranslation | null);
const finalsAtom = atom({ plugin: "prompt-translate", key: "finals" } as const, {} as Record<string, string>, { shape: "finals-1" });
const originalsAtom = atom({ plugin: "prompt-translate", key: "originals" } as const, {} as Record<string, OriginalRecord>, { shape: "originals-1" });
const sessionCostAtom = atom({ plugin: "prompt-translate", key: "sessionCostUsd" } as const, 0);
const translatingAtom = atom({ plugin: "prompt-translate", key: "translating" } as const, false);
const badgeAtom = atom({ plugin: "prompt-translate", key: "badge" } as const, null as Badge | null);


type $ = EngineInterface;

const SESSION_INDEX_KEY = "sessions";
const MAX_STORED_SESSIONS = 30;

/** The hidden note the model reads beside a translated prompt. */
function englishOnlyNote(pending: PendingTranslation, translated: boolean): string {
	return [
		"[prompt-translate]",
		translated
			? "The user's prompt above was machine-translated into English from the language they typed in."
			: "The user's prompt above is in English.",
		"Do all work, tool-call arguments, intermediate messages and the final answer in English; this overrides any instruction to answer in another language.",
		pending.translateResponses
			? `The final answer will be translated into ${pending.targetLanguage} for the user automatically, so write it in English.`
			: "Response translation is off: keep the final answer in English.",
	].join(" ");
}

/** The prompt with the hidden note attached, when the person wants it. */
function withNote<E extends { context?: readonly string[] }>(e: E, on: boolean, note: string): E {
	return on ? { ...e, context: [...(e.context ?? []), note] } : e;
}

async function refreshStatus($: $): Promise<void> {
	const [config, sessionCostUsd, translating] = await Promise.all([
		read($, configAtom),
		read($, sessionCostAtom),
		read($, translatingAtom),
	]);
	let currentModel: string | undefined;
	if (effectiveModel(config).setting === "current") currentModel = await $.session.model().catch(() => undefined);
	// Drawn at the end of the hint line (PromptHint), not as a status line:
	// Claude Code heads a mod's status line with the mod's name.
	const indicator = statusLine({
			config,
			sessionCostUsd,
			rate: cachedUsdToCzkRate(),
			balance: modelBackend(effectiveModel(config).setting) === "openrouter" ? cachedBalance() : undefined,
			translating,
			currentModel,
		});
	if (JSON.stringify(await read($, badgeAtom)) !== JSON.stringify(indicator)) await update($, badgeAtom, () => indicator);
}

async function refreshBalance($: $): Promise<void> {
	const config = await getConfig($);
	try {
		await Promise.all([
			getUsdToCzkRate($),
			modelBackend(effectiveModel(config).setting) === "openrouter" ? getOpenRouterBalance($) : undefined,
		]);
	} catch {
		/* best-effort */
	}
	await refreshStatus($);
}

// The translations of a session are kept in $.store too, so a resumed session
// still draws its answers translated.
async function persistSession($: $): Promise<void> {
	try {
		const id = await $.session.id();
		const [finals, originals] = await Promise.all([read($, finalsAtom), read($, originalsAtom)]);
		await $.store.set(`session:${id}`, { finals, originals });
		const index = ((await $.store.get(SESSION_INDEX_KEY)) as string[] | undefined) ?? [];
		const next = [...index.filter((s) => s !== id), id];
		for (const old of next.splice(0, Math.max(0, next.length - MAX_STORED_SESSIONS))) {
			await $.store.delete(`session:${old}`);
		}
		await $.store.set(SESSION_INDEX_KEY, next);
	} catch (error) {
		await debug($, `session persist failed: ${String(error)}`);
	}
}

async function restoreSession($: $): Promise<void> {
	try {
		const id = await $.session.id();
		const saved = (await $.store.get(`session:${id}`)) as
			| { finals?: Record<string, string>; originals?: Record<string, OriginalRecord> }
			| undefined;
		if (!saved) return;
		await update($, finalsAtom, (f) => ({ ...(saved.finals ?? {}), ...f }));
		await update($, originalsAtom, (o) => ({ ...(saved.originals ?? {}), ...o }));
	} catch {
		/* nothing to restore */
	}
}

async function translateAnswer($: $, answer: string, pending: PendingTranslation): Promise<void> {
	await update($, translatingAtom, () => true);
	await refreshStatus($);
	try {
		const result = await translate($, answer, pending.targetLanguage, "answer");
		if (result.degraded) return;
		await update($, finalsAtom, (f) => capRecord({ ...f, [textKey(answer)]: result.text }));
		$.ui.invalidate("ui.render");
		$.ui.toast(`odpověď → ${pending.targetLanguage} ${formatCost(result.costUsd, result.costCzk)}`.trim());
		await persistSession($);
	} catch (error) {
		warn($, `překlad odpovědi selhal, zůstává anglicky: ${error instanceof Error ? error.message : String(error)}`);
	} finally {
		await update($, translatingAtom, () => false);
		await refreshBalance($);
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
	const originals = await read($, originalsAtom);
	if (!prompt || !originals[textKey(prompt.text ?? "")]) return;
	await debug($, "translating an answer a reload cut off");
	await translateAnswer($, answer, { targetLanguage: config.targetLanguage, translateResponses: true });
}

async function askYesNo($: $, question: string, yes: string, no: string, header: string): Promise<boolean | undefined> {
	try {
		const answer = await $.ui.ask(question, { options: [yes, no], header });
		return answer === yes ? true : answer === no ? false : undefined;
	} catch {
		return undefined; // dismissed, or no one to ask
	}
}

function preview(text: string, max = 500): string {
	return text.length > max ? `${text.slice(0, max)}…` : text;
}

export const register: Register = (on) => {
	on("session.start", async ($, e, next) => {
		await $.command.register({
			name: "prompt-translate",
			description: "Překlad promptů do EN a odpovědí zpět (boost, historie, cena v Kč)",
			argumentHint: "help | on | off | model <m> | boost <level> | stats | …",
		});
		const config = await loadConfig($);
		await update($, configAtom, () => config);
		await expireTemporaryModel($);
		await restoreSession($);
		$.ui.status(undefined); // an earlier version pinned a status line
		$.clock.after(0, () => {
			void recoverMissedAnswer($);
		});
		await refreshStatus($);
		void refreshBalance($);
		return next(e);
	});

	on("ui.render", { component: "PromptHint" }, async ($, e, next) => {
		const badge = await read($, badgeAtom);
		if (!badge) return next(e);
		const line = await next(e);
		const { Box, Text } = $.ui.resolve(e);
		const color = badge.level === "critical" ? "error" : badge.level === "low" ? "warning" : "success";
		return (
			<Box flexDirection="row">
				{line}
				<Text>{`  ${badge.flag}`}</Text>
				{badge.credit ? <Text color={color}>{` 💳 ${badge.credit}`}</Text> : null}
			</Box>
		);
	});

	on("session.end", async ($, e, next) => {
		await update($, pendingAtom, () => null);
		return next(e);
	});

	// ---------------------------------------------------------------- prompt → EN
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

		if (config.autodetect && config.boost === "off") {
			const detection = detectLanguageOrCode(source);
			if (detection.isEnglishOrCode) {
				await debug($, `prompt detected as ${detection.reason}; not translated`);
				await update($, pendingAtom, () => pending);
				return next(withNote(e, config.englishNote, englishOnlyNote(pending, false)));
			}
		}

		let conversationContext: string | undefined;
		if (config.historyMode === "always") {
			conversationContext = await extractRecentContext($);
		} else if (config.historyMode === "auto" && hasDeicticReferences(source)) {
			conversationContext = await extractRecentContext($);
			if (conversationContext) await debug($, "reference words detected; attached conversation context");
		} else if (config.historyMode === "ask") {
			const candidate = await extractRecentContext($);
			if (candidate) {
				const attach = await askYesNo(
					$,
					"Připojit k překladu nedávnou historii konverzace?",
					"Ano, připojit",
					"Ne, bez historie",
					"Kontext",
				);
				if (attach) conversationContext = candidate;
			}
		}

		const result = await translate($, source, "English", "prompt", conversationContext);
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
			model: result.model,
			usage: result.usage,
			costUsd: result.costUsd,
			costCzk: result.costCzk,
			conversationContext,
		};
		await update($, originalsAtom, (o) => capRecord({ ...o, [textKey(english)]: record }));
		await update($, pendingAtom, () => pending);
		$.ui.toast(
			`prompt → EN${conversationContext ? " [s historií]" : ""} ${formatCost(result.costUsd, result.costCzk)}`.trim(),
		);
		void persistSession($);
		void refreshBalance($);
		return next(withNote({ ...e, text: english }, config.englishNote, englishOnlyNote(pending, true)));
	});

	// ----------------------------------------------------------- answer → target
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
		const finals = await read($, finalsAtom);
		const translated = finals[textKey(e.props.text)];
		if (!translated) return next(e);
		return next({ ...e, props: { ...e.props, text: translated } });
	});

	on("ui.render", { component: "UserMessage" }, async ($, e, next) => {
		const config = await read($, configAtom);
		if (!config.showOriginal && !config.diff) return next(e);
		const record = (await read($, originalsAtom))[textKey(e.props.text)];
		if (!record || record.source.trim() === record.english.trim()) return next(e);
		// One frame in place of the engine's row: the original and the English
		// as a diff, each in its own colour, with a rule between them.
		const { Box, Text } = $.ui.resolve(e);
		const badges = [
			record.boost !== "off" ? `boost: ${record.boost}` : "",
			record.conversationContext ? "s historií" : "",
		].filter(Boolean);
		const meta = config.diff
			? [formatTokens(record.usage), formatCost(record.costUsd, record.costCzk), shortModelLabel(record.model)]
					.filter(Boolean)
					.join(" · ")
			: "";
		const ruleWidth = Math.max(8, Math.min(100, (e.viewport?.columns ?? 80) - 6));
		return (
			<Box flexDirection="column" borderStyle="round" borderColor="suggestion" paddingX={1}>
				<Box flexDirection="row">
					<Text bold color="suggestion">
						🔄 překlad
					</Text>
					{badges.length > 0 ? <Text color="warning">{` [${badges.join(", ")}]`}</Text> : null}
					{meta ? <Text dimColor>{`  ${meta}`}</Text> : null}
				</Box>
				<Box flexDirection="row" marginTop={1}>
					<Text bold color="diffRemoved">{"- "}</Text>
					<Text color="diffRemoved">{record.source}</Text>
				</Box>
				<Text dimColor>{"─".repeat(ruleWidth)}</Text>
				<Box flexDirection="row">
					<Text bold color="diffAdded">{"+ "}</Text>
					<Text color="diffAdded">{record.english}</Text>
				</Box>
				{config.diff && record.conversationContext ? (
					<Text dimColor>{`\nhistorie:\n${record.conversationContext}`}</Text>
				) : null}
			</Box>
		);
	});

	// ----------------------------------------------------- AskUserQuestion → target
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

	// ----------------------------------------------------------------- commands
	on("command.run", { command: "prompt-translate" }, async ($, e) => {
		const output = await runCommand($, e.args);
		// Logged, not returned: a log row never reaches the model.
		for (let i = 0; i < output.length; i += 1900) $.ui.log(output.slice(i, i + 1900));
		await refreshBalance($);
		return {};
	});

	// A skill's or command's free-text arguments → English (the slash scaffold stays).
	on("command.run", async ($, e, next) => {
		const config = await getConfig($);
		if (!config.enabled || e.command === COMMAND || !e.args.trim()) return next(e);
		if (e.origin.kind !== "composer" && e.origin.kind !== "bridge") return next(e);
		let source: string | undefined;
		try {
			source = (await $.command.list()).find((c) => c.name === e.command)?.source;
		} catch {
			return next(e);
		}
		if (source !== "plugin" && source !== "user") return next(e);
		if (detectLanguageOrCode(e.args).isEnglishOrCode) return next(e);
		const result = await translate($, e.args, "English", "prompt");
		if (result.degraded) return next(e);
		$.ui.toast(`/${e.command} argumenty → EN ${formatCost(result.costUsd, result.costCzk)}`.trim());
		return next({ ...e, args: result.text });
	});

	on("prompt.autocomplete", async ($, e, next) => {
		const mine = completions(e.text, e.token);
		if (mine.length === 0) return next(e);
		const below = await next(e);
		return { ...below, suggestions: [...mine, ...below.suggestions] };
	});
};
