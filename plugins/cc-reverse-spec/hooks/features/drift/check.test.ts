import { describe, expect, test } from "claude-code/testing";
import { analyse, renderConfidenceFile, renderMessage } from "./check";
import { runDrift } from "./run";
import type { DriftFs } from "./run";

const GOOD = "id: BR-A-001\nconfidence: confirmed\nsource:\n  - file: legacy/a\nverified_by:\n  - tests/features/a.feature:3\n";
const rule = (name: string, text: string) => ({ name, text });
const feature = (text: string) => [{ name: "a.feature", text }];

describe("analyse", () => {
	test("clean project", () => {
		const r = analyse([rule("BR-A-001.yaml", GOOD)], feature("  @BR-A-001\n  Scenario: x"));
		expect(r.problems).toEqual([]);
		expect(r).toMatchObject({ confirmed: 1, inferred: 0, gap: 0, untested: 0 });
	});

	test("bad confidence, missing source, empty verified_by", () => {
		const r = analyse(
			[
				rule("BR-A-001.yaml", "id: BR-A-001\nconfidence: maybe\nsource: []\nverified_by: []\n"),
				rule("BR-A-002.yaml", "id: BR-A-002\nsource:\n  - x: 1\nverified_by:\n  - y\n"),
			],
			feature("@BR-A-001 @BR-A-002"),
		);
		expect(r.problems).toContain('BR-A-001: confidence "maybe" is not confirmed|inferred|gap');
		expect(r.problems).toContain("BR-A-001: source missing");
		expect(r.problems).toContain("BR-A-001: verified_by empty");
		expect(r.problems).toContain("BR-A-002: confidence missing");
	});

	test("untagged rule and orphan tag", () => {
		const r = analyse([rule("BR-A-001.yaml", GOOD)], feature("@BR-B-009\n# @BR-A-001 in a comment"));
		expect(r.problems).toContain("BR-A-001: no feature scenario tagged @BR-A-001");
		expect(r.problems).toContain("@BR-B-009 in a.feature: no such rule");
		expect(r.untested).toBe(1);
	});

	test("file name differs from id", () => {
		const r = analyse([rule("BR-A-002.yaml", GOOD)], feature("@BR-A-001"));
		expect(r.problems).toContain('BR-A-002.yaml: file name differs from id "BR-A-001"');
	});

	test("counts all three levels", () => {
		const mk = (id: string, c: string) => rule(`${id}.yaml`, `id: ${id}\nconfidence: ${c}\n`);
		const r = analyse([mk("BR-A-1", "confirmed"), mk("BR-A-2", "inferred"), mk("BR-A-3", "gap"), mk("BR-A-4", "gap")], []);
		expect([r.confirmed, r.inferred, r.gap]).toEqual([1, 1, 2]);
		expect(renderMessage(r)).toContain("confirmed 1 · inferred 1 · gap 2");
		expect(renderConfidenceFile(r)).toContain("| 1 | 1 | 2 |");
	});
});

function fakeFs(files: Record<string, string>): DriftFs & { written: Record<string, string> } {
	const written: Record<string, string> = {};
	return {
		written,
		stat: async (p) => {
			if (Object.keys(files).some((f) => f.startsWith(`${p}/`))) return { kind: "dir" };
			throw new Error("ENOENT");
		},
		list: async (dir) => {
			const names = new Map<string, string>();
			for (const f of Object.keys(files)) {
				if (!f.startsWith(`${dir}/`)) continue;
				const [head, ...tail] = f.slice(dir.length + 1).split("/");
				names.set(head ?? "", tail.length ? "dir" : "file");
			}
			if (names.size === 0) throw new Error("ENOENT");
			return [...names].map(([name, kind]) => ({ name, kind }));
		},
		read: async (p) => files[p] ?? "",
		write: async (p, t) => void (written[p] = t),
	};
}

describe("runDrift", () => {
	test("not a migration project: one sentence pointing at the skill", async () => {
		const out = await runDrift(fakeFs({}));
		expect(out).toContain("spec/rules/ is missing");
		expect(out).toContain("reverse-spec");
		expect(out.split("\n")).toHaveLength(1);
	});

	test("check reports and writes spec/confidence.md; features searched recursively", async () => {
		const fs = fakeFs({
			"spec/rules/BR-A-001.yaml": GOOD,
			"tests/features/sub/a.feature": "@BR-A-001\nScenario: x",
		});
		const out = await runDrift(fs);
		expect(out).toContain("No problems.");
		expect(out).toContain("confirmed 1 · inferred 0 · gap 0");
		expect(fs.written["spec/confidence.md"]).toContain("| 1 | 0 | 0 |");
	});
});
