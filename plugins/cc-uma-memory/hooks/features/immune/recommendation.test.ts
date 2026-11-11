import { expect, test } from "claude-code/testing";
import { buildPrompt, formatRecommendation, parseRecommendation } from "./recommendation";

test("prompt: strict JSON demanded, rule and added text caps", () => {
	const p = buildPrompt({ title: "T", body: "b".repeat(3000) }, "x".repeat(5000));
	expect(p.system).toContain('"relation":"violates"|"touches"|"unrelated"');
	expect(p.system).toContain("Czech");
	expect(p.user).toContain('MEMORY RULE "T"');
	expect(p.user.length).toBeLessThan(2500 + 4000 + 200);
});

test("parser: plain, fenced, chatty; clamps; rejects junk", () => {
	expect(parseRecommendation('{"relation":"unrelated","confidence":0.9,"reason":" ok "}')).toEqual({ relation: "unrelated", confidence: 0.9, reason: "ok" });
	expect(parseRecommendation('```json\n{"relation":"violates","confidence":7}\n```')).toEqual({ relation: "violates", confidence: 1, reason: "" });
	expect(parseRecommendation('Sure! {"relation":"touches"} bye')?.confidence).toBe(0.5);
	expect(parseRecommendation('{"relation":"maybe"}')).toBeUndefined();
	expect(parseRecommendation("no json")).toBeUndefined();
	expect(parseRecommendation("")).toBeUndefined();
});

test("format: Czech verdict line with percent and the reason", () => {
	expect(formatRecommendation({ relation: "unrelated", confidence: 0.82, reason: "jen slova" })).toBe("🧠 Jev: nesouvisí s jádrem pravidla (82 %) — doporučuji Ano\n  „jen slova“");
	expect(formatRecommendation({ relation: "violates", confidence: 0.5, reason: "" })).toBe("🧠 Jev: nejspíš porušuje pravidlo (50 %) — doporučuji Ne");
	expect(formatRecommendation({ relation: "touches", confidence: 0.1, reason: "" })).toContain("dotýká se tématu");
});
