import { expect, test } from "claude-code/testing";
import { hasRedacted } from "./fields";

test("a leftover REDACTED warns, a restored tag does not", () => {
	expect(hasRedacted({ command: 'export PW="REDACTED"' }, ["command"])).toBe(true);
	expect(hasRedacted({ command: "echo «REDACTED:password:1»" }, ["command"])).toBe(false);
	expect(hasRedacted({ command: "echo hello" }, ["command"])).toBe(false);
	expect(hasRedacted({ file_path: "/p/REDACTED" }, ["file_path"])).toBe(false);
});
