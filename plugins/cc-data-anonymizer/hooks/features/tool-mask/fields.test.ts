import { expect, test } from "claude-code/testing";
import { writesRedacted } from "./fields";

test("REDACTED as a value written into a file is caught, other mentions are not", () => {
	expect(writesRedacted("Write", { file_path: "/p/a", content: 'pw = "REDACTED"' })).toBe(true);
	expect(writesRedacted("Edit", { file_path: "/p/a", old_string: "a", new_string: "pw: REDACTED" })).toBe(true);
	expect(writesRedacted("NotebookEdit", { notebook_path: "/p/n", new_source: "pw=REDACTED" })).toBe(true);
	expect(writesRedacted("Write", { file_path: "/p/a", content: "the word REDACTED means removed" })).toBe(false);
	expect(writesRedacted("Write", { file_path: "/p/REDACTED", content: "x" })).toBe(false);
	// the text being replaced is not a written value
	expect(writesRedacted("Edit", { file_path: "/p/a", old_string: 'pw = "REDACTED"', new_string: "pw = 1" })).toBe(false);
	expect(writesRedacted("Write", { file_path: "/p/a", content: "echo «REDACTED:password:1»" })).toBe(false);
});

test("a shell command counts only when it writes a file", () => {
	expect(writesRedacted("Bash", { command: 'export PW="REDACTED"' })).toBe(false);
	expect(writesRedacted("Bash", { command: 'grep "REDACTED" a.txt 2>&1' })).toBe(false);
	expect(writesRedacted("Bash", { command: 'grep "REDACTED" a.txt > /dev/null' })).toBe(false);
	expect(writesRedacted("Bash", { command: 'echo "x=REDACTED" > a.env' })).toBe(true);
	expect(writesRedacted("PowerShell", { command: "Set-Content a 'k=REDACTED'" })).toBe(true);
	expect(writesRedacted("Grep", { pattern: "REDACTED" })).toBe(false);
});
