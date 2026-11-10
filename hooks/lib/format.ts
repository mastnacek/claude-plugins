// format.ts — pure presentation helpers: money, usage, model labels, help text,
// the status line. Plain text: the status line and log rows draw no ANSI colour.

import { effectiveModel } from "./config";
import type { Badge, BalanceInfo, Telemetry, TranslateConfig, TranslationUsage } from "./types";

// Show real amounts even when tiny: 0.000022 USD, 0.000468 Kč — never collapse to 0.000.
export function fmtSmallAmount(n: number): string {
	if (!Number.isFinite(n)) return "n/a";
	if (n === 0) return "0";
	const abs = Math.abs(n);
	const decimals = abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
	return n.toFixed(decimals);
}

export function formatCost(costUsd?: number, costCzk?: number): string {
	if (typeof costCzk === "number") return `(${fmtSmallAmount(costCzk)} Kč)`;
	if (typeof costUsd === "number") return `($${fmtSmallAmount(costUsd)})`;
	return "";
}

export function formatUsage(usage: TranslationUsage, rate?: number): string {
	const cost = usage.costUsd;
	let costText = "";
	if (typeof cost === "number") {
		costText =
			typeof rate === "number" && rate > 0 ? `, cost=${fmtSmallAmount(cost * rate)} Kč` : `, cost=$${cost.toFixed(6)}`;
	}
	return `input=${usage.input}, output=${usage.output}, cacheRead=${usage.cacheRead}, cacheWrite=${usage.cacheWrite}, total=${usage.totalTokens}${costText}`;
}

export function formatTokens(usage?: TranslationUsage): string {
	return usage ? `${usage.totalTokens} tok (in: ${usage.input}, out: ${usage.output})` : "";
}

const PROVIDER_SHORT_CODES: Record<string, string> = {
	openrouter: "OR",
	google: "G",
	anthropic: "A",
	openai: "OAI",
	deepseek: "DS",
	mistral: "M",
};

// "openrouter/google/gemini-3.1-flash-lite" → "OR:gemini-3.1-flash-lite", "haiku" → "A:haiku"
export function shortModelLabel(setting: string, currentModel?: string): string {
	if (setting === "current") return `A:${currentModel ?? "current"}`;
	const firstSlash = setting.indexOf("/");
	if (firstSlash === -1) return `A:${setting}`;
	const provider = setting.slice(0, firstSlash).toLowerCase();
	const code = PROVIDER_SHORT_CODES[provider] ?? provider.slice(0, 3).toUpperCase();
	return `${code}:${setting.slice(setting.lastIndexOf("/") + 1)}`;
}

/** The status line: target & boost │ model & thinking │ session cost / balance. */
export function statusLine(options: {
	config: TranslateConfig;
	sessionCostUsd: number;
	rate?: number;
	balance?: BalanceInfo;
	translating: boolean;
	currentModel?: string;
}): Badge | null {
	// Deliberately minimal: on/off, and the OpenRouter credit left. The rest is in
	// /prompt-translate status.
	const { config, rate, balance } = options;
	if (!config.enabled) return null;
	if (!balance) return { flag: "🇬🇧", credit: "", level: "ok" };
	const credit =
		typeof rate === "number" && rate > 0
			? `${(balance.remaining * rate).toFixed(0)} Kč`
			: `$${balance.remaining.toFixed(2)}`;
	return { flag: "🇬🇧", credit, level: balanceLevel(balance.remaining) };
}

// pi's thresholds (USD): above $3 healthy, $1–3 time to refill, below $1 critical.
export function balanceLevel(remainingUsd: number): Badge["level"] {
	if (remainingUsd <= 1) return "critical";
	if (remainingUsd <= 3) return "low";
	return "ok";
}

const choice = (choices: string[], active: string | boolean): string => {
	const a = typeof active === "boolean" ? (active ? "on" : "off") : active === "boost" ? "on" : active;
	return choices.map((c) => (c === a ? `[${c}]` : c)).join("|");
};
const badge = (on: boolean): string => (on ? "● ON" : "○ OFF");

