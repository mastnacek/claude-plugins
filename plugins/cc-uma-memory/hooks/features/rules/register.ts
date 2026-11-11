// rules — the active decisions and patterns of UMA go into the system prompt as
// one `session` section, so the model follows them without being asked. Advisory:
// any failure leaves the prompt as the engine composed it.
//
//   prompt.compose   `/uma append` on → `uma list --json --type decision|pattern`,
//                    then the section is appended to what `next` answered
//
// The engine composes a prompt for every request, so the text is fetched once
// per session (`rulesSession`) and then reused: a steady prompt keeps the
// provider's cache; a fact written meanwhile shows up in the next session.

import type { On } from "claude-code";
import { atom, read, update } from "claude-code";
import { RULE_TYPES, formatRules, parseRules, rulesArgv } from "./policy";
import type { Rule } from "./policy";

// Atoms are declared in every file that reads them (the validator's scan reads literals).
const settingsAtom = atom({ plugin: "cc-uma-memory", key: "settings" } as const, { recall: true, writeGate: "ask", append: true, immune: "warn", immuneModel: "", humility: false, shadow: "on" } as { recall: boolean; writeGate: "ask" | "off"; append: boolean; immune: "off" | "warn" | "ask" | "auto"; immuneModel: string; humility: boolean; shadow: "off" | "on" | "jev" }, { shape: "settings-5" });
const rulesSessionAtom = atom({ plugin: "cc-uma-memory", key: "rulesSession" } as const, { session: "", text: null, failing: false } as { session: string; text: string | null; failing: boolean });

const TIMEOUT_MS = 5000;
const SECTION_ID = "cc-uma-memory:rules";

export function registerRules(on: On): void {
	on("prompt.compose", async ($, e, next) => {
		const composed = await next(e);
		if (!(await read($, settingsAtom)).append) return composed;

		const session = await $.session.id();
		const state = await read($, rulesSessionAtom);
		let text = state.session === session ? state.text : null;

		if (text === null) {
			let failure: string | undefined;
			const rules: Rule[] = [];
			try {
				const cwd = await $.session.cwd();
				const runs = await Promise.all(RULE_TYPES.map((type) => $.process.run(rulesArgv(type), { cwd, timeoutMs: TIMEOUT_MS })));
				for (const run of runs) {
					const parsed = run.exitCode === 0 ? parseRules(run.stdout) : undefined;
					if (run.exitCode !== 0) failure ??= run.stderr.split("\n")[0]?.trim() || `uma skončila kódem ${run.exitCode}`;
					else if (!parsed) failure ??= "uma vrátila nečitelnou odpověď";
					else rules.push(...parsed);
				}
			} catch (error) {
				failure = error instanceof Error ? error.message.split("\n")[0] : String(error);
			}
			if (failure !== undefined) {
				// Not cached: the next request tries again. One log line per series of failures.
				if (!state.failing) $.ui.log(`pravidla UMA přeskočena: ${failure}`);
				await update($, rulesSessionAtom, () => ({ session, text: null, failing: true }));
				return composed;
			}
			text = formatRules(rules);
			await update($, rulesSessionAtom, () => ({ session, text, failing: false }));
		}

		if (!text) return composed;
		return { sections: [...composed.sections, { id: SECTION_ID, text, scope: "session" }] };
	});
}
