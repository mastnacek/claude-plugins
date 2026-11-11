// Pure rules over what the engine reports about a command (`command.describe`):
// which literal values its argument hint names, whether the arguments need a
// translation at all, and whether a translation kept those literals.
// Nothing here knows a command, a plugin or a subcommand by name.

import { detectLanguageOrCode } from "../../shared/translation/detect";

const GROUP = /\[[^\]]*\]|<[^>]*>|\{[^}]*\}/g;
const WORD = /^-{0,2}[\p{L}\p{N}][\p{L}\p{N}_.-]*$/u;

function words(text: string): string[] {
	return text
		.split(/[\s|]+/)
		.map((w) => w.replace(/^[(,;:]+|[),;:.]+$/g, ""))
		.filter((w) => WORD.test(w));
}

const RUN = /[^\s|]+(?:\s*\|\s*[^\s|]+)+/g;

/** Words joined by `|` (in a group or bare): the values the text offers to choose from. */
function alternatives(text: string): string[] {
	const found: string[] = [];
	const chunks = [...(text.match(GROUP) ?? []).map((g) => g.slice(1, -1)), text.replace(GROUP, " ")];
	for (const chunk of chunks) {
		for (const run of chunk.match(RUN) ?? []) found.push(...words(run));
	}
	return found;
}

/**
 * Literal values a command knows: alternatives joined by `|`, and bare words of
 * the hint outside `[...]`, `<...>`, `{...}` (those hold placeholder names, like
 * `[what to do]`). The description contributes alternatives only: its other
 * words are prose.
 */
export function argumentLiterals(hint: string | undefined, description: string | undefined): Set<string> {
	const literals = new Set<string>();
	for (const w of words((hint ?? "").replace(GROUP, " "))) literals.add(w);
	for (const w of alternatives(hint ?? "")) literals.add(w);
	for (const w of alternatives(description ?? "")) literals.add(w);
	return literals;
}

const NUMBER = /^[+-]?\d[\d.,:_/-]*$/;
const CODE_TOKEN = /^(?:-{1,2}[\w]|[@~.\/\\])|[\/\\_=`]|::|\w\.\w|[a-z][A-Z]/;

function isFixedToken(token: string, literals: ReadonlySet<string>): boolean {
	return literals.has(token) || NUMBER.test(token) || CODE_TOKEN.test(token);
}

function tokens(args: string): string[] {
	return args.trim().split(/\s+/).filter(Boolean);
}

/**
 * Whether the arguments carry natural language worth a model call: what is left
 * after known literals, numbers and code/paths/flags must read as the person's
 * language (diacritics or its common words), not as an identifier or value.
 */
export function needsTranslation(args: string, literals: ReadonlySet<string>): boolean {
	const rest = tokens(args).filter((t) => !isFixedToken(t, literals));
	if (rest.length === 0) return false;
	const verdict = detectLanguageOrCode(rest.join(" "));
	return verdict.reason === "diacritics" || verdict.reason === "czech_ascii_words";
}

/** Every literal token of the arguments must come back verbatim (case, punctuation). */
export function literalsSurvive(args: string, output: string, literals: ReadonlySet<string>): boolean {
	const count = (list: string[]): Map<string, number> => {
		const m = new Map<string, number>();
		for (const t of list) m.set(t, (m.get(t) ?? 0) + 1);
		return m;
	};
	const out = count(tokens(output));
	for (const [t, n] of count(tokens(args))) if (literals.has(t) && (out.get(t) ?? 0) < n) return false;
	return true;
}

/** What the translator is told about the command it translates arguments for. */
export function commandContext(command: string, meta: { description?: string; argumentHint?: string } | undefined): string {
	return [
		`Command: /${command}`,
		meta?.description ? `Description: ${meta.description}` : "",
		meta?.argumentHint ? `Argument hint: ${meta.argumentHint}` : "",
	]
		.filter(Boolean)
		.join("\n");
}
