// types.ts — the data every slice passes around: ledger events, config, rules, verdicts.

export type Role = "orchestrator" | "coder" | "tester";

type Base = { ts: number; session: string; role: Role; cwd: string };

/** One tool call, written after the tool answered. No file contents, no outputs. */
export type ToolEv = Base & {
	kind: "tool";
	tool: string;
	/** file_path / notebook_path / path of the call. */
	path?: string;
	command?: string;
	url?: string;
	exitCode?: number;
	isError: boolean;
	denied: boolean;
	deniedReason?: string;
	durationMs: number;
	/** First line of the error, redacted and cut. */
	excerpt?: string;
	/** The tool's output looked like it held a secret (it is not stored). */
	secretOut?: true;
};

/** The assistant's closing text of a turn (cut, redacted). */
export type TurnEv = Base & { kind: "turn"; answer: string };

/** Files that sat in the work tree when a turn or the session ended. */
export type ScanEv = Base & { kind: "scan"; leftovers: string[] };

export type Ev = ToolEv | TurnEv | ScanEv;

export type Config = {
	/** Git root of the session's cwd. */
	workdir: string;
	home: string;
	/** Gate commands (each a command prefix such as `claude plugin test .`). */
	gate: string[];
	/** Paths the agent may change besides workdir and scratch. */
	allowed: string[];
	/** Paths it must not touch (adds to the built-in list). */
	protected: string[];
	scratch: string[];
	/** Hosts / devices where writes are allowed. */
	remoteAllow: string[];
	/** Profile rules to switch on (W29). */
	profile: string[];
};

export type Hit = { ts: number; evidence: string; points?: number; instant?: boolean };

export type Rule = {
	id: string;
	roles: readonly Role[];
	title: string;
	/** Points taken off per hit, or "instant" (score 0). */
	weight: number | "instant";
	/** Most this rule can take off in total. */
	cap?: number;
	/** Off unless the project lists it in `profile`. */
	profile?: boolean;
	check: (events: readonly Ev[], cfg: Config) => Hit[];
};

export type Violation = { rule: string; title: string; ts: number; evidence: string; points: number; instant: boolean };

export type Verdict = {
	role: Role;
	score: number;
	instant: boolean;
	violations: Violation[];
	calls: number;
};
