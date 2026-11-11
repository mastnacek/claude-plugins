// policy.ts — pure logic of the debt reminders: the `uma debt check` call, its
// report, and how many times a run may be nudged. Port of `decideDebtEnforcement`
// from pi (slices/debt/ledger.ts); running the process is the caller's job.

/** Who the debts are recorded for (`--origin`): the engine tags each debt with the client that added it. */
export const DEBT_ORIGIN = "claude-code";

/** A run may spend this many continuations on reminders; after that the person is only told. */
export const MAX_REMINDERS_PER_RUN = 2;

export const checkArgv = (): string[] => ["uma", "debt", "check", "--origin", DEBT_ORIGIN, "--json"];

export type Report = { blocking: number; reminder: string };

/** `{ blocking, reminder }` from `uma debt check --json`; undefined when stdout is anything else. */
export function parseReport(stdout: string): Report | undefined {
	try {
		const value: unknown = JSON.parse(stdout);
		if (typeof value !== "object" || value === null) return undefined;
		const { blocking, reminder } = value as Record<string, unknown>;
		if (typeof blocking !== "number" || !Number.isInteger(blocking) || blocking < 0 || typeof reminder !== "string") return undefined;
		return { blocking, reminder };
	} catch {
		return undefined;
	}
}

export type Decision = "allow" | "remind" | "log";

/** No blocking debts → allow; fewer than the cap used → remind (the model continues); cap spent → only log. */
export function decide(blocking: number, remindersUsed: number): Decision {
	if (blocking === 0) return "allow";
	return remindersUsed < MAX_REMINDERS_PER_RUN ? "remind" : "log";
}

/** The one line shown when the cap is spent and debts are still open. */
export const stillOpenLine = (blocking: number): string => `Otevřených blokujících dluhů: ${blocking} — připomínky tohoto běhu jsou vyčerpané, viz /uma debt list`;

export const cannotCheckLine = (reason: string): string => `dluhy se nepodařilo zkontrolovat: ${reason}`;
