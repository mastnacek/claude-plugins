// humility — the epistemic-humility gate (port of pi's humility_gate; Proposal 11 §9 step 4).
// The MCP tool `uma_humility` only advises; this slice makes a LOW verdict binding for the
// first edit, when the person has switched it on (`/uma humility on`, default off):
//
//   tool.call uma_humility   the verdict LOW (+ exploration_required) flags the directories of its `files`;
//                            every check replaces the flags (a new intent starts clean, a HIGH one clears)
//   tool.call Read           a file under a flagged directory counts toward `required_reads`
//   tool.call Write, Edit, NotebookEdit  into a flagged directory → deny until enough files are read AND
//                            the model has stated a hypothesis; then it runs, the flag is confirmed
//
// The hypothesis is the model's own words, not a tool call (the MCP tool has no `confirm`): a reply line
// `Hypothesis: …` written after the check, read from the transcript. The person is not asked — pi's
// last-resort "proceed anyway?" dialog is a no here: a deny names exactly what is missing.
// Every failure of the slice lets the call pass.

import type { EngineInterface, On } from "claude-code";
import { atom, read, update } from "claude-code";
import { absolute, decide, flagsOf, parseVerdict, statesHypothesis, withRead } from "./policy";
import type { Flag } from "./policy";

// Atoms are declared in every file that reads them (the validator's scan reads literals).
const settingsAtom = atom({ plugin: "cc-uma-memory", key: "settings" } as const, { recall: true, writeGate: "ask", append: true, immune: "warn", immuneModel: "", humility: false, shadow: "on", lang: "cs" } as { recall: boolean; writeGate: "ask" | "off"; append: boolean; immune: "off" | "warn" | "ask" | "auto"; immuneModel: string; humility: boolean; shadow: "off" | "on" | "jev"; lang: "cs" | "en" }, { shape: "settings-6" });
const stateAtom = atom({ plugin: "cc-uma-memory", key: "humilityState" } as const, { session: "", intent: "", since: 0, flags: [] } as { session: string; intent: string; since: number; flags: Flag[] });

type $ = EngineInterface;

const HUMILITY_TOOL = "mcp__plugin_cc-uma-memory_uma__uma_humility";

const enabled = async ($: $): Promise<boolean> => (await read($, settingsAtom)).humility;

/** This session's state; another session's leftovers count as none. */
async function current($: $): Promise<{ session: string; intent: string; since: number; flags: Flag[] }> {
	const [state, session] = [await read($, stateAtom), await $.session.id()];
	return state.session === session ? state : { session, intent: "", since: 0, flags: [] };
}

async function flagFromCheck($: $, e: Record<string, unknown>, text: string | undefined): Promise<void> {
	const cwd = await $.session.cwd();
	const verdict = parseVerdict(text);
	const files = Array.isArray(e.files) ? e.files.filter((f): f is string => typeof f === "string" && f !== "") : [];
	const flags = verdict.low ? flagsOf(files, cwd, verdict.required) : [];
	const session = await $.session.id();
	const since = (await $.session.messages()).length;
	await update($, stateAtom, () => ({ session, intent: typeof e.intent === "string" ? e.intent : "", since, flags }));
}

async function countRead($: $, path: string): Promise<void> {
	const state = await current($);
	if (state.flags.length === 0) return;
	const flags = withRead(state.flags, absolute(path, await $.session.cwd()));
	if (flags !== state.flags) await update($, stateAtom, () => ({ ...state, flags }));
}

/** Did the calling agent say `Hypothesis: …` after the check? A subagent's own conversation is read whole. */
async function stated($: $, agentId: string | undefined, since: number): Promise<boolean> {
	const messages = await $.session.messages(agentId === undefined ? {} : { agentId });
	if (!Array.isArray(messages)) return false; // no transcript to read (a denied agent lookup): the hypothesis cannot be shown
	return messages.slice(agentId === undefined ? since : 0).some((m: { role: string; text: string }) => m.role === "assistant" && statesHypothesis(m.text));
}

async function gate($: $, e: Record<string, unknown>, path: unknown): Promise<{ deny: string } | undefined> {
	if (typeof path !== "string" || path === "" || !(await enabled($))) return undefined;
	const state = await current($);
	if (state.flags.length === 0) return undefined;
	const agentId = typeof e.agentId === "string" ? e.agentId : undefined;
	const decision = await decide(state.flags, absolute(path, await $.session.cwd()), () => stated($, agentId, state.since));
	if (decision.kind === "deny") return { deny: decision.reason };
	const confirm = decision.confirm;
	if (confirm) await update($, stateAtom, () => ({ ...state, flags: state.flags.map((f) => (f.dir === confirm.dir ? { ...f, confirmed: true } : f)) }));
	return undefined;
}

/** A failure of the slice never stops the call. */
async function safely(work: Promise<unknown>): Promise<void> {
	try {
		await work;
	} catch {
		// the gate is advice with teeth, not a reason to break the work
	}
}

type Done = { isError?: true; deny?: string; text?: string };

export function registerHumility(on: On): void {
	// The matcher types know MCP tools only while the server was connected at the last save: the name is cast.
	on("tool.call", { tool: HUMILITY_TOOL as never }, async ($, e, next) => {
		const done = (await next(e as never)) as Done;
		if (done.isError !== true && done.deny === undefined) await safely(enabled($).then((yes) => (yes ? flagFromCheck($, e as Record<string, unknown>, done.text) : undefined)));
		return done as never;
	});

	on("tool.call", { tool: "Read" }, async ($, e, next) => {
		const done = await next(e);
		if (done.isError !== true && done.deny === undefined) await safely(enabled($).then((yes) => (yes ? countRead($, e.file_path) : undefined)));
		return done;
	});

	// After write-gate (it refuses the store first), before immune (cheap and without processes: no point judging an edit that is stopped here).
	on("tool.call", { tool: "Write" }, async ($, e, next) => (await gate($, e as Record<string, unknown>, e.file_path).catch(() => undefined)) ?? next(e));
	on("tool.call", { tool: "Edit" }, async ($, e, next) => (await gate($, e as Record<string, unknown>, e.file_path).catch(() => undefined)) ?? next(e));
	on("tool.call", { tool: "NotebookEdit" }, async ($, e, next) => (await gate($, e as Record<string, unknown>, e.notebook_path).catch(() => undefined)) ?? next(e));
}
