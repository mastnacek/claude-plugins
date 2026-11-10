// translate.ts — the deep module every slice translates through. One call,
// translate(), hides request building, the two backends (OpenRouter over
// $.http.fetch, Claude over $.model.complete), retries, segment protection,
// cost and telemetry. A failure never throws: it returns the original text
// flagged `degraded`.

import type { EngineInterface } from "claude-code";
import { atom, update } from "claude-code";
import { effectiveModel, getConfig, modelBackend } from "../config";
import { fmtSmallAmount, getOpenRouterApiKey, getUsdToCzkRate, refreshCredit } from "../credit";
import { debug, warn } from "../log";
import {
	KEEP_TERM_RULE,
	PROMPT_BOOST_SYSTEM_PROMPT,
	PROMPT_MEGA_SYSTEM_PROMPT,
	PROMPT_PLUS_SYSTEM_PROMPT,
	PROMPT_TRANSLATE_SYSTEM_PROMPT,
} from "./prompts";
import {
	cleanTranslationOutput,
	protectFinalAnswerSegments,
	protectPromptSegments,
	restoreProtectedSegments,
	stripKeepTags,
} from "./protect";

import type { Purpose, TranslateConfig, TranslationUsage } from "../types";
import { EMPTY_TELEMETRY } from "../types";
import type { Telemetry } from "../types";

// Atoms are declared in every file that reads them (the validator's scan reads literals).
const sessionCostAtom = atom({ plugin: "prompt-translate", key: "sessionCostUsd" } as const, 0);
const telemetryAtom = atom({ plugin: "prompt-translate", key: "telemetry" } as const, EMPTY_TELEMETRY as Telemetry, { shape: "telemetry-1" });


type $ = EngineInterface;

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const REASONING_HEADROOM = 2048;

export type TranslationResult = {
	text: string;
	usage: TranslationUsage;
	costUsd?: number;
	costCzk?: number;
	model: string;
	/** True when nothing was translated and `text` is the untouched original. */
	degraded?: boolean;
};

type CallResult =
	| { ok: true; text: string; usage: TranslationUsage; truncated: boolean }
	| { ok: false; error: string; status?: number };

const ZERO_USAGE: TranslationUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 };

// ---------------------------------------------------------------------------
// Request context
// ---------------------------------------------------------------------------

