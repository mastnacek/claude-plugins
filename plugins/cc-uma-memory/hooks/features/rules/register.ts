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
import { recordContext } from "../../shared/audit";
import { LANGUAGE_RULE, MAX_RULES, RULE_TYPES, formatRules, parseRules, rulesArgv } from "./policy";
import type { Rule } from "./policy";

// Atoms are declared in every file that reads them (the validator's scan reads literals).
const settingsAtom = atom({ plugin: "cc-uma-memory", key: "settings" } as const, { recall: true, writeGate: "ask", append: true, immune: "warn", immuneModel: "", humility: false, shadow: "on", lang: "cs" } as { recall: boolean; writeGate: "ask" | "off"; append: boolean; immune: "off" | "warn" | "ask" | "auto"; immuneModel: string; humility: boolean; shadow: "off" | "on" | "jev"; lang: "cs" | "en" }, { shape: "settings-6" });
const rulesSessionAtom = atom({ plugin: "cc-uma-memory", key: "rulesSession" } as const, { session: "", text: null, failing: false } as { session: string; text: string | null; failing: boolean });

const TIMEOUT_MS = 5000;
const SECTION_ID = "cc-uma-memory:rules";
const LANGUAGE_ID = "cc-uma-memory:language";

export function registerRules(on: On): void {
	on("prompt.compose", async ($, e, next) => {
		const base = await next(e);
		// The language rule is not a memory rule: it stays when `/uma append off` drops the rules.
		const composed = { ...base, sections: [...base.sections, { id: LANGUAGE_ID, text: LANGUAGE_RULE, scope: "session" as const }] };
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
			// Audit trail: the ids of the rules that really went into the prompt (once per fetch, not per request).
			await recordContext($, { source: "rules", factIds: rules.slice(0, MAX_RULES).map((r) => r.id).filter(Boolean), scope: "session" });
		}

		if (!text) return composed;
		return { sections: [...composed.sections, { id: SECTION_ID, text, scope: "session" }] };
	});
}
