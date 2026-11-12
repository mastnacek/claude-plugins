// register.tsx — the composition root: it knows the slices, they don't know
// each other. Nothing else lives here.
//
// An event without a matcher may be hooked once per plugin, so the root hooks
// session.start, turn.start, turn.complete and tool.call and calls each
// slice's function for it. `on` / `$` go only to functions called by name:
// every slice is wired by an explicit call, never a loop over a list.

import type { Register } from "claude-code";
import { registerCommand, startCommand } from "./features/command/register";
import { registerFace } from "./features/face/register";
import { hintsCall, hintsTurnEnd, hintsTurnStart } from "./features/hints/register";
import { moodCall, moodTurnEnd, moodTurnStart, startMood } from "./features/mood/register";
import { statsCall, statsTurnStart, startStats } from "./features/stats/register";
import { classify } from "./shared/classify";

export const register: Register = (on) => {
	on("session.start", async ($, e, next) => {
		await startMood($);
		await startStats($);
		await startCommand($);
		return next(e);
	});

	// Only the main loop's turns count; a subagent's tool calls do.
	on("turn.start", async ($, e, next) => {
		if (e.agentId === undefined) {
			await moodTurnStart($);
			await statsTurnStart($);
			await hintsTurnStart($);
		}
		return next(e);
	});

	on("turn.complete", async ($, e, next) => {
		if (e.agentId === undefined) {
			await moodTurnEnd($);
			await hintsTurnEnd($);
		}
		return next(e);
	});

	// Looks at the finished call; never changes the input or the result.
	on("tool.call", async ($, e, next) => {
		const ran = await next(e);
		if (ran.deny === undefined) {
			const info = classify(e, ran.isError === true);
			await moodCall($, info);
			await statsCall($, info);
			await hintsCall($, info);
		}
		return ran;
	});

	registerFace(on);
	registerCommand(on);
};
