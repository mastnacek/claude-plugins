// register.tsx — the composition root: it knows the slices, they don't know
// each other. Nothing else lives here.
//
// session.start, turn.complete and session.end may be hooked once per plugin, so
// they are hooked here and call each slice's function. `on` / `$` go only to
// functions called by name: every slice is wired by an explicit call, never a loop.
//
// The watchdog reports. Only a rule that someone switched to `block` refuses a call (features/guard);
// the default of every rule is `report`.

import type { EngineInterface, Register } from "claude-code";
import { recordTurn, registerLedger } from "./features/ledger/register";
import { registerGuard } from "./features/guard/register";
import { registerReport, startReport } from "./features/report/register";
import { evaluateNow, registerRules } from "./features/rules/register";
import { registerWaiver, startWaiver } from "./features/waiver/register";

/** One slice failing leaves the others working, and never disturbs the session. */
async function guarded($: EngineInterface, slice: string, work: Promise<void>): Promise<void> {
	try {
		await work;
	} catch (error) {
		$.ui.log(`${slice}: selhalo: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
	}
}

export const register: Register = (on) => {
	on("session.start", async ($, e, next) => {
		await guarded($, "report", startReport($));
		await guarded($, "waiver", startWaiver($));
		await guarded($, "rules", evaluateNow($));
		return next(e);
	});

	// The closing text of a turn goes to the ledger, then the session is judged again.
	on("turn.complete", async ($, e, next) => {
		const result = await next(e);
		if (e.agentId === undefined) {
			await guarded($, "ledger", recordTurn($, e.answer));
			await guarded($, "rules", evaluateNow($));
		}
		return result;
	});

	// Last look at the work tree (leftovers); the bound is short, so nothing else happens here.
	on("session.end", async ($, e, next) => {
		await guarded($, "rules", evaluateNow($));
		return next(e);
	});

	// Registered first: it wraps the later hooks of the same event (report answers /watch, rules is below it).
	registerReport(on);
	registerLedger(on);
	// After the ledger, so the ledger records what the guard refuses.
	registerGuard(on);
	registerWaiver(on);
	registerRules(on);
};
