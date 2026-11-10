// run.ts — /prompt-translate: one line in, the text to show out; and the
// completions for its arguments.

import type { EngineInterface, PromptAutocompleteSuggestion } from "claude-code";
import { atom, read, update } from "claude-code";
import { clearBalanceCache, getOpenRouterBalance, getUsdToCzkRate } from "../../shared/credit";
import {
	clearGlobalConfig,
	effectiveModel,
	getConfig,
	hasGlobalConfig,
	normalizeLanguage,
	parseModelSetting,
	parseUntilDate,
	saveConfig,
	setConfig,
} from "../../shared/config";
import { extractRecentContext } from "../../shared/recent-context";
import { DEFAULT_CONFIG, EMPTY_TELEMETRY } from "../../shared/types";
import type { BoostLevel, HistoryMode, PendingTranslation, Telemetry, TranslateConfig } from "../../shared/types";
import { buildHelpText, formatTelemetry, shortModelLabel } from "./texts";

// Atoms are declared in every file that reads them (the validator's scan reads literals).
const pendingAtom = atom({ plugin: "prompt-translate", key: "pending" } as const, null as PendingTranslation | null);
const sessionCostAtom = atom({ plugin: "prompt-translate", key: "sessionCostUsd" } as const, 0);
const telemetryAtom = atom({ plugin: "prompt-translate", key: "telemetry" } as const, EMPTY_TELEMETRY as Telemetry, { shape: "telemetry-2" });

type $ = EngineInterface;

export const COMMAND = "prompt-translate";

type Toggle = { key: keyof TranslateConfig; label: string; aliases: string[] };

const TOGGLES: Toggle[] = [
	{ key: "enabled", label: "překlad promptů", aliases: ["input", "prompt", "prompts"] },
	{ key: "translateResponses", label: "překlad odpovědí", aliases: ["responses", "response", "reply", "replies", "output"] },
	{ key: "translateReasoning", label: "reasoning překladového modelu", aliases: ["think", "thinking", "reason", "reasoning"] },
	{ key: "confirm", label: "potvrzení překladu", aliases: ["confirm"] },
	{ key: "diff", label: "porovnání originál/EN", aliases: ["diff"] },
	{ key: "autodetect", label: "autodetekce angličtiny/kódu", aliases: ["detect", "autodetect"] },
	{ key: "showOriginal", label: "zobrazení původního promptu", aliases: ["original", "showoriginal", "source"] },
	{ key: "translateToolUi", label: "překlad dialogů AskUserQuestion", aliases: ["ui", "tool-ui", "card"] },
	{ key: "englishNote", label: "skrytá poznámka „pracuj anglicky“ u každého promptu", aliases: ["note", "english-note"] },
	{ key: "debug", label: "debug", aliases: ["debug"] },
];

const SUBCOMMANDS: Record<string, string> = {
	help: "nápověda",
	status: "úplný stav",
	on: "zapne překlad promptů",
	off: "vypne překlad promptů",
	responses: "překlad odpovědí on|off",
	lang: "cílový jazyk odpovědí",
	model: "překladový model [until YYYY-MM-DD]",
	boost: "off|on|plus|mega",
	think: "reasoning on|off",
	confirm: "potvrzení on|off",
	history: "off|ask|auto|always|inspect",
	diff: "porovnání on|off",
	detect: "autodetekce on|off",
	original: "původní prompt on|off",
	ui: "překlad AskUserQuestion on|off",
	note: "poznámka „pracuj anglicky“ u promptu on|off",
	balance: "zůstatek OpenRouter [refresh]",
	stats: "telemetrie",
	debug: "debug on|off",
	global: "show|off",
	reset: "výchozí nastavení",
};

const VALUES: Record<string, string[]> = {
	boost: ["off", "on", "plus", "mega"],
	history: ["off", "ask", "auto", "always", "inspect"],
	global: ["show", "off"],
	balance: ["refresh"],
	lang: ["Czech", "English", "German", "Slovak", "Polish", "Spanish", "French"],
	model: [
		"openrouter/google/gemini-3.1-flash-lite",
		"openrouter/google/gemini-3.5-flash-lite",
		"haiku",
		"sonnet",
		"current",
	],
};
for (const t of TOGGLES) for (const a of t.aliases) VALUES[a] ??= ["on", "off"];

