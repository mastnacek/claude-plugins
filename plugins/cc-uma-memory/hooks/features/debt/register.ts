// debt — at the end of the main agent's turn, open blocking debts of the
// Prospective Debt Ledger are put back to the model as a prompt, so it carries
// on (settles or explains them) instead of quietly finishing.
//
//   turn.start {main}     a turn that is not our own continuation starts a new run: counter to 0
//   turn.complete {main}  `uma debt check` → blocking > 0 → $.prompt.submit(reminder), at most
//                         twice per run; then only one $.ui.log line
//   command.run {uma}     after `/uma debt …` re-reads the count (the label under the prompt)
//
// A `turn.complete` hook can only return text; it cannot make the model continue.
// `$.prompt.submit` can: it starts a turn of its own once the session is idle.

import type { EngineInterface, On } from "claude-code";
import { atom, read, update } from "claude-code";
import { cannotCheckLine, checkArgv, decide, parseReport, stillOpenLine } from "./policy";

// Atoms are declared in every file that reads them (the validator's scan reads literals).
const debtStateAtom = atom({ plugin: "cc-uma-memory", key: "debtState" } as const, { blocking: 0, reminders: 0, continuing: false, failing: false } as { blocking: number; reminders: number; continuing: boolean; failing: boolean });

type $ = EngineInterface;

const TIMEOUT_MS = 5000;

/** `uma debt check` in the session's cwd; a reason when it cannot be had (no git repo, no binary, timeout). */
async function check($: $): Promise<{ blocking: number; reminder: string } | string> {
	try {
		const run = await $.process.run(checkArgv(), { cwd: await $.session.cwd(), timeoutMs: TIMEOUT_MS });
		if (run.exitCode !== 0) return run.stderr.split("\n").find((l) => l.trim())?.trim() || `uma skončila kódem ${run.exitCode}`;
		return parseReport(run.stdout) ?? "uma vrátila nečitelnou odpověď";
	} catch (error) {
		return error instanceof Error ? (error.message.split("\n")[0] ?? "") : String(error);
	}
}

/** Reads the ledger into the state; a failure is logged once per series and counts as no debts. */
async function refresh($: $): Promise<{ blocking: number; reminder: string } | undefined> {
	const result = await check($);
	if (typeof result === "string") {
		if (!(await read($, debtStateAtom)).failing) $.ui.log(cannotCheckLine(result));
		await update($, debtStateAtom, (s) => ({ ...s, blocking: 0, failing: true }));
		return undefined;
	}
	await update($, debtStateAtom, (s) => ({ ...s, blocking: result.blocking, failing: false }));
	return result;
}

export function registerDebt(on: On): void {
	on("turn.start", async ($, e, next) => {
		if (e.agentId === undefined) {
			// The run is the user's prompt plus the continuations we started: our own turn keeps the counter.
			await update($, debtStateAtom, (s) => ({ ...s, reminders: s.continuing ? s.reminders : 0, continuing: false }));
		}
		return next(e);
	});

	on("turn.complete", async ($, e, next) => {
		const result = await next(e);
		if (e.agentId !== undefined) return result;
		const report = await refresh($);
		// An interrupted or failed turn is not a settle attempt: the label is fresh, the model is left alone.
		if (!report || e.reason !== "answer") return result;
		const state = await read($, debtStateAtom);
		const decision = decide(report.blocking, state.reminders);
		if (decision === "log") $.ui.log(stillOpenLine(report.blocking));
		if (decision === "remind") {
			await update($, debtStateAtom, (s) => ({ ...s, reminders: s.reminders + 1, continuing: true }));
			// Not awaited: it resolves when the new turn starts, which this hook must not wait for.
			$.prompt.submit({ text: report.reminder }).catch(() => undefined);
		}
		return result;
	});

	on("command.run", { command: "uma" }, async ($, e, next) => {
		const result = await next(e);
		if (e.args.trim().split(/\s+/)[0] === "debt") await refresh($);
		return result;
	});
}
