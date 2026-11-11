// immune — the cognitive immune interceptor (port of pi's immune_interceptor).
// Before Write / Edit / NotebookEdit into a file OUTSIDE the UMA store (write-gate
// guards the store) it asks the engine for the file's pain (`uma risk pain`),
// loads the rules (decision, pattern, preference, correction), checks the
// contract rules with ast-grep and judges the edit. By mode (`/uma immune`):
//
//   off   nothing
//   warn  (default) one $.ui.log line; nothing reaches the model
//   ask   a dialog $.ui.ask (Ano, pokračovat / Ne, zablokovat); No = { deny }
//   auto  a verified deny contract blocks (reason to the model, line to the person); the rest asks
//
// A heuristic verdict may warn or ask, never silently veto. Every failure
// degrades to "let it pass": an interceptor that breaks the work is worse than none.
//
// Why three hooks with a tool matcher and not one: tool.call without a matcher
// may be hooked once per plugin and write-gate owns it; a matched hook may be
// had by every slice.

import type { EngineInterface, On, PluginState, ShapedValue } from "claude-code";
import { atom, read, update } from "claude-code";
import { complete } from "../../shared/openrouter";
import { applicableRules, breachOf, outcomeOfScan, patternBlindSpot, ruleYaml, scanArgv, languageOf } from "./contracts";
import type { ContractBreach, ContractRule } from "./contracts";
import { LOG_KEY, appended, parseLog, statsOut, statsText, summarize } from "./log";
import { BLOCK, DIALOG_TITLE, NO_UI_REASON, PAIN_ARGV, PROCEED, RULES_ARGV, RULE_FACT_TYPES, assessEdit, decideAction, extractEdit, matchRule, oneLine, parsePain, parseRules, worthDialog } from "./policy";
import type { Edit, Mode, PainVerdict, RuleL1 } from "./policy";
import { DEFAULT_MODEL, RECOMMENDATION_TIMEOUT_MS, buildPrompt, formatRecommendation, parseRecommendation } from "./recommendation";
import type { Recommendation } from "./recommendation";

// Atoms are declared in every file that reads them (the validator's scan reads literals).
const settingsAtom = atom({ plugin: "cc-uma-memory", key: "settings" } as const, { recall: true, writeGate: "ask", append: true, immune: "warn", immuneModel: "", humility: false, shadow: "on" } as { recall: boolean; writeGate: "ask" | "off"; append: boolean; immune: "off" | "warn" | "ask" | "auto"; immuneModel: string; humility: boolean; shadow: "off" | "on" | "jev" }, { shape: "settings-5" });

type $ = EngineInterface;

/** Per check: a warning that costs 5 seconds is worse than none. */
const commandOutputsAtom = atom({ plugin: "cc-uma-memory", key: "commandOutputs" } as const, {} as ShapedValue<PluginState["cc-uma-memory"]["commandOutputs"]>, { shape: "output-2" });
const MAX_OUTPUTS = 20;
const CHECK_TIMEOUT_MS = 5000;
const SCAN_TIMEOUT_MS = 10_000;
const PLASTICITY_TIMEOUT_MS = 3000;
const RULES_TTL_MS = 10 * 60 * 1000;

let rulesCache: { cwd: string; rules: RuleL1[]; at: number } | undefined;
let astGrepBin: string | null | undefined;

/** For tests: nothing leaks between cases. */
export function resetImmuneCache(): void {
	rulesCache = undefined;
	astGrepBin = undefined;
}

async function fetchPain($: $, cwd: string, path: string): Promise<PainVerdict | undefined> {
	try {
		const run = await $.process.run(PAIN_ARGV(path), { cwd, timeoutMs: CHECK_TIMEOUT_MS });
		return run.exitCode === 0 ? parsePain(run.stdout) : undefined;
	} catch {
		return undefined;
	}
}

/** One `uma list` per type (clap rejects a repeated --type); cached 10 minutes per cwd. */
async function fetchRules($: $, cwd: string): Promise<RuleL1[]> {
	if (rulesCache && rulesCache.cwd === cwd && Date.now() - rulesCache.at < RULES_TTL_MS) return rulesCache.rules;
	const lists = await Promise.all(
		RULE_FACT_TYPES.map(async (type) => {
			try {
				const run = await $.process.run(RULES_ARGV(type), { cwd, timeoutMs: CHECK_TIMEOUT_MS });
				return run.exitCode === 0 ? parseRules(run.stdout) : [];
			} catch {
				return [];
			}
		}),
	);
	const rules = lists.flat();
	rulesCache = { cwd, rules, at: Date.now() };
	return rules;
}

