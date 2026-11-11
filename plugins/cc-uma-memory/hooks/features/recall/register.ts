// recall — memories from UMA that fit the prompt are added to it as hidden
// context (the model reads them, the user does not see them). Advisory: any
// failure leaves the prompt as it was.
//
//   prompt.submit   not a command, recall on → `uma recall check`, then
//                   next({ ...e, context: [...] })

import type { On } from "claude-code";
import { atom, read, update } from "claude-code";
import { recordContext } from "../../shared/audit";
import { buildRecallContext, factCount, parseVerdict, recallArgv, recallTimeout } from "./policy";

// Atoms are declared in every file that reads them (the validator's scan reads literals).
const settingsAtom = atom({ plugin: "cc-uma-memory", key: "settings" } as const, { recall: true, writeGate: "ask", append: true, immune: "warn", immuneModel: "", humility: false, shadow: "on", lang: "cs" } as { recall: boolean; writeGate: "ask" | "off"; append: boolean; immune: "off" | "warn" | "ask" | "auto"; immuneModel: string; humility: boolean; shadow: "off" | "on" | "jev"; lang: "cs" | "en" }, { shape: "settings-6" });
const recallSessionAtom = atom({ plugin: "cc-uma-memory", key: "recallSession" } as const, { session: "", ids: [], failing: false } as { session: string; ids: string[]; failing: boolean });

/** Prompts the person wrote: the terminal, the Remote Control bridge, an SDK host. Not notifications or peers. */
const USER_ORIGINS = new Set(["composer", "bridge", "sdk"]);

export function registerRecall(on: On): void {
	// After a compaction the inserted facts are gone from the context: forget them so they can be inserted again.
	on("session.compact", async ($, e, next) => {
		const result = await next(e);
		if (e.trigger !== "precompute" && !e.agentId && result.messages) await update($, recallSessionAtom, (s) => ({ ...s, ids: [] }));
		return result;
	});

	on("prompt.submit", async ($, e, next) => {
		const text = e.text.trim();
		// A test's submission carries no origin; a real one always does.
		const origin = e.origin?.kind;
		if (!text || e.command || e.isMeta || text.startsWith("/") || (origin !== undefined && !USER_ORIGINS.has(origin))) return next(e);
		if (!(await read($, settingsAtom)).recall) return next(e);

		// Debug aid (env, not a setting): the text recall is asked with, to see whether the translation ran first.
		if (await $.env.get("UMA_RECALL_DEBUG") === "1") $.ui.log(`recall debug: ${text.slice(0, 60)}`);
		const session = await $.session.id();
		const state = await read($, recallSessionAtom);
		// A new session starts with nothing inserted yet.
		const seen = state.session === session ? state.ids : [];
		let failure: string | undefined;
		let context: { text: string; ids: string[] } | undefined;
		try {
			// cwd of the session: the engine limits recall to the project of the git root of its cwd.
			const run = await $.process.run(recallArgv(text, seen), { cwd: await $.session.cwd(), timeoutMs: recallTimeout(text) });
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
		await recordContext($, { source: "recall", factIds: context.ids, scope: "prompt" });
		return next({ ...e, context: [...(e.context ?? []), context.text] });
	});
}
