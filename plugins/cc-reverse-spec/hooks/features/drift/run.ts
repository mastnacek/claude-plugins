// run.ts — /spec-check: one line in, the text to show out.

import { analyse, renderConfidenceFile, renderMessage } from "./check";
import type { SourceFile } from "./check";
import { isMigrationProject } from "../../shared/project";
import type { StatFs } from "../../shared/project";

export const COMMAND = "spec-check";

export type DriftFs = StatFs & {
	list: (path: string) => Promise<{ name: string; kind: string }[]>;
	read: (path: string) => Promise<string>;
	write: (path: string, text: string) => Promise<void>;
};

const NOT_MIGRATION = "spec/rules/ is missing — this is not a migration project; see skill reverse-spec, step 0.";

async function readAll(fs: DriftFs, dir: string, keep: (name: string) => boolean, deep: boolean): Promise<SourceFile[]> {
	const entries = await fs.list(dir).catch(() => []);
	const out: SourceFile[] = [];
	for (const e of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
		const path = `${dir}/${e.name}`;
		if (e.kind === "dir" && deep) out.push(...(await readAll(fs, path, keep, deep)));
		else if (e.kind === "file" && keep(e.name)) out.push({ name: path, text: await fs.read(path) });
	}
	return out;
}

export async function runDrift(fs: DriftFs): Promise<string> {
	if (!(await isMigrationProject(fs))) return NOT_MIGRATION;

	const rules = await readAll(fs, "spec/rules", (n) => n.endsWith(".yaml"), false);
	const features = await readAll(fs, "tests/features", (n) => n.endsWith(".feature"), true);
	// File names in messages are shown without the folder.
	const report = analyse(
		rules.map((f) => ({ ...f, name: f.name.slice("spec/rules/".length) })),
		features.map((f) => ({ ...f, name: f.name.slice("tests/features/".length) })),
	);
	await fs.write("spec/confidence.md", renderConfidenceFile(report));
	return `${renderMessage(report)}\nWrote spec/confidence.md.`;
}
