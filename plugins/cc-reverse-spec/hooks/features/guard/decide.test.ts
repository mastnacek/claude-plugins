import { describe, expect, test } from "claude-code/testing";
import { decide } from "./decide";

const CWD = "/work/proj";

describe("decide", () => {
	test("allowed paths", () => {
		expect(decide(CWD, "src/app.py")).toBeNull();
		expect(decide(CWD, "spec/rules/BR-A-001.yaml")).toBeNull();
		expect(decide(CWD, "/work/proj/tests/features/a.feature")).toBeNull();
	});

	test("legacy/ is refused with the oracle advice", () => {
		expect(decide(CWD, "legacy/mod.bas")).toContain("read-only oracle; record behaviour in spec/ or tests/");
	});

	test("generated/ is refused with the regenerate advice", () => {
		expect(decide(CWD, "generated/x.py")).toContain("change the generator template or the spec, then regenerate");
	});

	test("absolute, ./ and .. spellings are normalised", () => {
		expect(decide(CWD, "/work/proj/legacy/a.bas")).not.toBeNull();
		expect(decide(CWD, "./legacy/a.bas")).not.toBeNull();
		expect(decide(CWD, "src/../legacy/a.bas")).not.toBeNull();
		expect(decide(CWD, "/work/proj/src/../../proj/generated/a")).not.toBeNull();
		expect(decide(CWD, "legacy//sub/./a.bas")).not.toBeNull();
	});

	test("legacy-old/ and legacy.md are not legacy/", () => {
		expect(decide(CWD, "legacy-old/a.bas")).toBeNull();
		expect(decide(CWD, "legacy.md")).toBeNull();
		expect(decide(CWD, "src/legacy/a.bas")).toBeNull();
	});

	test("outside the project", () => {
		expect(decide(CWD, "/other/legacy/a.bas")).toBeNull();
		expect(decide(CWD, "../legacy/a.bas")).toBeNull();
		expect(decide(CWD, "/work/legacy/a.bas")).toBeNull();
	});
});

describe("decide on Windows paths", () => {
	const WIN = "D:\\proj";

	test("backslash and drive-letter spellings are refused", () => {
		expect(decide(WIN, "D:\\proj\\legacy\\a.cs")).toContain("read-only oracle");
		expect(decide(WIN, "d:\\proj\\legacy\\a.cs")).toContain("read-only oracle");
		expect(decide("d:/proj", "D:/proj/generated/a.py")).toContain("regenerate");
		expect(decide(WIN, "D:/proj\\legacy/a.cs")).not.toBeNull();
		expect(decide(WIN, "legacy\\a.cs")).not.toBeNull();
		expect(decide(WIN, "src\\..\\generated\\a.py")).not.toBeNull();
		expect(decide(WIN, "\\proj\\legacy\\a.cs")).not.toBeNull();
	});

	test("allowed, outside and look-alike Windows paths", () => {
		expect(decide(WIN, "D:\\proj\\src\\a.cs")).toBeNull();
		expect(decide(WIN, "D:\\proj\\legacy-old\\a.cs")).toBeNull();
		expect(decide(WIN, "D:\\other\\legacy\\a.cs")).toBeNull();
		expect(decide(WIN, "E:\\proj\\legacy\\a.cs")).toBeNull();
		expect(decide(WIN, "..\\legacy\\a.cs")).toBeNull();
	});
});
