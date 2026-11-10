// uma-command — the /uma command's shell: registers it, answers help and unknown
// subcommands, draws multi-line output, completes subcommands, and owns the two
// persisted switches (`/uma recall`, `/uma write-gate`) that other slices read.
//
//   start                  registers /uma, loads the switches from $.store into `settings`
//   command.run {uma}      recall, write-gate, help; anything else goes down to the slice that owns
//                          it (claude-memory), and if none answers, the unknown-subcommand text
//   ui.render CommandOutput draws a multi-line output from `commandOutputs` in its row
//   prompt.autocomplete    completes subcommands and their arguments
//
// A plugin's command text goes into the model's requests: the model gets only
// the first line, the full text lives in $.state ($.ui.log is one line).

import type { EngineInterface, On, PromptAutocompleteSuggestion } from "claude-code";
import { atom, read, update } from "claude-code";
import { parseStored, recallCommand, writeGateCommand } from "./settings";
import type { Settings } from "./settings";

// Atoms are declared in every file that reads them (the validator's scan reads literals).
const commandOutputsAtom = atom({ plugin: "cc-uma-memory", key: "commandOutputs" } as const, {} as Record<string, string>);
const settingsAtom = atom({ plugin: "cc-uma-memory", key: "settings" } as const, { recall: true, writeGate: "ask" } as Settings);

type $ = EngineInterface;

const COMMAND = "uma";
const STORE_KEY = "settings";
const MAX_OUTPUTS = 20;

const HELP = [
	"/uma — paměť UMA",
	"/uma claude-memory                 stav automatické paměti Claude Code — ne UMA — a odkud pochází",
	"/uma claude-memory off [--global]  vypne ji (projekt: .claude/settings.local.json, --global: ~/.claude/settings.json)",
	"/uma claude-memory on [--global]   zapne ji",
	"/uma recall [on|off]               vzpomínky z UMA se přidají k promptu (výchozí zapnuto, platí ve všech sezeních)",
	"/uma write-gate [ask|off]          dialog před zápisem do paměti UMA (výchozí ask, platí ve všech sezeních)",
	"/uma help                          tato nápověda",
].join("\n");

async function runCommand($: $, args: string): Promise<string | undefined> {
	const [sub, arg, ...rest] = args.trim().split(/\s+/).filter(Boolean);
	if (sub === undefined || sub === "help") return HELP;
	if (sub !== "recall" && sub !== "write-gate") return undefined;
	const current = await read($, settingsAtom);
	const result = sub === "recall" ? recallCommand(current, arg, rest.length) : writeGateCommand(current, arg, rest.length);
	if (result.settings !== current) {
		await $.store.set(STORE_KEY, result.settings);
		await update($, settingsAtom, () => result.settings);
	}
	return result.text;
}

function completions(text: string, token: string): PromptAutocompleteSuggestion[] {
	const m = /^\/uma\s+(.*)$/s.exec(text);
	if (!m) return [];
	const words = (m[1] ?? "").split(/\s+/);
	const prefix = token.toLowerCase();
	let options: Array<[string, string?]>;
	if (words.length <= 1) {
		options = [
			["claude-memory", "automatická paměť Claude Code — ne UMA"],
			["recall", "vzpomínky z UMA k promptu"],
			["write-gate", "schvalování zápisu do paměti"],
			["help", "nápověda"],
		];
	} else if (words[0] === "claude-memory" && words.length <= 3) options = [["on"], ["off"], ["--global"]];
	else if (words[0] === "recall" && words.length === 2) options = [["on"], ["off"]];
	else if (words[0] === "write-gate" && words.length === 2) options = [["ask"], ["off"]];
	else return [];
	return options
		.filter(([name]) => name.startsWith(prefix))
		.map(([name, description]) => (description ? { text: name, description } : { text: name }));
}

function capOutputs(record: Record<string, string>): Record<string, string> {
	const keys = Object.keys(record);
	if (keys.length <= MAX_OUTPUTS) return record;
	const next: Record<string, string> = {};
	for (const key of keys.slice(keys.length - MAX_OUTPUTS)) next[key] = record[key] as string;
	return next;
}

export function registerUmaCommand(on: On): void {
	on("command.run", { command: COMMAND }, async ($, e, next) => {
		const mine = await runCommand($, e.args);
		if (mine === undefined) {
			// Not ours: the slice that owns the subcommand answers; if nobody does, it is unknown.
			const below = await next(e).catch(() => ({ text: undefined }));
			if (below.text !== undefined) return below;
			return { text: `Neznámý podpříkaz „${e.args.trim().split(/\s+/)[0] ?? ""}“. Zkus /uma help.` };
		}
		const output = mine.trimEnd();
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

/** Session start, run by the root: registers the command and loads the persisted switches. */
export async function startUmaCommand($: EngineInterface): Promise<void> {
	await $.command.register({
		name: COMMAND,
		description: "Paměť UMA: vzpomínky k promptu, schvalování zápisu, automatická paměť Claude",
		argumentHint: "claude-memory | recall | write-gate [on|off|ask] | help",
	});
	const stored = parseStored(await $.store.get(STORE_KEY));
	await update($, settingsAtom, () => stored);
}