export function completions(text: string, token: string): PromptAutocompleteSuggestion[] {
	const m = /^\/prompt-translate\s+(.*)$/s.exec(text);
	if (!m) return [];
	const words = (m[1] ?? "").split(/\s+/);
	const prefix = token.toLowerCase();
	if (words.length <= 1) {
		return Object.entries(SUBCOMMANDS)
			.filter(([name]) => name.startsWith(prefix))
			.map(([name, description]) => ({ text: name, description }));
	}
	const sub = (words[0] ?? "").toLowerCase();
	const values = [...(VALUES[sub] ?? []), "--global"];
	if (words.length > 3) return [];
	return values.filter((v) => v.toLowerCase().startsWith(prefix)).map((v) => ({ text: v }));
}

function parseOnOff(value: string | undefined): boolean | undefined {
	if (value === "on") return true;
	if (value === "off") return false;
	return undefined;
}

const onOff = (v: boolean) => (v ? "on" : "off");

/** Runs one /prompt-translate line; answers the text to show. */
export async function runCommand($: $, args: string): Promise<string> {
	const tokens = args.trim().split(/\s+/).filter(Boolean);
	const writeGlobal = tokens.some((t) => t.toLowerCase() === "--global");
	const clean = tokens.filter((t) => t.toLowerCase() !== "--global");
	const sub = (clean[0] ?? "").toLowerCase();
	const rest = clean.slice(1);
	const config = await getConfig($);

	const persist = async (fn: (c: TranslateConfig) => TranslateConfig): Promise<string> => {
		const next = await setConfig($, fn);
		return saveConfig($, next, writeGlobal);
	};

	if (!sub || sub === "help") return buildHelpText(config, await read($, sessionCostAtom));

	if (sub === "on" || sub === "enable" || sub === "off" || sub === "disable") {
		const on = sub === "on" || sub === "enable";
		if (!on) await update($, pendingAtom, () => null);
		const where = await persist((c) => ({ ...c, enabled: on }));
		return `překlad promptů ${onOff(on)} (cíl: ${config.targetLanguage}) — ${where}`;
	}

	const toggle = TOGGLES.find((t) => t.aliases.includes(sub));
	if (toggle) {
		const value = parseOnOff(rest[0]);
		const current = config[toggle.key] as boolean;
		if (value === undefined) return `${toggle.label}: ${onOff(current)}\nPoužití: /prompt-translate ${sub} on|off [--global]`;
		if (toggle.key === "enabled" && !value) await update($, pendingAtom, () => null);
		if (toggle.key === "translateResponses") {
			await update($, pendingAtom, (p) => (p ? { ...p, translateResponses: value } : p));
		}
		const where = await persist((c) => ({ ...c, [toggle.key]: value }));
		return `${toggle.label}: ${onOff(value)} — ${where}`;
	}

	if (sub === "lang" || sub === "language" || sub === "target") {
		const language = normalizeLanguage(rest.join(" "));
		if (!language) return `cílový jazyk: ${config.targetLanguage}\nPoužití: /prompt-translate lang <jazyk>`;
		const where = await persist((c) => ({ ...c, targetLanguage: language }));
		return `cílový jazyk: ${language} — ${where}`;
	}

	if (sub === "boost") {
		const v = rest[0];
		const level: BoostLevel | undefined =
			v === "on" || v === "boost" ? "boost" : v === "off" ? "off" : v === "plus" || v === "mega" ? v : undefined;
		if (!level) return `boost: ${config.boost}\nPoužití: /prompt-translate boost off|on|plus|mega`;
		const where = await persist((c) => ({ ...c, boost: level }));
		return `boost: ${level} — ${where}`;
	}

	if (sub === "model") {
		const untilIndex = rest.findIndex((t) => t.toLowerCase() === "until");
		const modelTokens = untilIndex >= 0 ? rest.slice(0, untilIndex) : rest;
		if (modelTokens.length === 0) {
			const eff = effectiveModel(config);
			return `překladový model: ${eff.setting}${eff.temporaryUntil ? ` (dočasně do ${config.temporaryModelUntil}, pak ${config.translateModel})` : ""}\nPoužití: /prompt-translate model openrouter/<vendor>/<model>|haiku|sonnet|current|<claude-id> [until YYYY-MM-DD]`;
		}
		const setting = parseModelSetting(modelTokens.join(" "));
		if (!setting) return "Neplatný model. Použití: /prompt-translate model openrouter/<vendor>/<model>|haiku|sonnet|current [until YYYY-MM-DD]";
		if (untilIndex >= 0) {
			const untilRaw = rest[untilIndex + 1] ?? "";
			const until = parseUntilDate(untilRaw);
			if (!until) return `Neplatné datum "until": ${untilRaw || "(chybí)"}. Formát YYYY-MM-DD.`;
			if (until.getTime() < Date.now()) return `Datum ${untilRaw} je v minulosti; ponechávám ${config.translateModel}.`;
			const where = await persist((c) => ({ ...c, temporaryModel: setting, temporaryModelUntil: untilRaw }));
			return `překladový model ${setting} do ${untilRaw} (včetně), pak zpět na ${config.translateModel} — ${where}`;
		}
		const where = await persist((c) => {
			const next = { ...c, translateModel: setting };
			delete next.temporaryModel;
			delete next.temporaryModelUntil;
			return next;
		});
		return `překladový model: ${setting} (${shortModelLabel(setting)}) — ${where}`;
	}

	if (sub === "history") {
		const v = (rest[0] ?? "").toLowerCase();
		if (v === "inspect" || v === "show" || v === "preview") {
			const ctx = await extractRecentContext($);
			return ctx
				? `historie (režim ${config.historyMode}) — extrahovaný kontext:\n\n${ctx}`
				: `historie (režim ${config.historyMode}): žádný kontext předchozí konverzace.`;
		}
		const mode: HistoryMode | undefined =
			v === "on" || v === "ask" ? "ask" : v === "off" || v === "auto" || v === "always" ? v : undefined;
		if (!mode) return `historie: ${config.historyMode}\nPoužití: /prompt-translate history off|ask|auto|always|inspect`;
		const where = await persist((c) => ({ ...c, historyMode: mode }));
		return `historie: ${mode} — ${where}`;
	}

	if (sub === "status") return statusText($, config);

	if (sub === "stats" || sub === "telemetry" || sub === "savings") {
		return formatTelemetry(await read($, telemetryAtom), config, await read($, sessionCostAtom), await getUsdToCzkRate($));
	}

	if (sub === "balance") {
		if (rest[0] === "refresh") clearBalanceCache();
		const [rate, balance] = await Promise.all([getUsdToCzkRate($), getOpenRouterBalance($)]);
		const lines = [`USD→CZK: ${typeof rate === "number" ? `${rate.toFixed(3)} (ČNB)` : "n/a"}`];
		if (balance) {
			const czk = typeof rate === "number" ? ` (≈ ${(balance.remaining * rate).toFixed(2)} Kč)` : "";
			lines.push(`OpenRouter: $${balance.remaining.toFixed(2)}${czk} / $${balance.total.toFixed(2)} kredit, utraceno $${balance.used.toFixed(2)}`);
		} else {
			lines.push("OpenRouter: zůstatek nedostupný (chybí klíč?)");
		}
		return lines.join(" | ");
	}

	if (sub === "reset") {
		await update($, pendingAtom, () => null);
		const where = await persist(() => ({ ...DEFAULT_CONFIG }));
		return `nastavení obnoveno na výchozí — ${where}`;
	}

	if (sub === "global") {
		const v = rest[0];
		if (v === "off" || v === "clear") {
			await clearGlobalConfig($);
			return "globální konfigurace smazána";
		}
		if (!v || v === "show") {
			return (await hasGlobalConfig($))
				? `globální konfigurace:\n${JSON.stringify(await $.store.get("config"), null, 2)}`
				: "žádná globální konfigurace (platí výchozí hodnoty)";
		}
		return "Použití: /prompt-translate global [show|off]";
	}

	return `Neznámý podpříkaz "${sub}". Použij /prompt-translate help`;
}

