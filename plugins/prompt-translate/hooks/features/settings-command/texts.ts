// texts.ts — the texts /prompt-translate prints: help, stats, model labels.
// Plain text, no colour: the CommandOutput row draws it line by line.

import { fmtSmallAmount } from "../../shared/credit";
import type { BalanceInfo, Telemetry, TranslateConfig } from "../../shared/types";

const PROVIDER_SHORT_CODES: Record<string, string> = {
	openrouter: "OR",
	google: "G",
	anthropic: "A",
	openai: "OAI",
	deepseek: "DS",
	mistral: "M",
};

// "openrouter/google/gemini-3.1-flash-lite" → "OR:gemini-3.1-flash-lite", "haiku" → "A:haiku"
export function shortModelLabel(setting: string): string {
	if (setting === "current") return "A:current";
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

export function buildHelpText(config: TranslateConfig): string {
	const onOff = ["on", "off"];
	return [
		`prompt-translate — vstupy ${badge(config.enabled)}, odpovědi ${badge(config.translateResponses)}`,
		"Překládá prompty do angličtiny a finální odpověď asistenta zpět do cílového jazyka.",
		"",
		"Příkazy:",
		`  /prompt-translate on|off              — překlad promptů (${choice(onOff, config.enabled)})`,
		`  /prompt-translate responses on|off    — překlad odpovědí zpět (${choice(onOff, config.translateResponses)})`,
		`  /prompt-translate lang <jazyk>        — cílový jazyk odpovědí (${config.targetLanguage})`,
		`  /prompt-translate boost <level>       — vylepšení promptu (${choice(["off", "on", "plus", "mega"], config.boost)})`,
		`  /prompt-translate model <m>           — překladový model (${config.translateModel})`,
		"        openrouter/<vendor>/<model> | haiku | sonnet | current | claude-…",
		`  /prompt-translate think <level>       — reasoning překladového modelu (${choice(["off", "low", "medium", "high"], config.think)})`,
		`  /prompt-translate confirm on|off      — potvrzení před odesláním (${choice(onOff, config.confirm)})`,
		`  /prompt-translate history <mode>      — historie konverzace (${choice(["off", "ask", "auto", "always"], config.historyMode)}) | inspect`,
		`  /prompt-translate original on|off     — rámeček originál/překlad (${choice(onOff, config.showOriginal)})`,
		`  /prompt-translate ui on|off           — překlad dialogů AskUserQuestion (${choice(onOff, config.translateToolUi)})`,
		`  /prompt-translate note on|off         — skrytá poznámka „pracuj anglicky“ u promptu (${choice(onOff, config.englishNote)})`,
		`  /prompt-translate debug on|off        — podrobné logování (${choice(onOff, config.debug)})`,
		"  /prompt-translate stats               — cena, kredit, kurz, tokeny",
		"  /prompt-translate global show|off     — globální konfigurace",
		"  /prompt-translate reset               — výchozí nastavení",
		"",
		"Tip: --global u kteréhokoli podpříkazu uloží nastavení pro všechny projekty (jinak do .claude/prompt-translate.json).",
	].join("\n");
}

export type Stats = {
	tokens: Telemetry;
	/** Only on an OpenRouter model; a Claude model is paid by the subscription. */
	costUsd?: number;
	rate?: number;
	/** null: the credit could not be read (no key, OpenRouter down). */
	balance?: BalanceInfo | null;
};

/** The session's translation statistics: price, credit, rate, tokens. */
export function buildStatsText({ tokens, costUsd, rate, balance }: Stats): string {
	const n = (v: number) => v.toLocaleString("en-US");
	const lines = ["prompt-translate — statistiky sezení", ""];
	if (costUsd === undefined) {
		lines.push("Model Claude: platí předplatné, cena a kredit se nesledují.");
	} else {
		const czk = (usd: number, format: (v: number) => string) =>
			typeof rate === "number" && rate > 0 ? ` (≈ ${format(usd * rate)} Kč)` : "";
		lines.push(`  Cena:    $${fmtSmallAmount(costUsd)}${czk(costUsd, fmtSmallAmount)}`);
		lines.push(
			balance
				? `  Kredit:  $${balance.remaining.toFixed(2)}${czk(balance.remaining, (v) => v.toFixed(0))} z $${balance.total.toFixed(2)}`
				: "  Kredit:  nedostupný (chybí klíč OpenRouteru?)",
		);
		lines.push(`  Kurz:    ${typeof rate === "number" ? `1 USD = ${rate.toFixed(3)} Kč (ČNB)` : "nedostupný"}`);
	}
	lines.push(`  Tokeny:  in ${n(tokens.inputTokens)}, out ${n(tokens.outputTokens)}`);
	return lines.join("\n");
}
