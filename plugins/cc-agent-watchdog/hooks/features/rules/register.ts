// rules — judges the session's ledger against the rules and keeps the score in $.state.
//
//   evaluateNow         the root calls it at session start, after each turn and at session end:
//                       looks for debugging leftovers (git status), judges the ledger, writes `verdict`
//   command.run {watch} answers `/watch rules` (the active rules); everything else goes down
//
// The rules themselves (data, predicates, scoring) live in shared/ — the report
// slice judges old sessions with the same code. This slice never denies a call.

import type { EngineInterface, On } from "claude-code";
import { atom, update } from "claude-code";
import { loadConfig } from "../../shared/config";
import { activeRules, evaluate } from "../../shared/judge";
import { leftoversOf } from "../../shared/checks";
import { NOT_YET } from "../../shared/rules";
import { rulesOutput } from "../../shared/output";
import type { Out, Outputs } from "../../shared/output";
import { currentRole } from "../../shared/role";
import { appendEvent, openLog, readEvents } from "../../shared/store";

type $ = EngineInterface;

const verdictAtom = atom({ plugin: "cc-agent-watchdog", key: "verdict" } as const, null as { score: number; instant: boolean; count: number } | null);
const commandOutputsAtom = atom({ plugin: "cc-agent-watchdog", key: "commandOutputs" } as const, {} as Outputs, { shape: "output-1" });

const MAX_OUTPUTS = 20;

/** Files of the work tree that look like debugging leftovers (`git status --porcelain`). */
async function scanLeftovers($: $, cwd: string): Promise<string[]> {
	try {
		const run = await $.process.run(["git", "status", "--porcelain", "--untracked-files=all"], { cwd, timeoutMs: 5000 });
		if (run.exitCode !== 0) return [];
		return leftoversOf(run.stdout.split("\n").filter(Boolean).map((l) => l.slice(3).replace(/^"|"$/g, "")));
	} catch {
		return [];
	}
}

/** Judges the session now. Never throws: the watchdog must not disturb the session. */
export async function evaluateNow($: $): Promise<void> {
	try {
		const session = await $.session.id();
		const cwd = await $.session.cwd();
		const role = await currentRole($);
		const ref = await openLog($, session, role, cwd);
		if (!ref) return;
		let events = await readEvents($, ref.path);
		if (role !== "orchestrator") {
			const leftovers = await scanLeftovers($, cwd);
			const last = events.findLast((e) => e.kind === "scan");
			const before = last?.kind === "scan" ? last.leftovers.join("\n") : "";
			if (leftovers.join("\n") !== before) {
				const scan = { kind: "scan" as const, ts: await $.clock.now(), session, role, cwd, leftovers };
				await appendEvent($, ref, scan);
				events = [...events, scan];
			}
		}
		const verdict = evaluate(events, await loadConfig($, ref.workdir), role);
		await update($, verdictAtom, () => ({ score: verdict.score, instant: verdict.instant, count: verdict.violations.length }));
	} catch (error) {
		$.ui.log(`pravidla: vyhodnocení selhalo: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
	}
}

export function registerRules(on: On): void {
	on("command.run", { command: "watch" }, async ($, e, next) => {
		if (e.args.trim().split(/\s+/)[0] !== "rules") return next(e);
		const role = await currentRole($);
		const cwd = await $.session.cwd();
		const ref = await openLog($, await $.session.id(), role, cwd);
		const cfg = await loadConfig($, ref?.workdir ?? cwd);
		const { text, out } = rulesOutput(role, activeRules(role, cfg), NOT_YET);
		await update($, commandOutputsAtom, (o) => {
			const merged = { ...o, [text]: out };
			const keys = Object.keys(merged);
			return keys.length <= MAX_OUTPUTS ? merged : Object.fromEntries(keys.slice(keys.length - MAX_OUTPUTS).map((k) => [k, merged[k] as Out]));
		});
		return { text };
	});
}
