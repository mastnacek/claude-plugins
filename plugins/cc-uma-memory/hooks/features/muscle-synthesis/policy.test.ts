import { expect, test } from "claude-code/testing";
import { HISTORY_LIMIT, buildRoutineProposal, createArgv, detectRepeatedSequence, normalizeCommand, pushCommand, routineName } from "./policy";
import type { RepetitionHit } from "./policy";

test("normalizeCommand strips to shape and excludes hazardous commands", () => {
	expect(normalizeCommand("cargo test --release --features x")).toBe("cargo test");
	expect(normalizeCommand("npm run build")).toBe("npm run");
	expect(normalizeCommand("git push --force origin main")).toBeUndefined();
	expect(normalizeCommand("rm -rf .")).toBeUndefined();
	expect(normalizeCommand("sudo apt install")).toBeUndefined();
	expect(normalizeCommand("   ")).toBeUndefined();
});

test("detectRepeatedSequence finds non-overlapping repeats", () => {
	const shapes = ["cargo fmt", "cargo clippy", "cargo test", "git status", "cargo fmt", "cargo clippy", "cargo test", "git status"];
	const hit = detectRepeatedSequence(shapes, shapes);
	expect(hit?.sequence).toEqual(["cargo fmt", "cargo clippy", "cargo test"]);
	expect(hit?.occurrences).toBe(2);
	expect(hit?.name).toBe("cargo-fmt-clippy");
});

test("a repeated identical command is not a sequence; a single occurrence stays silent", () => {
	const same = ["git status", "git status", "git status", "git status"];
	expect(detectRepeatedSequence(same, same)).toBeUndefined();
	const once = ["cargo fmt", "cargo clippy", "cargo test"];
	expect(detectRepeatedSequence(once, once)).toBeUndefined();
});

test("the proposal carries a valid JSON step template and a muscle: title", () => {
	const hit: RepetitionHit = {
		sequence: ["cargo fmt", "cargo clippy", "cargo test"],
		occurrences: 2,
		name: "cargo-fmt-clippy",
		rawLines: ["cargo fmt --all", "cargo clippy -- -D warnings", "cargo test -p uma-cli"],
	};
	const proposal = buildRoutineProposal(hit);
	expect(proposal.title).toBe("muscle:cargo-fmt-clippy");
	expect(proposal.tags).toContain("routine-proposal");
	const steps = JSON.parse(proposal.template) as Array<{ command: string; args: string[] }>;
	expect(steps).toHaveLength(3);
	expect(steps[0]?.command).toBe("cargo");
	expect(steps[0]?.args).toEqual(["fmt", "--all"]);
	expect(proposal.body).toContain("2\u00d7");
	expect(proposal.body).toContain("uma muscle run cargo-fmt-clippy --confirm");
});

test("compound command lines are never routine steps (pi's live finding); names are clean slugs", () => {
	expect(normalizeCommand('cd "core" && cargo test')).toBeUndefined();
	expect(normalizeCommand("npm test; npm run build")).toBeUndefined();
	expect(normalizeCommand("git log | head")).toBeUndefined();
	expect(routineName(["npm test", "npm run", "npm test"])).toBe("npm-test-run");
	expect(routineName(["node --version", "npm --version", "git --version"])).toBe("node-version-npm");
	expect(routineName(['cd "core"', "cp a"])).toBe("cd-core-cp");
});

test("history keeps a window; the draft argv is `uma staging create --type skill` with the muscle_synthesis trigger", () => {
	let h = { shapes: [] as string[], raw: [] as string[], proposed: [] as string[] };
	for (let i = 0; i < HISTORY_LIMIT + 5; i++) h = pushCommand(h, `c${i}`, ` raw ${i} `);
	expect(h.shapes).toHaveLength(HISTORY_LIMIT);
	expect(h.raw.at(-1)).toBe("raw " + (HISTORY_LIMIT + 4));
	const argv = createArgv({ title: "muscle:x", body: "b", template: "[]", tags: ["muscle", "routine"] });
	expect(argv.slice(0, 5)).toEqual(["uma", "staging", "create", "--type", "skill"]);
	expect(argv[argv.indexOf("--trigger") + 1]).toBe("muscle_synthesis");
	expect(argv[argv.indexOf("--tags") + 1]).toBe("muscle,routine");
	expect(argv).not.toContain("muscle");
});
