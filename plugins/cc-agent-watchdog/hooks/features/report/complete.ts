// complete.ts — completion of `/watch` arguments in the prompt box. Pure.

import type { PromptAutocompleteSuggestion } from "claude-code";
import { RULES } from "../../shared/rules";

type Option = [string, string?];

/** Suggestions for the token being typed in `text`; none when `text` is not a /watch command. */
export function completions(text: string, token: string): PromptAutocompleteSuggestion[] {
	const m = /^\/watch\s+(.*)$/s.exec(text);
	if (!m) return [];
	const words = (m[1] ?? "").split(/\s+/);
	const prefix = token.toLowerCase();
	let options: Option[];
	if (words.length <= 1) {
		options = [
			["report", "skóre sezení (last | all | id)"],
			["rules", "pravidla: stav, režim, zdroj, výjimky"],
			["rule", "zapnout / vypnout / přepnout režim pravidla"],
		];
	} else if (words[0] === "report" && words.length === 2) options = [["last", "předchozí sezení"], ["all", "přehled sezení"]];
	else if (words[0] === "rule" && words.length === 2) options = RULES.map((r): Option => [r.id, r.title]);
	else if (words[0] === "rule" && words.length === 3) options = [["on", "zapnout"], ["off", "vypnout"], ["report", "jen zaznamenávat"], ["block", "zamítnout volání, které pravidlo porušuje"]];
	else if (words[0] === "rule" && words.length === 4) options = [["--global", "osobně pro všechny projekty"]];
	else return [];
	return options.filter(([name]) => name.toLowerCase().startsWith(prefix)).map(([name, description]) => (description ? { text: name, description } : { text: name }));
}
