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

/** A marker that is no explicit error indicator: it corrects a plain message, but does not turn a request for an operation into a repair request. */
const WEAK_MARKER = "instead of";

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
 * A request for an operation (not a correction unless it also carries an explicit error
 * indicator, see `isUserCorrection`): the message opens with an imperative verb ("Enable uma
 * memory globally instead of …", "Přidej …") or points at a command to run ("there is
 * an uma command for this"). Pi's TASK_DIRECTIVE misses these: "instead of" alone then
 * staged guidance as a correction. A correction opens with its own word ("Špatně",
 * "No", "Don't use …"), so those openers are not in the list.
 */
const OPERATION_REQUEST =
	/^(?:please\s+|prosím\s+)?(?:enable|disable|add|create|install|set\s?up|switch|turn|make|run|call|open|show|write|implement|fix|update|remove|delete|start|stop|try|check|find|list|move|rename|configure|migrate|zapni|vypni|přidej|vytvoř|nainstaluj|nastav|přepni|udělej|spusť|zavolej|otevři|ukaž|napiš|implementuj|oprav|uprav|odstraň|smaž|zkus|zkontroluj|najdi)\b|\bcommand\s+for\s+(?:this|that|it)\b|\bpříkaz\s+(?:na|pro)\s+(?:to|tohle)\b|\b(?:uma|git|npm|cargo|claude)\s+(?:command|příkaz)\b/i;

/**
 * True when a user message corrects the agent and is worth distilling.
 * A task directive or an operation request is never a correction; a correction reacts
 * to something, so without an earlier assistant reply there is nothing to correct. The
 * text is the person's own (Claude Code hands the prompt as typed), so Czech markers
 * match directly. Pi's extra input, the translate plugin's record of the original text,
 * has no counterpart here: the prompt is not translated.
 */
export function isUserCorrection(text: string, hasPriorAssistant: boolean): boolean {
	const t = text.trim();
	if (!hasPriorAssistant || !t || t.length >= MAX_CORRECTION_CHARS || TASK_DIRECTIVE.test(t)) return false;
	const lower = t.toLowerCase();
	const explicit = CORRECTION_OPENERS.test(t) || CORRECTION_MARKERS.some((m) => m !== WEAK_MARKER && lower.includes(m));
	if (OPERATION_REQUEST.test(t)) return explicit;
	return explicit || lower.includes(WEAK_MARKER);
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

/** A test file by name or folder: `*.test.*`, `*.spec.*`, `*_test.*`, `test_*.py`, `tests/`, `__tests__/`. */
export function isTestPath(path: string): boolean {
	const p = path.replace(/\\/g, "/");
	const name = p.slice(p.lastIndexOf("/") + 1);
	return /\.(?:test|spec)\.[^.]+$/.test(name) || /_test\.[^.]+$/.test(name) || /^test_.*\.py$/.test(name) || /(?:^|\/)(?:tests?|__tests__)\//.test(p);
}

/** Only the build/test parts of a compound command: `cd x && sed -i … && tsc` → `tsc`. */
function testPart(command: string): string {
	const parts = command.split(/&&|\|\||;|\|/).map((c) => c.trim()).filter(isTestOrBuildCommand);
	return parts.length > 0 ? parts.join(" && ") : command.trim();
}

/** Files a shell command writes: in-place `sed`/`perl`, `tee`, `>`/`>>` redirects. */
export function shellWrittenPaths(command: string): string[] {
	const pathLike = /^[\w./@~-]*\w\.\w+$/;
	const out: string[] = [];
	for (const part of command.split(/&&|\|\||;|\|/)) {
		const tokens = part.trim().split(/\s+/);
		if (/\b(?:sed|perl)\b/.test(part) && tokens.some((t) => /^-\w*i/.test(t) || t === "--in-place")) out.push(...tokens.filter((t) => pathLike.test(t)));
		tokens.forEach((t, i) => {
			if (t === "tee" || t === ">" || t === ">>") {
				const next = tokens[i + 1];
				if (next !== undefined && pathLike.test(next)) out.push(next);
			}
		});
	}
	return out;
}

/** The context handed to the judge once a red build/test run was followed by a green one: the error and what fixed it, never the edit command itself. */
export function recoveryContext(failedCommand: string, failedOutput: string, okCommand: string, edited: readonly string[]): string {
	return `Command \`${testPart(failedCommand)}\` initially failed:\n${failedOutput.trim()}\n\nFixed by changing: ${edited.join(", ")}.\nSubsequent command succeeded: \`${testPart(okCommand)}\`.`;
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

/** Most changed files kept (and named in the context) per failure. */
const MAX_EDITED = 5;

/** The last red build/test run, kept until a green one follows (or it grows stale), and the non-test files changed since. */
export type Failure = { command: string; output: string; at: number; edited: string[] };

/** A file changed after a red run: only non-test files count as a fix worth learning from. */
export function afterEdit(failure: Failure | null, path: string): Failure | null {
	if (!failure || !path || isTestPath(path)) return failure;
	const edited = failure.edited ?? [];
	if (edited.includes(path) || edited.length >= MAX_EDITED) return failure;
	return { ...failure, edited: [...edited, path] };
}

/**
 * What a finished Bash call changes: a red build/test run is remembered; a green one
 * within the TTL of a red one is a recovery (the context to distill) and clears it —
 * but only when a non-test file changed in between. A test file edited to match the
 * code, or a bare rerun, teaches nothing. Files the command itself writes count too.
 * Anything that is not a build/test command leaves the memory as it was.
 */
export function afterBash(failure: Failure | null, command: string, failed: boolean, output: string, now: number): { failure: Failure | null; context?: string } {
	let current = failure;
	for (const path of shellWrittenPaths(command)) current = afterEdit(current, path);
	if (!isTestOrBuildCommand(command)) return { failure: current };
	if (failed) return { failure: { command, output: output.slice(0, OUTPUT_CHARS), at: now, edited: [] } };
	if (current && now - current.at < FAILURE_TTL_MS) {
		const edited = current.edited ?? [];
		return edited.length > 0 ? { failure: null, context: recoveryContext(current.command, current.output, command, edited) } : { failure: null };
	}
	return { failure: current };
}
