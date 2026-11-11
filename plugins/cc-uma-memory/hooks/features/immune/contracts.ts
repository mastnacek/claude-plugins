// contracts.ts — pure part of the contract (ast-grep) check, ported from pi's
// slices/immune: which contracts apply to a file, the inline rule YAML, how a
// scan's output becomes breaches. The process itself runs in register.ts
// (`ast-grep scan --stdin --inline-rules … --json=compact`, the added text on
// stdin — no temp files, unlike pi).
//
// Degradation is visible and fail-safe: no ast-grep, an unknown language, a
// pattern ast-grep cannot match, a failed scan → a deny contract becomes a
// warn-severity breach with a note. It can neither silently pass nor silently block.

export type ContractDefinition = {
	engine?: string;
	severity?: "deny" | "warn";
	rule: { pattern: string; message?: string; language?: string; inside?: string };
};

/** One L1 rule: what the interceptor checks proposed edits against. */
export type RuleL1 = { id: string; title: string; fact_type?: string; body: string; contract?: ContractDefinition | null };

export type ContractBreach = {
	factId: string;
	title: string;
	ruleMessage: string;
	severity: "deny" | "warn";
	pattern: string;
	file: string;
};

export type ContractRule = RuleL1 & { contract: ContractDefinition };

const ALIASES: Record<string, string> = { rs: "rust", ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript", py: "python", golang: "go" };

const EXT_LANGUAGE: Record<string, string> = {
	rs: "rust", ts: "typescript", tsx: "typescript", mts: "typescript", cts: "typescript",
	js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
	py: "python", pyi: "python", go: "go", c: "c", h: "c", cpp: "cpp", cc: "cpp",
	cxx: "cpp", hpp: "cpp", java: "java", kt: "kotlin", swift: "swift", rb: "ruby",
	cs: "csharp", html: "html", css: "css", scss: "css", json: "json", yaml: "yaml",
	yml: "yaml", toml: "toml", lua: "lua", php: "php", sh: "bash", bash: "bash",
	sql: "sql", dart: "dart", scala: "scala", hs: "haskell", ex: "elixir",
};

/** The language a rule is scanned with: the contract's own, else the edited file's extension; undefined = cannot be verified. */
export function languageOf(contract: ContractDefinition, filePath: string): string | undefined {
	const raw = contract.rule.language?.toLowerCase();
	if (raw) return ALIASES[raw] ?? raw;
	const ext = /\.([A-Za-z0-9]+)$/.exec(filePath)?.[1]?.toLowerCase();
	return ext ? EXT_LANGUAGE[ext] : undefined;
}

/** Whether a contract's `inside` glob matches the file path (pi's pathMatchesInside). */
export function pathMatchesInside(inside: string, filePath: string): boolean {
	const normPath = filePath.replace(/\\/g, "/");
	const normInside = inside.replace(/\\/g, "/");
	if (normInside.endsWith("/**")) {
		const prefix = normInside.slice(0, -3);
		return normPath.startsWith(prefix) || normPath.includes(`/${prefix}`) || normPath.includes(prefix);
	}
	if (normInside.includes("*")) {
		// Every regex metacharacter but the glob `*` is escaped first (a glob like `(a+)+` must not become a ReDoS).
		const escaped = normInside.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
		const regexStr = `^${escaped.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*")}$`;
		try {
			return new RegExp(regexStr).test(normPath);
		} catch {
			return normPath.includes(normInside.replace(/\*/g, ""));
		}
	}
	return normPath.includes(normInside);
}

/** The contract-backed rules that apply to this file. */
export function applicableRules(rules: RuleL1[], filePath: string): ContractRule[] {
	return rules.filter((rule): rule is ContractRule => {
		const contract = rule.contract;
		if (!contract?.rule?.pattern) return false;
		return !contract.rule.inside || pathMatchesInside(contract.rule.inside, filePath);
	});
}

/** Structural blind spots of a bare ast-grep `pattern:` rule: a scan would give a silent zero there, so the rule degrades instead. */
export function patternBlindSpot(pattern: string): string | undefined {
	if (/"[^"\n]*\$[A-Z]|'[^'\n]*\$[A-Z]/.test(pattern)) return "metavariable inside a string literal never matches (strings are atomic)";
	if (/::\s*\$+\{?[A-Z]/.test(pattern) && /\s/.test(pattern)) return "metavariable after '::' binds a single path segment only";
	return undefined;
}

const yamlQuote = (value: string): string => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

/** Id of the rule inside ast-grep's output. */
export const scanRuleId = (id: string): string => `uma-${id.toLowerCase()}`;

/** The inline rule YAML, or undefined when it cannot be one line (multi-line patterns degrade). */
export function ruleYaml(rule: ContractRule, language: string): string | undefined {
	const { contract } = rule;
	if (/[\r\n]/.test(contract.rule.pattern)) return undefined;
	return (
		`id: ${scanRuleId(rule.id)}\n` +
		`message: "${yamlQuote(contract.rule.message ?? "")}"\n` +
		`severity: ${contract.severity === "warn" ? "warning" : "error"}\n` +
		`language: ${language}\n` +
		`rule:\n` +
		`  pattern: "${yamlQuote(contract.rule.pattern)}"\n`
	);
}

export const scanArgv = (bin: string, yaml: string): string[] => [bin, "scan", "--stdin", "--inline-rules", yaml, "--json=compact"];

/** What one scan said: matched, clean, or why it could not tell. Exit 1 with findings is a successful scan. */
export type ScanOutcome = { matched: boolean; degraded?: string };

export function outcomeOfScan(rule: ContractRule, exitCode: number, stdout: string): ScanOutcome {
	const out = stdout.trim();
	if (out === "" || out === "[]") return exitCode === 0 || exitCode === 1 ? { matched: false } : { matched: false, degraded: "ast-grep scan failed" };
	try {
		const matches = JSON.parse(out) as Array<{ ruleId?: string }>;
		return { matched: matches.some((m) => (m.ruleId ?? "").toLowerCase() === scanRuleId(rule.id)) };
	} catch {
		return { matched: false, degraded: "unparsable ast-grep output" };
	}
}

export const degradedMessage = (rule: ContractRule, reason: string): string =>
	`${rule.contract.rule.message ?? ""} [UMA inline check DEGRADED: ${reason} — this deny contract is downgraded to warn and was NOT verified.]`;

/** A breach out of one rule's outcome; undefined when the rule is clean. */
export function breachOf(rule: ContractRule, file: string, outcome: ScanOutcome): ContractBreach | undefined {
	const base = { factId: rule.id, title: rule.title, pattern: rule.contract.rule.pattern, file };
	if (outcome.degraded) return { ...base, ruleMessage: degradedMessage(rule, outcome.degraded), severity: "warn" };
	if (!outcome.matched) return undefined;
	return {
		...base,
		ruleMessage: rule.contract.rule.message || `Violated contract pattern: ${rule.contract.rule.pattern}`,
		severity: rule.contract.severity || "deny",
	};
}
