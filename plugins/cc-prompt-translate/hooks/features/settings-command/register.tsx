// settings-command — /prompt-translate: every setting, help and stats.
//
//   start                         registers the command
//   command.run {prompt-translate} runs a line (./run.ts)
//   ui.render CommandOutput       draws the whole multi-line output in its row
//   prompt.autocomplete           completes subcommands and values
//
// A plugin's command text goes into the model's requests, so the model gets
// only the output's first line; the full text lives in $.state and is drawn by
// the CommandOutput hook. ($.ui.log is no way out: a log row is one line and
// draws "\n" as "�".)

import type { EngineInterface, On } from "claude-code";
import { atom, read, update } from "claude-code";
import { refreshCredit } from "../../shared/credit";
import { capRecord } from "../../shared/state";
import { COMMAND, completions, runCommand } from "./run";

// Atoms are declared in every file that reads them (the validator's scan reads literals).
const commandOutputsAtom = atom({ plugin: "cc-prompt-translate", key: "commandOutputs" } as const, {} as Record<string, string>);

export function registerSettingsCommand(on: On): void {
	on("command.run", { command: COMMAND }, async ($, e) => {
		const output = (await runCommand($, e.args)).trimEnd();
		const [summary = "", ...rest] = output.split("\n");
		if (rest.length > 0) await update($, commandOutputsAtom, (o) => capRecord({ ...o, [summary]: output }, 20));
		await refreshCredit($); // a model switch changes what the indicator shows
		return { text: summary };
	});

	on("ui.render", { component: "CommandOutput" }, async ($, e, next) => {
		if (e.props.command !== COMMAND || e.props.isErrored) return next(e);
		// The row's text may come headed with the plugin's name ("prompt-translate: …").
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

/** Session start, run by the root after the configuration is loaded. */
export async function startSettingsCommand($: EngineInterface): Promise<void> {
	await $.command.register({
		name: COMMAND,
		description: "Překlad promptů do EN a odpovědí zpět (boost, historie, cena v Kč)",
		argumentHint: "help | on | off | model <m> | boost <level> | stats | …",
	});
}
