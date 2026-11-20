import { expect, test } from "claude-code/testing";
import type { TestBody } from "claude-code/testing";

type On = Parameters<TestBody>[1];

// Made-up values. A stand-in for anon: mask turns REAL into a tag, unmask turns it back.
const TAG = "«REDACTED:password:1»";
const OTHER = "«REDACTED:password:9»";

const world = (on: On, output = "ok") => {
	const calls: string[] = [];
	on("env.get", () => ({ value: undefined }));
	on("fs.stat", () => ({ value: { kind: "file", size: 1, mtimeMs: 0, isLink: false } }));
	on("process.run", (_$, e) => {
		const [, command] = e.argv;
		calls.push(command ?? "");
		const reply = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: "", isStdoutTruncated: false, isStderrTruncated: false } });
		if (command === "help") return reply("{}");
		const stdin = e.init?.stdin ?? "";
		if (command === "mask") return reply(JSON.stringify({ ok: true, style: "tag", text: stdin.replaceAll("REAL", TAG), replacements: [] }));
		return reply(JSON.stringify({ ok: true, text: stdin.replaceAll(TAG, "REAL").replaceAll(OTHER, "OTHER") }));
	});
	// The tool itself: Grep reads a file with a secret, anything else records what reached it.
	const tool = { ran: false, seen: "" };
	on("tool.call", { tool: /./ }, (_$, e) => {
		if (e.tool === "Grep") return { result: { content: "key REAL" } };
		tool.ran = true;
		tool.seen = JSON.stringify(e);
		return { result: output };
	});
	return { calls, tool };
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

test("PowerShell command with a known tag is restored before it runs", async ($, on) => {
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
			Bash: { command: 'export PW="REDACTED"' },
			PowerShell: { command: '$pw = "REDACTED"' },
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
