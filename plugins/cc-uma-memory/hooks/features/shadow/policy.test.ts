import { expect, test } from "claude-code/testing";
import { FAILURE_TTL_MS, afterBash, afterEdit, dependencyContext, distillArgv, isCommandFailure, isTestOrBuildCommand, isTestPath, isUserCorrection, shellWrittenPaths, stagedDraft } from "./policy";
import type { Failure } from "./policy";

test("isCommandFailure: '0 failed' on a green run is NOT a failure (pi's live false positive)", () => {
	expect(isCommandFailure("test result: ok. 148 passed; 0 failed; 0 ignored\n", false)).toBe(false);
	expect(isCommandFailure("0 errors, 0 warnings", false)).toBe(false);
});

test("isCommandFailure: a non-zero count, compiler markers and the tool's error flag are failures", () => {
	expect(isCommandFailure("test result: FAILED. 147 passed; 1 failed", false)).toBe(true);
	expect(isCommandFailure("2 errors, 0 warnings", false)).toBe(true);
	expect(isCommandFailure("error[E0432]: unresolved import", false)).toBe(true);
	expect(isCommandFailure("error: expected `;`", false)).toBe(true);
	expect(isCommandFailure("clean output", true)).toBe(true);
});

test("isCommandFailure: ordinary success output stays quiet", () => {
	expect(isCommandFailure("Compiling uma-core\nFinished release profile", false)).toBe(false);
	expect(isCommandFailure("", false)).toBe(false);
});

test("isUserCorrection: Czech and English corrections, an opener alone", () => {
	expect(isUserCorrection("That is an error: do not use var in this project, always const.", true)).toBe(true);
	expect(isUserCorrection("Incorrect: tests go into test, not tests.", true)).toBe(true);
	expect(isUserCorrection("Tohle je špatně: testy patří do test.", true)).toBe(true);
	expect(isUserCorrection("nepoužívej console.log", true)).toBe(true);
});

test("isUserCorrection: task directives are never corrections (pi's live false positive)", () => {
	expect(isUserCorrection("Intentional gateway test: use the edit tool on src/app.js with newText console.log('debug: never use the logger module');", true)).toBe(false);
	expect(isUserCorrection("Call uma_write with body 'never use tabs'.", true)).toBe(false);
	expect(isUserCorrection("Zavolej uma_debt a nikdy nepoužívej nic jiného", true)).toBe(false);
});

test("isUserCorrection: nothing to correct without an earlier assistant reply; a long message is a task", () => {
	expect(isUserCorrection("That's wrong, never use tabs.", false)).toBe(false);
	expect(isUserCorrection(`špatně ${"x".repeat(300)}`, true)).toBe(false);
	expect(isUserCorrection("udělej commit", true)).toBe(false);
});

test("build/test commands are recognised", () => {
	expect(isTestOrBuildCommand("cargo test -p core")).toBe(true);
	expect(isTestOrBuildCommand("npx tsc --noEmit")).toBe(true);
	expect(isTestOrBuildCommand("ls -la")).toBe(false);
});

test("isUserCorrection: a request for an operation is guidance, not a correction (today's false positive, verbatim)", () => {
	expect(isUserCorrection("Enable uma memory globally instead of claude memory; there is an uma command for this.", true)).toBe(false);
	expect(isUserCorrection("Přidej to místo toho do globálního nastavení", true)).toBe(false);
	expect(isUserCorrection("Use the uma command for this instead of editing files", true)).toBe(false);
	// A repair request with an explicit error indicator is a correction; "instead of" alone is not one.
	expect(isUserCorrection("Oprav to, je to špatně – používáš var", true)).toBe(true);
	expect(isUserCorrection("Fix it, that's wrong", true)).toBe(true);
	expect(isUserCorrection("Add the helper instead of the copy", true)).toBe(false);
	// A real correction after a reply still counts.
	expect(isUserCorrection("Ne, to je špatně, má to být const", true)).toBe(true);
	expect(isUserCorrection("No, that's wrong, it should be X", true)).toBe(true);
	expect(isUserCorrection("Don't use var, use const instead of let", true)).toBe(true);
});

test("isTestPath: test files by name and folder only", () => {
	for (const p of ["/p/a.test.ts", "/p/a.spec.js", "/p/a_test.go", "/p/test_a.py", "/p/tests/x.rs", "plugins/x/hooks/__tests__/y.ts", "C:\\p\\a.test.ts"]) expect(isTestPath(p)).toBe(true);
	for (const p of ["/p/src/main.rs", "/p/latest.ts", "/p/contest.ts"]) expect(isTestPath(p)).toBe(false);
});

