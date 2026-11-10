// check.ts — the drift check: pure analysis of rule files and feature files.

import { parseRule } from "./parse-rule";

export type SourceFile = { name: string; text: string };

export type Report = {
	rules: number;
	features: number;
	problems: string[];
	confirmed: number;
	inferred: number;
	gap: number;
	/** Rules no feature tags with @<ID>. */
	untested: number;
};

const CONFIDENCE = ["confirmed", "inferred", "gap"] as const;
const TAG = /@(BR-[\w-]+)/g;

function featureTags(text: string): string[] {
	const tags: string[] = [];
	for (const line of text.split(/\r?\n/)) {
		if (line.trimStart().startsWith("#")) continue;
		for (const m of line.matchAll(TAG)) tags.push(m[1] ?? "");
	}
	return tags;
}

export function analyse(rules: SourceFile[], features: SourceFile[]): Report {
	const problems: string[] = [];
	const counts = { confirmed: 0, inferred: 0, gap: 0 };
	const ids = new Set<string>();

	for (const file of rules) {
		const stem = file.name.replace(/\.ya?ml$/, "");
		const r = parseRule(file.text);
		const label = r.id ?? stem;
		ids.add(label);
		if (!r.id) problems.push(`${file.name}: no id`);
		else if (r.id !== stem) problems.push(`${file.name}: file name differs from id "${r.id}"`);
		const level = CONFIDENCE.find((c) => c === r.confidence);
		if (level) counts[level] += 1;
		else problems.push(`${label}: confidence ${r.confidence ? `"${r.confidence}" is not confirmed|inferred|gap` : "missing"}`);
		if (!r.source) problems.push(`${label}: source missing`);
		if (!r.verifiedBy) problems.push(`${label}: verified_by empty`);
	}

	const tagged = new Map<string, string[]>();
	for (const f of features) {
		for (const tag of featureTags(f.text)) tagged.set(tag, [...(tagged.get(tag) ?? []), f.name]);
	}
	let untested = 0;
	for (const id of ids) {
		if (!tagged.has(id)) {
			untested += 1;
			problems.push(`${id}: no feature scenario tagged @${id}`);
		}
	}
	for (const [tag, files] of tagged) {
		if (!ids.has(tag)) problems.push(`@${tag} in ${[...new Set(files)].join(", ")}: no such rule`);
	}

	return { rules: rules.length, features: features.length, problems, ...counts, untested };
}

const MAX_LISTED = 50;

export function renderMessage(r: Report): string {
	const lines = [`Checked ${r.rules} rules, ${r.features} feature files.`];
	if (r.problems.length === 0) lines.push("No problems.");
	else {
		lines.push(`${r.problems.length} problems:`);
		lines.push(...r.problems.slice(0, MAX_LISTED).map((p) => `- ${p}`));
		if (r.problems.length > MAX_LISTED) lines.push(`- … and ${r.problems.length - MAX_LISTED} more`);
	}
	lines.push(`confirmed ${r.confirmed} · inferred ${r.inferred} · gap ${r.gap}`);
	return lines.join("\n");
}

/** The body of spec/confidence.md (table as in the skill's template). */
export function renderConfidenceFile(r: Report): string {
	const lines = [
		"# Confidence summary",
		"",
		"Updated by `/spec-check`.",
		"",
		"| confirmed | inferred | gap |",
		"|---|---|---|",
		`| ${r.confirmed} | ${r.inferred} | ${r.gap} |`,
	];
	if (r.problems.length > 0) {
		lines.push("", "## Open problems", "", ...r.problems.slice(0, MAX_LISTED).map((p) => `- ${p}`));
		if (r.problems.length > MAX_LISTED) lines.push(`- … and ${r.problems.length - MAX_LISTED} more`);
	}
	return `${lines.join("\n")}\n`;
}
