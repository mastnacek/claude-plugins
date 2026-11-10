// count.ts — the numbers behind the status line. A minimal copy of what drift
// checks (slices do not import each other): confidence per rule, rules
// without a @<ID> scenario.

export type StatusFs = {
	stat: (path: string) => Promise<{ kind: string }>;
	list: (path: string) => Promise<{ name: string; kind: string }[]>;
	read: (path: string) => Promise<string>;
};

export type Counts = { confirmed: number; inferred: number; gap: number; untested: number };

async function files(fs: StatusFs, dir: string, ext: string, deep: boolean): Promise<string[]> {
	const out: string[] = [];
	for (const e of await fs.list(dir).catch(() => [])) {
		const path = `${dir}/${e.name}`;
		if (e.kind === "dir" && deep) out.push(...(await files(fs, path, ext, deep)));
		else if (e.kind === "file" && e.name.endsWith(ext)) out.push(path);
	}
	return out;
}

export async function countSpec(fs: StatusFs): Promise<Counts> {
	const counts: Counts = { confirmed: 0, inferred: 0, gap: 0, untested: 0 };
	const tags = new Set<string>();
	for (const path of await files(fs, "tests/features", ".feature", true)) {
		for (const line of (await fs.read(path)).split(/\r?\n/)) {
			if (line.trimStart().startsWith("#")) continue;
			for (const m of line.matchAll(/@(BR-[\w-]+)/g)) tags.add(m[1] ?? "");
		}
	}
	for (const path of await files(fs, "spec/rules", ".yaml", false)) {
		const text = await fs.read(path);
		const level = /^confidence:\s*(confirmed|inferred|gap)\b/m.exec(text)?.[1] as "confirmed" | "inferred" | "gap" | undefined;
		if (level) counts[level] += 1;
		const id = /^id:\s*["']?([\w-]+)/m.exec(text)?.[1] ?? path.slice(path.lastIndexOf("/") + 1).replace(/\.yaml$/, "");
		if (!tags.has(id)) counts.untested += 1;
	}
	return counts;
}

export function statusText(c: Counts): string {
	return `spec ✔${c.confirmed} ~${c.inferred} ?${c.gap}${c.untested > 0 ? ` · ${c.untested} untested` : ""}`;
}

/** Does a write to this project-relative path change the numbers? */
export function affectsStatus(relative: string): boolean {
	return relative.startsWith("spec/") || relative.startsWith("tests/features/");
}