test("shellWrittenPaths: in-place sed, tee and redirects", () => {
	expect(shellWrittenPaths("sed -i 's/a/b/' hooks/x.test.ts")).toEqual(["hooks/x.test.ts"]);
	expect(shellWrittenPaths("echo hi > out/a.txt && ls")).toEqual(["out/a.txt"]);
	expect(shellWrittenPaths("sed -n 1,5p a.ts")).toEqual([]);
});

const RED_STATE: Failure = { command: "cargo test", output: "error[E0432]: boom", at: 1000, edited: [] };

test("afterBash: red remembers, green after a production fix is a recovery, stale or unrelated is not", () => {
	const red = afterBash(null, "cargo test", true, "error[E0432]: boom", 1000);
	expect(red.failure).toEqual(RED_STATE);
	expect(red.context).toBeUndefined();
	const fixed = afterEdit(red.failure, "/p/src/main.rs");
	const green = afterBash(fixed, "cargo test", false, "ok", 2000);
	expect(green.failure).toBeNull();
	expect(green.context).toContain("`cargo test` initially failed:\nerror[E0432]: boom");
	expect(green.context).toContain("Fixed by changing: /p/src/main.rs.");
	expect(green.context).toContain("Subsequent command succeeded: `cargo test`.");
	expect(afterBash(fixed, "cargo test", false, "ok", 1000 + FAILURE_TTL_MS).context).toBeUndefined();
	expect(afterBash(red.failure, "ls", false, "x", 2000)).toEqual({ failure: red.failure });
	expect(afterBash(red.failure, "cargo test", true, "e".repeat(900), 3000).failure?.output).toHaveLength(500);
});

test("afterBash: only test files changed, or nothing changed, teaches nothing (today's sed -i case)", () => {
	const failedCmd = "cd plugins/p && claude plugin test . && npx -y -p typescript tsc -p . --noEmit";
	const red = afterBash(null, failedCmd, true, "expected X to contain Y", 1000).failure;
	// The orchestrator fixes a stale expectation in a test with sed, then the run is green.
	const viaSed = afterBash(red, "sed -i 's/toContain(a)/toContain(b)/' hooks/features/x/policy.test.ts", false, "", 1500);
	expect(viaSed.context).toBeUndefined();
	expect(afterBash(viaSed.failure, "npx tsc", false, "ok", 2000)).toEqual({ failure: null });
	const green = afterBash(afterEdit(red, "/p/hooks/x.test.ts"), "npx tsc", false, "ok", 2000);
	expect(green).toEqual({ failure: null });
	expect(afterBash(red, "npx tsc", false, "ok", 2000)).toEqual({ failure: null });
});

test("afterBash: the context holds the error and the fix, never the edit command", () => {
	const red = afterBash(null, "cd p && sed -i 's/a/b/' src/a.ts && npx tsc -p . --noEmit", true, "error TS2322", 1000).failure;
	const viaShell = afterBash(red, "sed -i 's/a/b/' src/a.ts", false, "", 1200).failure;
	const { context } = afterBash(viaShell, "npx tsc -p . --noEmit", false, "ok", 2000);
	expect(context).toContain("`npx tsc -p . --noEmit` initially failed:\nerror TS2322");
	expect(context).toContain("Fixed by changing: src/a.ts.");
	expect(context).not.toContain("sed");
});

test("dependencyContext: manifests only; Write must mention dependencies, any non-empty Edit counts", () => {
	expect(dependencyContext("Write", "/p/Cargo.toml", '[dependencies]\nserde = "1"')).toBe('File: /p/Cargo.toml\nModified dependencies:\n[dependencies]\nserde = "1"');
	expect(dependencyContext("Write", "/p/package.json", '{"name":"x"}')).toBeUndefined();
	expect(dependencyContext("Edit", "/p/package.json", '"left-pad": "1"')).toContain("left-pad");
	expect(dependencyContext("Edit", "/p/package.json", "  ")).toBeUndefined();
	expect(dependencyContext("Edit", "/p/src/main.rs", "dependencies")).toBeUndefined();
});

test("distill argv: judge off unless the mode is jev; the draft is read from the JSON", () => {
	expect(distillArgv("user_correction", "ctx", "on")).toEqual(["uma", "staging", "distill", "--trigger", "user_correction", "--context", "ctx", "--judge", "off", "--json"]);
	expect(distillArgv("compiler_recovery", "ctx", "jev")).toContain("jev");
	expect(stagedDraft('{"id":"01X","durable":true}')).toBe(true);
	expect(stagedDraft('{"id":"01X","durable":false}')).toBe(false);
	expect(stagedDraft("nope")).toBe(false);
});
