// command — `/herdr-plugin scaffold <lang> [dir] [id] | validate [path] | docs`, its framed output, its argument completion.
//
//   start                    registers /herdr-plugin
//   command.run              runs the subcommand (run.ts); the model reads one line, the whole output is data in $.state
//   ui.render CommandOutput  draws that output in a round frame
//   prompt.autocomplete      completes subcommands and the language
//
// A plugin's command text goes into the model's requests: the model gets only the first line.

import type { EngineInterface, On } from "claude-code";
import { atom, read, update } from "claude-code";
import { completions } from "./parse";
import { runCommand } from "./run";

// Atoms are declared in every file that reads them (the validator's scan reads literals).
const commandOutputsAtom = atom({ plugin: "cc-herdr-plugin-dev", key: "commandOutputs" } as const, {} as Record<string, import("claude-code").HerdrOutput>, { shape: "output-1" });

const COMMAND = "herdr-plugin";
const MAX_OUTPUTS = 20;
const FRAME = { normal: "claude", error: "error", warning: "warning", success: "success" } as const;

export function registerCommand(on: On): void {
	on("command.run", { command: COMMAND }, async ($, e) => {
		const { text, out } = await runCommand($, e.args);
		await update($, commandOutputsAtom, (o) => Object.fromEntries(Object.entries({ ...o, [text]: out }).slice(-MAX_OUTPUTS)));
		return { text };
	});

	on("ui.render", { component: "CommandOutput" }, async ($, e, next) => {
		if (e.props.command !== COMMAND || e.props.isErrored) return next(e);
		const outputs = await read($, commandOutputsAtom);
		const text = e.props.text.trim();
		const key = Object.keys(outputs).find((k) => text === k || text.endsWith(`: ${k}`));
		const out = key ? outputs[key] : undefined;
		if (!out || out.lines.length === 0) return next(e);
		const { Box, Text } = $.ui.resolve(e);
		return (
			<Box borderStyle="round" borderColor={FRAME[out.tone]} flexDirection="column" paddingX={1}>
				<Text bold>{`🧩 Herdr · ${out.title}`}</Text>
				{out.lines.map((line, i) => (
					<Text key={`l${i}`} color={line.tone === "dim" ? undefined : line.tone} dimColor={line.tone === "dim"}>
						{line.text || " "}
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
export async function startCommand($: EngineInterface): Promise<void> {
	await $.command.register({
		name: COMMAND,
		description: "Herdr pluginy: kostra, validace manifestu, dokumentace",
		argumentHint: "scaffold <rust|typescript|bash> [dir] [id] | validate [path] | docs",
	});
}
