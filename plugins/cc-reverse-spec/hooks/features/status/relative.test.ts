import { expect, test } from "claude-code/testing";
import { relativeSegments } from "./relative";

test("relative, absolute, dotted and outside paths", () => {
	expect(relativeSegments("/w/p", "spec/a.yaml")).toEqual(["spec", "a.yaml"]);
	expect(relativeSegments("/w/p", "/w/p/./spec/../tests/a")).toEqual(["tests", "a"]);
	expect(relativeSegments("/w/p", "/w/other/a")).toBeUndefined();
	expect(relativeSegments("/w/p", "../a")).toBeUndefined();
});
