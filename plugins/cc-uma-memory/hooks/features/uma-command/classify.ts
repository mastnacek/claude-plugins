// classify.ts — pure: what a line or a value of a /uma output MEANS, so the drawer can
// colour it. The data's own fields (a state, a type, a severity) decide first; this only
// answers for text that has no such field. Czech and English keywords, nothing else.

export type Meaning = "error" | "warning" | "success" | "id" | "path" | "number" | "command" | "empty";

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
const NUMBER = /^[+-]?\d+([.,]\d+)?(\s?%)?$/;
const COMMAND = /^\/uma\b/;
const PATH = /^(~|\.{1,2})?\/\S+$|^[A-Za-z]:\\\S+$/;

const EMPTY = /nic nenalezeno|nenalezen|žádn[éáýíé]|\(žádné\)|\bno (facts|results|drafts|debts) found\b|\bnothing\b|\bnone\b|\bempty\b/i;
const ERROR = /chyb|selhal|selhán|nepodařilo|neznámý|nečitelnou|skončila kódem|zamítnut|\berror\b|\bfailed\b|\bfailure\b|\bdenied\b|\bcannot\b|\bnot found\b|❌/i;
const WARNING = /varován|blokující|blokuj|přerušen|zastaral|\bwarn(ing)?\b|\bblocking\b|\bstale\b|\bzombie\b|⚠/i;
const SUCCESS = /úspěš|hotovo|schválen|zapsán|přebudován|vyrovnán|dokončen|smazán|zahozen|zapnut|\bsuccess\b|\bdone\b|\bapproved\b|\bcleared\b|\bok\b|✔|✅/i;

/** The meaning of one line or value, or undefined when it is plain text. The order is the severity: a failure beats a success word in the same line. */
export function classify(text: string): Meaning | undefined {
	const t = text.trim();
	if (t === "") return undefined;
	if (ULID.test(t)) return "id";
	if (NUMBER.test(t)) return "number";
	if (PATH.test(t)) return "path";
	if (COMMAND.test(t)) return "command";
	if (EMPTY.test(t) && t.length < 60) return "empty";
	if (ERROR.test(t)) return "error";
	if (WARNING.test(t)) return "warning";
	if (SUCCESS.test(t)) return "success";
	return undefined;
}

export type Style = { color?: string; dim?: boolean; bold?: boolean; icon?: string };

/** How a meaning is drawn: colours are the engine's theme names, never RGB. */
export function styleOf(meaning: Meaning | "dim" | undefined): Style {
	switch (meaning) {
		case "error":
			return { color: "error", icon: "❌" };
		case "warning":
			return { color: "warning", icon: "⚠️" };
		case "success":
			return { color: "success", icon: "✅" };
		case "id":
		case "path":
		case "empty":
		case "dim":
			return { dim: true };
		case "number":
			return { color: "permission", bold: true };
		case "command":
			return { color: "suggestion" };
		default:
			return {};
	}
}

/** Colours of the fact type label (theme names); an unknown type is subtle. */
const TYPE_COLORS: Record<string, string> = {
	task: "planMode",
	decision: "permission",
	pattern: "remember",
	rule: "merged",
	preference: "suggestion",
	correction: "autoAccept",
	skill: "ide",
};
export const typeColor = (type: string): string => TYPE_COLORS[type.toLowerCase()] ?? "subtle";
