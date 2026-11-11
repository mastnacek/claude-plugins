// memory-guard — /uma claude-memory: turns Claude Code's automatic memory on and off
// (UMA is the one memory) and keeps its state visible as a tag under the prompt.
//
//   start                  reads the three settings layers into memoryState
//   command.run {uma}      answers `claude-memory [on|off] [--global]`, passes the rest down
//   ui.render PromptHint   adds the tag [UMA] / [UMA ⚠ CC] (+ ↻ once changed, ⚖N debts, 📝N waiting drafts) to its tail
//
// The command itself (registration, help, drawing multi-line output,
// completion) is the uma-command slice's. A plugin's command text goes into the
// model's requests, so the model gets only the output's first line; the full
// text goes to $.state (`commandOutputs`), which uma-command draws.

import type { EngineInterface, On, PluginState, ShapedValue } from "claude-code";
import { atom, read, update } from "claude-code";
import { claudeConfigDir } from "../../shared/home";
import { addToTail, buildBadge } from "./badge";
import { effectiveState, setAutoMemory } from "./settings";
import type { Layers, MemoryState } from "./settings";

// Atoms are declared in every file that reads them (the validator's scan reads literals).
const commandOutputsAtom = atom({ plugin: "cc-uma-memory", key: "commandOutputs" } as const, {} as Outputs, { shape: "output-2" });
const memoryStateAtom = atom({ plugin: "cc-uma-memory", key: "memoryState" } as const, null as MemoryState | null);
const debtStateAtom = atom({ plugin: "cc-uma-memory", key: "debtState" } as const, { blocking: 0, reminders: 0, continuing: false, failing: false } as { blocking: number; reminders: number; continuing: boolean; failing: boolean });
const stagingStateAtom = atom({ plugin: "cc-uma-memory", key: "stagingState" } as const, { pending: 0 } as { pending: number });
const memoryChangedAtom = atom({ plugin: "cc-uma-memory", key: "memoryChanged" } as const, false);

type $ = EngineInterface;
type Outputs = ShapedValue<PluginState["cc-uma-memory"]["commandOutputs"]>;
type Out = Outputs[string];

/** The model's line and, when there is more to show, the data uma-command draws. */
type Result = { text: string; out?: Out };

/** Lines of one framed output; the first is also the model's. */
const framed = (title: string, lines: string[], tone: Out["tone"]): Result => ({ text: lines[0] ?? "", out: { title, tone, lines: lines.map((text) => (tone === "normal" ? { text } : { text, tone })) } });

const COMMAND = "uma";
const MAX_OUTPUTS = 20;

type Paths = { global: string | undefined; project: string; local: string };

async function paths($: $): Promise<Paths> {
	const dir = await claudeConfigDir($);
	const cwd = await $.session.cwd();
	return {
		global: dir ? `${dir}/settings.json` : undefined,
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

async function runMemory($: $, words: string[]): Promise<Result> {
	const isGlobal = words.includes("--global");
	const rest = words.filter((w) => w !== "--global");
	const p = await paths($);
	const target = rest[0];

	if (target === undefined) {
		const state = effectiveState(await readLayers($, p));
		const summary = `${state.enabled ? "zapnuta" : "vypnuta"} (${state.source})`;
		return {
			text: `Automatická paměť Claude: ${summary}`,
			out: {
				title: "automatická paměť Claude",
				tone: "normal",
				fields: [
					{ label: "stav", value: summary, tone: state.enabled ? "warning" : "success" },
					{ label: "globální", value: p.global ?? "(HOME není nastaveno)" },
					{ label: "projekt", value: p.project },
					{ label: "lokální", value: p.local },
				],
			},
		};
	}
	if ((target !== "on" && target !== "off") || rest.length > 1) return framed("použití", ["Neznámý argument. Zkus /uma claude-memory [on|off] [--global]."], "warning");

	const path = isGlobal ? p.global : p.local;
	if (!path) return framed("chyba", ["Nelze zapsat: HOME není nastaveno."], "error");
	const result = setAutoMemory(await readFile($, path), target === "on");
	if (!result.ok) return framed("chyba", [`Nic nezapsáno — ${path}: ${result.error}.`], "error");
	await $.fs.write(path, result.text);
	await update($, memoryChangedAtom, () => true);
	const wanted = target === "on";
	const state = await refreshState($);
	const word = (enabled: boolean) => (enabled ? "zapnuto" : "vypnuto");
	if (state.enabled !== wanted) {
		const winner = { lokální: p.local, projekt: p.project, globální: p.global ?? "", výchozí: "" }[state.source];
		return framed("paměť Claude · přebito", [`Zapsáno ${word(wanted)} do ${path}, ale platí ${word(state.enabled)} — přebíjí to ${state.source} (${winner})`, verdict(state)], "warning");
	}
	return framed(`paměť Claude · ${wanted ? "zapnuta" : "vypnuta"}`, [`Automatická paměť Claude: ${wanted ? "zapnuta" : "vypnuta"} → ${path}`, verdict(state)], "success");
}

export function registerMemoryGuard(on: On): void {
	on("command.run", { command: COMMAND }, async ($, e, next) => {
		const [sub, ...rest] = e.args.trim().split(/\s+/).filter(Boolean);
		if (sub !== "claude-memory") return next(e);
		const { text, out } = await runMemory($, rest);
		if (out) await update($, commandOutputsAtom, (o) => capOutputs({ ...o, [text]: out }));
		return { text };
	});

	on("ui.render", { component: "PromptHint" }, async ($, e, next) => {
		const state = await read($, memoryStateAtom);
		if (!state) return next(e);
		const badge = buildBadge(state.enabled, await read($, memoryChangedAtom), (await read($, debtStateAtom)).blocking, (await read($, stagingStateAtom)).pending);
		return next({ ...e, props: { ...e.props, tail: addToTail(e.props.tail, badge) } });
	});
}

function capOutputs(record: Outputs): Outputs {
	const keys = Object.keys(record);
	if (keys.length <= MAX_OUTPUTS) return record;
	const next: Outputs = {};
	for (const key of keys.slice(keys.length - MAX_OUTPUTS)) next[key] = record[key] as Out;
	return next;
}

/** Session start, run by the root: clears the old status line and computes the state. */
export async function startMemoryGuard($: EngineInterface): Promise<void> {
	// Version 0.1.0 drew a status line; clear what it left behind.
	await $.ui.status(undefined);
	await refreshState($);
}
