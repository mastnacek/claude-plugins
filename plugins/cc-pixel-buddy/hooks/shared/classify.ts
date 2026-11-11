// classify — what one finished tool call was, for the slices that count or react to it
// (mood, hints, stats all ask the same question). Pure; no engine access.

export type CallInfo = {
	/** Same call again? The Bash command (whitespace squeezed), else tool + path. */
	key: string;
	isError: boolean;
	/** Edit, Write or NotebookEdit that went through. */
	isEdit: boolean;
	/** `git commit` / `git push` that went through. */
	isCommit: boolean;
	/** A test or build command: how it ended; null for anything else. */
	test: "pass" | "fail" | null;
};

const EDIT_TOOLS = new Set(["Edit", "Write", "NotebookEdit"]);
const COMMIT = /\bgit(?:\s+-[cC]\s+\S+|\s+-\S+)*\s+(?:commit|push)\b/;
const TEST =
	/\b(?:claude plugin test|cargo (?:test|build|check|nextest)|(?:npm|pnpm|yarn|bun)(?: run)? (?:test|build)|pytest|go (?:test|build)|vitest|jest|tsc|make(?: test| check| build)?|mvn (?:test|package)|gradlew? (?:test|build))\b/;

export function classify(e: { readonly tool: string }, isError: boolean): CallInfo {
	const raw = e as { command?: unknown; file_path?: unknown };
	const command = e.tool === "Bash" && typeof raw.command === "string" ? raw.command.trim().replace(/\s+/g, " ") : "";
	const path = typeof raw.file_path === "string" ? raw.file_path : "";
	return {
		key: command || `${e.tool}:${path}`,
		isError,
		isEdit: EDIT_TOOLS.has(e.tool) && !isError,
		isCommit: command !== "" && !isError && COMMIT.test(command),
		test: command !== "" && TEST.test(command) ? (isError ? "fail" : "pass") : null,
	};
}
