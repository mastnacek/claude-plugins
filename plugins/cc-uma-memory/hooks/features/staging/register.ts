// staging — the drafts the shadow worker (and muscle synthesis) staged in `.uma/.staging/`
// wait here for the person (port of pi's slices/staging). Nothing reaches memory until
// they say so: `/uma review` shows each draft in the same step dialog as write-gate's
// proposal and approves it with `uma staging approve`, or throws it away with `discard`.
//
//   command.run {uma}      review · staging list | show <id> | discard <id>; the rest goes down
//   turn.complete {answer} re-reads the count of waiting drafts (the label ` 📝N` under the prompt)
//   start                  the same read at session start (run by the root)
//
// Bash `uma staging approve|discard` stays behind write-gate's dialog: only the person's
// own `/uma review` approves without asking again, because that dialog IS the asking.

import type { EngineInterface, On } from "claude-code";
import { atom, read, update } from "claude-code";
import { BACK, BACK_FULL, DONE, HEADER, APPROVE, REJECT, fieldQuestion, fullTextQuestion, optionOf, withField, PICK_BODY, PICK_FULL, PICK_TITLE } from "../../shared/proposal";
import type { EditField, Proposal } from "../../shared/proposal";
import { EDIT_DRAFT, EDIT_PICKS, NO_DRAFTS, SKIP_DRAFT, USAGE, approveArgv, discardArgv, isDraftId, listArgv, parseDrafts, proposalOf, questionOf, renderList, renderShow, reviewSummary } from "./policy";
import type { Draft } from "./policy";

// Atoms are declared in every file that reads them (the validator's scan reads literals).
const commandOutputsAtom = atom({ plugin: "cc-uma-memory", key: "commandOutputs" } as const, {} as Record<string, string>);
const stagingStateAtom = atom({ plugin: "cc-uma-memory", key: "stagingState" } as const, { pending: 0 } as { pending: number });

type $ = EngineInterface;

const COMMAND = "uma";
const MAX_OUTPUTS = 20;
const TIMEOUT_MS = 10_000;

type Run = { ok: true; stdout: string } | { ok: false; reason: string };

/** One `uma` call in the session's cwd (the engine scopes `.uma/` by the git root). */
async function uma($: $, argv: string[]): Promise<Run> {
	try {
		const run = await $.process.run(argv, { cwd: await $.session.cwd(), timeoutMs: TIMEOUT_MS });
		if (run.exitCode === 0) return { ok: true, stdout: run.stdout };
		return { ok: false, reason: (run.stderr || run.stdout).split("\n").find((l) => l.trim())?.trim() || `uma skončila kódem ${run.exitCode}` };
	} catch (error) {
		return { ok: false, reason: error instanceof Error ? (error.message.split("\n")[0] ?? "") : String(error) };
	}
}

/** The waiting drafts; a failure (no binary, not a git repo) is a reason instead. */
async function load($: $): Promise<Draft[] | string> {
	const run = await uma($, listArgv());
	return run.ok ? parseDrafts(run.stdout) : run.reason;
}

/**
 * Re-reads the count for the label from the drafts' folder (`<cwd>/.uma/.staging/*.json`, as
 * pi did): a directory listing, no process per turn. No folder or no way to read it = none.
 * `/uma review` and `/uma staging` use the engine's own list, which is exact in a subfolder too.
 */
async function refresh($: $): Promise<void> {
	let pending = 0;
	try {
		const entries = await $.fs.list(`${await $.session.cwd()}/.uma/.staging`);
		pending = entries.filter((f) => f.kind === "file" && f.name.endsWith(".json")).length;
	} catch {
		// No folder yet: nothing is waiting.
	}
	await update($, stagingStateAtom, () => ({ pending }));
}

/** One step of the dialog: the answer, or undefined when nobody can answer (dismissed, `-p`). */
async function ask($: $, question: string, options: string[]): Promise<string | undefined> {
	try {
		return optionOf(await $.ui.ask(question, { options, header: HEADER }), options);
	} catch {
		return undefined;
	}
}

/** The edit menu → one field (or the full text) → back; returns the proposal as changed. Dismissed = no change. */
async function editMenu($: $, v: Proposal, question: string): Promise<Proposal> {
	const pick = await ask($, `✏️ Co upravit?\n\n${question}`, [...EDIT_PICKS]);
	if (pick === PICK_FULL) {
		await ask($, fullTextQuestion(v), [BACK_FULL, DONE]);
		return v;
	}
	const field: EditField | undefined = pick === PICK_TITLE ? "title" : pick === PICK_BODY ? "body" : undefined;
	if (field === undefined) return v;
	const typed = await ask($, fieldQuestion(v, field), [BACK, DONE]);
	return typed === undefined || typed === BACK || typed === DONE ? v : withField(v, field, typed);
}

