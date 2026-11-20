// ledger — writes one line per tool call to the session's ledger file.
//
//   tool.call (no matcher)  `await next(e)`, then records the call; the result goes up untouched
//   recordTurn              the root calls it at the end of a turn (turn.complete is hooked once, by the root)
//
// The hook only observes. A failed write is one quiet `$.ui.log` line; the tool
// is never denied, rewritten or held back by it.

import type { EngineInterface, On } from "claude-code";
import { currentRole } from "../../shared/role";
import { openLog, appendEvent } from "../../shared/store";
import type { LogRef } from "../../shared/store";
import type { Ev } from "../../shared/types";
import { toEvent, toTurn } from "./record";
import type { CallInput, CallResult } from "./record";

type $ = EngineInterface;

async function write($: $, make: (ref: LogRef, session: string, cwd: string) => Ev): Promise<void> {
	try {
		const session = await $.session.id();
		const cwd = await $.session.cwd();
		const ref = await openLog($, session, await currentRole($), cwd);
		if (!ref) return $.ui.log("deník: nenašel jsem domovskou složku, nezapisuji");
		await appendEvent($, ref, make(ref, session, cwd));
	} catch (error) {
		$.ui.log(`deník: zápis selhal: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
	}
}

export function registerLedger(on: On): void {
	on("tool.call", async ($, e, next) => {
		const startedAt = await $.clock.now();
		const ran = await next(e);
		const finishedAt = await $.clock.now();
		const role = await currentRole($);
		await write($, (_ref, session, cwd) =>
			toEvent(e.tool, e as unknown as CallInput, ran as CallResult, { ts: finishedAt, durationMs: Math.max(0, finishedAt - startedAt), session, role, cwd }),
		);
		return ran;
	}).catch(($, e, next) => next(e)); // whatever fails in here, the tool still goes through
}

/** The assistant's closing text of a turn (main loop only). */
export async function recordTurn($: $, answer: string): Promise<void> {
	const role = await currentRole($);
	const ts = await $.clock.now();
	await write($, (_ref, session, cwd) => toTurn(answer, { ts, session, role, cwd }));
}
