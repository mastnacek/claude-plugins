// uma-command — the /uma command's shell: registers it, answers help and unknown
// subcommands, draws multi-line output, completes subcommands, and owns the
// persisted switches (`/uma recall`, `/uma write-gate`, `/uma append`) that other slices
// read, and the read-only commands a person runs to look into the memory.
//
//   start                  registers /uma, loads the switches from $.store into `settings`
//   command.run {uma}      recall, write-gate, append, search/list/read/timeline/doctor/reindex/export, help; anything else goes down to the slice that owns
//                          it (claude-memory), and if none answers, the unknown-subcommand text
//   ui.render CommandOutput draws a multi-line output from `commandOutputs` in its row
//   prompt.autocomplete    completes subcommands and their arguments
//
// A plugin's command text goes into the model's requests: the model gets only
// the first line, the full text lives in $.state ($.ui.log is one line).

import type { EngineInterface, On, PromptAutocompleteSuggestion } from "claude-code";
import { atom, read, update } from "claude-code";
import { failedRun, isQuery, missingBinary, planQuery } from "./queries";
import { appendCommand, immuneCommand, immuneModelCommand, parseStored, recallCommand, writeGateCommand } from "./settings";
import type { Settings } from "./settings";

// Atoms are declared in every file that reads them (the validator's scan reads literals).
const commandOutputsAtom = atom({ plugin: "cc-uma-memory", key: "commandOutputs" } as const, {} as Record<string, string>);
const settingsAtom = atom({ plugin: "cc-uma-memory", key: "settings" } as const, { recall: true, writeGate: "ask", append: true, immune: "warn", immuneModel: "" } as Settings, { shape: "settings-3" });

type $ = EngineInterface;

const COMMAND = "uma";
const STORE_KEY = "settings";
const MAX_OUTPUTS = 20;
const QUERY_TIMEOUT_MS = 30_000;

const HELP = [
	"/uma — paměť UMA",
	"/uma claude-memory                 stav automatické paměti Claude Code — ne UMA — a odkud pochází",
	"/uma claude-memory off [--global]  vypne ji (projekt: .claude/settings.local.json, --global: ~/.claude/settings.json)",
	"/uma claude-memory on [--global]   zapne ji",
	"/uma recall [on|off]               vzpomínky z UMA se přidají k promptu (výchozí zapnuto, platí ve všech sezeních)",
	"/uma write-gate [ask|off]          dialog před zápisem do paměti UMA (výchozí ask, platí ve všech sezeních)",
	"/uma append [on|off]               aktivní rozhodnutí a vzory z UMA v system promptu (výchozí zapnuto, platí ve všech sezeních)",
	"/uma immune [off|warn|ask|auto]    imunitní interceptor před Write/Edit mimo úložiště UMA (výchozí warn: varování jedním řádkem; ask: dialog; auto: ověřený kontrakt blokuje hned)",
	"/uma immune stats                  jak jsi odpovídal na dialogy interceptoru",
	"/uma immune-model [<id>|default]   model OpenRouteru pro doporučení v dialogu (výchozí google/gemini-3.5-flash-lite)",
	"/uma search <dotaz>                hledání ve faktech",
	"/uma list [global|<projekt>]       výpis faktů",
	"/uma read <id>                     jeden fakt",
	"/uma timeline [--id <ULID>] [--all] jak se fakty vyvíjely (řetězy nahrazení)",
	"/uma doctor                        zpráva o zdraví úložiště a indexu (jen čte)",
	"/uma reindex                       přebuduje index z markdownových souborů",
	"/uma export --out <složka>         zapíše fakta jako balíček OKF do složky",
	"/uma debt [list|clear]             dluhy tohoto pracovního stromu (list výchozí, i vyrovnané); clear smaže všechny — jen člověk",
	"/uma help                          tato nápověda",
].join("\n");

/** A look into the memory: `uma` runs in the session's cwd (it scopes facts by git root); nothing is written. */
async function runQuery($: $, sub: Parameters<typeof planQuery>[0], args: string[]): Promise<string> {
	const plan = planQuery(sub, args);
	if ("usage" in plan) return plan.usage;
	try {
		const run = await $.process.run(plan.argv, { cwd: await $.session.cwd(), timeoutMs: QUERY_TIMEOUT_MS });
		if (run.exitCode !== 0) return failedRun(sub, run.exitCode, run.stderr || run.stdout);
		return plan.render(run.stdout);
	} catch (error) {
		return missingBinary(error instanceof Error ? error.message.split("\n")[0] ?? "" : String(error));
	}
}

async function runCommand($: $, args: string): Promise<string | undefined> {
	const [sub, arg, ...rest] = args.trim().split(/\s+/).filter(Boolean);
	if (sub === undefined || sub === "help") return HELP;
	if (isQuery(sub)) return runQuery($, sub, [arg, ...rest].filter((a): a is string => a !== undefined));
	if (sub === "immune" && arg === "stats") return undefined; // the immune slice owns its log
	if (sub !== "recall" && sub !== "write-gate" && sub !== "append" && sub !== "immune" && sub !== "immune-model") return undefined;
	const current = await read($, settingsAtom);
	const change = sub === "recall" ? recallCommand : sub === "append" ? appendCommand : sub === "immune" ? immuneCommand : sub === "immune-model" ? immuneModelCommand : writeGateCommand;
	const result = change(current, arg, rest.length);
	if (result.settings !== current) {
		await $.store.set(STORE_KEY, result.settings);
		await update($, settingsAtom, () => result.settings);
	}
	return result.text;
}

