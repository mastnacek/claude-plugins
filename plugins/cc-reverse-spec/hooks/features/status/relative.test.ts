import { expect, test } from "claude-code/testing";
import { relativeSegments } from "./relative";

test("relative, absolute, dotted and outside paths", () => {
	expect(relativeSegments("/w/p", "spec/a.yaml")).toEqual(["spec", "a.yaml"]);
	expect(relativeSegments("/w/p", "/w/p/./spec/../tests/a")).toEqual(["tests", "a"]);
	expect(relativeSegments("/w/p", "/w/other/a")).toBeUndefined();
	expect(relativeSegments("/w/p", "../a")).toBeUndefined();
});

test("Windows paths: backslashes, drive letter case, rooted and mixed spellings", () => {
	expect(relativeSegments("D:\\proj", "D:\\proj\\legacy\\a.cs")).toEqual(["legacy", "a.cs"]);
	expect(relativeSegments("D:\\proj", "d:\\proj\\legacy\\a.cs")).toEqual(["legacy", "a.cs"]);
	expect(relativeSegments("D:/proj", "d:/proj/spec/a")).toEqual(["spec", "a"]);
	expect(relativeSegments("D:\\proj", "D:/proj\\tests/a")).toEqual(["tests", "a"]);
	expect(relativeSegments("D:\\proj", "legacy\\a.cs")).toEqual(["legacy", "a.cs"]);
	expect(relativeSegments("D:\\proj", "\\proj\\legacy\\a.cs")).toEqual(["legacy", "a.cs"]);
	expect(relativeSegments("D:\\proj", "src\\..\\spec\\a")).toEqual(["spec", "a"]);
	expect(relativeSegments("D:\\proj", "..\\other\\a")).toBeUndefined();
	expect(relativeSegments("D:\\proj", "E:\\proj\\legacy\\a.cs")).toBeUndefined();
	expect(relativeSegments("D:\\proj", "D:\\other\\a")).toBeUndefined();
});
