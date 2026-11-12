// command — /buddy: status card, panel open / close, mute.
//
//   start                    registers /buddy, reads `muted` from $.store into $.state
//   command.run {buddy}      status · open · close · mute on|off
//   ui.render CommandOutput  draws the card of a /buddy output in a round frame
//   prompt.autocomplete      completes the arguments
// It only shows and sets: it never touches tool calls or prompts.

import type { BuddyCard, EngineInterface, On, Tone } from "claude-code";
import { atom, read, update } from "claude-code";
import { completions, parse, statusCard, USAGE } from "./parse";

const cardsAtom = atom({ plugin: "cc-pixel-buddy", key: "cards" } as const, {} as Record<string, BuddyCard>, { shape: "cards-1" });
const moodAtom = atom({ plugin: "cc-pixel-buddy", key: "mood" } as const, null, { shape: "mood-1" });
const statsAtom = atom({ plugin: "cc-pixel-buddy", key: "stats" } as const, { day: "", turns: 0, toolErrors: 0, edits: 0, commits: 0, testsPass: 0, testsFail: 0 }, { shape: "stats-1" });
const mutedAtom = atom({ plugin: "cc-pixel-buddy", key: "muted" } as const, false);

const COMMAND = "buddy";
const PANE = "buddy";
const MUTE_KEY = "muted";
const MAX_CARDS = 20;
const FRAME: Record<Tone, string | undefined> = { normal: "claude", success: "success", warning: "warning", error: "error", dim: undefined };

function capCards(cards: Record<string, BuddyCard>): Record<string, BuddyCard> {
	const keys = Object.keys(cards);
	if (keys.length <= MAX_CARDS) return cards;
	return Object.fromEntries(keys.slice(keys.length - MAX_CARDS).map((k) => [k, cards[k] as BuddyCard]));
}

export function registerCommand(on: On): void {
	on("command.run", { command: COMMAND }, async ($, e) => {
		const action = parse(e.args);
		let text: string;
		let card: BuddyCard;
		switch (action.kind) {
			case "status":
				({ text, card } = statusCard(await read($, moodAtom), await read($, statsAtom), await read($, mutedAtom)));
				break;
			case "open": {
				const opened = await $.ui.open({ id: PANE, title: "Buddy" });
				text = opened.isPlaced ? "Panel je otevřený." : "Panel se nevešel — okno je úzké; proužek nad promptem zůstává. Zkus širší okno.";
				card = { title: "panel", tone: opened.isPlaced ? "success" : "warning", lines: [{ text: opened.isPlaced ? "✔ panel je otevřený (/buddy close ho zavře)" : "⚠ panel se nevešel — okno je úzké, zkus širší; proužek nad promptem zůstává" }] };
				break;
			}
			case "close":
				await $.ui.close({ id: PANE });
				text = "Panel je zavřený.";
				card = { title: "panel", tone: "normal", lines: [{ text: "panel je zavřený" }] };
				break;
			case "mute":
				await update($, mutedAtom, () => action.on);
				await $.store.set(MUTE_KEY, action.on);
				text = action.on ? "Hlášky jsou vypnuté, postavička zůstává." : "Hlášky jsou zapnuté.";
				card = { title: "hlášky", tone: "normal", lines: [{ text: action.on ? "🔕 hlášky vypnuté (postavička zůstává)" : "🔔 hlášky zapnuté" }] };
				break;
			case "usage":
				return { text: USAGE };
		}
		await update($, cardsAtom, (c) => capCards({ ...c, [text]: card }));
		return { text };
	});

	on("ui.render", { component: "CommandOutput" }, async ($, e, next) => {
		if (e.props.command !== COMMAND || e.props.isErrored) return next(e);
		const cards = await read($, cardsAtom);
		const text = e.props.text.trim();
		const key = Object.keys(cards).find((k) => text === k || text.endsWith(`: ${k}`));
		const card = key ? cards[key] : undefined;
		if (!card) return next(e);
		const { Box, Text } = $.ui.resolve(e);
		return (
			<Box borderStyle="round" borderColor={FRAME[card.tone]} flexDirection="column" paddingX={1}>
				<Text bold>{`🖥 Buddy · ${card.title}`}</Text>
				{card.lines.map((line, i) => (
					<Text key={`l${i}`} color={line.tone ? FRAME[line.tone] : undefined} dimColor={line.tone === "dim"}>
						{line.text}
					</Text>
				))}
			</Box>
		);
	});

	on("prompt.autocomplete", async ($, e, next) => {
		const mine = completions(e.text, e.token);
		if (mine.length === 0) return next(e);
		const below = await next(e);
		return { ...below, suggestions: [...mine, ...below.suggestions] };
	});
}

/** Session start, run by the root. */
export async function startCommand($: EngineInterface): Promise<void> {
	await $.command.register({
		name: COMMAND,
		description: "Počítačový parťák: stav, panel, hlášky",
		argumentHint: "open | close | mute on|off",
	});
	const stored = await $.store.get(MUTE_KEY);
	await update($, mutedAtom, () => stored === true);
}
