// rules — judges the session's ledger against the rules and keeps the score in $.state.
//
//   evaluateNow         the root calls it at session start, after each turn and at session end:
//                       looks for debugging leftovers (git status), judges the ledger, writes `verdict`
//   command.run {watch} answers `/watch rules` (all rules: state, mode, source, open exceptions) and
//                       `/watch rule <id> on|off|report|block [--global]` (project file or $.store); the rest goes down
//
// The rules themselves (data, predicates, scoring) live in shared/ — the report
// slice judges old sessions with the same code. This slice never denies a call.

import type { EngineInterface, On } from "claude-code";
import { atom, update } from "claude-code";
import { loadConfig, globalRules } from "../../shared/config";
import { evaluate } from "../../shared/judge";
import { leftoversOf } from "../../shared/checks";
import { NOT_YET, RULES } from "../../shared/rules";
import { rulesOutput, sentence } from "../../shared/output";
import type { Out, Outputs, Result } from "../../shared/output";
import { currentRole } from "../../shared/role";
import { STORE_KEY } from "../../shared/settings";
import { appendEvent, openLog, readEvents } from "../../shared/store";
import { openWindows } from "../../shared/waivers";
import { describeChange, parseChange, patchProjectFile, withChange } from "./change";

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

const PROJECT_FILE = ".claude/watchdog.json";

/** `/watch rules`: all rules with state, mode, source, and the exceptions open in this session. */
async function rulesView($: $): Promise<Result> {
	const role = await currentRole($);
	const cwd = await $.session.cwd();
	const ref = await openLog($, await $.session.id(), role, cwd);
	const cfg = await loadConfig($, ref?.workdir ?? cwd);
	const events = ref ? await readEvents($, ref.path) : [];
	return rulesOutput(role, RULES, cfg, NOT_YET, openWindows(events));
}

const fail = (text: string): Result => sentence("pravidlo", `❌ ${text}`, "error");

/** `/watch rule <id> on|off|report|block [--global]`: writes the project file or the user's store. */
async function ruleChange($: $, args: string[]): Promise<Result> {
	const change = parseChange(args);
	if ("error" in change) return fail(change.error);
	if (change.global) {
		const layer = withChange(await globalRules($), change);
		await $.store.set(STORE_KEY, layer);
	} else {
		const cwd = await $.session.cwd();
		const workdir = (await openLog($, await $.session.id(), await currentRole($), cwd))?.workdir ?? cwd;
		const path = `${workdir}/${PROJECT_FILE}`;
		const old = (await $.fs.exists(path)) ? String(await $.fs.read(path)) : undefined;
		const patched = patchProjectFile(old, change);
		if ("error" in patched) return fail(patched.error);
		await $.fs.write(path, patched.text);
	}
	const head = describeChange(change);
	const lines: Out["lines"] = [{ text: `✔ ${head}`, tone: "success" }];
	if (change.warning) lines.push({ text: change.warning, tone: "warning" });
	return { text: `Watchdog · ${head}`, out: { title: `pravidlo ${change.id}`, tone: change.warning ? "warning" : "success", lines } };
}

export function registerRules(on: On): void {
	on("command.run", { command: "watch" }, async ($, e, next) => {
		const [sub, ...rest] = e.args.trim().split(/\s+/).filter(Boolean);
		if (sub !== "rules" && sub !== "rule") return next(e);
		let result: Result;
		try {
			result = sub === "rules" ? await rulesView($) : await ruleChange($, rest);
		} catch (error) {
			result = fail(`${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
		}
		const { text, out } = result;
		await update($, commandOutputsAtom, (o) => {
			const merged = { ...o, [text]: out };
			const keys = Object.keys(merged);
			return keys.length <= MAX_OUTPUTS ? merged : Object.fromEntries(keys.slice(keys.length - MAX_OUTPUTS).map((k) => [k, merged[k] as Out]));
		});
		return { text };
	});
}
