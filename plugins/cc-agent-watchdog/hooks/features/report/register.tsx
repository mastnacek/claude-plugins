// report — what the person sees: the /watch command, its framed output, the tag under the prompt.
//
//   start                    registers /watch
//   command.run {watch}      `report [last|all|<id>]` builds the scorecard; `rules` goes down to the rules slice
//   ui.render CommandOutput  draws a /watch output from `commandOutputs` in a round frame
//   ui.render PromptHint     adds [👁 🟢 100] / [👁 🟡 85 ⚠️2] / [👁 🔴 0 ⛔] to the tail, next to another plugin's tag
//
// A plugin's command text goes into the model's requests: the model gets only
// the first line; the full output is data in $.state, drawn here.

import type { EngineInterface, On } from "claude-code";
import { atom, read, update } from "claude-code";
import { badge } from "../../shared/judge";
import type { Out, Outputs } from "../../shared/output";
import { addToTail } from "./badge";
import { reportResult, USAGE } from "./command";

// Atoms are declared in every file that reads them (the validator's scan reads literals).
const commandOutputsAtom = atom({ plugin: "cc-agent-watchdog", key: "commandOutputs" } as const, {} as Outputs, { shape: "output-1" });
const verdictAtom = atom({ plugin: "cc-agent-watchdog", key: "verdict" } as const, null as { score: number; instant: boolean; count: number } | null);

const COMMAND = "watch";
const MAX_OUTPUTS = 20;
const FRAME = { normal: "claude", error: "error", warning: "warning", success: "success" } as const;

function capOutputs(record: Outputs): Outputs {
	const keys = Object.keys(record);
	if (keys.length <= MAX_OUTPUTS) return record;
	return Object.fromEntries(keys.slice(keys.length - MAX_OUTPUTS).map((k) => [k, record[k] as Out]));
}

export function registerReport(on: On): void {
	on("command.run", { command: COMMAND }, async ($, e, next) => {
		const [sub, ...rest] = e.args.trim().split(/\s+/).filter(Boolean);
		if (sub === "report") {
			const { text, out } = await reportResult($, rest.join(" "));
			await update($, commandOutputsAtom, (o) => capOutputs({ ...o, [text]: out }));
			return { text };
		}
		if (sub === "rules") return next(e);
		return { text: USAGE };
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
				<Text bold>{`👁 Watchdog · ${out.title}`}</Text>
				{out.lines.map((line, i) => (
					<Text key={`l${i}`} color={line.tone === "dim" ? undefined : line.tone} dimColor={line.tone === "dim"}>
						{line.text || " "}
					</Text>
				))}
			</Box>
		);
	});

	on("ui.render", { component: "PromptHint" }, async ($, e, next) => {
		const verdict = await read($, verdictAtom);
		if (!verdict) return next(e);
		return next({ ...e, props: { ...e.props, tail: addToTail(e.props.tail, badge(verdict)) } });
	});
}

/** Session start, run by the root. */
export async function startReport($: EngineInterface): Promise<void> {
	await $.command.register({
		name: COMMAND,
		description: "Watchdog agentů: skóre sezení a aktivní pravidla",
		argumentHint: "report [last | all | <id>] | rules",
	});
}
