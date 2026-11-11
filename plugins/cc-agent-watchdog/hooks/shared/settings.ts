// settings.ts — which rules are on and in which mode, from four layers:
//   default < global (`$.store`, all projects) < project (`.claude/watchdog.json`) < exception of the session
// The exception does not change a setting; it excuses violations (shared/waivers.ts).
// Pure: the config in, the state of a rule out.

import type { Config, Layer, Mode, Rule, Setting } from "./types";

export type Source = "výchozí" | "globální" | "projekt";

export type RuleState = {
	enabled: boolean;
	enabledFrom: Source;
	/** What the rule really does: a rule that cannot be judged before the call is always `report`. */
	mode: Mode;
	modeFrom: Source;
	/** `block` is possible at all (the rule is judged from one call's input). */
	blockable: boolean;
};

/** Key of the global settings in the plugin's `$.store`. */
export const STORE_KEY = "rules";

const RULE_ID = /^W\d{2}$/;

/** A layer as stored or written in JSON; anything of the wrong type is dropped. */
export function parseLayer(value: unknown): Layer {
	const layer: Layer = {};
	if (typeof value !== "object" || value === null || Array.isArray(value)) return layer;
	for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
		if (!RULE_ID.test(id) || typeof raw !== "object" || raw === null) continue;
		const r = raw as Record<string, unknown>;
		const setting: Setting = {};
		if (typeof r.enabled === "boolean") setting.enabled = r.enabled;
		if (r.mode === "report" || r.mode === "block") setting.mode = r.mode;
		layer[id.toUpperCase()] = setting;
	}
	return layer;
}

/** An instant-failure rule: the project cannot switch it off (only the user, globally). */
export const isInstant = (rule: Rule): boolean => rule.weight === "instant";

export function stateOf(rule: Rule, cfg: Config): RuleState {
	let enabled = !rule.profile;
	let enabledFrom: Source = "výchozí";
	let mode: Mode = "report";
	let modeFrom: Source = "výchozí";
	const global = cfg.globalRules[rule.id];
	if (global?.enabled !== undefined) [enabled, enabledFrom] = [global.enabled, "globální"];
	if (global?.mode !== undefined) [mode, modeFrom] = [global.mode, "globální"];
	if (cfg.profile.includes(rule.id)) [enabled, enabledFrom] = [true, "projekt"];
	const project = cfg.projectRules[rule.id];
	// A project file (which an agent may be able to edit) never switches off an instant-failure rule.
	if (project?.enabled !== undefined && (project.enabled || !isInstant(rule))) [enabled, enabledFrom] = [project.enabled, "projekt"];
	if (project?.mode !== undefined) [mode, modeFrom] = [project.mode, "projekt"];
	const blockable = rule.pre === true;
	return blockable ? { enabled, enabledFrom, mode, modeFrom, blockable } : { enabled, enabledFrom, mode: "report", modeFrom: "výchozí", blockable };
}
