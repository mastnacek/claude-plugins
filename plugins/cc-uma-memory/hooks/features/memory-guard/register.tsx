// memory-guard — /uma claude-memory: turns Claude Code's automatic memory on and off
// (UMA is the one memory) and keeps its state visible under the prompt.
//
//   start                  reads the three settings layers, draws the status
//   command.run {uma}      runs a line (claude-memory [on|off] [--global], help)
//   ui.render CommandOutput draws the whole multi-line output in its row
//   prompt.autocomplete    completes subcommands and --global
//
// A plugin's command text goes into the model's requests, so the model gets
// only the output's first line; the full text lives in $.state and is drawn by
// the CommandOutput hook ($.ui.log is one line and draws "\n" as "�").

import type { EngineInterface, On, PromptAutocompleteSuggestion } from "claude-code";
import { atom, read, update } from "claude-code";
import { effectiveState, setAutoMemory } from "./settings";
import type { Layers } from "./settings";

// Atoms are declared in every file that reads them (the validator's scan reads literals).
const commandOutputsAtom = atom({ plugin: "cc-uma-memory", key: "commandOutputs" } as const, {} as Record<string, string>);
const memoryChangedAtom = atom({ plugin: "cc-uma-memory", key: "memoryChanged" } as const, false);

type $ = EngineInterface;

const COMMAND = "uma";
const MAX_OUTPUTS = 20;

const HELP = [
	"/uma — paměť UMA",
	"/uma claude-memory                 stav automatické paměti Claude Code — ne UMA — a odkud pochází",
	"/uma claude-memory off [--global]  vypne ji (projekt: .claude/settings.local.json, --global: ~/.claude/settings.json)",
	"/uma claude-memory on [--global]   zapne ji",
	"/uma help                          tato nápověda",
].join("\n");

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

/** The line under the prompt. */
async function showStatus($: $): Promise<string> {
	const state = effectiveState(await readLayers($, await paths($)));
	const changed = await read($, memoryChangedAtom);
	const text = state.enabled
		? `🧠 paměť Claude zapnutá (${state.source}) — zapisuje mimo UMA · /uma claude-memory off`
		: `🧠 paměť Claude vypnuta (${state.source}) · paměť = UMA`;
	const line = changed ? `${text} · platí od příštího sezení` : text;
	await $.ui.status(line);
	return line;
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
	const state = effectiveState(await readLayers($, p));
	const status = await showStatus($);
	const word = (enabled: boolean) => (enabled ? "zapnuto" : "vypnuto");
	if (state.enabled !== wanted) {
		const winner = { lokální: p.local, projekt: p.project, globální: p.global ?? "", výchozí: "" }[state.source];
		return [`Zapsáno ${word(wanted)} do ${path}, ale platí ${word(state.enabled)} — přebíjí to ${state.source} (${winner})`, status].join("\n");
	}
	return [`Automatická paměť Claude: ${wanted ? "zapnuta" : "vypnuta"} → ${path}`, status].join("\n");
}

async function runCommand($: $, args: string): Promise<string> {
	const words = args.trim().split(/\s+/).filter(Boolean);
	const [sub, ...rest] = words;
	if (sub === undefined || sub === "help") return HELP;
	if (sub === "claude-memory") return runMemory($, rest);
	return `Neznámý podpříkaz „${sub}“.\n${HELP}`;
}

function completions(text: string, token: string): PromptAutocompleteSuggestion[] {
	const m = /^\/uma\s+(.*)$/s.exec(text);
	if (!m) return [];
	const words = (m[1] ?? "").split(/\s+/);
	const prefix = token.toLowerCase();
	let options: Array<[string, string?]>;
	if (words.length <= 1) options = [["claude-memory", "automatická paměť Claude Code — ne UMA"], ["help", "nápověda"]];
	else if (words[0] === "claude-memory" && words.length <= 3) options = [["on"], ["off"], ["--global"]];
	else return [];
	return options
		.filter(([name]) => name.startsWith(prefix))
		.map(([name, description]) => (description ? { text: name, description } : { text: name }));
}

export function registerMemoryGuard(on: On): void {
	on("command.run", { command: COMMAND }, async ($, e) => {
		const output = (await runCommand($, e.args)).trimEnd();
		const [summary = "", ...rest] = output.split("\n");
		if (rest.length > 0) await update($, commandOutputsAtom, (o) => capOutputs({ ...o, [summary]: output }));
		return { text: summary };
	});

	on("ui.render", { component: "CommandOutput" }, async ($, e, next) => {
		if (e.props.command !== COMMAND || e.props.isErrored) return next(e);
		// The row's text may come headed with the plugin's name ("uma: …").
		const outputs = await read($, commandOutputsAtom);
		const text = e.props.text.trim();
		const key = Object.keys(outputs).find((k) => text === k || text.endsWith(`: ${k}`));
		const full = key ? outputs[key] : undefined;
		if (!full) return next(e);
		const { Box, Text } = $.ui.resolve(e);
		return (
			<Box flexDirection="column">
				{full.split("\n").map((line, i) => (
					<Text key={String(i)} dimColor={i > 0}>
						{line || " "}
					</Text>
				))}
			</Box>
		);
	});

	on("prompt.autocomplete", async ($, e, next) => {
		const mine = completions(e.text, e.token);
		if (mine.length === 0) return next(e);
		const below = await next(e);
		return { ...below, suggestions: [...mine, ...below.suggestions] };
	});
}

function capOutputs(record: Record<string, string>): Record<string, string> {
	const keys = Object.keys(record);
	if (keys.length <= MAX_OUTPUTS) return record;
	const next: Record<string, string> = {};
	for (const key of keys.slice(keys.length - MAX_OUTPUTS)) next[key] = record[key] as string;
	return next;
}

/** Session start, run by the root: registers the command and draws the status. */
export async function startMemoryGuard($: EngineInterface): Promise<void> {
	await $.command.register({
		name: COMMAND,
		description: "Paměť UMA: vypnutí a zapnutí automatické paměti Claude",
		argumentHint: "claude-memory [on|off] [--global] | help",
	});
	await showStatus($);
}
