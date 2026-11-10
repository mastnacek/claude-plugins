// run.ts — /prompt-translate: one line in, the text to show out; and the
// completions for its arguments.

import type { EngineInterface, PromptAutocompleteSuggestion } from "claude-code";
import { atom, read, update } from "claude-code";
import { clearBalanceCache, getOpenRouterBalance, getUsdToCzkRate } from "../../shared/credit";
import {
	clearGlobalConfig,
	getConfig,
	loadGlobalConfig,
	modelBackend,
	parseModelSetting,
	saveConfig,
	setConfig,
	THINK_LEVELS,
} from "../../shared/config";
import { normalizeLanguage } from "../../shared/languages";
import { extractRecentContext } from "../../shared/recent-context";
import { DEFAULT_CONFIG, EMPTY_TELEMETRY } from "../../shared/types";
import type { BoostLevel, HistoryMode, PendingTranslation, Telemetry, TranslateConfig } from "../../shared/types";
import { buildHelpText, buildStatsText, shortModelLabel } from "./texts";

// Atoms are declared in every file that reads them (the validator's scan reads literals).
const pendingAtom = atom({ plugin: "cc-prompt-translate", key: "pending" } as const, null as PendingTranslation | null);
const sessionCostAtom = atom({ plugin: "cc-prompt-translate", key: "sessionCostUsd" } as const, 0);
const telemetryAtom = atom({ plugin: "cc-prompt-translate", key: "telemetry" } as const, EMPTY_TELEMETRY as Telemetry, { shape: "telemetry-3" });

type $ = EngineInterface;

export const COMMAND = "prompt-translate";

type Toggle = { key: keyof TranslateConfig; label: string; aliases: string[] };

const TOGGLES: Toggle[] = [
	{ key: "enabled", label: "překlad promptů", aliases: ["input", "prompt", "prompts"] },
	{ key: "translateResponses", label: "překlad odpovědí", aliases: ["responses", "response", "reply", "replies", "output"] },
	{ key: "confirm", label: "potvrzení překladu", aliases: ["confirm"] },
	{ key: "showOriginal", label: "rámeček originál/překlad", aliases: ["original", "frame", "diff", "showoriginal", "source"] },
	{ key: "translateToolUi", label: "překlad dialogů AskUserQuestion", aliases: ["ui", "tool-ui", "card"] },
	{ key: "englishNote", label: "skrytá poznámka „pracuj anglicky“ u každého promptu", aliases: ["note", "english-note"] },
	{ key: "log", label: "log pro vyhodnocení (~/.claude/prompt-translate/log/)", aliases: ["log"] },
	{ key: "debug", label: "debug", aliases: ["debug"] },
];

const SUBCOMMANDS: Record<string, string> = {
	help: "příkazy a aktuální nastavení",
	on: "zapne překlad promptů",
	off: "vypne překlad promptů",
	responses: "překlad odpovědí on|off",
	lang: "cílový jazyk odpovědí",
	model: "překladový model",
	boost: "off|on|plus|mega",
	think: "reasoning off|low|medium|high",
	confirm: "potvrzení on|off",
	history: "off|ask|auto|always|inspect",
	original: "rámeček originál/překlad on|off",
	ui: "překlad AskUserQuestion on|off",
	note: "poznámka „pracuj anglicky“ u promptu on|off",
	stats: "cena, kredit, kurz, tokeny",
	log: "log pro vyhodnocení on|off",
	debug: "debug on|off",
	global: "show|off",
	reset: "výchozí nastavení",
};

const VALUES: Record<string, string[]> = {
	boost: ["off", "on", "plus", "mega"],
	history: ["off", "ask", "auto", "always", "inspect"],
	global: ["show", "off"],
	think: [...THINK_LEVELS],
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

	if (!sub || sub === "help") return buildHelpText(config);

	// `/prompt-translate on|off` is the prompt toggle without its name.
	const bare = sub === "on" || sub === "enable" ? true : sub === "off" || sub === "disable" ? false : undefined;
	const toggle = bare === undefined ? TOGGLES.find((t) => t.aliases.includes(sub)) : TOGGLES.find((t) => t.key === "enabled");
	if (toggle) {
		const value = bare ?? parseOnOff(rest[0]);
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
		const usage = "Použití: /prompt-translate model openrouter/<vendor>/<model>|haiku|sonnet|current|<claude-id>";
		if (rest.length === 0) return `překladový model: ${config.translateModel}\n${usage}`;
		const setting = parseModelSetting(rest.join(" "));
		if (!setting) return `Neplatný model. ${usage}`;
		const where = await persist((c) => ({ ...c, translateModel: setting }));
		return `překladový model: ${setting} (${shortModelLabel(setting)}) — ${where}`;
	}

	if (sub === "think") {
		const level = THINK_LEVELS.find((l) => l === (rest[0] ?? "").toLowerCase());
		if (!level) return `reasoning: ${config.think}\nPoužití: /prompt-translate think off|low|medium|high`;
		const where = await persist((c) => ({ ...c, think: level }));
		return `reasoning: ${level} — ${where}`;
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

	if (sub === "stats") {
		const tokens = await read($, telemetryAtom);
		// A Claude model is paid by the subscription: no price, credit or rate to show.
		if (modelBackend(config.translateModel) !== "openrouter") return buildStatsText({ tokens });
		clearBalanceCache(); // asked for now: show the credit as it is now
		const [rate, balance] = await Promise.all([getUsdToCzkRate($), getOpenRouterBalance($)]);
		return buildStatsText({ tokens, costUsd: await read($, sessionCostAtom), rate, balance: balance ?? null });
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
			const global = await loadGlobalConfig($);
			return Object.keys(global).length > 0
				? `globální konfigurace:\n${JSON.stringify(global, null, 2)}`
				: "žádná globální konfigurace (platí výchozí hodnoty)";
		}
		return "Použití: /prompt-translate global [show|off]";
	}

	return `Neznámý podpříkaz "${sub}". Použij /prompt-translate help`;
}
