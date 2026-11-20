import { describe, expect, test } from "claude-code/testing";
import { DENY, bashWritesRecord, decide, isSpaiRecord } from "./decide";

describe("isSpaiRecord", () => {
	test("records", () => {
		expect(isSpaiRecord("docs/spai/task/T-1.md")).toBe(true);
		expect(isSpaiRecord("/w/p/docs/spai/.index.json")).toBe(true);
		expect(isSpaiRecord("/w/p/.pi/spai/a.md")).toBe(true);
		expect(isSpaiRecord("D:\\proj\\docs\\spai\\a.md")).toBe(true);
		expect(isSpaiRecord("d:/proj/DOCS/SPAI/A.MD")).toBe(true);
		expect(isSpaiRecord("D:/proj\\docs/spai\\x\\.index.json")).toBe(true);
	});
	test("not records", () => {
		expect(isSpaiRecord("docs/spai/a.txt")).toBe(false);
		expect(isSpaiRecord("docs/spai")).toBe(false);
		expect(isSpaiRecord("docs/other/a.md")).toBe(false);
		expect(isSpaiRecord("src/spai/a.md")).toBe(false);
		expect(isSpaiRecord("docs/spai-x/a.md")).toBe(false);
		expect(isSpaiRecord("D:\\proj\\docs\\spai\\a.json")).toBe(false);
	});
});

describe("decide", () => {
	test("file tools", () => {
		for (const tool of ["Write", "Edit", "MultiEdit"]) {
			expect(decide(tool, { file_path: "/w/docs/spai/a.md" })).toBe(DENY);
			expect(decide(tool, { file_path: "D:\\w\\docs\\spai\\a.md" })).toBe(DENY);
			expect(decide(tool, { file_path: "/w/docs/readme.md" })).toBeNull();
		}
		expect(decide("NotebookEdit", { notebook_path: "/w/.pi/spai/a.md" })).toBe(DENY);
		expect(decide("NotebookEdit", { notebook_path: "/w/a.ipynb" })).toBeNull();
	});
	test("Bash writes denied", () => {
		for (const c of [
			"echo x > docs/spai/a.md",
			"echo x >> docs/spai/a.md",
			"echo x 2>/dev/null >docs/spai/a.md",
			'cat <<EOF > "docs/spai/a.md"',
			"echo x | tee docs/spai/a.md",
			"echo x | tee -a D:\\p\\docs\\spai\\a.md",
			"sed -i s/a/b/ docs/spai/a.md",
			"sed -i.bak 's/a/b/' docs/spai/a.md",
			"cp /tmp/a.md docs/spai/a.md",
			"mv a.md D:\\p\\DOCS\\SPAI\\a.md",
			"ls && FOO=1 cp a docs/spai/b.md",
		])
			expect(bashWritesRecord(c), c).toBe(true);
	});
	test("Bash reads pass", () => {
		for (const c of [
			"cat docs/spai/a.md",
			"grep -r x docs/spai",
			"ls docs/spai/",
			"spai add --title 'x > docs/spai/a.md'",
			'spai set docs/spai/a.md --status done',
			"echo x > out.txt",
			"sed s/a/b/ docs/spai/a.md",
			"cp docs/spai/a.md /tmp/a.md",
			"mv docs/spai/a.md /tmp/",
			"cat docs/spai/a.md | tee out.txt",
			"echo x 2>&1",
		])
			expect(bashWritesRecord(c), c).toBe(false);
		expect(decide("Bash", { command: "cat docs/spai/a.md" })).toBeNull();
		expect(decide("Bash", { command: "echo > docs/spai/a.md" })).toBe(DENY);
	});
});
