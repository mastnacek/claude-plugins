// config.ts — normalisation, persistence and model-setting parsing.
//
// Precedence: DEFAULT_CONFIG < global ($.store "config") < project
// (<cwd>/.claude/prompt-translate.json). Nothing is inherited from the pi
// version: a fresh install starts from DEFAULT_CONFIG.

import type { EngineInterface } from "claude-code";
import { atom, read, update } from "claude-code";
import { normalizeLanguage } from "./languages";

import { DEFAULT_CONFIG } from "./types";
import type { BoostLevel, HistoryMode, ModelBackend, TranslateConfig } from "./types";

// Atoms are declared in every file that reads them (the validator's scan reads literals).
const configAtom = atom({ plugin: "prompt-translate", key: "config" } as const, DEFAULT_CONFIG as TranslateConfig, { shape: "config-1" });


type $ = EngineInterface;

const GLOBAL_KEY = "config";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeConfig(value: Partial<TranslateConfig> | Record<string, unknown>): TranslateConfig {
	const v = value as Record<string, unknown>;
	const bool = (key: keyof TranslateConfig): boolean =>
		typeof v[key] === "boolean" ? (v[key] as boolean) : (DEFAULT_CONFIG[key] as boolean);
	const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
		allowed.includes(value as T) ? (value as T) : fallback;
	const boost = oneOf<BoostLevel>(v.boost, ["off", "boost", "plus", "mega"], DEFAULT_CONFIG.boost);
	const historyMode = oneOf<HistoryMode>(v.historyMode, ["off", "ask", "auto", "always"], DEFAULT_CONFIG.historyMode);
	const translateModel =
		typeof v.translateModel === "string" && v.translateModel.trim() ? v.translateModel.trim() : DEFAULT_CONFIG.translateModel;
	const config: TranslateConfig = {
		enabled: bool("enabled"),
		translateResponses: bool("translateResponses"),
		targetLanguage:
			typeof v.targetLanguage === "string" && v.targetLanguage.trim()
				? normalizeLanguage(v.targetLanguage) || DEFAULT_CONFIG.targetLanguage
				: DEFAULT_CONFIG.targetLanguage,
		translateModel,
		translateReasoning: bool("translateReasoning"),
		boost,
		historyMode,
		confirm: bool("confirm"),
		showOriginal: bool("showOriginal"),
		diff: bool("diff"),
		autodetect: bool("autodetect"),
		translateToolUi: bool("translateToolUi"),
		englishNote: bool("englishNote"),
		debug: bool("debug"),
	};
	if (typeof v.temporaryModel === "string" && typeof v.temporaryModelUntil === "string") {
		config.temporaryModel = v.temporaryModel;
		config.temporaryModelUntil = v.temporaryModelUntil;
	}
	return config;
}

async function readJson($: $, path: string): Promise<Record<string, unknown> | undefined> {
	try {
		if (!(await $.fs.exists(path))) return undefined;
		const parsed: unknown = JSON.parse(await $.fs.read(path));
		return isRecord(parsed) ? parsed : undefined;
	} catch {
		return undefined;
	}
}

export async function projectConfigPath($: $): Promise<string> {
	return `${await $.session.cwd()}/.claude/prompt-translate.json`;
}

/** The global config: what `/prompt-translate … --global` stored, else nothing. */
export async function loadGlobalConfig($: $): Promise<Record<string, unknown>> {
	const stored = await $.store.get(GLOBAL_KEY);
	return isRecord(stored) ? stored : {};
}

export async function clearGlobalConfig($: $): Promise<void> {
	await $.store.delete(GLOBAL_KEY);
}

export async function loadConfig($: $): Promise<TranslateConfig> {
	const global = await loadGlobalConfig($);
	const project = (await readJson($, await projectConfigPath($))) ?? {};
	return normalizeConfig({ ...global, ...project });
}

export async function saveConfig($: $, config: TranslateConfig, global: boolean): Promise<string> {
	if (global) {
		await $.store.set(GLOBAL_KEY, config);
		return "uloženo globálně";
	}
	const path = await projectConfigPath($);
	await $.fs.write(path, `${JSON.stringify(config, null, 2)}\n`);
	return `uloženo do projektu: ${path}`;
}

export function getConfig($: $): Promise<TranslateConfig> {
	return read($, configAtom);
}

export async function setConfig($: $, fn: (c: TranslateConfig) => TranslateConfig): Promise<TranslateConfig> {
	let next = DEFAULT_CONFIG;
	await update($, configAtom, (c) => {
		next = fn({ ...c });
		return next;
	});
	return next;
}

export function parseModelSetting(raw: string): string | undefined {
	const value = raw.trim();
	if (!value || /\s/.test(value)) return undefined;
	if (value === "current") return value;
	if (/^openrouter\/[^/\s]+\/\S+$/.test(value)) return value;
	if (value.startsWith("openrouter/")) return undefined;
	// A Claude alias (haiku, sonnet, opus) or full id (claude-haiku-…), optionally anthropic/…
	return value;
}

export function modelBackend(setting: string): ModelBackend {
	return setting.startsWith("openrouter/") ? "openrouter" : "claude";
}

// Parse "until" dates as local end-of-day, so "until 2026-08-26" keeps the
// temporary model active through that whole day.
export function parseUntilDate(raw: string): Date | undefined {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
	if (!m) return undefined;
	const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999);
	return Number.isNaN(d.getTime()) ? undefined : d;
}

/** The model used right now: a still-valid temporary override, else the base model. */
export function effectiveModel(config: TranslateConfig): { setting: string; temporaryUntil?: Date; expired: boolean } {
	if (config.temporaryModel && config.temporaryModelUntil) {
		const until = parseUntilDate(config.temporaryModelUntil);
		if (until && Date.now() <= until.getTime()) {
			return { setting: config.temporaryModel, temporaryUntil: until, expired: false };
		}
		return { setting: config.translateModel, expired: true };
	}
	return { setting: config.translateModel, expired: false };
}

/** Session start: the merged configuration into $.state, an expired override dropped. */
export async function initConfig($: $): Promise<void> {
	const config = await loadConfig($);
	await update($, configAtom, () => config);
	await expireTemporaryModel($);
}

/** Drop an expired temporary override from the session config. */
export async function expireTemporaryModel($: $): Promise<void> {
	const config = await getConfig($);
	if (effectiveModel(config).expired) {
		await setConfig($, (c) => {
			delete c.temporaryModel;
			delete c.temporaryModelUntil;
			return c;
		});
	}
}
