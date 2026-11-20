// Exceptions, settings layers and block mode as pure functions: the judge, stateOf, breaches.

import { expect, test } from "claude-code/testing";
import { blockReason, breaches, callOf, isBlockReason } from "./block";
import { defaultConfig, mergeConfig } from "./config";
import { bash, CFG, denied, file, turn, waiver } from "./fixture";
import { activeRules, evaluate } from "./judge";
import { RULES } from "./rules";
import { stateOf } from "./settings";
import type { Config } from "./types";
import { openWaiver, refusal } from "./waivers";

const W29 = RULES.find((r) => r.id === "W29")!;
const W01 = RULES.find((r) => r.id === "W01")!;
const W08 = RULES.find((r) => r.id === "W08")!;
const profile: Config = { ...CFG, profile: ["W29"] };
const edit = (n = 1) => Array.from({ length: n }, (_, i) => bash(`sed -i 's/a/b/' /work/repo/src/f${i}.ts`));

test("a violation inside an exception costs nothing and is listed as allowed; outside it counts", () => {
	const events = [bash("sed -i 's/a/b/' /work/repo/before.ts"), waiver("W29"), ...edit(2), turn("Pracuji."), bash("sed -i 's/a/b/' /work/repo/after.ts")];
	const v = evaluate(events, profile);
	expect(v.violations.map((x) => x.rule)).toEqual(["W29", "W29"]); // before the exception and after the turn
	expect(v.waived).toHaveLength(2);
	expect(v.waived[0]).toMatchObject({ rule: "W29", reason: "mechanická hromadná úprava" });
	expect(v.score).toBe(96);
	expect(v.waivers).toEqual({ requested: 1, granted: 1, used: 1 });
});

test("scope.calls: the exception covers that many following calls, its own tool call and requests do not count", () => {
	const events = [waiver("W29", { scope: { calls: 2 } }), bash("echo x", { tool: "mcp__cc-agent-watchdog__watchdog_waiver" }), ...edit(3)];
	const v = evaluate(events, profile);
	expect(v.waived).toHaveLength(2);
	expect(v.violations.map((x) => x.rule)).toEqual(["W29"]);
});

test("a denied request covers nothing; an exception for another rule neither", () => {
	const v = evaluate([waiver("W29", { decision: "deny" }), waiver("W04"), ...edit(1)], profile);
	expect(v.violations).toHaveLength(1);
	expect(v.waivers).toEqual({ requested: 2, granted: 1, used: 0 });
});

test("instant-failure rules cannot be excused, not even by a hand-written ledger line", () => {
	expect(refusal(W01)).toContain("instant failure");
	expect(refusal(W29)).toBeUndefined();
	expect(refusal(RULES.find((r) => r.id === "W28")!)).toContain("výjimku nelze udělit");
	const v = evaluate([waiver("W01"), bash("git commit -m x")], CFG);
	expect(v).toMatchObject({ instant: true, score: 0 });
	expect(v.waived).toHaveLength(0);
});

test("openWaiver: open until the turn ends or the calls are used up", () => {
	expect(openWaiver([waiver("W29")], "W29")).toBeDefined();
	expect(openWaiver([waiver("W29"), ...edit(5)], "W29")).toBeDefined();
	expect(openWaiver([waiver("W29"), turn("x")], "W29")).toBeUndefined();
	expect(openWaiver([waiver("W29", { scope: { calls: 2 } }), ...edit(2)], "W29")).toBeUndefined();
	expect(openWaiver([waiver("W29", { scope: { calls: 2 } }), ...edit(1)], "W29")).toBeDefined();
	expect(openWaiver([waiver("W29", { decision: "deny" })], "W29")).toBeUndefined();
});

// --- settings: default < global < project ----------------------------------------

test("settings priority: default < global < project, with the source of each", () => {
	const base = defaultConfig("/work/repo", "/home/t");
	expect(stateOf(W29, base)).toMatchObject({ enabled: false, enabledFrom: "výchozí", mode: "report", modeFrom: "výchozí" });
	const global: Config = { ...base, globalRules: { W29: { enabled: true, mode: "block" } } };
	expect(stateOf(W29, global)).toMatchObject({ enabled: true, enabledFrom: "globální", mode: "block", modeFrom: "globální" });
	const project = mergeConfig(global, { rules: { W29: { mode: "report" } } });
	expect(stateOf(W29, project)).toMatchObject({ enabled: true, enabledFrom: "globální", mode: "report", modeFrom: "projekt" });
	const off = mergeConfig(global, { rules: { W29: { enabled: false } } });
	expect(stateOf(W29, off)).toMatchObject({ enabled: false, enabledFrom: "projekt" });
});

