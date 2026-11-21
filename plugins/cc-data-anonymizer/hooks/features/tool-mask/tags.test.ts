import { expect, test } from "claude-code/testing";
import type { TestBody } from "claude-code/testing";

type On = Parameters<TestBody>[1];

// Made-up values. A stand-in for anon: mask turns REAL into a tag, unmask turns it back.
const TAG = "«REDACTED:password:1»";
const OTHER = "«REDACTED:password:9»";

const UNKNOWN = /(?:«|%C2%AB|&laquo;|&#0*171;|&lt;&lt;)?REDACTED:[A-Za-z_-]+(?![A-Za-z_-])(?!:[A-Za-z<{[$%*?])(?::\d+)?/gi;

const world = (on: On, output = "ok") => {
	const calls: string[] = [];
	const argvs: string[][] = [];
	on("env.get", () => ({ value: undefined }));
	on("fs.stat", () => ({ value: { kind: "file", size: 1, mtimeMs: 0, isLink: false } }));
	on("process.run", (_$, e) => {
		const [, command] = e.argv;
		calls.push(command ?? "");
		argvs.push([...e.argv]);
		const reply = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: "", isStdoutTruncated: false, isStderrTruncated: false } });
		if (command === "help") return reply("{}");
		const stdin = e.init?.stdin ?? "";
		if (command === "mask") return reply(JSON.stringify({ ok: true, style: "tag", text: stdin.replaceAll("REAL", TAG), replacements: [] }));
		const text = stdin.replaceAll(TAG, "REAL").replaceAll(OTHER, "OTHER");
		// `unmask --strict`: what anon cannot restore is listed and the exit is 3 (a stand-in for its leftover scan:
		// a tag with digits or a cut one, not a generic form such as «REDACTED:kind:n»).
		const strict = e.argv.includes("--strict");
		const left = strict ? [...text.matchAll(UNKNOWN)].map((m) => m[0]) : [];
		if (left.length > 0) {
			return { value: { exitCode: 3, stdout: JSON.stringify({ ok: false, text, restored: 0, unknown_tags: left }), stderr: "", isStdoutTruncated: false, isStderrTruncated: false } };
		}
		return reply(JSON.stringify({ ok: true, text }));
	});
	// The tool itself: Grep reads a file with a secret, anything else records what reached it.
	const tool = { ran: false, seen: "" };
	on("tool.call", { tool: /./ }, (_$, e) => {
		if (e.tool === "Grep") return { result: { content: "key REAL" } };
		tool.ran = true;
		tool.seen = JSON.stringify(e);
		return { result: output };
	});
	return { calls, argvs, tool };
};

// The session reads a masked result first: that issues TAG to it.
const issue = async ($: Parameters<TestBody>[0]) => {
	await $.tool.call({ tool: "Grep", pattern: "key" });
};

const text = (out: { deny?: string; text?: string }) => out.deny ?? out.text ?? "";

test("PowerShell output is masked", async ($, on) => {
	world(on, "Get-Content: key REAL");
	const out = await $.tool.call({ tool: "PowerShell", command: "Get-Content a.txt" });
	expect(JSON.stringify(out.result)).toContain(TAG);
	expect(JSON.stringify(out.result)).not.toContain("REAL");
});

test("PowerShell command with a known tag is restored before it runs", { options: { shellSecrets: "allow" } }, async ($, on) => {
	const { tool: t } = world(on);
	await issue($);
	await $.tool.call({ tool: "PowerShell", command: "Set-Content a.txt '" + TAG + "'" });
	expect(t.seen).toContain("Set-Content a.txt 'REAL'");
	expect(t.seen).not.toContain("REDACTED");
});

test("NotebookEdit new_source with a known tag is restored", async ($, on) => {
	const { tool: t } = world(on);
	await issue($);
	await $.tool.call({ tool: "NotebookEdit", notebook_path: "/p/n.ipynb", new_source: "x = '" + TAG + "'" });
	expect(t.seen).toContain("x = 'REAL'");
});

const BAD: [string, string][] = [
	["unknown tag", "echo " + OTHER],
	["lower case tag", "echo " + TAG.toLowerCase()],
	["altered tag", "echo «REDACTED:password:1 »"],
	["partial tag", "echo «REDACTED:pass"],
	["HTML entity", "echo &laquo;REDACTED:password:1&raquo;"],
	["numeric entity", "echo &#171;REDACTED:password:1»"],
	["double lt entity", "echo &lt;&lt;REDACTED:password:1&gt;&gt;"],
	["JSON escape", "echo \\u00abREDACTED:password:1\\u00bb"],
];

for (const [name, command] of BAD) {
	for (const tool of ["Bash", "PowerShell"]) {
		test(tool + " denied: " + name, async ($, on) => {
			const { tool: t } = world(on);
			await issue($);
			const out = await $.tool.call({ tool, command } as never);
			expect(text(out)).toContain("Neznámá nebo poškozená značka");
			expect(text(out)).toContain("Přečti soubor znovu a značku opiš přesně.");
			expect(t.ran).toBe(false);
		});
	}
}

test("a tag issued to no session is denied before anon unmask runs", async ($, on) => {
	const { tool: t } = world(on);
	const out = await $.tool.call({ tool: "Edit", file_path: "/p/a.txt", old_string: TAG, new_string: "x" });
	expect(text(out)).toContain("Neznámá nebo poškozená značka " + TAG);
	expect(t.ran).toBe(false);
});