/** ast-grep from PATH, else the copy pi installed under ~/.pi/agent/npm; null = none. */
async function findAstGrep($: $, cwd: string): Promise<string | null> {
	if (astGrepBin !== undefined) return astGrepBin;
	const home = await $.env.get("HOME");
	const base = home ? `${home}/.pi/agent/npm/node_modules/@ast-grep` : undefined;
	const candidates = ["ast-grep", ...(base ? [`${base}/cli-linux-x64-gnu/ast-grep`, `${base}/cli-linux-x64-musl/ast-grep`, `${base}/cli-darwin-arm64/ast-grep`, `${base}/cli-darwin-x64/ast-grep`] : [])];
	for (const bin of candidates) {
		try {
			if ((await $.process.run([bin, "--version"], { cwd, timeoutMs: CHECK_TIMEOUT_MS })).exitCode === 0) return (astGrepBin = bin);
		} catch {
			// not here: try the next place
		}
	}
	return (astGrepBin = null);
}

/** The contract rules against the added text. Never throws; what cannot be verified becomes a visible warn breach. */
async function checkContracts($: $, cwd: string, rules: RuleL1[], edit: Edit): Promise<ContractBreach[]> {
	const applicable = applicableRules(rules, edit.path);
	if (applicable.length === 0 || edit.added.trim() === "") return [];
	const bin = await findAstGrep($, cwd);
	const breaches: ContractBreach[] = [];
	for (const rule of applicable) {
		const found = await scanOne($, cwd, bin, rule, edit);
		const breach = breachOf(rule, edit.path, found);
		if (breach) breaches.push(breach);
	}
	return breaches;
}

async function scanOne($: $, cwd: string, bin: string | null, rule: ContractRule, edit: Edit): Promise<{ matched: boolean; degraded?: string }> {
	if (bin === null) return { matched: false, degraded: "ast-grep executable not found" };
	const blind = patternBlindSpot(rule.contract.rule.pattern);
	if (blind) return { matched: false, degraded: blind };
	const language = languageOf(rule.contract, edit.path);
	const yaml = language ? ruleYaml(rule, language) : undefined;
	if (!yaml) return { matched: false, degraded: "contract language/pattern cannot be verified inline" };
	try {
		const run = await $.process.run(scanArgv(bin, yaml), { cwd, stdin: edit.added, timeoutMs: SCAN_TIMEOUT_MS });
		return outcomeOfScan(rule, run.exitCode, run.stdout);
	} catch {
		return { matched: false, degraded: "inline scan could not run" };
	}
}

/** The second opinion of the model on OpenRouter; undefined on any failure (the dialog then shows without it). */
async function recommend($: $, rule: RuleL1, added: string, model: string): Promise<Recommendation | undefined> {
	const prompt = buildPrompt(rule, added);
	const answer = await complete($, { model, system: prompt.system, user: prompt.user, timeoutMs: RECOMMENDATION_TIMEOUT_MS });
	return answer.ok ? parseRecommendation(answer.text) : undefined;
}

/** Asks; undefined = nobody to ask. */
async function askProceed($: $, question: string): Promise<boolean | undefined> {
	try {
		return (await $.ui.ask(question, { options: [PROCEED, BLOCK] })).trim() === PROCEED;
	} catch {
		return undefined;
	}
}

async function recordDecision($: $, cwd: string, matched: RuleL1 | undefined, rec: Recommendation | undefined, approved: boolean): Promise<void> {
	try {
		const entry = { ts: new Date().toISOString(), ...(matched ? { ruleId: matched.id } : {}), ...(rec ? { relation: rec.relation, confidence: rec.confidence } : {}), approved };
		await $.store.set(LOG_KEY, appended(parseLog(await $.store.get(LOG_KEY)), entry));
		// Plasticity: the person upheld the rule (blocked) → reinforce; overrode a verdict "violates" (proceeded) → frustrate.
		// A touch or an unrelated edit must not erode the rule's weight.
		if (matched) {
			const kind = !approved ? "reinforce" : rec?.relation === "violates" ? "frustrate" : undefined;
			if (kind) await $.process.run(["uma", "plasticity", kind, matched.id], { cwd, timeoutMs: PLASTICITY_TIMEOUT_MS });
		}
	} catch {
		// the journal and the telemetry never touch the decision
	}
}

