// parse.ts — the words of `/herdr-plugin …` and the completion of them. Pure; no `$`.

import type { PromptAutocompleteSuggestion } from "claude-code";
import { LANGUAGES } from "../../shared/scaffold";
import type { Language } from "../../shared/scaffold";

export const USAGE = "Použití: /herdr-plugin scaffold <rust|typescript|bash> [dir] [id] | validate [dir|soubor] | docs";

export type Parsed =
	| { sub: "scaffold"; language: Language; dir: string; id: string; name: string }
	| { sub: "validate"; path: string }
	| { sub: "docs" }
	| { sub: "usage"; why?: string };

/** "lab.test-tool" → "Test Tool": the last dotted part, split at - and _, capitalized. */
export function nameOf(id: string): string {
	const last = id.split(".").pop() || id;
	return last.split(/[-_]+/).filter(Boolean).map((w) => w[0]?.toUpperCase() + w.slice(1)).join(" ") || id;
}

export function parseArgs(args: string): Parsed {
	const [sub = "", ...rest] = args.trim().split(/\s+/).filter(Boolean);
	if (sub === "docs") return { sub: "docs" };
	if (sub === "validate") return { sub: "validate", path: rest[0] ?? "." };
	if (sub === "scaffold") {
		const language = (rest[0] ?? "rust").toLowerCase();
		if (!LANGUAGES.includes(language as Language)) return { sub: "usage", why: `Neznámý jazyk „${language}“ (rust, typescript, bash).` };
		const id = rest[2] ?? "custom.herdr-tool";
		return { sub: "scaffold", language: language as Language, dir: rest[1] ?? "./my-herdr-plugin", id, name: nameOf(id) };
	}
	return { sub: "usage" };
}

type Option = [string, string];

/** Suggestions for the token being typed in `text`; none when `text` is not a /herdr-plugin command. */
export function completions(text: string, token: string): PromptAutocompleteSuggestion[] {
	const m = /^\/herdr-plugin\s+(.*)$/s.exec(text);
	if (!m) return [];
	const words = (m[1] ?? "").split(/\s+/);
	let options: Option[];
	if (words.length <= 1) {
		options = [
			["scaffold", "nový herdr plugin (rust | typescript | bash)"],
			["validate", "zkontrolovat herdr-plugin.toml"],
			["docs", "kde je dokumentace herdru"],
		];
	} else if (words[0] === "scaffold" && words.length === 2) options = LANGUAGES.map((l): Option => [l, `kostra pluginu v jazyce ${l}`]);
	else return [];
	const prefix = token.toLowerCase();
	return options.filter(([name]) => name.startsWith(prefix)).map(([name, description]) => ({ text: name, description }));
}
