// /buddy: reading the arguments, the status card, completion. Pure.

import type { BuddyCard, DayStats, MoodState, PromptAutocompleteSuggestion } from "claude-code";

export const USAGE = "Použití: /buddy · /buddy open · /buddy close · /buddy mute on|off";

export type Action = { kind: "status" } | { kind: "open" } | { kind: "close" } | { kind: "mute"; on: boolean } | { kind: "usage" };

export function parse(args: string): Action {
	const [sub, arg, ...rest] = args.trim().toLowerCase().split(/\s+/).filter(Boolean);
	if (sub === undefined) return { kind: "status" };
	if (rest.length > 0) return { kind: "usage" };
	if ((sub === "open" || sub === "close") && arg === undefined) return { kind: sub };
	if (sub === "mute" && (arg === "on" || arg === "off")) return { kind: "mute", on: arg === "on" };
	return { kind: "usage" };
}

/** Today's numbers (face draws the same in the panel). */
function statLines(s: DayStats): BuddyCard["lines"] {
	return [
		{ text: `📅 dnes ${s.day}`, tone: "dim" },
		{ text: `🔄 tahy ${s.turns}` },
		{ text: `❌ chyby nástrojů ${s.toolErrors}`, tone: s.toolErrors > 0 ? "warning" : undefined },
		{ text: `✏️  úpravy souborů ${s.edits}` },
		{ text: `📦 commity ${s.commits}` },
		{ text: `🧪 testy ✔ ${s.testsPass} · ✘ ${s.testsFail}`, tone: s.testsFail > 0 ? "warning" : undefined },
	];
}

/** The one line the model reads (no newline), and the card the person sees. */
export function statusCard(mood: MoodState | null, s: DayStats, muted: boolean): { text: string; card: BuddyCard } {
	const text = `Buddy: ${mood?.label ?? "ještě nezačal"}, dnes ${s.turns} tahů, ${s.toolErrors} chyb, ${s.edits} úprav, ${s.commits} commitů, testy ${s.testsPass}✔/${s.testsFail}✘${muted ? ", hlášky vypnuté" : ""}`;
	const lines: BuddyCard["lines"] = [
		{ text: mood ? `${mood.emoji} ${mood.label}` : "🙂 ještě nezačal", tone: mood?.tone },
		...statLines(s),
		...(muted ? [{ text: "🔕 hlášky vypnuté (/buddy mute off)", tone: "dim" as const }] : []),
	];
	return { text, card: { title: "stav", tone: mood?.tone ?? "normal", lines } };
}

type Option = [string, string];

export function completions(text: string, token: string): PromptAutocompleteSuggestion[] {
	const m = /^\/buddy\s+(.*)$/s.exec(text);
	if (!m) return [];
	const words = (m[1] ?? "").split(/\s+/);
	const prefix = token.toLowerCase();
	let options: Option[];
	if (words.length <= 1) {
		options = [
			["open", "otevřít panel"],
			["close", "zavřít panel"],
			["mute", "vypnout / zapnout hlášky"],
		];
	} else if (words[0] === "mute" && words.length === 2) options = [["on", "hlášky vypnout"], ["off", "hlášky zapnout"]];
	else return [];
	return options.filter(([name]) => name.startsWith(prefix)).map(([name, description]) => ({ text: name, description }));
}
