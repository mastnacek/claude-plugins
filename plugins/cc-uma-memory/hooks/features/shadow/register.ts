// shadow — the shadow worker (port of pi's slices/shadow): it watches for the moments
// worth remembering and stages them as DRAFTS in `.uma/.staging/`; it never writes
// memory. The person judges them in `/uma review`.
//
//   tool.call Bash          a build/test command ran red, then green within 5 minutes → recovery draft
//   tool.call Write, Edit   a dependency manifest (Cargo.toml, package.json) changed → draft
//   prompt.submit           the person's message corrects the agent ("špatně", "don't use …") → draft
//
// Each draft is `uma staging distill` (`$.process.run`), started with `$.clock.after(0)`
// after the hook has answered: it never delays a turn, asks nothing and shows nothing
// (the count of waiting drafts is the label under the prompt, staging's). `/uma shadow
// off` stops all of it; `jev` lets Jev judge each draft over OpenRouter.

import type { EngineInterface, On } from "claude-code";
import { atom, read, update } from "claude-code";
import { MAX_CORRECTION_CHARS, afterBash, dependencyContext, distillArgv, isUserCorrection } from "./policy";
import type { Failure, Trigger } from "./policy";

// Atoms are declared in every file that reads them (the validator's scan reads literals).
const settingsAtom = atom({ plugin: "cc-uma-memory", key: "settings" } as const, { recall: true, writeGate: "ask", append: true, immune: "warn", immuneModel: "", humility: false, shadow: "on" } as { recall: boolean; writeGate: "ask" | "off"; append: boolean; immune: "off" | "warn" | "ask" | "auto"; immuneModel: string; humility: boolean; shadow: "off" | "on" | "jev" }, { shape: "settings-5" });
const shadowStateAtom = atom({ plugin: "cc-uma-memory", key: "shadowState" } as const, { failure: null, lastCorrection: "" } as { failure: Failure | null; lastCorrection: string });

type $ = EngineInterface;

/** The judge may take a network round trip. */
const DISTILL_TIMEOUT_MS = 30_000;
/** Prompts the person wrote: the terminal, the Remote Control bridge, an SDK host. Not notifications or peers. */
const USER_ORIGINS = new Set(["composer", "bridge", "sdk"]);

/** The mode, or undefined when the worker is off. */
async function activeMode($: $): Promise<"on" | "jev" | undefined> {
	const mode = (await read($, settingsAtom)).shadow;
	return mode === "off" ? undefined : mode;
}

async function distill($: $, mode: "on" | "jev", trigger: Trigger, context: string): Promise<void> {
	try {
		await $.process.run(distillArgv(trigger, context, mode), { cwd: await $.session.cwd(), timeoutMs: DISTILL_TIMEOUT_MS });
	} catch {
		// A missing binary or a timeout loses one draft; nothing else depends on it.
	}
}

/** Starts the draft after the current hook has answered, so the turn never waits for it. */
function stage($: $, mode: "on" | "jev", trigger: Trigger, context: string): void {
	$.clock.after(0, () => {
		void distill($, mode, trigger, context);
	});
}

async function afterBashCall($: $, command: string, failed: boolean, output: string): Promise<void> {
	const mode = await activeMode($);
	if (mode === undefined) return;
	const outcome = afterBash((await read($, shadowStateAtom)).failure, command, failed, output, await $.clock.now());
	await update($, shadowStateAtom, (s) => ({ ...s, failure: outcome.failure }));
	if (outcome.context !== undefined) stage($, mode, "compiler_recovery", outcome.context);
}

async function afterManifestEdit($: $, tool: string, e: Record<string, unknown>): Promise<void> {
	const mode = await activeMode($);
	if (mode === undefined) return;
	const path = typeof e.file_path === "string" ? e.file_path : "";
	const text = typeof (tool === "Write" ? e.content : e.new_string) === "string" ? String(tool === "Write" ? e.content : e.new_string) : "";
	const context = dependencyContext(tool, path, text);
	if (context !== undefined) stage($, mode, "dependency_change", context);
}

async function afterPrompt($: $, text: string): Promise<void> {
	const mode = await activeMode($);
	if (mode === undefined) return;
	const trimmed = text.trim();
	if (!trimmed || trimmed.length >= MAX_CORRECTION_CHARS || trimmed === (await read($, shadowStateAtom)).lastCorrection) return;
	const messages = await $.session.messages();
	if (!isUserCorrection(trimmed, Array.isArray(messages) && messages.some((m: { role: string }) => m.role === "assistant"))) return;
	await update($, shadowStateAtom, (s) => ({ ...s, lastCorrection: trimmed }));
	stage($, mode, "user_correction", trimmed);
}

export function registerShadow(on: On): void {
	on("tool.call", { tool: "Bash" }, async ($, e, next) => {
		const result = await next(e);
		if (result.deny === undefined) {
			try {
				const output = typeof result.text === "string" ? result.text : "";
				await afterBashCall($, e.command, result.isError === true, output);
			} catch {
				// Telemetry never costs the person a tool result.
			}
		}
		return result;
	});

	on("tool.call", { tool: ["Write", "Edit"] }, async ($, e, next) => {
		const result = await next(e);
		if (result.deny === undefined && result.isError !== true) {
			try {
				await afterManifestEdit($, e.tool, e as Record<string, unknown>);
			} catch {
				// Telemetry never costs the person a tool result.
			}
		}
		return result;
	});

	// A matcher on the text: the unmatched prompt.submit is recall's.
	on("prompt.submit", { text: /\S/ }, async ($, e, next) => {
		const origin = e.origin?.kind;
		if (!e.command && !e.isMeta && !e.text.trim().startsWith("/") && (origin === undefined || USER_ORIGINS.has(origin))) {
			try {
				await afterPrompt($, e.text);
			} catch {
				// Telemetry never costs the person a prompt.
			}
		}
		return next(e);
	});
}