test("the old profile still switches a rule on; an explicit rules entry wins over it", () => {
	const base = defaultConfig("/work/repo", "/home/t");
	const old = mergeConfig(base, { profile: ["W29"] });
	expect(stateOf(W29, old)).toMatchObject({ enabled: true, enabledFrom: "projekt" });
	expect(activeRules("coder", old).map((r) => r.id)).toContain("W29");
	const both = mergeConfig(base, { profile: ["W29"], rules: { W29: { enabled: false } } });
	expect(stateOf(W29, both).enabled).toBe(false);
});

test("a project file cannot switch off an instant-failure rule, a global setting can; wrong types are ignored", () => {
	const base = defaultConfig("/work/repo", "/home/t");
	expect(stateOf(W01, mergeConfig(base, { rules: { W01: { enabled: false } } })).enabled).toBe(true);
	expect(stateOf(W01, { ...base, globalRules: { W01: { enabled: false } } }).enabled).toBe(false);
	expect(stateOf(W01, mergeConfig(base, { rules: { W01: { enabled: "no", mode: "loud" }, nonsense: 1 } }))).toMatchObject({ enabled: true, mode: "report" });
});

test("a rule that needs history or the result cannot be block: it stays report", () => {
	const base = defaultConfig("/work/repo", "/home/t");
	const st = stateOf(W08, mergeConfig(base, { rules: { W08: { mode: "block" } } }));
	expect(st).toMatchObject({ blockable: false, mode: "report" });
});

// --- block mode ---------------------------------------------------------------------

const meta = { ts: 1, session: "s1", role: "coder" as const, cwd: "/work/repo" };
const blocking: Config = mergeConfig(CFG, { rules: { W29: { enabled: true, mode: "block" }, W01: { mode: "block" } } });

test("block: a call that breaks a rule in block mode is found before it runs; report mode and clean calls are not", () => {
	const hit = breaches(callOf({ tool: "Bash", command: "sed -i 's/a/b/' /work/repo/a.ts" }, meta), "coder", blocking);
	expect(hit.map((b) => b.rule.id)).toEqual(["W29"]);
	expect(breaches(callOf({ tool: "Bash", command: "ls" }, meta), "coder", blocking)).toEqual([]);
	expect(breaches(callOf({ tool: "Bash", command: "sed -i 's/a/b/' /work/repo/a.ts" }, meta), "coder", CFG)).toEqual([]); // default: report
	expect(breaches(callOf({ tool: "Bash", command: "git commit -m x" }, meta), "coder", blocking).map((b) => b.rule.id)).toEqual(["W01"]);
	expect(breaches(callOf({ tool: "Bash", command: "git commit -m x" }, meta), "orchestrator", blocking)).toEqual([]);
});

test("block: the refusal names the rule, the right way and the waiver tool; instant rules say no exception", () => {
	const [w29] = breaches(callOf({ tool: "Bash", command: "sed -i 's/a/b/' /work/repo/a.ts" }, meta), "coder", blocking);
	const text = blockReason(w29!.rule, w29!.hit);
	expect(text).toMatch(/^W29: .*\. Použij nástroj Write nebo Edit, nebo požádej o výjimku nástrojem watchdog_waiver\.$/);
	expect(isBlockReason(text)).toBe(true);
	const [w01] = breaches(callOf({ tool: "Bash", command: "git commit -m x" }, meta), "coder", blocking);
	expect(blockReason(w01!.rule, w01!.hit)).toContain("výjimku u tohoto pravidla nelze udělit");
	expect(isBlockReason("Blocked by hook")).toBe(false);
});

test("block: a refusal by the watchdog is not an obstacle W19 sees and not a denial W20 counts", () => {
	const refused = { ...denied(bash("sed -i 's/a/b/' /work/repo/a.ts"), "W29: x. watchdog_waiver"), blocked: true as const };
	const next = file("Edit", "/work/repo/a.ts");
	const v = evaluate([refused, next], CFG);
	expect(v.violations.map((x) => x.rule)).not.toContain("W19");
	expect(v.violations.map((x) => x.rule)).not.toContain("W20");
	// the same denial from the user is still counted
	const user = evaluate([denied(bash("ls")), next], CFG);
	expect(user.violations.map((x) => x.rule)).toContain("W20");
});
