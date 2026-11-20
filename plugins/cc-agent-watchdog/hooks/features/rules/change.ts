// change.ts — `/watch rule <id> on|off|report|block [--global]`: reading the arguments and
// putting the change into a settings file's JSON. Pure.

import { RULES } from "../../shared/rules";
import { isInstant } from "../../shared/settings";
import type { Layer, Mode, Setting } from "../../shared/types";

export const RULE_USAGE = "Použití: /watch rule <id> on|off|report|block [--global]  (id viz /watch rules)";

export type Change = { id: string; patch: Setting; global: boolean; warning?: string };

/** The arguments after `rule`, as a change, or why not. */
export function parseChange(args: readonly string[]): Change | { error: string } {
	const global = args.includes("--global");
	const rest = args.filter((a) => a !== "--global");
	const [rawId, action, ...extra] = rest;
	if (!rawId || !action || extra.length > 0) return { error: RULE_USAGE };
	const id = rawId.toUpperCase();
	const rule = RULES.find((r) => r.id === id);
	if (!rule) return { error: `Pravidlo „${rawId}“ neexistuje. ${RULE_USAGE}` };
	if (action === "on") return { id, patch: { enabled: true }, global };
	if (action === "off") {
		if (!isInstant(rule)) return { id, patch: { enabled: false }, global };
		if (!global) return { error: `${id} je pravidlo s instant failure: vypnout ho jde jen osobně pro všechny projekty (/watch rule ${id} off --global).` };
		return { id, patch: { enabled: false }, global, warning: `⚠ ${id} je pravidlo s instant failure — vypnuté už nehlídá nic, ani v ostatních projektech.` };
	}
	if (action === "report" || action === "block") {
		if (action === "block" && !rule.pre) return { error: `${id} nejde přepnout na block: potřebuje výsledek nebo historii a před voláním ho nelze posoudit (zůstává jen report).` };
		return { id, patch: { mode: action as Mode }, global };
	}
	return { error: RULE_USAGE };
}

/** Merges the change into the layer (other rules and other fields stay). */
export const withChange = (layer: Layer, c: Change): Layer => ({ ...layer, [c.id]: { ...layer[c.id], ...c.patch } });

/**
 * The project file's text with the change in `rules`; every other key stays. A file that is not
 * a JSON object is never rewritten: `{ error }`. A missing file (undefined) starts a new one.
 */
export function patchProjectFile(text: string | undefined, c: Change): { text: string } | { error: string } {
	let root: Record<string, unknown> = {};
	if (text !== undefined && text.trim() !== "") {
		try {
			const parsed: unknown = JSON.parse(text);
			if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("kořen není objekt");
			root = parsed as Record<string, unknown>;
		} catch (error) {
			return { error: `.claude/watchdog.json není platný JSON (${error instanceof Error ? error.message.split("\n")[0] : String(error)}); nechávám ho být — oprav ho a zkus znovu.` };
		}
	}
	const rules = typeof root.rules === "object" && root.rules !== null && !Array.isArray(root.rules) ? (root.rules as Record<string, unknown>) : {};
	const old = typeof rules[c.id] === "object" && rules[c.id] !== null ? (rules[c.id] as Record<string, unknown>) : {};
	root.rules = { ...rules, [c.id]: { ...old, ...c.patch } };
	return { text: `${JSON.stringify(root, null, 2)}\n` };
}

/** What the person is told after a change. */
export function describeChange(c: Change): string {
	const what = [c.patch.enabled === undefined ? "" : c.patch.enabled ? "zapnuto" : "vypnuto", c.patch.mode === undefined ? "" : `režim ${c.patch.mode}`].filter(Boolean).join(", ");
	return `${c.id}: ${what} (${c.global ? "globálně, pro všechny projekty" : "v projektu, .claude/watchdog.json"})`;
}