type Verdict = { deny: string } | { note?: string };

async function inspect($: $, mode: Mode, model: string, edit: Edit): Promise<Verdict> {
	const cwd = await $.session.cwd();
	const [pain, rules] = await Promise.all([fetchPain($, cwd, edit.path), fetchRules($, cwd)]);
	const warnings = assessEdit(pain, rules, edit.added);
	const breaches = await checkContracts($, cwd, rules, edit);
	const action = decideAction(mode, warnings, breaches);

	if (action.kind === "allow") return {};
	if (action.kind === "notify") {
		await $.ui.log(oneLine(action.message));
		return {};
	}
	if (action.kind === "block") {
		await $.ui.log(oneLine(`Imunitní interceptor zablokoval úpravu ${edit.path} (porušený kontrakt)`));
		return { deny: action.reason };
	}
	const matched = matchRule(rules, edit.added);
	// Not worth interrupting: the warning rides along to the model instead.
	if (!worthDialog(pain, matched, breaches)) return { note: `[UMA Immune Advisory Warning]:\n${action.message}` };

	const rec = matched ? await recommend($, matched, edit.added, model) : undefined;
	const question = [DIALOG_TITLE, action.message, ...(rec ? [formatRecommendation(rec)] : []), "", "Pokračovat s úpravou?"].join("\n");
	const proceed = await askProceed($, question);
	if (proceed === undefined) {
		// No one to ask: a heuristic never vetoes silently. Let it pass, the model and the person are told.
		await $.ui.log(oneLine(`Imunitní interceptor se nemohl zeptat; úprava ${edit.path} prošla s varováním`));
		return { note: `[UMA Immune Advisory Warning]:\n${action.message}\n${NO_UI_REASON}` };
	}
	await recordDecision($, cwd, matched, rec, proceed);
	if (!proceed) return { deny: action.message };
	return { note: `[UMA Immune Advisory Warning]:\n${action.message}${rec ? `\n${rec.relation} (${Math.round(rec.confidence * 100)} %): ${rec.reason}` : ""}` };
}

/** The hook body shared by the three tools: judge, then run the call, the warning attached when there is one. */
async function guard($: $, e: Record<string, unknown>, pass: () => Promise<{ context?: string[] }>): Promise<{ deny: string } | { context?: string[] }> {
	let verdict: Verdict = {};
	try {
		const settings = await read($, settingsAtom);
		const edit = settings.immune === "off" ? undefined : extractEdit(e);
		if (edit) verdict = await inspect($, settings.immune, settings.immuneModel || DEFAULT_MODEL, edit);
	} catch {
		verdict = {};
	}
	if ("deny" in verdict) return { deny: verdict.deny };
	const done = await pass();
	return verdict.note ? { ...done, context: [...(done.context ?? []), verdict.note] } : done;
}

export function registerImmune(on: On): void {
	on("tool.call", { tool: "Write" }, ($, e, next) => guard($, e as Record<string, unknown>, () => next(e) as never) as never);
	on("tool.call", { tool: "Edit" }, ($, e, next) => guard($, e as Record<string, unknown>, () => next(e) as never) as never);
	on("tool.call", { tool: "NotebookEdit" }, ($, e, next) => guard($, e as Record<string, unknown>, () => next(e) as never) as never);

	// `/uma immune stats`; the switches (`immune`, `immune-model`) are uma-command's.
	on("command.run", { command: "uma" }, async ($, e, next) => {
		if (!/^\s*immune\s+stats\s*$/.test(e.args)) return next(e);
		const summary = summarize(parseLog(await $.store.get(LOG_KEY)));
		const text = statsText(summary);
		const out = statsOut(summary);
		await update($, commandOutputsAtom, (o) => ({ ...Object.fromEntries(Object.entries(o).slice(-(MAX_OUTPUTS - 1))), [text]: out }));
		return { text };
	});
}