async function statusText($: $, config: TranslateConfig): Promise<string> {
	const eff = effectiveModel(config);
	const [rate, balance, current] = await Promise.all([getUsdToCzkRate($), getOpenRouterBalance($), $.session.model()]);
	return [
		`vstupy=${onOff(config.enabled)}`,
		`odpovědi=${onOff(config.translateResponses)}`,
		`cíl=${config.targetLanguage}`,
		`model=${config.translateModel}`,
		`dočasný=${config.temporaryModel ? `${config.temporaryModel} do ${config.temporaryModelUntil}` : "žádný"}`,
		`aktivní=${eff.setting}`,
		`globální=${(await hasGlobalConfig($)) ? "ano" : "ne"}`,
		`modelSezení=${current}`,
		`thinking=${config.translateReasoning ? "on (low)" : "off"}`,
		`boost=${config.boost}`,
		`historie=${config.historyMode}`,
		`confirm=${onOff(config.confirm)}`,
		`original=${onOff(config.showOriginal)}`,
		`diff=${onOff(config.diff)}`,
		`detect=${onOff(config.autodetect)}`,
		`ui=${onOff(config.translateToolUi)}`,
		`usdCzk=${typeof rate === "number" ? rate.toFixed(3) : "n/a"}`,
		`openRouter=${balance ? `$${balance.remaining.toFixed(2)} / $${balance.total.toFixed(2)}` : "n/a"}`,
		`debug=${onOff(config.debug)}`,
	].join(", ");
}