function randomHex(bytes = 16): string {
	const buf = new Uint8Array(bytes);
	crypto.getRandomValues(buf);
	return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** A per-request tag: a `</source_text>` inside the prompt cannot close it early. */
export function createSourceTag(): string {
	return `source_text_${randomHex()}`;
}

function escapeForTag(value: string, tag: string): string {
	const names = new Set([tag, "source_text", "translation", "conversation_context"]);
	let escaped = value;
	for (const name of names) {
		escaped = escaped.split(`</${name}>`).join(`&lt;/${name}&gt;`).split(`<${name}>`).join(`&lt;${name}&gt;`);
	}
	return escaped;
}

export function buildUserContent(text: string, tag: string, conversationContext?: string): string {
	const body = escapeForTag(text, tag);
	return conversationContext && conversationContext.trim()
		? `<conversation_context>\n${escapeForTag(conversationContext.trim(), "conversation_context")}\n</conversation_context>\n\n<${tag}>\n${body}\n</${tag}>`
		: `<${tag}>\n${body}\n</${tag}>`;
}

function formatUsage(usage: TranslationUsage, rate?: number): string {
	const cost = usage.costUsd;
	let costText = "";
	if (typeof cost === "number") {
		costText =
			typeof rate === "number" && rate > 0 ? `, cost=${fmtSmallAmount(cost * rate)} Kč` : `, cost=$${cost.toFixed(6)}`;
	}
	return `input=${usage.input}, output=${usage.output}, cacheRead=${usage.cacheRead}, cacheWrite=${usage.cacheWrite}, total=${usage.totalTokens}${costText}`;
}

function estimateMaxTokens(text: string, reasoning: boolean): number {
	const hardCap = reasoning ? 16000 : 8192;
	const estimated = Math.ceil(text.length / 2) + 96 + (reasoning ? REASONING_HEADROOM : 0);
	return Math.max(64, Math.min(hardCap, estimated));
}

function isTransient(error: string, status?: number): boolean {
	if (status !== undefined && (status === 429 || status >= 500)) return true;
	return /(429|overload|rate.?limit|timeout|timed out|temporar|econnreset|etimedout|unavailable|aborted)/i.test(error);
}

function systemPromptFor(purpose: Purpose, config: TranslateConfig, targetLanguage: string, tag: string): string {
	if (purpose === "prompt") {
		const body =
			config.boost === "mega"
				? PROMPT_MEGA_SYSTEM_PROMPT
				: config.boost === "plus"
					? PROMPT_PLUS_SYSTEM_PROMPT
					: config.boost === "boost"
						? PROMPT_BOOST_SYSTEM_PROMPT
						: PROMPT_TRANSLATE_SYSTEM_PROMPT;
		// Kept constant (no per-request tag) so the provider's prompt cache holds it.
		return `${KEEP_TERM_RULE}\n${body}`;
	}
	if (purpose === "tool") {
		return [
			`Translate every block of text to ${targetLanguage}. The blocks are separated by lines of the form <<<n>>>.`,
			"Repeat every <<<n>>> marker exactly once, in the same order, and translate only the text under it.",
			"Output nothing but the markers and their translations: no preamble, no commentary, no numbering of your own.",
			"Keep code, commands, flags, file paths, file names, numbers, markdown and placeholders unchanged.",
		].join("\n");
	}
	return [
		`Translate the text inside <${tag}> to ${targetLanguage}. Output ONLY the translation.`,
		`Do not wrap your output in <${tag}> tags, and do not add commentary.`,
		"Keep code, paths, commands, flags, markdown, URLs, JSON, placeholders, XML-like tags, machine-readable sections, and protected tokens unchanged.",
		"Never alter, translate, remove, or add content inside placeholders like __PI_PROMPT_TRANSLATE_PROTECTED_0__.",
	].join("\n");
}

// ---------------------------------------------------------------------------
// Backends
// ---------------------------------------------------------------------------

async function callOpenRouter(
	$: $,
	setting: string,
	system: string,
	user: string,
	maxTokens: number,
	reasoning: boolean,
): Promise<CallResult> {
	const apiKey = await getOpenRouterApiKey($);
	if (!apiKey) return { ok: false, error: "no OpenRouter key (set OPENROUTER_API_KEY or log in to openrouter in pi)" };
	const model = setting.slice("openrouter/".length);
	const body: Record<string, unknown> = {
		model,
		messages: [
			{ role: "system", content: system },
			{ role: "user", content: user },
		],
		max_tokens: maxTokens,
		usage: { include: true },
	};
	if (reasoning) body.reasoning = { effort: "low", exclude: true };
	const headers: Record<string, string> = {
		Authorization: `Bearer ${apiKey}`,
		"Content-Type": "application/json",
		"HTTP-Referer": "https://github.com/mastnacek/cc-prompt-translate-czk",
		"X-Title": "Claude Code Prompt Translate",
	};
	try {
		const sessionId = await $.session.id();
		if (sessionId) headers["x-session-id"] = sessionId;
	} catch {
		/* sticky routing is an optimisation only */
	}
	let res: Awaited<ReturnType<$["http"]["fetch"]>>;
	try {
		res = await $.http.fetch(OPENROUTER_URL, { method: "POST", headers, body: JSON.stringify(body) });
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : String(error) };
	}
	let data: {
		error?: { message?: string };
		choices?: Array<{ message?: { content?: string | null }; finish_reason?: string | null }>;
		usage?: {
			prompt_tokens?: number;
			completion_tokens?: number;
			total_tokens?: number;
			cost?: number;
			prompt_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
		};
	};
	try {
		data = JSON.parse(res.text);
	} catch {
		return { ok: false, error: `HTTP ${res.status}: ${res.text.slice(0, 200)}`, status: res.status };
	}
	if (!res.ok || data.error) {
		return { ok: false, error: `HTTP ${res.status}: ${data.error?.message ?? res.text.slice(0, 200)}`, status: res.status };
	}
	const choice = data.choices?.[0];
	const u = data.usage ?? {};
	const usage: TranslationUsage = {
		input: u.prompt_tokens ?? 0,
		output: u.completion_tokens ?? 0,
		cacheRead: u.prompt_tokens_details?.cached_tokens ?? 0,
		cacheWrite: u.prompt_tokens_details?.cache_write_tokens ?? 0,
		totalTokens: u.total_tokens ?? (u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0),
		costUsd: typeof u.cost === "number" ? u.cost : undefined,
	};
	const text = choice?.message?.content ?? "";
	if (!text.trim()) {
		if (choice?.finish_reason === "length") return { ok: true, text: "", usage, truncated: true };
		return { ok: false, error: "empty reply" };
	}
	return { ok: true, text, usage, truncated: choice?.finish_reason === "length" };
}

