// face — the buddy on screen.
//
//   ui.render AbovePrompt  a strip, 3 rows: small head + mood + the hint on show (else today's turns)
//   ui.render Pane buddy   the panel (opened by `command`): big head, mood, today's numbers, the hint
// Reads `mood`, `hint`, `stats`, `muted` from $.state; writes nothing.

import type { DayStats, On, Tone } from "claude-code";
import { atom, read } from "claude-code";
import { big, mini } from "./art";

const moodAtom = atom({ plugin: "cc-pixel-buddy", key: "mood" } as const, null, { shape: "mood-1" });
const hintAtom = atom({ plugin: "cc-pixel-buddy", key: "hint" } as const, null, { shape: "hint-1" });
const statsAtom = atom({ plugin: "cc-pixel-buddy", key: "stats" } as const, { day: "", turns: 0, toolErrors: 0, edits: 0, commits: 0, testsPass: 0, testsFail: 0 } as DayStats, { shape: "stats-1" });
const mutedAtom = atom({ plugin: "cc-pixel-buddy", key: "muted" } as const, false);

export const PANE = "buddy";

const COLOR: Record<Tone, string | undefined> = { normal: "claude", success: "success", warning: "warning", error: "error", dim: undefined };

/** Today's numbers as rows of the panel (command draws the same in its card). */
function statRows(s: DayStats): string[] {
	return [
		`🔄 tahy ${s.turns}`,
		`❌ chyby nástrojů ${s.toolErrors}`,
		`✏️  úpravy souborů ${s.edits}`,
		`📦 commity ${s.commits}`,
		`🧪 testy ✔ ${s.testsPass} · ✘ ${s.testsFail}`,
	];
}

export function registerFace(on: On): void {
	on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
		const mood = await read($, moodAtom);
		if (e.props.hasSurvey || mood === null) return next(e);
		const hint = (await read($, mutedAtom)) ? null : await read($, hintAtom);
		const stats = await read($, statsAtom);
		const { Box, Text } = $.ui.resolve(e);
		return (
			<Box borderStyle="round" borderColor={COLOR[mood.tone]} paddingX={1}>
				<Text wrap="truncate-end">
					<Text bold color={COLOR[mood.tone]}>{`${mini(mood.face)} ${mood.emoji} ${mood.label}`}</Text>
					{hint ? <Text color={hint.tone}>{` · ${hint.text}`}</Text> : <Text dimColor>{` · dnes ${stats.turns} tahů`}</Text>}
				</Text>
			</Box>
		);
	});

	on("ui.render", { component: "Pane", requestId: PANE }, async ($, e, next) => {
		const mood = await read($, moodAtom);
		if (mood === null) return next(e);
		const hint = (await read($, mutedAtom)) ? null : await read($, hintAtom);
		const stats = await read($, statsAtom);
		const { Box, Text } = $.ui.resolve(e);
		return (
			<Box borderStyle="round" borderColor={COLOR[mood.tone]} flexDirection="column" paddingX={1}>
				<Text bold>🖥 Buddy</Text>
				<Box flexDirection="column" marginTop={1}>
					{big(mood.face).map((row, i) => (
						<Text key={`h${i}`} color={COLOR[mood.tone]}>{row}</Text>
					))}
				</Box>
				<Text bold>{`${mood.emoji} ${mood.label}`}</Text>
				<Box flexDirection="column" marginTop={1}>
					<Text dimColor>{`📅 dnes ${stats.day}`}</Text>
					{statRows(stats).map((row, i) => (
						<Text key={`s${i}`}>{row}</Text>
					))}
				</Box>
				{hint ? <Text color={hint.tone}>{`💬 ${hint.text}`}</Text> : null}
			</Box>
		);
	});
}
