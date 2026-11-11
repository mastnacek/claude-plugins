// config.ts — what counts as "inside" and "outside" for a project.
// `<git root>/.claude/watchdog.json` (optional) overrides the defaults:
//   { "gate": [..], "allowed": [..], "protected": [..], "scratch": [..], "remoteAllow": [..], "profile": [..],
//     "rules": { "W29": { "enabled": true, "mode": "block" } } }
// `protected` adds to the built-in list; the others replace the default (empty, except scratch).

import type { EngineInterface } from "claude-code";
import { homeDir } from "./home";
import { canon } from "./paths";
import { parseLayer, STORE_KEY } from "./settings";
import type { Config, Layer } from "./types";

type $ = EngineInterface;

export const DEFAULT_PROTECTED = [
	"~/.ssh",
	"~/.claude/settings*",
	"~/.claude/rules",
	"~/.claude/statusline*",
	"~/.claude/.credentials*",
	"~/.pi/agent/*.json",
	"/etc",
	".git/config",
	".claude/protected-paths.txt",
	"~/tools/ghidra*",
];

export const DEFAULT_SCRATCH = ["/tmp/claude-*"];

const strings = (v: unknown): string[] | undefined => (Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : undefined);

/** Defaults for a work tree at `workdir`. */
export function defaultConfig(workdir: string, home: string): Config {
	return { workdir: canon(workdir), home: canon(home), gate: [], allowed: [], protected: [...DEFAULT_PROTECTED], scratch: [...DEFAULT_SCRATCH], remoteAllow: [], profile: [], globalRules: {}, projectRules: {} };
}

/** Merges the parsed `watchdog.json` into the defaults; anything of the wrong type is ignored. */
export function mergeConfig(base: Config, json: unknown): Config {
	if (typeof json !== "object" || json === null || Array.isArray(json)) return base;
	const j = json as Record<string, unknown>;
	return {
		...base,
		gate: strings(j.gate) ?? base.gate,
		allowed: strings(j.allowed) ?? base.allowed,
		protected: [...base.protected, ...(strings(j.protected) ?? [])],
		scratch: strings(j.scratch) ?? base.scratch,
		remoteAllow: strings(j.remoteAllow) ?? base.remoteAllow,
		profile: strings(j.profile) ?? base.profile,
		projectRules: parseLayer(j.rules),
	};
}

/** The user's per-rule settings (all projects); a store that cannot be read means none. */
export async function globalRules($: $): Promise<Layer> {
	try {
		return parseLayer(await $.store.get(STORE_KEY));
	} catch {
		return {};
	}
}

/** Reads the project's config; a missing or broken file leaves the defaults. */
export async function loadConfig($: $, workdir: string): Promise<Config> {
	const home = (await homeDir($)) ?? "";
	const base = defaultConfig(workdir, home);
	// The user's own settings come from the store on every load (not from $.state, which is empty after /clear).
	base.globalRules = await globalRules($);
	const path = `${workdir}/.claude/watchdog.json`;
	try {
		if (!(await $.fs.exists(path))) return base;
		return mergeConfig(base, JSON.parse(String(await $.fs.read(path))));
	} catch {
		return base;
	}
}