async function callClaude(
	$: $,
	setting: string,
	system: string,
	user: string,
	maxTokens: number,
	reasoning: boolean,
): Promise<CallResult> {
	const model = setting === "current" ? await $.session.model() : setting.replace(/^anthropic\//, "");
	const result = await $.model.complete({
		model,
		system,
		prompt: user,
		maxTokens,
		...(reasoning ? { effort: "low" as const } : {}),
	});
	const usage: TranslationUsage = {
		input: result.usage.input_tokens,
		output: result.usage.output_tokens,
		cacheRead: result.usage.cache_read_input_tokens,
		cacheWrite: result.usage.cache_creation_input_tokens,
		totalTokens: result.usage.input_tokens + result.usage.output_tokens,
	};
	if (result.isAnswered) return { ok: true, text: result.text, usage, truncated: false };
	if (result.reason === "api-error") {
		return { ok: false, error: `api-error ${result.status ?? ""} ${String(result.error)}`.trim(), status: result.status ?? undefined };
	}
	return { ok: false, error: result.reason };
}

function callModel(
	$: $,
	setting: string,
	system: string,
	user: string,
	maxTokens: number,
	reasoning: boolean,
): Promise<CallResult> {
	return modelBackend(setting) === "openrouter"
		? callOpenRouter($, setting, system, user, maxTokens, reasoning)
		: callClaude($, setting, system, user, maxTokens, reasoning);
}

/** One model, with the retries pi's version made: transient, reasoning on/off, truncation. */
async function callWithRetries(
	$: $,
	setting: string,
	system: string,
	user: string,
	payloadText: string,
	reasoningWanted: boolean,
): Promise<CallResult> {
	let reasoning = reasoningWanted;
	const run = () => callModel($, setting, system, user, estimateMaxTokens(payloadText, reasoning), reasoning);
	let response = await run();

	if (!response.ok && isTransient(response.error, response.status)) {
		await debug($, `transient error (${response.error}); retrying once in 1s`);
		await $.clock.sleep(1000);
		response = await run();
	}
	if (!response.ok) {
		const mandatory = /reasoning is mandatory|mandatory.*reasoning|reasoning.*cannot be disabled/i.test(response.error);
		if (mandatory && !reasoning) {
			await debug($, "reasoning mandatory; retrying with thinking on");
			reasoning = true;
			response = await run();
		} else if (reasoning && /thinking|effort|max_?tokens|unsupported|invalid|bad request|400/i.test(response.error)) {
			await debug($, `error with thinking on (${response.error}); retrying without thinking`);
			reasoning = false;
			response = await run();
		}
	}
	// Reasoning shares the output budget; a truncated reply with thinking on gets
	// one more try with the whole budget for the translation.
	if (response.ok && response.truncated && reasoning) {
		await debug($, "translation truncated with thinking on; retrying without thinking");
		reasoning = false;
		response = await run();
	}
	return response;
}

// ---------------------------------------------------------------------------
// translate()
// ---------------------------------------------------------------------------

export async function translate(
	$: $,
	text: string,
	targetLanguage: string,
	purpose: Purpose,
	conversationContext?: string,
): Promise<TranslationResult> {
	const config = await getConfig($);
	const eff = effectiveModel(config).setting;
	const rate = await getUsdToCzkRate($);
	await debug($, `${purpose} translation with ${eff}`);

	const protectedInput = purpose === "prompt" ? protectPromptSegments(text) : protectFinalAnswerSegments(text);

	// Fail closed on placeholders, fail open on the model: the masked text never escapes.
	const degrade = (reason: string, model: string): TranslationResult => {
		warn($, `${reason} — posílám původní text bez překladu`);
		return { text, usage: ZERO_USAGE, model, degraded: true };
	};

	const tag = createSourceTag();
	const system = systemPromptFor(purpose, config, targetLanguage, tag);
	const user = purpose === "tool" ? protectedInput.text : buildUserContent(protectedInput.text, tag, conversationContext);

	let model = eff;
	let response = await callWithRetries($, model, system, user, protectedInput.text, config.translateReasoning);
	// A broken temporary override falls back to the base model.
	if (!response.ok && model !== config.translateModel) {
		warn($, `${model}: ${response.error} — zkouším ${config.translateModel}`);
		model = config.translateModel;
		response = await callWithRetries($, model, system, user, protectedInput.text, config.translateReasoning);
	}
	if (!response.ok) return degrade(`${purpose} translation failed: ${response.error}`, model);
	if (response.truncated) return degrade(`${purpose} translation truncated at maxTokens`, model);

	await debug($, `${purpose} usage: ${formatUsage(response.usage, rate)}`);
	const cleaned = cleanTranslationOutput(response.text.trim(), tag);
	const stats = { appended: 0 };
	const restored = stripKeepTags(restoreProtectedSegments(cleaned, protectedInput.segments, stats));
	if (stats.appended > 3) return degrade(`${purpose} translation dropped ${stats.appended} protected segments`, model);

	const costUsd = response.usage.costUsd;
	const costCzk = typeof costUsd === "number" && typeof rate === "number" && rate > 0 ? costUsd * rate : undefined;
	if (typeof costUsd === "number") await update($, sessionCostAtom, (c) => c + costUsd);

	const backend = modelBackend(model);
	const usage = response.usage;
	await update($, telemetryAtom, (t) => {
		const next = { ...t };
		next.totalRequests++;
		if (purpose === "prompt") next.promptRequests++;
		else if (purpose === "answer") next.answerRequests++;
		else next.toolRequests++;
		if (backend === "openrouter") next.openRouterRequests++;
		else next.claudeRequests++;
		next.inputTokens += usage.input;
		next.outputTokens += usage.output;
		if (usage.cacheRead > 0) {
			next.cachedTokens += usage.cacheRead;
			next.cacheHitTurns++;
			if (purpose !== "tool") next.promptAnswerCacheHits++;
		}
		next.cacheWriteTokens += usage.cacheWrite;
		return next;
	});

	void refreshCredit($); // the call was paid for: the credit shown is stale
	return { text: restored, usage, costUsd, costCzk, model };
}
