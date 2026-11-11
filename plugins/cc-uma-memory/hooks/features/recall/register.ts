// recall — memories from UMA that fit the prompt are added to it as hidden
// context (the model reads them, the user does not see them). Advisory: any
// failure leaves the prompt as it was.
//
//   prompt.submit   not a command, recall on → `uma recall check`, then
//                   next({ ...e, context: [...] })

import type { On } from "claude-code";
import { atom, read, update } from "claude-code";
import { buildRecallContext, factCount, parseVerdict, recallArgv } from "./policy";

// Atoms are declared in every file that reads them (the validator's scan reads literals).
const settingsAtom = atom({ plugin: "cc-uma-memory", key: "settings" } as const, { recall: true, writeGate: "ask", append: true } as { recall: boolean; writeGate: "ask" | "off"; append: boolean }, { shape: "settings-2" });
const recallSessionAtom = atom({ plugin: "cc-uma-memory", key: "recallSession" } as const, { session: "", ids: [], failing: false } as { session: string; ids: string[]; failing: boolean });

const TIMEOUT_MS = 3000;
/** Prompts the person wrote: the terminal, the Remote Control bridge, an SDK host. Not notifications or peers. */
const USER_ORIGINS = new Set(["composer", "bridge", "sdk"]);

export function registerRecall(on: On): void {
	on("prompt.submit", async ($, e, next) => {
		const text = e.text.trim();
		// A test's submission carries no origin; a real one always does.
		const origin = e.origin?.kind;
		if (!text || e.command || e.isMeta || text.startsWith("/") || (origin !== undefined && !USER_ORIGINS.has(origin))) return next(e);
		if (!(await read($, settingsAtom)).recall) return next(e);

		const session = await $.session.id();
		const state = await read($, recallSessionAtom);
		// A new session starts with nothing inserted yet.
		const seen = state.session === session ? state.ids : [];
		let failure: string | undefined;
		let context: { text: string; ids: string[] } | undefined;
		try {
			// cwd of the session: the engine limits recall to the project of the git root of its cwd.
			const run = await $.process.run(recallArgv(text, seen), { cwd: await $.session.cwd(), timeoutMs: TIMEOUT_MS });
			const verdict = run.exitCode === 0 ? parseVerdict(run.stdout) : undefined;
			if (run.exitCode !== 0) failure = run.stderr.split("\n")[0]?.trim() || `uma skončila kódem ${run.exitCode}`;
			else if (!verdict) failure = "uma vrátila nečitelnou odpověď";
			else context = buildRecallContext(verdict, new Set(seen));
		} catch (error) {
			failure = error instanceof Error ? error.message.split("\n")[0] : String(error);
		}

		if (failure !== undefined) {
			// One line per series of failures, not one per prompt.
			if (!state.failing) $.ui.log(`recall přeskočen: ${failure}`);
			await update($, recallSessionAtom, (s) => ({ session, ids: s.session === session ? s.ids : [], failing: true }));
			return next(e);
		}
		await update($, recallSessionAtom, (s) => ({ session, ids: [...(s.session === session ? s.ids : []), ...(context?.ids ?? [])], failing: false }));
		if (!context) return next(e);
		$.ui.log(`🧠 recall: ${factCount(context.ids.length)}`);
		return next({ ...e, context: [...(e.context ?? []), context.text] });
	});
}
