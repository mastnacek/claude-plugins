// The pure half: pi's policy (flag → reads → gate), ported with its cases, plus the paths and the hypothesis line.

import { expect, test } from "claude-code/testing";
import { absolute, decide, denyReason, dirOf, flagForPath, flagsOf, parseVerdict, statesHypothesis, withRead } from "./policy";

const never = async (): Promise<boolean> => {
	throw new Error("the transcript must not be read here");
};

test("the verdict is LOW only with familiarity low AND exploration_required; required_reads is taken from the result", () => {
	expect(parseVerdict(JSON.stringify({ familiarity: "low", exploration_required: true, required_reads: 5 }))).toEqual({ low: true, required: 5 });
	expect(parseVerdict(JSON.stringify({ familiarity: "low", exploration_required: true }))).toEqual({ low: true, required: 3 });
	expect(parseVerdict(JSON.stringify({ familiarity: "high", exploration_required: false })).low).toBe(false);
	expect(parseVerdict(JSON.stringify({ familiarity: "low", exploration_required: false })).low).toBe(false);
	expect(parseVerdict("not json").low).toBe(false);
	expect(parseVerdict(undefined).low).toBe(false);
	expect(parseVerdict(JSON.stringify({ familiarity: "low", exploration_required: true, required_reads: 0 })).required).toBe(1);
});

test("paths: relative to the cwd, dots collapsed, a directory per file", () => {
	expect(absolute("src/a.ts", "/w")).toBe("/w/src/a.ts");
	expect(absolute("./src/../lib/a.ts", "/w/")).toBe("/w/lib/a.ts");
	expect(absolute("/x/y.ts", "/w")).toBe("/x/y.ts");
	expect(dirOf("a.ts", "/w")).toBe("/w");
	expect(dirOf("/w/src/a.ts", "/w")).toBe("/w/src");
	expect(flagsOf(["src/a.ts", "src/b.ts", "lib/c.ts"], "/w", 3).map((f) => f.dir)).toEqual(["/w/src", "/w/lib"]);
	expect(flagsOf([], "/w", 3)).toEqual([]);
});

test("the longest flagged directory governs a path; a sibling prefix does not", () => {
	const flags = flagsOf(["/w/src/a.ts", "/w/src/deep/b.ts"], "/w", 3);
	expect(flagForPath(flags, "/w/src/deep/x.ts")?.dir).toBe("/w/src/deep");
	expect(flagForPath(flags, "/w/src/x.ts")?.dir).toBe("/w/src");
	expect(flagForPath(flags, "/w/src-other/x.ts")).toBeUndefined();
	expect(flagForPath(flags, "/w/elsewhere/x.ts")).toBeUndefined();
});

test("reads count once per file and only under a flag", () => {
	const flags = flagsOf(["/w/src/a.ts"], "/w", 3);
	const once = withRead(withRead(flags, "/w/src/a.ts"), "/w/src/a.ts");
	expect(once[0]?.reads).toEqual(["/w/src/a.ts"]);
	expect(withRead(flags, "/w/other/z.ts")).toBe(flags);
});

test("Windows paths: backslashes, drive letter case, a cwd with backslashes", () => {
	expect(absolute("src\\a.ts", "D:\\w")).toBe("d:/w/src/a.ts");
	expect(absolute("D:\\a\\b\\c.ts", "D:\\w")).toBe("d:/a/b/c.ts");
	expect(absolute("d:/a/b/c.ts", "D:\\w")).toBe("d:/a/b/c.ts");
	expect(absolute("src\\..\\lib\\a.ts", "D:/w/")).toBe("d:/w/lib/a.ts");
	expect(dirOf("D:\\w\\src\\a.ts", "D:\\w")).toBe("d:/w/src");
});

test("Windows paths: a flag on D:\\a\\b governs d:/a/b/c.ts and D:\\a\\b\\c.ts alike", () => {
	const flags = flagsOf(["D:\\a\\b\\x.ts"], "D:\\w", 3);
	expect(flags.map((f) => f.dir)).toEqual(["d:/a/b"]);
	expect(flagForPath(flags, absolute("d:/a/b/c.ts", "D:\\w"))?.dir).toBe("d:/a/b");
	expect(flagForPath(flags, absolute("D:\\a\\b\\c.ts", "D:\\w"))?.dir).toBe("d:/a/b");
	expect(flagForPath(flags, absolute("D:\\a\\b-other\\c.ts", "D:\\w"))).toBeUndefined();
	expect(flagForPath(flags, absolute("E:\\a\\b\\c.ts", "D:\\w"))).toBeUndefined();
});

test("hypothesis line: Hypothesis / Hypotéza, bold or quoted, with substance; a bare mention is not one", () => {
	expect(statesHypothesis("Hypothesis: the router forwards by prefix and the cache is per request")).toBe(true);
	expect(statesHypothesis("Some text\n**Hypotéza:** modul drží stav jen v paměti procesu")).toBe(true);
	expect(statesHypothesis("> Hypothesis: it keeps a queue per session id")).toBe(true);
	expect(statesHypothesis("Hypothesis: ok")).toBe(false);
	expect(statesHypothesis("I will state a hypothesis later")).toBe(false);
	expect(statesHypothesis("My hypothesis: the router forwards by prefix")).toBe(false);
});

test("gate: no flag or confirmed → allow without reading the transcript", async () => {
	expect(await decide([], "/w/a.ts", never)).toEqual({ kind: "allow" });
	const flags = flagsOf(["/w/src/a.ts"], "/w", 3).map((f) => ({ ...f, confirmed: true }));
	expect(await decide(flags, "/w/src/a.ts", never)).toEqual({ kind: "allow" });
});

test("gate: too few reads → deny with the count and what to do, transcript not consulted (pi's text)", async () => {
	const flags = withRead(flagsOf(["/w/src/a.ts"], "/w", 3), "/w/src/a.ts");
	const d = await decide(flags, "/w/src/new.ts", never);
	expect(d.kind).toBe("deny");
	const reason = d.kind === "deny" ? d.reason : "";
	expect(reason).toContain("Read-Only Explorative Mode");
	expect(reason).toContain("1/3");
	expect(reason).toContain("read 2 more");
	expect(reason).toContain("Hypothesis:");
});

test("gate: enough reads but no hypothesis → deny; with it → allow and the flag to confirm", async () => {
	let flags = flagsOf(["/w/src/a.ts"], "/w", 2);
	flags = withRead(withRead(flags, "/w/src/a.ts"), "/w/src/b.ts");
	const no = await decide(flags, "/w/src/a.ts", async () => false);
	expect(no.kind === "deny" && no.reason).toContain("no hypothesis stated");
	expect(denyReason(flags[0]!)).toContain("2 related file(s) read");
	const yes = await decide(flags, "/w/src/a.ts", async () => true);
	expect(yes).toEqual({ kind: "allow", confirm: flags[0] });
});

test("gate: a path outside every flag is allowed", async () => {
	const flags = flagsOf(["/w/src/a.ts"], "/w", 3);
	expect(await decide(flags, "/w/docs/x.md", never)).toEqual({ kind: "allow" });
});