function completions(text: string, token: string): PromptAutocompleteSuggestion[] {
	const m = /^\/uma\s+(.*)$/s.exec(text);
	if (!m) return [];
	const words = (m[1] ?? "").split(/\s+/);
	const prefix = token.toLowerCase();
	let options: Array<[string, string?]>;
	if (words.length <= 1) {
		options = [
			["claude-memory", "automatická paměť Claude Code — ne UMA"],
			["recall", "vzpomínky z UMA k promptu"],
			["write-gate", "schvalování zápisu do paměti"],
			["append", "pravidla UMA v system promptu"],
			["immune", "imunitní interceptor úprav kódu"],
			["immune-model", "model OpenRouteru pro doporučení"],
			["search", "hledání ve faktech"],
			["list", "výpis faktů"],
			["read", "jeden fakt"],
			["timeline", "vývoj faktů"],
			["doctor", "zpráva o zdraví úložiště"],
			["reindex", "přebudování indexu"],
			["export", "export do balíčku OKF"],
			["debt", "dluhy pracovního stromu"],
			["help", "nápověda"],
		];
	} else if (words[0] === "claude-memory" && words.length <= 3) options = [["on"], ["off"], ["--global"]];
	else if (words[0] === "recall" && words.length === 2) options = [["on"], ["off"]];
	else if (words[0] === "write-gate" && words.length === 2) options = [["ask"], ["off"]];
	else if (words[0] === "append" && words.length === 2) options = [["on"], ["off"]];
	else if (words[0] === "immune" && words.length === 2) options = [["off"], ["warn"], ["ask"], ["auto"], ["stats", "jak jsi odpovídal na dialogy"]];
	else if (words[0] === "immune-model" && words.length === 2) options = [["default", "google/gemini-3.5-flash-lite"]];
	else if (words[0] === "debt" && words.length === 2) options = [["list", "otevřené i vyrovnané dluhy"], ["clear", "smazat všechny dluhy"]];
	else if (words[0] === "list" && words.length === 2) options = [["global", "jen globální fakta"]];
	else if (words[0] === "timeline" && words.length >= 2) options = [["--id", "jen řetěz s tímto ID"], ["--all", "i nikdy nenahrazená fakta"]];
	else if (words[0] === "export" && words.length === 2) options = [["--out", "cílová složka"]];
	else return [];
	return options
		.filter(([name]) => name.startsWith(prefix))
		.map(([name, description]) => (description ? { text: name, description } : { text: name }));
}

function capOutputs(record: Record<string, string>): Record<string, string> {
	const keys = Object.keys(record);
	if (keys.length <= MAX_OUTPUTS) return record;
	const next: Record<string, string> = {};
	for (const key of keys.slice(keys.length - MAX_OUTPUTS)) next[key] = record[key] as string;
	return next;
}

export function registerUmaCommand(on: On): void {
	on("command.run", { command: COMMAND }, async ($, e, next) => {
		const mine = await runCommand($, e.args);
		if (mine === undefined) {
			// Not ours: the slice that owns the subcommand answers; if nobody does, it is unknown.
			const below = await next(e).catch(() => ({ text: undefined }));
			if (below.text !== undefined) return below;
			return { text: `Neznámý podpříkaz „${e.args.trim().split(/\s+/)[0] ?? ""}“. Zkus /uma help.` };
		}
		const output = mine.trimEnd();
		const [summary = "", ...rest] = output.split("\n");
		if (rest.length > 0) await update($, commandOutputsAtom, (o) => capOutputs({ ...o, [summary]: output }));
		return { text: summary };
	});

	on("ui.render", { component: "CommandOutput" }, async ($, e, next) => {
		if (e.props.command !== COMMAND || e.props.isErrored) return next(e);
		// The row's text may come headed with the plugin's name ("uma: …").
		const outputs = await read($, commandOutputsAtom);
		const text = e.props.text.trim();
		const key = Object.keys(outputs).find((k) => text === k || text.endsWith(`: ${k}`));
		const full = key ? outputs[key] : undefined;
		if (!full) return next(e);
		const { Box, Text } = $.ui.resolve(e);
		return (
			<Box flexDirection="column">
				{full.split("\n").map((line, i) => (
					<Text key={String(i)} dimColor={i > 0}>
						{line || " "}
					</Text>
				))}
			</Box>
		);
	});

	on("prompt.autocomplete", async ($, e, next) => {
		const mine = completions(e.text, e.token);
		if (mine.length === 0) return next(e);
		const below = await next(e);
		return { ...below, suggestions: [...mine, ...below.suggestions] };
	});
}

/** Session start, run by the root: registers the command and loads the persisted switches. */
export async function startUmaCommand($: EngineInterface): Promise<void> {
	await $.command.register({
		name: COMMAND,
		description: "Paměť UMA: vzpomínky k promptu, schvalování zápisu, automatická paměť Claude",
		argumentHint: "search | list | read | timeline | doctor | reindex | export | debt | recall | append | write-gate | immune | immune-model | claude-memory | help",
	});
	const stored = parseStored(await $.store.get(STORE_KEY));
	await update($, settingsAtom, () => stored);
}
