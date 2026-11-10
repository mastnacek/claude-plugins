import { describe, expect, test } from "claude-code/testing";
import { affectsStatus, countSpec, statusText } from "./count";

function fakeFs(files: Record<string, string>) {
	return {
		stat: async () => ({ kind: "dir" }),
		list: async (dir: string) => {
			const names = new Map<string, string>();
			for (const f of Object.keys(files)) {
				if (!f.startsWith(`${dir}/`)) continue;
				const [head, ...tail] = f.slice(dir.length + 1).split("/");
				names.set(head ?? "", tail.length ? "dir" : "file");
			}
			if (names.size === 0) throw new Error("ENOENT");
			return [...names].map(([name, kind]) => ({ name, kind }));
		},
		read: async (p: string) => files[p] ?? "",
	};
}

describe("countSpec", () => {
	test("counts confidence and rules without a tagged scenario", async () => {
		const c = await countSpec(
			fakeFs({
				"spec/rules/BR-A-1.yaml": "id: BR-A-1\nconfidence: confirmed   # x\n",
				"spec/rules/BR-A-2.yaml": "id: BR-A-2\nconfidence: gap\n",
				"spec/rules/BR-A-3.yaml": "id: BR-A-3\nconfidence: inferred\n",
				"tests/features/x/a.feature": "@BR-A-1\nScenario: x\n# @BR-A-2\n",
			}),
		);
		expect(c).toEqual({ confirmed: 1, inferred: 1, gap: 1, untested: 2 });
	});

	test("no features folder: everything untested", async () => {
		const c = await countSpec(fakeFs({ "spec/rules/BR-A-1.yaml": "id: BR-A-1\nconfidence: gap\n" }));
		expect(c.untested).toBe(1);
	});
});

describe("statusText / affectsStatus", () => {
	test("text", () => {
		expect(statusText({ confirmed: 3, inferred: 2, gap: 1, untested: 0 })).toBe("spec ✔3 ~2 ?1");
		expect(statusText({ confirmed: 3, inferred: 2, gap: 1, untested: 4 })).toBe("spec ✔3 ~2 ?1 · 4 untested");
	});
	test("paths", () => {
		expect(affectsStatus("spec/rules/a.yaml")).toBe(true);
		expect(affectsStatus("tests/features/a.feature")).toBe(true);
		expect(affectsStatus("tests/golden/a.json")).toBe(false);
		expect(affectsStatus("src/spec/a.py")).toBe(false);
	});
});
