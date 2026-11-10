// texts.ts — the texts /prompt-translate prints: help, stats, model labels.
// Plain text, no colour: the CommandOutput row draws it line by line.

import { effectiveModel } from "../../shared/config";
import { fmtSmallAmount } from "../../shared/credit";
import type { Telemetry, TranslateConfig } from "../../shared/types";

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
		`  /prompt-translate diff on|off         — rámeček originál/EN (${choice(["on", "off"], config.diff)})`,
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
