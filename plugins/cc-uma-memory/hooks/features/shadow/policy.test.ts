import { expect, test } from "claude-code/testing";
import { FAILURE_TTL_MS, afterBash, dependencyContext, distillArgv, isCommandFailure, isTestOrBuildCommand, isUserCorrection, stagedDraft } from "./policy";

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

test("afterBash: red remembers, green within the TTL is a recovery, stale or unrelated is not", () => {
	const red = afterBash(null, "cargo test", true, "error[E0432]: boom", 1000);
	expect(red.failure).toEqual({ command: "cargo test", output: "error[E0432]: boom", at: 1000 });
	expect(red.context).toBeUndefined();
	const green = afterBash(red.failure, "cargo test", false, "ok", 2000);
	expect(green.failure).toBeNull();
	expect(green.context).toContain("`cargo test` initially failed:\nerror[E0432]: boom");
	expect(green.context).toContain("Subsequent command succeeded: `cargo test`.");
	expect(afterBash(red.failure, "cargo test", false, "ok", 1000 + FAILURE_TTL_MS).context).toBeUndefined();
	expect(afterBash(red.failure, "ls", false, "x", 2000)).toEqual({ failure: red.failure });
	expect(afterBash(red.failure, "cargo test", true, "e".repeat(900), 3000).failure?.output).toHaveLength(500);
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
