import { describe, expect, test } from "claude-code/testing";
import { isMigrationProject } from "./project";

describe("isMigrationProject", () => {
	test("spec/rules is a folder", async () => {
		expect(await isMigrationProject({ stat: async () => ({ kind: "dir" }) })).toBe(true);
	});
	test("missing", async () => {
		expect(await isMigrationProject({ stat: async () => Promise.reject(new Error("ENOENT")) })).toBe(false);
	});
	test("a file, not a folder", async () => {
		expect(await isMigrationProject({ stat: async () => ({ kind: "file" }) })).toBe(false);
	});
});
