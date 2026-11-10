// tts-command — /tts: switch, hold, palettes, location and herdr from the prompt.
//
//   start                      registers the command
//   command.run {tts}          runs a line (./run.ts)
//   ui.render CommandOutput    draws the whole multi-line output in its row
//   prompt.autocomplete        completes subcommands and values
//
// A plugin's command text goes into the model's requests, so the model gets
// only the output's first line; the full text lives in $.state and is drawn by
// the CommandOutput hook. ($.ui.log is no way out: a log row is one line and
// draws "\n" as "�".)

import type { EngineInterface, On } from "claude-code";
import { atom, read, update } from "claude-code";
import { COMMAND, completions, runCommand } from "./run";

// Atoms are declared in every file that reads them (the validator's scan reads literals).
const commandOutputsAtom = atom({ plugin: "cc-theme-switcher", key: "commandOutputs" } as const, {} as Record<string, string>);

const MAX_OUTPUTS = 20;

function cap(record: Record<string, string>): Record<string, string> {
	const keys = Object.keys(record);
	if (keys.length <= MAX_OUTPUTS) return record;
	return Object.fromEntries(keys.slice(keys.length - MAX_OUTPUTS).map((k) => [k, record[k] as string]));
}

export function registerTtsCommand(on: On): void {
	on("command.run", { command: COMMAND }, async ($, e) => {
		let output: string;
		try {
			output = (await runCommand($, e.args)).trimEnd();
		} catch (error) {
			output = error instanceof Error ? error.message : String(error);
		}
		const [summary = "", ...rest] = output.split("\n");
		if (rest.length > 0) await update($, commandOutputsAtom, (o) => cap({ ...o, [summary]: output }));
		return { text: summary };
	});

	on("ui.render", { component: "CommandOutput" }, async ($, e, next) => {
		if (e.props.command !== COMMAND || e.props.isErrored) return next(e);
		// The row's text may come headed with the plugin's name ("cc-theme-switcher: …").
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

/** Session start, run by the root. */
export async function startTtsCommand($: EngineInterface): Promise<void> {
	await $.command.register({
		name: COMMAND,
		description: "Téma Claude Code podle slunce (hold, palety, poloha, herdr)",
		argumentHint: "status | on | off | hold <slot> [2h] | slot <slot> <paleta> | location <lat> <lon> | herdr on|off",
	});
}
