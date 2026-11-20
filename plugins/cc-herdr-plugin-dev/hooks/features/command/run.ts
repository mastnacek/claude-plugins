// run.ts — what `/herdr-plugin <sub>` does and the output it leaves: one line for the model (`text`)
// and the whole output as data (`out`) that register.tsx draws in a frame.

import type { EngineInterface, HerdrOutput } from "claude-code";
import { scaffoldPlugin, validateAt } from "../../shared/actions";
import { parseArgs, USAGE } from "./parse";

type $ = EngineInterface;
type Result = { text: string; out: HerdrOutput };

const fail = (title: string, text: string): Result => ({ text, out: { title, tone: "error", lines: [{ text: `❌ ${text}`, tone: "error" }] } });

async function validate($: $, path: string): Promise<Result> {
	const r = await validateAt($, path);
	if ("error" in r) return fail("validace manifestu", r.error);
	const lines: HerdrOutput["lines"] = [{ text: `📄 ${r.path}`, tone: "dim" }];
	for (const x of r.errors) lines.push({ text: `❌ ${x}`, tone: "error" });
	for (const x of r.warnings) lines.push({ text: `⚠️  ${x}`, tone: "warning" });
	if (r.errors.length === 0) lines.push({ text: "✅ manifest je platný", tone: "success" });
	const text = r.errors.length === 0 ? `manifest ${r.path} je platný (${r.warnings.length} varování)` : `manifest ${r.path}: ${r.errors.length} chyb: ${r.errors[0]}`;
	return { text, out: { title: "validace manifestu", tone: r.errors.length === 0 ? (r.warnings.length ? "warning" : "success") : "error", lines } };
}

export async function runCommand($: $, args: string): Promise<Result> {
	const p = parseArgs(args);
	if (p.sub === "usage") return fail("nápověda", p.why ? `${p.why} ${USAGE}` : USAGE);
	if (p.sub === "validate") return validate($, p.path);
	if (p.sub === "docs") {
		const dir = `${$.plugin.root}/skills/herdr-plugin-dev`;
		const text = `dokumentace herdru 0.9.5 je ve skillu herdr-plugin-dev: ${dir}/SKILL.md a references/`;
		return { text, out: { title: "dokumentace", tone: "normal", lines: [{ text: "📚 skill herdr-plugin-dev (SKILL.md + references/)" }, { text: `📁 ${dir}`, tone: "dim" }] } };
	}
	const done = await scaffoldPlugin($, p.dir, { id: p.id, name: p.name, language: p.language });
	if ("error" in done) return fail("kostra pluginu", done.error);
	const lines: HerdrOutput["lines"] = [
		{ text: `✅ ${p.language} plugin ${p.id} v ${p.dir}`, tone: "success" },
		...done.files.map((f) => ({ text: `   📄 ${f}`, tone: "dim" as const })),
		{ text: `▶ cd ${p.dir} && herdr plugin link .` },
	];
	return { text: `kostra ${p.language} pluginu ${p.id} vytvořena v ${p.dir} (${done.files.length} souborů)`, out: { title: "kostra pluginu", tone: "success", lines } };
}