type Tally = { approved: number; discarded: number; skipped: number; failed: number };

/** What the person decided about one draft; "stop" ends the whole review. */
async function reviewOne($: $, d: Draft, index: number, total: number, projectName: string, tally: Tally): Promise<"next" | "stop"> {
	let v = proposalOf(d, projectName);
	for (;;) {
		const question = questionOf(d, v, index, total);
		const answer = await ask($, question, [APPROVE, EDIT_DRAFT, SKIP_DRAFT, REJECT]);
		// Dismissed, no one to ask, or text typed under "Other": the review stops, nothing is decided for the rest.
		if (answer === undefined || (answer !== APPROVE && answer !== EDIT_DRAFT && answer !== SKIP_DRAFT && answer !== REJECT)) return "stop";
		if (answer === EDIT_DRAFT) {
			v = await editMenu($, v, question);
			continue;
		}
		if (answer === SKIP_DRAFT) {
			tally.skipped++;
			return "next";
		}
		const done = await uma($, answer === APPROVE ? approveArgv(d.id, v, d) : discardArgv(d.id));
		if (done.ok) {
			if (answer === APPROVE) tally.approved++;
			else tally.discarded++;
		} else {
			tally.failed++;
			$.ui.log(`koncept ${d.id}: ${done.reason}`);
		}
		return "next";
	}
}

async function review($: $): Promise<string> {
	const drafts = await load($);
	if (typeof drafts === "string") return `Koncepty se nepodařilo načíst: ${drafts}`;
	if (drafts.length === 0) return NO_DRAFTS;
	const cwd = await $.session.cwd();
	const projectName = cwd.split(/[\\/]/).filter(Boolean).pop() || "project";
	const tally: Tally = { approved: 0, discarded: 0, skipped: 0, failed: 0 };
	let stopped = false;
	for (const [i, d] of drafts.entries()) {
		if ((await reviewOne($, d, i, drafts.length, projectName, tally)) === "stop") {
			stopped = true;
			tally.skipped += drafts.length - i;
			break;
		}
	}
	return reviewSummary(tally, stopped);
}

async function stagingCommand($: $, words: string[]): Promise<string> {
	const [action, id, ...extra] = words;
	if (action === undefined || action === "list") {
		if (id !== undefined) return USAGE;
		const drafts = await load($);
		return typeof drafts === "string" ? `Koncepty se nepodařilo načíst: ${drafts}` : renderList(drafts);
	}
	if ((action !== "show" && action !== "discard") || !isDraftId(id) || extra.length > 0) return USAGE;
	if (action === "discard") {
		const done = await uma($, discardArgv(id));
		return done.ok ? done.stdout.trim().split("\n")[0] || `Koncept ${id} zahozen.` : `Koncept ${id} se nepodařilo zahodit: ${done.reason}`;
	}
	const drafts = await load($);
	if (typeof drafts === "string") return `Koncepty se nepodařilo načíst: ${drafts}`;
	const found = drafts.find((d) => d.id.toLowerCase() === id.toLowerCase());
	return found ? renderShow(found) : `Koncept ${id} nenalezen. Zkus /uma staging list.`;
}

function capOutputs(record: Record<string, string>): Record<string, string> {
	const keys = Object.keys(record);
	if (keys.length <= MAX_OUTPUTS) return record;
	const next: Record<string, string> = {};
	for (const key of keys.slice(keys.length - MAX_OUTPUTS)) next[key] = record[key] as string;
	return next;
}

export function registerStaging(on: On): void {
	on("command.run", { command: COMMAND }, async ($, e, next) => {
		const [sub, ...rest] = e.args.trim().split(/\s+/).filter(Boolean);
		if (sub !== "review" && sub !== "staging") return next(e);
		const output = (sub === "review" ? (rest.length > 0 ? "Použití: /uma review" : await review($)) : await stagingCommand($, rest)).trimEnd();
		await refresh($);
		const [summary = "", ...more] = output.split("\n");
		if (more.length > 0) await update($, commandOutputsAtom, (o) => capOutputs({ ...o, [summary]: output }));
		return { text: summary };
	});

	// Drafts appear while a turn runs (shadow, muscle synthesis): the label catches up when it ends.
	on("turn.complete", { reason: "answer" }, async ($, e, next) => {
		const result = await next(e);
		if (e.agentId === undefined) await refresh($);
		return result;
	});
}

/** Session start, run by the root: the count of drafts that waited from earlier sessions. */
export async function startStaging($: EngineInterface): Promise<void> {
	await refresh($);
}
