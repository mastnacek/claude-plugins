import { expect, test } from "claude-code/testing";
import type { TestBody } from "claude-code/testing";

type On = Parameters<TestBody>[1];

const reply = (stdout: string, exitCode = 0) => ({
	value: { exitCode, stdout, stderr: "", isStdoutTruncated: false, isStderrTruncated: false },
});

// anon double (REAL <-> FAKE) and a pdftotext double that prints "mail REAL" (or is missing).
const doubles = (on: On, opts: { role?: string; pdftotext?: "ok" | "missing" } = {}) => {
	const argvs: string[][] = [];
	on("env.get", (_$, e) => ({ value: e.name === "CC_ROLE" ? opts.role : undefined }));
	on("fs.stat", () => ({ value: { kind: "file", size: 1, mtimeMs: 0, isLink: false } }));
	on("process.run", (_$, e) => {
		argvs.push([...e.argv]);
		const [bin, command] = e.argv;
		if (bin === "pdftotext") {
			if (opts.pdftotext === "missing") throw new Error("spawn pdftotext ENOENT");
			return reply("mail REAL\n");
		}
		if (command === "help") return reply("{}");
		const swap = command === "mask" ? (s: string) => s.replaceAll("REAL", "FAKE") : (s: string) => s.replaceAll("FAKE", "REAL");
		return reply(JSON.stringify({ ok: true, text: swap(e.init?.stdin ?? "") }));
	});
	return argvs;
};

const inner = (on: On) => {
	const calls: string[] = [];
	on("tool.call", { tool: "Read" }, (_$, e) => {
		calls.push(String(e.file_path));
		return { result: { type: "text", file: { content: "inner" } } };
	});
	return calls;
};

test("a PDF is read as masked text; the document itself is never passed on", async ($, on) => {
	doubles(on);
	const calls = inner(on);
	const out = await $.tool.call({ tool: "Read", file_path: "/p/a.pdf" });
	expect(JSON.stringify(out.result)).toContain("mail FAKE");
	expect(JSON.stringify(out.result)).not.toContain("REAL");
	expect(calls.length).toBe(0);
});

test("without pdftotext a PDF is denied with a clear message", async ($, on) => {
	doubles(on, { pdftotext: "missing" });
	const calls = inner(on);
	const out = await $.tool.call({ tool: "Read", file_path: "/p/a.PDF" });
	expect(out.deny ?? out.text).toContain("pdftotext není v PATH");
	expect(calls.length).toBe(0);
});

test("an image: denied dialog denies", async ($, on) => {
	doubles(on);
	const calls = inner(on);
	let asked = "";
	on("tool.call", { tool: "AskUserQuestion" }, (_$, e) => {
		asked = JSON.stringify(e);
		return { deny: "dismissed" };
	});
	const out = await $.tool.call({ tool: "Read", file_path: "/p/a.png" });
	expect(asked).toContain("Obrázek nejde zamaskovat. Poslat ho modelu?");
	expect(out.deny ?? out.text).toContain("nebyl povolen");
	expect(calls.length).toBe(0);
});

test("an image: a confirmed dialog lets the Read through", async ($, on) => {
	doubles(on);
	const calls = inner(on);
	on("tool.call", { tool: "AskUserQuestion" }, (_$, e) => {
		const q = (e as { questions?: { question: string; options: { label: string }[] }[] }).questions?.[0];
		return { result: { questions: (e as { questions?: unknown }).questions, answers: { [q?.question ?? ""]: q?.options[0]?.label ?? "" } } };
	});
	const out = await $.tool.call({ tool: "Read", file_path: "/p/a.webp" });
	expect(out.deny).toBeUndefined();
	expect(calls).toEqual(["/p/a.webp"]);
});

test("an image: an agent session is denied without a dialog", async ($, on) => {
	doubles(on, { role: "coder" });
	const calls = inner(on);
	let asked = false;
	on("tool.call", { tool: "AskUserQuestion" }, () => {
		asked = true;
		return { deny: "dismissed" };
	});
	const out = await $.tool.call({ tool: "Read", file_path: "/p/a.jpeg" });
	expect(asked).toBe(false);
	expect(out.deny ?? out.text).toContain("nebyl povolen");
	expect(calls.length).toBe(0);
});

test("a text file is not touched by the guard", async ($, on) => {
	doubles(on);
	const calls = inner(on);
	await $.tool.call({ tool: "Read", file_path: "/p/a.txt" });
	expect(calls).toEqual(["/p/a.txt"]);
});