export function buildHelpText(config: TranslateConfig, sessionCostUsd: number): string {
	const eff = effectiveModel(config);
	const modelDisplay =
		config.temporaryModel && config.temporaryModelUntil
			? `${config.temporaryModel} (dočasně do ${config.temporaryModelUntil})`
			: eff.setting;
	return [
		`prompt-translate — vstupy ${badge(config.enabled)}, odpovědi ${badge(config.translateResponses)}`,
		"Překládá prompty do angličtiny a finální odpověď asistenta zpět do cílového jazyka.",
		"",
		"Příkazy:",
		`  /prompt-translate on|off              — překlad promptů (${choice(["on", "off"], config.enabled)})`,
		`  /prompt-translate responses on|off    — překlad odpovědí zpět (${choice(["on", "off"], config.translateResponses)})`,
		`  /prompt-translate lang <jazyk>        — cílový jazyk odpovědí (${config.targetLanguage})`,
		`  /prompt-translate boost <level>       — vylepšení promptu (${choice(["off", "on", "plus", "mega"], config.boost)})`,
		`  /prompt-translate model <m> [until YYYY-MM-DD] — model (${modelDisplay})`,
		"        openrouter/<vendor>/<model> | haiku | sonnet | current | claude-…",
		`  /prompt-translate think on|off        — reasoning překladového modelu (${choice(["on", "off"], config.translateReasoning)})`,
		`  /prompt-translate confirm on|off      — potvrzení před odesláním (${choice(["on", "off"], config.confirm)})`,
		`  /prompt-translate history <mode>      — historie konverzace (${choice(["off", "ask", "auto", "always"], config.historyMode)}) | inspect`,
		`  /prompt-translate diff on|off         — porovnání originál/EN s tokeny (${choice(["on", "off"], config.diff)})`,
		`  /prompt-translate detect on|off       — autodetekce angličtiny/kódu (${choice(["on", "off"], config.autodetect)})`,
		`  /prompt-translate original on|off     — zobrazení původního promptu (${choice(["on", "off"], config.showOriginal)})`,
		`  /prompt-translate ui on|off           — překlad dialogů AskUserQuestion (${choice(["on", "off"], config.translateToolUi)})`,
		`  /prompt-translate note on|off         — skrytá poznámka „pracuj anglicky“ u promptu (${choice(["on", "off"], config.englishNote)})`,
		`  /prompt-translate debug on|off        — podrobné logování (${choice(["on", "off"], config.debug)})`,
		"  /prompt-translate balance [refresh]   — zůstatek OpenRouter a kurz ČNB",
		"  /prompt-translate stats               — telemetrie a úspory cache",
		"  /prompt-translate status              — úplný stav",
		"  /prompt-translate global show|off     — globální konfigurace",
		"  /prompt-translate reset               — výchozí nastavení",
		"",
		"Tip: --global u kteréhokoli podpříkazu uloží nastavení pro všechny projekty (jinak do .claude/prompt-translate.json).",
		"",
		`Cena sezení: $${sessionCostUsd.toFixed(4)}`,
	].join("\n");
}

export function formatTelemetry(tel: Telemetry, config: TranslateConfig, sessionCostUsd: number, rate?: number): string {
	const cacheable = tel.promptRequests + tel.answerRequests;
	const hitRate = cacheable > 0 ? ((tel.promptAnswerCacheHits / cacheable) * 100).toFixed(1) : "0.0";
	const usdCzk = (usd: number) =>
		typeof rate === "number" && rate > 0 ? `$${fmtSmallAmount(usd)} (~${fmtSmallAmount(usd * rate)} Kč)` : `$${fmtSmallAmount(usd)}`;
	return [
		"prompt-translate — telemetrie",
		"",
		"Model & routing",
		`  • Aktivní model:   ${effectiveModel(config).setting}`,
		`  • Historie:        ${config.historyMode}`,
		`  • Sticky routing:  ${tel.openRouterRequests > 0 ? "aktivní (x-session-id)" : "připraveno"}`,
		`  • Požadavky:       ${tel.totalRequests} (${tel.promptRequests} promptů, ${tel.answerRequests} odpovědí, ${tel.toolRequests} dialogů; OpenRouter ${tel.openRouterRequests}, Claude ${tel.claudeRequests})`,
		`  • Tokeny:          in ${tel.inputTokens.toLocaleString("en-US")}, out ${tel.outputTokens.toLocaleString("en-US")}`,
		"",
		"Cache",
		`  • Hit rate:        ${hitRate}% (${tel.promptAnswerCacheHits} z ${cacheable} prompt+odpověď požadavků)`,
		`  • Čteno z cache:   ${tel.cachedTokens.toLocaleString("en-US")} tok`,
		`  • Zapsáno:         ${tel.cacheWriteTokens.toLocaleString("en-US")} tok`,
		"",
		"Náklady",
		`  • Celkem:          ${usdCzk(sessionCostUsd)} (cena OpenRouteru už zahrnuje slevu za cache)`,
	].join("\n");
}