for (const tool of ["Edit", "Write", "NotebookEdit", "Bash", "PowerShell"]) {
	test(tool + ": a write with a bare REDACTED is denied", async ($, on) => {
		const { tool: t } = world(on);
		const input = {
			Edit: { file_path: "/p/a.txt", old_string: "a", new_string: 'pw = "REDACTED"' },
			Write: { file_path: "/p/a.txt", content: 'pw = "REDACTED"' },
			NotebookEdit: { notebook_path: "/p/n.ipynb", new_source: 'pw = "REDACTED"' },
			Bash: { command: "echo 'PW=\"REDACTED\"' >> .env" },
			PowerShell: { command: "Set-Content a.txt '$pw = \"REDACTED\"'" },
		}[tool];
		const out = await $.tool.call({ tool, ...input } as never);
		expect(text(out)).toContain("REDACTED");
		expect(t.ran).toBe(false);
	});
}

test("MCP input with a tag is denied", async ($, on) => {
	const { tool: t } = world(on);
	await issue($);
	const out = await $.tool.call({ tool: "mcp__fs__write_file", path: "/p/a.txt", content: "k=" + TAG } as never);
	expect(text(out)).toContain("MCP nástroje značky neodmaskují; použij Edit/Write.");
	expect(t.ran).toBe(false);
});

test("MCP input without a tag still runs and its result is masked", async ($, on) => {
	world(on, "REAL");
	const out = await $.tool.call({ tool: "mcp__fs__read_file", path: "/p/a.txt" } as never);
	expect(JSON.stringify(out.result)).toContain(TAG);
});

test("anon unmask is asked for --strict, and a tag it lists is denied with the usual message", { options: { shellSecrets: "allow" } }, async ($, on) => {
	const { argvs, tool: t } = world(on);
	await issue($);
	await $.tool.call({ tool: "Bash", command: "echo " + TAG });
	expect(argvs.some((a) => a[1] === "unmask" && a.includes("--strict"))).toBe(true);
	// a tag anon lists as unknown (this one is not in the session's list, so it never reaches anon: use a cut one)
	t.ran = false;
	const out = await $.tool.call({ tool: "Write", file_path: "/p/a.txt", content: "x «REDACTED:pass" } as never);
	expect(text(out)).toContain("Neznámá nebo poškozená značka «REDACTED:pass");
	expect(t.ran).toBe(false);
});

test("a generic form of the tag in documentation is text and may be written", async ($, on) => {
	const { tool: t } = world(on);
	const doc = "Format: «REDACTED:kind:n», «REDACTED:<kind>:<n>» and «REDACTED:{kind}:{n}».";
	const out = await $.tool.call({ tool: "Write", file_path: "/p/doc.md", content: doc } as never);
	expect(out.deny).toBeUndefined();
	expect(t.seen).toContain("«REDACTED:kind:n»");
});

const ALLOWED_WORD: [string, Record<string, string>][] = [
	["Bash searching for it", { command: "grep -rn REDACTED src && grep -c 'REDACTED' a.txt 2>&1" }],
	["Bash reading with a pipe", { command: 'cat a.txt | grep "REDACTED" | wc -l' }],
	["PowerShell searching for it", { command: 'Select-String -Path a.txt -Pattern "REDACTED"' }],
	["Bash writing a file without it", { command: "echo hello > out.txt" }],
];

for (const [name, input] of ALLOWED_WORD) {
	test("REDACTED is no value: " + name, async ($, on) => {
		const { tool: t } = world(on);
		const tool = name.startsWith("PowerShell") ? "PowerShell" : "Bash";
		const out = await $.tool.call({ tool, ...input } as never);
		expect(out.deny).toBeUndefined();
		expect(t.ran).toBe(true);
	});
}

test("prose about REDACTED in a file is allowed, a value is not", async ($, on) => {
	const { tool: t } = world(on);
	const prose = await $.tool.call({ tool: "Write", file_path: "/p/a.md", content: "Style redact leaves the word REDACTED in the text." } as never);
	expect(prose.deny).toBeUndefined();
	expect(t.ran).toBe(true);
	t.ran = false;
	for (const content of ["pw=REDACTED", "pw: REDACTED", 'pw = "REDACTED"', "pw = 'REDACTED'"]) {
		const out = await $.tool.call({ tool: "Write", file_path: "/p/a.txt", content } as never);
		expect(text(out)).toContain("REDACTED");
		expect(t.ran).toBe(false);
	}
});

const WRITING: [string, string][] = [
	["redirect", "echo pw=REDACTED > a.env"],
	["append", 'echo "REDACTED" >> a.env'],
	["tee", "echo pw=REDACTED | tee a.env"],
	["sed -i", "sed -i 's/x/pw: REDACTED/' a.env"],
	["Add-Content", "Add-Content a.env 'pw=REDACTED'"],
	["Out-File", "'pw=REDACTED' | Out-File a.env"],
];

for (const [name, command] of WRITING) {
	test("a shell command writing REDACTED as a value is denied: " + name, async ($, on) => {
		const { tool: t } = world(on);
		const out = await $.tool.call({ tool: name === "Add-Content" || name === "Out-File" ? "PowerShell" : "Bash", command } as never);
		expect(text(out)).toContain("REDACTED");
		expect(t.ran).toBe(false);
	});
}
