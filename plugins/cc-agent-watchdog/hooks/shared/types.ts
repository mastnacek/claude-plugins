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
	/** The denial came from this plugin's own `block` mode (shared/block.ts), not from the user or a classifier. */
	blocked?: true;
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

/**
 * A request for an exception to a rule (the `watchdog_waiver` tool), with the decision.
 * `scope.calls` limits it to that many following tool calls; either way it ends with the turn.
 * Whether it was used is not stored: the judge counts that from the events after it.
 */
export type WaiverEv = Base & {
	kind: "waiver";
	rule: string;
	reason: string;
	scope: { calls?: number };
	decision: "allow" | "deny";
	/** `dialog` = a person (or the orchestrator) answered; `policy` = refused without asking (instant failure, no one to ask …). */
	decidedBy: "dialog" | "policy";
};

export type Ev = ToolEv | TurnEv | ScanEv | WaiverEv;

/** The mode of a rule: `report` only records, `block` also refuses a call that breaks it. */
export type Mode = "report" | "block";

/** What one layer (global store, project file) says about one rule. */
export type Setting = { enabled?: boolean; mode?: Mode };

export type Layer = Record<string, Setting>;

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
	/** Profile rules to switch on (W29): the old spelling of `rules: { W29: { enabled: true } }`. */
	profile: string[];
	/** Per-rule settings of the user (the plugin's `$.store`, all projects). */
	globalRules: Layer;
	/** Per-rule settings of the project (`.claude/watchdog.json` → `rules`). */
	projectRules: Layer;
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
	/** Off unless a layer switches it on (the project's `profile` or `rules`). */
	profile?: boolean;
	/** Judged from one call's input alone, so `block` mode can refuse the call before it runs. */
	pre?: boolean;
	/** What to do instead, in the words of a refusal: "Použij <way>". */
	way?: string;
	/** No exception can be granted, and why (an "instant" rule never can; this is for the others). */
	noWaiver?: string;
	check: (events: readonly Ev[], cfg: Config) => Hit[];
};

export type Violation = { rule: string; title: string; ts: number; evidence: string; points: number; instant: boolean };

/** A violation an exception covered: no points, shown as allowed. */
export type Waived = { rule: string; ts: number; evidence: string; reason: string };

export type Verdict = {
	role: Role;
	score: number;
	instant: boolean;
	violations: Violation[];
	/** Violations covered by a granted exception (they cost nothing). */
	waived: Waived[];
	/** Requests of the session, how many were granted, and how many of those covered a violation. */
	waivers: { requested: number; granted: number; used: number };
	calls: number;
};
