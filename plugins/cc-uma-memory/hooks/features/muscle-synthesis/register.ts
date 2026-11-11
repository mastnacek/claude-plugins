// muscle-synthesis — a command sequence the person keeps running becomes a PROPOSAL
// of a routine (port of pi's hooks/muscle_synthesis.ts). The worker only proposes: the
// proposal is a staged draft (`uma staging create --type skill`), never `uma muscle new`;
// the person turns it into a routine in `/uma review`.
//
//   tool.call Bash   a command that ran without error joins the session's history; the
//                    first repeated 3-step sequence (twice, no overlap) → one draft per sequence
//
// `/uma shadow off` stops it, like the rest of the shadow worker.

import type { EngineInterface, On } from "claude-code";
import { atom, read, update } from "claude-code";
import { buildRoutineProposal, createArgv, detectRepeatedSequence, normalizeCommand, pushCommand, stagedLine } from "./policy";
import type { History } from "./policy";

// Atoms are declared in every file that reads them (the validator's scan reads literals).
const settingsAtom = atom({ plugin: "cc-uma-memory", key: "settings" } as const, { recall: true, writeGate: "ask", append: true, immune: "warn", immuneModel: "", humility: false, shadow: "on" } as { recall: boolean; writeGate: "ask" | "off"; append: boolean; immune: "off" | "warn" | "ask" | "auto"; immuneModel: string; humility: boolean; shadow: "off" | "on" | "jev" }, { shape: "settings-5" });
const historyAtom = atom({ plugin: "cc-uma-memory", key: "commandHistory" } as const, { shapes: [], raw: [], proposed: [] } as History);

type $ = EngineInterface;

const CREATE_TIMEOUT_MS = 5000;

async function propose($: $, command: string): Promise<void> {
	if ((await read($, settingsAtom)).shadow === "off") return;
	const shape = normalizeCommand(command);
	if (shape === undefined) return;
	const history = pushCommand(await read($, historyAtom), shape, command);
	const hit = detectRepeatedSequence(history.shapes, history.raw);
	// One proposal per sequence per session.
	const key = hit?.sequence.join("→");
	const fresh = hit !== undefined && key !== undefined && !history.proposed.includes(key);
	await update($, historyAtom, () => (fresh ? { ...history, proposed: [...history.proposed, key] } : history));
	if (!fresh) return;
	try {
		const run = await $.process.run(createArgv(buildRoutineProposal(hit)), { cwd: await $.session.cwd(), timeoutMs: CREATE_TIMEOUT_MS });
		if (run.exitCode === 0) $.ui.log(stagedLine(hit.name));
	} catch {
		// A missing binary loses one proposal; nothing else depends on it.
	}
}

export function registerMuscleSynthesis(on: On): void {
	on("tool.call", { tool: "Bash" }, async ($, e, next) => {
		const result = await next(e);
		if (result.deny === undefined && result.isError !== true) {
			try {
				await propose($, e.command);
			} catch {
				// A proposal never costs the person a tool result.
			}
		}
		return result;
	});
}
