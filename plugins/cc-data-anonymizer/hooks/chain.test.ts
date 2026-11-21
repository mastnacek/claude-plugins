// The full hook chain in register.tsx order: the failure seen live (a .png Read hit anon scan
// before the consent dialog) is reproduced here, not in media-guard alone.
import { expect, test } from "claude-code/testing";
import type { TestBody } from "claude-code/testing";

type On = Parameters<TestBody>[1];

const reply = (stdout: string, exitCode = 0) => ({
	value: { exitCode, stdout, stderr: "", isStdoutTruncated: false, isStderrTruncated: false },
});

// anon double: scan of a .png or .bin fails like the real anon (not UTF-8 text); mask/unmask swap REAL <-> FAKE.
const doubles = (on: On, role?: string) => {
	const scanned: string[] = [];
	on("env.get", (_$, e) => ({ value: e.name === "CC_ROLE" ? role : undefined }));
	on("fs.stat", () => ({ value: { kind: "file", size: 1, mtimeMs: 0, isLink: false } }));
	on("process.run", (_$, e) => {
		const [, command, path] = e.argv;
		if (command === "help") return reply("{}");
		if (command === "scan") {
			scanned.push(String(path));
			return reply(`anon: ${path}: soubor není UTF-8 text`, 1);
		}
		const swap = command === "mask" ? (s: string) => s.replaceAll("REAL", "FAKE") : (s: string) => s.replaceAll("FAKE", "REAL");
		return reply(JSON.stringify({ ok: true, text: swap(e.init?.stdin ?? "") }));
	});
	return scanned;
};

const reader = (on: On) => {
	const calls: string[] = [];
	on("tool.call", { tool: "Read" }, (_$, e) => {
		calls.push(String(e.file_path));
		return { result: { type: "image", file: { base64: "REAL-bytes" } } };
	});
	return calls;
};

const answer = (on: On, label: "Poslat" | "Neposílat") =>
	on("tool.call", { tool: "AskUserQuestion" }, (_$, e) => {
		const q = (e as { questions?: { question: string }[] }).questions?.[0]?.question ?? "";
		return { result: { questions: (e as { questions?: unknown }).questions, answers: { [q]: label } } };
	});

test("chain: a .PNG Read with consent allowed passes unmasked, never scanned", async ($, on) => {
	const scanned = doubles(on);
	const calls = reader(on);
	answer(on, "Poslat");
	const out = await $.tool.call({ tool: "Read", file_path: "/p/a.PNG" });
	expect(out.deny).toBeUndefined();
	expect(calls).toEqual(["/p/a.PNG"]);
	expect(JSON.stringify(out.result)).toContain("REAL-bytes");
	expect(scanned.length).toBe(0);
});

test("chain: a .png Read with consent denied is denied", async ($, on) => {
	const scanned = doubles(on);
	const calls = reader(on);
	answer(on, "Neposílat");
	const out = await $.tool.call({ tool: "Read", file_path: "/p/a.png" });
	expect(out.deny ?? out.text).toContain("nebyl povolen");
	expect(calls.length).toBe(0);
	expect(scanned.length).toBe(0);
});

test("chain: a .png Read in an agent session is denied", async ($, on) => {
	const scanned = doubles(on, "coder");
	const calls = reader(on);
	const out = await $.tool.call({ tool: "Read", file_path: "/p/a.png" });
	expect(out.deny ?? out.text).toContain("nebyl povolen");
	expect(calls.length).toBe(0);
	expect(scanned.length).toBe(0);
});

test("chain: a .bin Read gets the clear message, not the raw anon error", async ($, on) => {
	doubles(on);
	const calls = reader(on);
	answer(on, "Poslat");
	const out = await $.tool.call({ tool: "Read", file_path: "/p/a.bin" });
	expect(out.deny ?? out.text).toContain("Binární soubor nejde zamaskovat; čtení zamítnuto.");
	expect(out.deny ?? out.text).not.toContain("anon scan failed");
	expect(calls.length).toBe(0);
});
