import { expect, test } from "claude-code/testing";
import type { TestBody } from "claude-code/testing";

type On = Parameters<TestBody>[1];

// A stand-in for the anon CLI: REAL <-> FAKE, scan finds REAL.
const anonDouble = (on: On, options: { isMissing?: boolean; scanFound?: boolean } = {}) => {
	on("env.get", () => ({ value: undefined }));
	on("fs.stat", () => ({ value: { kind: "file", size: 1, mtimeMs: 0, isLink: false } }));
	on("process.run", (_$, e) => {
		const [bin, command] = e.argv;
		if (options.isMissing) throw new Error(`spawn ${bin} ENOENT`);
		const reply = (stdout: string, exitCode = 0) => ({
			value: { exitCode, stdout, stderr: "", isStdoutTruncated: false, isStderrTruncated: false },
		});
		if (command === "help") return reply("{}");
		if (command === "scan") return options.scanFound ? reply("secret #1, 4 znaků", 3) : reply("");
		const swap = command === "mask" ? (s: string) => s.replaceAll("REAL", "FAKE") : (s: string) => s.replaceAll("FAKE", "REAL");
		return reply(JSON.stringify({ ok: true, text: swap(e.init?.stdin ?? "") }));
	});
};

test("a Read result is masked", async ($, on) => {
	anonDouble(on);
	on("tool.call", () => ({ result: { type: "text", file: { content: "key REAL" } } }));
	const out = await $.tool.call({ tool: "Read", file_path: "/p/a.txt" });
	expect(JSON.stringify(out.result)).toContain("key FAKE");
	expect(JSON.stringify(out.result)).not.toContain("REAL");
});

test("Edit input is unmasked before the tool and its result masked", async ($, on) => {
	anonDouble(on);
	let seen = "";
	on("tool.call", (_$, e) => {
		seen = JSON.stringify(e);
		return { result: { filePath: "/p/a.txt", newString: "REAL" } };
	});
	const out = await $.tool.call({ tool: "Edit", file_path: "/p/a.txt", old_string: "FAKE", new_string: "FAKE2" });
	expect(seen).toContain('"old_string":"REAL"');
	expect(JSON.stringify(out.result)).toContain("FAKE");
});

test("a file anon finds secrets in is denied when the dialog is dismissed", async ($, on) => {
	anonDouble(on, { scanFound: true });
	on("tool.call", { tool: "AskUserQuestion" }, () => ({ deny: "dismissed" }));
	on("tool.call", { tool: "Read" }, () => ({ result: { content: "REAL" } }));
	const out = await $.tool.call({ tool: "Read", file_path: "/p/secret.txt" });
	expect(out.deny ?? out.text).toContain("not allowed");
});

test("anon missing: the call is denied (fail closed)", async ($, on) => {
	anonDouble(on, { isMissing: true });
	on("tool.call", () => ({ result: { content: "REAL" } }));
	const out = await $.tool.call({ tool: "Bash", command: "echo REAL" });
	expect(out.deny ?? out.text).toContain("anon was not found");
});
