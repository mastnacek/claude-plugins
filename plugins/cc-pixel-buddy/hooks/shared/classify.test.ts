import { expect, test } from "claude-code/testing";
import { classify } from "./classify";

test("a test or build command passes or fails with the call", () => {
	expect(classify({ tool: "Bash", command: "cargo test --lib" } as never, false).test).toBe("pass");
	expect(classify({ tool: "Bash", command: "npm run build" } as never, true).test).toBe("fail");
	expect(classify({ tool: "Bash", command: "claude plugin test ." } as never, false).test).toBe("pass");
	expect(classify({ tool: "Bash", command: "npx -y -p typescript tsc -p . --noEmit" } as never, false).test).toBe("pass");
	expect(classify({ tool: "Bash", command: "cat tsconfig.json" } as never, false).test).toBeNull();
	expect(classify({ tool: "Bash", command: "ls" } as never, true).test).toBeNull();
});

test("git commit and push count only when they went through", () => {
	expect(classify({ tool: "Bash", command: "git commit -m x" } as never, false).isCommit).toBe(true);
	expect(classify({ tool: "Bash", command: "git -C /x push origin main" } as never, false).isCommit).toBe(true);
	expect(classify({ tool: "Bash", command: "git commit -m x" } as never, true).isCommit).toBe(false);
	expect(classify({ tool: "Bash", command: "git status" } as never, false).isCommit).toBe(false);
});

test("edits are Edit, Write and NotebookEdit that went through", () => {
	for (const tool of ["Edit", "Write", "NotebookEdit"]) expect(classify({ tool, file_path: "/a" } as never, false).isEdit).toBe(true);
	expect(classify({ tool: "Edit", file_path: "/a" } as never, true).isEdit).toBe(false);
	expect(classify({ tool: "Read", file_path: "/a" } as never, false).isEdit).toBe(false);
});

test("the key of a call: the Bash command with squeezed spaces, else tool and path", () => {
	expect(classify({ tool: "Bash", command: "  ls   -la " } as never, false).key).toBe("ls -la");
	expect(classify({ tool: "Edit", file_path: "/a" } as never, false).key).toBe("Edit:/a");
});
