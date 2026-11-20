import { describe, expect, test } from "claude-code/testing";
import { DENY, DENY_DELETE, bashDeletesRecord, bashWritesRecord, decide, isSpaiRecord } from "./decide";

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

describe("deleting records", () => {
	test("Bash deletes denied", () => {
		for (const c of [
			"rm docs/spai/a.md",
			"rm -f docs/spai/2026-01-01-SPAI-001-a.md",
			"rm -rf /w/p/.pi/spai/a.md",
			"rm docs/spai/*.md",
			"git rm docs/spai/a.md",
			"git rm -f --cached docs/spai/.index.json",
			"del docs\\spai\\a.md",
			"del /q D:\\p\\DOCS\\SPAI\\a.md",
			"Remove-Item docs/spai/a.md",
			"Remove-Item -Force -LiteralPath 'D:\\p\\docs\\spai\\a.md'",
			"remove-item x.txt,docs/spai/a.md",
			"unlink docs/spai/.index.json",
			"ls && FOO=1 rm docs/spai/a.md",
			"/bin/rm docs/spai/a.md",
		])
			expect(bashDeletesRecord(c), c).toBe(true);
	});
	test("Bash non-deletes pass", () => {
		for (const c of [
			"rm out.txt",
			"rm -rf target",
			"git rm src/a.rs",
			"git add docs/spai/a.md",
			"git status docs/spai/a.md",
			"cat docs/spai/a.md",
			"ls docs/spai/ && rm out.txt",
			"spai delete 7",
			"spai delete docs/spai/a.md",
			"echo rm docs/spai/a.md",
			"cat docs/spai/a.md | tee out.txt",
		])
			expect(bashDeletesRecord(c), c).toBe(false);
	});
	test("decide gives the delete reason", () => {
		expect(decide("Bash", { command: "rm docs/spai/a.md" })).toBe(DENY_DELETE);
		expect(DENY_DELETE).toBe("Záznamy SPAI maže jen `spai delete` (skill spai).");
		expect(decide("Bash", { command: "echo x > docs/spai/a.md" })).toBe(DENY);
		expect(decide("Bash", { command: "rm out.txt" })).toBeNull();
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
