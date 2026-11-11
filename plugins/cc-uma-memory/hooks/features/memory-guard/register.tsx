// memory-guard — /uma claude-memory: turns Claude Code's automatic memory on and off
// (UMA is the one memory) and keeps its state visible as a tag under the prompt.
//
//   start                  reads the three settings layers into memoryState
//   command.run {uma}      answers `claude-memory [on|off] [--global]`, passes the rest down
//   ui.render PromptHint   adds the tag [UMA] / [UMA ⚠ CC] (+ ↻ once changed) to its tail
//
// The command itself (registration, help, drawing multi-line output,
// completion) is the uma-command slice's. A plugin's command text goes into the
// model's requests, so the model gets only the output's first line; the full
// text goes to $.state (`commandOutputs`), which uma-command draws.

import type { EngineInterface, On } from "claude-code";
import { atom, read, update } from "claude-code";
import { addToTail, buildBadge } from "./badge";
import { effectiveState, setAutoMemory } from "./settings";
import type { Layers, MemoryState } from "./settings";

// Atoms are declared in every file that reads them (the validator's scan reads literals).
const commandOutputsAtom = atom({ plugin: "cc-uma-memory", key: "commandOutputs" } as const, {} as Record<string, string>);
const memoryStateAtom = atom({ plugin: "cc-uma-memory", key: "memoryState" } as const, null as MemoryState | null);
const debtStateAtom = atom({ plugin: "cc-uma-memory", key: "debtState" } as const, { blocking: 0, reminders: 0, continuing: false, failing: false } as { blocking: number; reminders: number; continuing: boolean; failing: boolean });
const memoryChangedAtom = atom({ plugin: "cc-uma-memory", key: "memoryChanged" } as const, false);

type $ = EngineInterface;

const COMMAND = "uma";
const MAX_OUTPUTS = 20;

type Paths = { global: string | undefined; project: string; local: string };

async function paths($: $): Promise<Paths> {
	const home = await $.env.get("HOME");
	const cwd = await $.session.cwd();
	return {
		global: home ? `${home}/.claude/settings.json` : undefined,
		project: `${cwd}/.claude/settings.json`,
		local: `${cwd}/.claude/settings.local.json`,
	};
}

async function readFile($: $, path: string | undefined): Promise<string | null> {
	if (!path) return null;
	try {
		return (await $.fs.exists(path)) ? String(await $.fs.read(path)) : null;
	} catch {
		return null;
	}
}

async function readLayers($: $, p: Paths): Promise<Layers> {
	return { global: await readFile($, p.global), project: await readFile($, p.project), local: await readFile($, p.local) };
}

/** Recomputes the effective state once; the PromptHint hook only reads it. */
async function refreshState($: $): Promise<MemoryState> {
	const state = effectiveState(await readLayers($, await paths($)));
	await update($, memoryStateAtom, () => state);
	return state;
}

/** The sentence that replaces the old status line. */
function verdict(state: MemoryState): string {
	return state.enabled
		? `Platí: paměť Claude zapnuta (${state.source}) — zapisuje mimo UMA; od příštího sezení.`
		: `Platí: paměť Claude vypnuta (${state.source}) — jediná paměť je UMA; od příštího sezení.`;
}

async function runMemory($: $, words: string[]): Promise<string> {
	const isGlobal = words.includes("--global");
	const rest = words.filter((w) => w !== "--global");
	const p = await paths($);
	const target = rest[0];

	if (target === undefined) {
		const state = effectiveState(await readLayers($, p));
		return [
			`Automatická paměť Claude: ${state.enabled ? "zapnuta" : "vypnuta"} (${state.source})`,
			`globální:  ${p.global ?? "(HOME není nastaveno)"}`,
			`projekt:   ${p.project}`,
			`lokální:   ${p.local}`,
		].join("\n");
	}
	if ((target !== "on" && target !== "off") || rest.length > 1) return `Neznámý argument. Zkus /uma claude-memory [on|off] [--global].`;

	const path = isGlobal ? p.global : p.local;
	if (!path) return "Nelze zapsat: HOME není nastaveno.";
	const result = setAutoMemory(await readFile($, path), target === "on");
	if (!result.ok) return `Nic nezapsáno — ${path}: ${result.error}.`;
	await $.fs.write(path, result.text);
	await update($, memoryChangedAtom, () => true);
	const wanted = target === "on";
	const state = await refreshState($);
	const word = (enabled: boolean) => (enabled ? "zapnuto" : "vypnuto");
	if (state.enabled !== wanted) {
		const winner = { lokální: p.local, projekt: p.project, globální: p.global ?? "", výchozí: "" }[state.source];
		return [`Zapsáno ${word(wanted)} do ${path}, ale platí ${word(state.enabled)} — přebíjí to ${state.source} (${winner})`, verdict(state)].join("\n");
	}
	return [`Automatická paměť Claude: ${wanted ? "zapnuta" : "vypnuta"} → ${path}`, verdict(state)].join("\n");
}

export function registerMemoryGuard(on: On): void {
	on("command.run", { command: COMMAND }, async ($, e, next) => {
		const [sub, ...rest] = e.args.trim().split(/\s+/).filter(Boolean);
		if (sub !== "claude-memory") return next(e);
		const output = (await runMemory($, rest)).trimEnd();
		const [summary = "", ...more] = output.split("\n");
		if (more.length > 0) await update($, commandOutputsAtom, (o) => capOutputs({ ...o, [summary]: output }));
		return { text: summary };
	});

	on("ui.render", { component: "PromptHint" }, async ($, e, next) => {
		const state = await read($, memoryStateAtom);
		if (!state) return next(e);
		const badge = buildBadge(state.enabled, await read($, memoryChangedAtom), (await read($, debtStateAtom)).blocking);
		return next({ ...e, props: { ...e.props, tail: addToTail(e.props.tail, badge) } });
	});
}

function capOutputs(record: Record<string, string>): Record<string, string> {
	const keys = Object.keys(record);
	if (keys.length <= MAX_OUTPUTS) return record;
	const next: Record<string, string> = {};
	for (const key of keys.slice(keys.length - MAX_OUTPUTS)) next[key] = record[key] as string;
	return next;
}

/** Session start, run by the root: clears the old status line and computes the state. */
export async function startMemoryGuard($: EngineInterface): Promise<void> {
	// Version 0.1.0 drew a status line; clear what it left behind.
	await $.ui.status(undefined);
	await refreshState($);
}
