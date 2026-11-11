// policy.ts — pure logic of the shadow worker: what counts as a failure, a recovery,
// a user correction and a dependency change, and the `uma staging distill` call.
// Port of pi's slices/shadow (policy.ts, the detection in index.ts); running the
// process is the caller's job. The SPAI promotion of pi is dropped: Claude Code has
// no SPAI tool.

/** A failure is forgotten after this long: a later green run is no longer its recovery. */
export const FAILURE_TTL_MS = 5 * 60 * 1000;

/** Longest correction (characters) worth distilling; a longer message is a task, not a correction. */
export const MAX_CORRECTION_CHARS = 300;

/** How much of a failing command's output the draft's context keeps. */
export const OUTPUT_CHARS = 500;

/** Longest slice of a manifest edit passed as context. */
const EDIT_CHARS = 300;

/**
 * True when a command's output indicates a real failure.
 *
 * A bare "failed" is NOT a failure: `cargo test` prints "0 failed" on a green
 * run, so the old `output.includes("failed")` staged a bogus compiler-recovery
 * draft after every successful test run. A failure requires a NON-ZERO count, a
 * compiler error marker, or the tool's own error flag.
 */
export function isCommandFailure(output: string, toolReportedError: boolean): boolean {
	if (toolReportedError) return true;
	if (/\b[1-9]\d*\s+(?:failed|failure|failures|errors?)\b/i.test(output)) return true;
	const lower = output.toLowerCase();
	return lower.includes("error[e") || lower.includes("err!") || lower.includes("error:");
}

/** Commands whose red-then-green sequence is worth a draft (pi's list). */
export function isTestOrBuildCommand(command: string): boolean {
	const lower = command.toLowerCase().trim();
	return ["cargo test", "cargo build", "npm test", "npm run build", "pytest", "go test", "tsc"].some((c) => lower.includes(c));
}

/** Phrases that mark a user message as correcting the agent. */
const CORRECTION_MARKERS: readonly string[] = [
	// Czech
	"takhle ne", "nepouzivej", "nepoužívej", "spatne", "špatně", "chyba", "tam ne", "nedělej to",
	// English
	"don't use", "do not use", "never use", "instead of", "that's wrong", "thats wrong",
	"that is wrong", "this is wrong", "that's a mistake", "that is a mistake", "that is an error",
	"that's incorrect", "that is incorrect", "you should not",
];

/** English openers a translation produces for "Špatně:" / "Chyba:". */
const CORRECTION_OPENERS = /^(?:wrong|incorrect|mistake|error)\s*[:!,.-]/i;

/**
 * A task directive is not a correction: it names a tool or an explicit
 * operation ("use the edit tool", "call uma_write", "spusť …"). Live finding in pi
 * 2026-10-28: a test directive containing "never use" was staged as a
 * correction that reversed the real rule.
 */
const TASK_DIRECTIVE =
	/\b(?:use|call|run|invoke)\s+(?:the\s+)?[\w-]+\s+tool\b|\buma_[a-z_]+\b|\bnástroj\w*|\b(?:zavolej|spusť|použij nástroj|vytvoř soubor)\b|\b(?:edit|write|bash|read)\s+tool\b/i;

/**
 * True when a user message corrects the agent and is worth distilling.
 * A task directive is never a correction; a correction reacts to something, so
 * without an earlier assistant reply there is nothing to correct. The text is the
 * person's own (Claude Code hands the prompt as typed), so Czech markers match directly.
 */
export function isUserCorrection(text: string, hasPriorAssistant: boolean): boolean {
	const t = text.trim();
	if (!hasPriorAssistant || !t || t.length >= MAX_CORRECTION_CHARS || TASK_DIRECTIVE.test(t)) return false;
	const lower = t.toLowerCase();
	return CORRECTION_OPENERS.test(t) || CORRECTION_MARKERS.some((m) => lower.includes(m));
}

/** Whether a path is a dependency manifest the worker watches. */
export const isManifest = (path: string): boolean => path.endsWith("Cargo.toml") || path.endsWith("package.json");

/**
 * The text of a manifest edit, or undefined when it is not a dependency change.
 * `Write` counts only when its content mentions dependencies; any `Edit` counts (pi).
 */
export function dependencyContext(tool: string, path: string, text: string): string | undefined {
	if (!isManifest(path)) return undefined;
	if (tool === "Write" && !text.includes("dependencies")) return undefined;
	if (tool === "Edit" && !text.trim()) return undefined;
	return `File: ${path}\nModified dependencies:\n${text.slice(0, EDIT_CHARS)}`;
}

/** The context handed to the judge once a red build/test run was followed by a green one. */
export function recoveryContext(failedCommand: string, failedOutput: string, okCommand: string): string {
	return `Command \`${failedCommand}\` initially failed:\n${failedOutput.trim()}\n\nSubsequent command succeeded: \`${okCommand}\`.`;
}

export type Trigger = "compiler_recovery" | "user_correction" | "dependency_change";

/** `uma staging distill` — the judge is Jev only in the `jev` mode; `off` stages a draft by heuristic, with no network. */
export function distillArgv(trigger: Trigger, context: string, mode: "on" | "jev"): string[] {
	return ["uma", "staging", "distill", "--trigger", trigger, "--context", context, "--judge", mode === "jev" ? "jev" : "off", "--json"];
}

/** Whether `uma staging distill --json` staged a draft: an id, and the judge did not call it non-durable. */
export function stagedDraft(stdout: string): boolean {
	try {
		const parsed: unknown = JSON.parse(stdout);
		if (typeof parsed !== "object" || parsed === null) return false;
		const { id, durable } = parsed as { id?: unknown; durable?: unknown };
		return durable !== false && typeof id === "string" && id !== "";
	} catch {
		return false;
	}
}

/** The last red build/test run, kept until a green one follows (or it grows stale). */
export type Failure = { command: string; output: string; at: number };

/**
 * What a finished Bash call changes: a red build/test run is remembered; a green one
 * within the TTL of a red one is a recovery (the context to distill) and clears it.
 * Anything that is not a build/test command leaves the memory as it was.
 */
export function afterBash(failure: Failure | null, command: string, failed: boolean, output: string, now: number): { failure: Failure | null; context?: string } {
	if (!isTestOrBuildCommand(command)) return { failure };
	if (failed) return { failure: { command, output: output.slice(0, OUTPUT_CHARS), at: now } };
	if (failure && now - failure.at < FAILURE_TTL_MS) return { failure: null, context: recoveryContext(failure.command, failure.output, command) };
	return { failure };
}
