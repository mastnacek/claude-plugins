// muscle.ts — pure part of the routine gate (Proposal 11 §5): reading the engine's
// dry-run report and the dialog that shows its steps. The hook in register.ts
// asks the engine itself, so the dialog shows what will run, not what the model says.

import { T } from "../../shared/proposal";

export interface MuscleStep {
	command: string;
	args: string[];
}

export interface MusclePlan {
	/** Fingerprint of the plan (16 hex chars). */
	planHash: string;
	steps: MuscleStep[];
	/** The routine's fact ID, when the engine reports it. */
	factId: string | undefined;
}

/** `uma muscle run <name> --json` — a dry-run; stdout is the JSON report. */
export function dryRunArgv(name: string): string[] {
	return ["uma", "muscle", "run", name, "--json"];
}

/** Reads the dry-run report. Undefined when it is unusable (no hash, no steps array). */
export function parseDryRun(stdout: string): MusclePlan | undefined {
	try {
		const r = JSON.parse(stdout) as { plan_hash?: unknown; plan?: unknown; fact_id?: unknown };
		if (typeof r.plan_hash !== "string" || !/^[0-9a-f]{16}$/.test(r.plan_hash)) return undefined;
		if (!Array.isArray(r.plan)) return undefined;
		const steps: MuscleStep[] = [];
		for (const s of r.plan as Array<{ command?: unknown; args?: unknown }>) {
			if (typeof s?.command !== "string" || !Array.isArray(s.args)) return undefined;
			steps.push({ command: s.command, args: s.args.map(String) });
		}
		return { planHash: r.plan_hash, steps, factId: typeof r.fact_id === "string" ? r.fact_id : undefined };
	} catch {
		return undefined;
	}
}

const RULE = "─".repeat(32);
/** A longer step line is cut with a mark, so the reader knows there is more. */
const MAX_STEP_CHARS = 300;

function stepLine(step: MuscleStep): string {
	const line = ["$", step.command, ...step.args].join(" ").replace(/\s*\n\s*/g, " ⏎ ");
	return line.length <= MAX_STEP_CHARS ? line : `${line.slice(0, MAX_STEP_CHARS)}… (+${line.length - MAX_STEP_CHARS} znaků)`;
}

/** The question for a routine run: name, fact ID, fingerprint and every step as `$ command args…` (never the label). */
export function previewOfMuscle(name: string, plan: MusclePlan): string {
	return [
		T.immuneDialogTitle,
		`⚙️ Rutina „${name}“ spustí ${plan.steps.length} ${plan.steps.length === 1 ? "krok" : plan.steps.length < 5 ? "kroky" : "kroků"}`,
		...(plan.factId ? [`   ID faktu: ${plan.factId}`] : []),
		`   Otisk: ${plan.planHash}`,
		RULE,
		...plan.steps.map((s) => `   ${stepLine(s)}`),
		RULE,
		"Spustit rutinu?",
	].join("\n");
}

export const MUSCLE_NO_UI_REASON = "Spuštění rutiny UMA vyžaduje souhlas uživatele, ale nelze se zeptat (bez dialogu). Nespuštěno.";
export const MUSCLE_ONE_PER_COMMAND = "Spouštěj jednu rutinu UMA na příkaz (jeden `uma muscle run … --confirm` bez dalších příkazů měnících paměť), ať uživatel v dialogu vidí všechno, co poběží.";
export const MUSCLE_NO_NAME = "V příkazu `uma muscle run … --confirm` chybí název rutiny.";
export const MUSCLE_NO_HASH = "Spusť rutinu s --plan-hash z dry-runu nástroje uma_muscle (`uma muscle run <název> --confirm --plan-hash <otisk>`); bez otisku se nespustí.";
export const MUSCLE_DRY_RUN_FAILED = (name: string, detail: string): string => `Náhled rutiny „${name}“ selhal, nespuštěno: ${detail}`;
export const MUSCLE_CHANGED = "Rutina se od náhledu změnila (otisk v příkazu nesouhlasí s aktuálním). Nespuštěno; udělej nový dry-run nástrojem uma_muscle.";
export const MUSCLE_DENIED = "Uživatel spuštění rutiny UMA zamítl. Nespouštěj ji znovu bez nového pokynu.";
