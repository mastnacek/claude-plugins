import type { EngineInterface } from "claude-code";
import { expect, test } from "claude-code/testing";
import { normalizeConfig } from "./config";
import { matchingSkipPattern } from "./skip";

// The invalid-regex path logs through the plugin's state, so it is tested in
// hooks/pipeline.test.ts; here only paths without a log line.
test("matches the trimmed text against any pattern", async (engine) => {
	const $ = engine as unknown as EngineInterface;
	expect(await matchingSkipPattern($, "  DONE x: OK \n", ["^nope", "^DONE "])).toBe("^DONE ");
	expect(await matchingSkipPattern($, "hotovo", ["^DONE "])).toBeUndefined();
	expect(await matchingSkipPattern($, "DONE x", [])).toBeUndefined();
});

test("config: skipPatterns defaults to [], keeps strings only", () => {
	expect(normalizeConfig({}).skipPatterns).toEqual([]);
	expect(normalizeConfig({ skipPatterns: ["^a", 3, "", "b"] }).skipPatterns).toEqual(["^a", "b"]);
	expect(normalizeConfig({ skipPatterns: "^a" }).skipPatterns).toEqual([]);
});
