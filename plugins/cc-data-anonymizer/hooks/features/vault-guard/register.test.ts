import { expect, test } from "claude-code/testing";
import type { TestBody } from "claude-code/testing";

type On = Parameters<TestBody>[1];

// Made-up environment: a fake roaming folder, never the real one.
const VARS: Record<string, string> = { APPDATA: "C:\\Users\\tester\\AppData\\Roaming", USERPROFILE: "C:\\Users\\tester" };
const SCRATCH = "C:/Users/tester/AppData/Local/Temp/scratch";

const world = (on: On, vars: Record<string, string> = VARS) => {
	const calls: string[] = [];
	on("env.get", (_$, e) => ({ value: vars[(e as unknown as { name: string }).name] }));
	on("session.cwd", () => ({ value: "D:/work/proj" }));
	on("process.run", (_$, e) => {
		calls.push(e.argv.join(" "));
		return { value: { exitCode: 0, stdout: "{}", stderr: "", isStdoutTruncated: false, isStderrTruncated: false } };
	});
	on("tool.call", () => ({ result: "ran" }));
	return calls;
};

const denied = (out: { deny?: string; text?: string }) => (out.deny ?? out.text ?? "").includes("anon guard");

const DENY_FILES: [string, Record<string, unknown>][] = [
	["Read vault.bin", { tool: "Read", file_path: "C:\\Users\\tester\\AppData\\Roaming\\anon\\vault.bin" }],
	["Read in other spelling and case", { tool: "Read", file_path: "c:/USERS/tester/appdata/roaming/ANON/map.db" }],
	["Read in Git Bash form", { tool: "Read", file_path: "/c/Users/tester/AppData/Roaming/anon/vault.key" }],
	["Read via 8.3 name", { tool: "Read", file_path: "C:\\Users\\TESTER~1\\APPDA~1\\Roaming\\anon\\rules.toml" }],
	["Read via ..", { tool: "Read", file_path: "C:/Users/tester/AppData/Local/../Roaming/anon/map.db" }],
	["Read via tilde", { tool: "Read", file_path: "~/AppData/Roaming/anon/map.db" }],
	["Edit", { tool: "Edit", file_path: "C:/Users/tester/AppData/Roaming/anon/rules.toml", old_string: "a", new_string: "b" }],
	["Write", { tool: "Write", file_path: "C:/Users/tester/AppData/Roaming/anon/rules.toml", content: "x" }],
	["NotebookEdit", { tool: "NotebookEdit", notebook_path: "C:/Users/tester/AppData/Roaming/anon/n.ipynb", new_source: "x" }],
	["Grep inside", { tool: "Grep", pattern: "a", path: "C:/Users/tester/AppData/Roaming/anon" }],
	["Grep whose root holds it", { tool: "Grep", pattern: "a", path: "C:/Users/tester/AppData" }],
	["Glob inside", { tool: "Glob", pattern: "*.bin", path: "C:/Users/tester/AppData/Roaming/anon" }],
	["Glob pattern with the path", { tool: "Glob", pattern: "C:/Users/tester/AppData/Roaming/anon/**" }],
	["Glob whose root holds it", { tool: "Glob", pattern: "**/vault.bin", path: "C:/Users/tester" }],
	["MCP file tool", { tool: "mcp__fs__read_file", path: "C:/Users/tester/AppData/Roaming/anon/map.db" }],
	["MCP file tool with a list", { tool: "mcp__fs__read_many", paths: ["D:/ok.txt", "C:/Users/tester/AppData/Roaming/anon/map.db"] }],
	["MCP file URI", { tool: "mcp__fs__open", uri: "file:///C:/Users/tester/AppData/Roaming/anon/vault.bin" }],
];

for (const [name, input] of DENY_FILES) {
	test("denied: " + name, async ($, on) => {
		const calls = world(on);
		const out = await $.tool.call(input as never);
		expect(denied(out)).toBe(true);
		expect(calls).toEqual([]); // not even the consent scan ran
	});
}

const DENY_COMMANDS: [string, string][] = [
	["literal path", "type C:\\Users\\tester\\AppData\\Roaming\\anon\\vault.bin"],
	["slashes", "cat C:/Users/tester/AppData/Roaming/anon/map.db"],
	["%APPDATA%", "type %APPDATA%\\anon\\vault.key"],
	["$env:APPDATA", "Get-Content $env:APPDATA\\anon\\rules.toml"],
	["$APPDATA", "cat $APPDATA/anon/map.db"],
	["braced APPDATA", "cat $" + "{APPDATA}/anon/map.db"],
	["Join-Path", "Get-Content (Join-Path $env:APPDATA 'anon')"],
	["tilde", "ls ~\\AppData\\Roaming\\anon"],
	["Git Bash drive", "cat /c/Users/tester/AppData/Roaming/anon/map.db"],
	["quoted in bash -c", "bash -c 'cat C:/Users/tester/AppData/Roaming/anon/map.db'"],
	["8.3", "type C:\\Users\\TESTER~1\\APPDA~1\\Roaming\\anon\\x"],
	["file name alone", "type vault.key"],
	["unmask", "anon unmask f.txt"],
	["unmask from a path", "D:/01_programovani/_tools/anon.exe unmask f.txt"],
	["call operator", "& 'D:\\tools\\anon.exe' unmask f.txt"],
	["map list", "anon map list"],
	["map export", "anon map export"],
	["vault", "anon vault add x"],
	["tui", "anon tui"],
	["rules", "anon rules"],
	["--with-values", "anon scan --with-values f.txt"],
	["--reveal", "anon mask --reveal f.txt"],
	["export", "anon export out.json"],
	["import", "anon import in.json"],
	["after &&", "cd x && anon unmask f.txt"],
	["after env var", "FOO=1 anon unmask f.txt"],
	["with env wrapper", "env anon map list"],
	["Start-Process", "Start-Process anon -ArgumentList 'unmask f.txt'"],
	["powershell -Command", 'powershell -Command "anon unmask f.txt"'],
	["ANON_HOME set to the real home", "ANON_HOME=C:/Users/tester/AppData/Roaming/anon anon mask f.txt"],
	["env:ANON_HOME set to the real home", "$env:ANON_HOME='C:\\Users\\tester\\AppData\\Roaming\\anon'; anon mask f.txt"],
	["DPAPI Unprotect", "[Security.Cryptography.ProtectedData]::Unprotect($b,$null,'CurrentUser')"],
	["CryptUnprotectData", "python -c \"import win32crypt; win32crypt.CryptUnprotectData(b)\""],
];

for (const [name, command] of DENY_COMMANDS) {
	for (const tool of ["Bash", "PowerShell"] as const) {
		test("denied " + tool + ": " + name, async ($, on) => {
			world(on);
			const out = await $.tool.call({ tool, command } as never);
			expect(denied(out)).toBe(true);
		});
	}
}

const ALLOW: [string, Record<string, unknown>][] = [
	["Read of a normal file", { tool: "Read", file_path: "D:/work/proj/a.txt" }],
	["Read in the scratch", { tool: "Read", file_path: SCRATCH + "/a.txt" }],
	["Read of a sibling of the home", { tool: "Read", file_path: "C:/Users/tester/AppData/Roaming/other/a.txt" }],
	["a folder named like the home elsewhere", { tool: "Read", file_path: "D:/01_programovani/anon/README.md" }],
	["Grep in the project", { tool: "Grep", pattern: "x", path: "D:/work/proj" }],
	["Grep without a path", { tool: "Grep", pattern: "x" }],
	["Write whose text mentions the folder", { tool: "Write", file_path: SCRATCH + "/n.md", content: "see C:/Users/tester/AppData/Roaming/anon" }],
	["anon scan", { tool: "Bash", command: "anon scan f.txt" }],
	["anon mask", { tool: "Bash", command: "anon mask f.txt" }],
	["anon.exe mask by path", { tool: "Bash", command: "D:/01_programovani/_tools/anon.exe mask f.txt" }],
	["anon --help", { tool: "Bash", command: "anon --help" }],
	["anon --version", { tool: "PowerShell", command: "anon --version" }],
	["anon help map", { tool: "Bash", command: "anon help map" }],
	["smoke test: ANON_HOME in scratch (bash)", { tool: "Bash", command: "ANON_HOME=" + SCRATCH + " anon mask file.txt" }],
	["smoke test: ANON_HOME in scratch (PowerShell)", { tool: "PowerShell", command: "$env:ANON_HOME='" + SCRATCH + "'; anon mask file.txt" }],
	["ordinary command", { tool: "Bash", command: "git status && ls D:/01_programovani/anon" }],
	["APPDATA alone", { tool: "PowerShell", command: "echo $env:APPDATA" }],
	["cd into the anon repo", { tool: "Bash", command: "cd D:/01_programovani/anon && cargo test" }],
];

for (const [name, input] of ALLOW) {
	test("allowed: " + name, async ($, on) => {
		world(on);
		on("tool.call", { tool: "Read" }, () => ({ result: { content: "plain" } }));
		const out = await $.tool.call(input as never);
		expect(denied(out)).toBe(false);
	});
}

test("the message names the reason, offers ! and quotes no path", async ($, on) => {
	world(on);
	const out = await $.tool.call({ tool: "Read", file_path: "C:/Users/tester/AppData/Roaming/anon/vault.bin" } as never);
	const text = out.deny ?? out.text ?? "";
	expect(text).toContain("off limits");
	expect(text).toContain("! <command>");
	expect(text).not.toContain("Roaming");
});

test("ANON_HOME of the session counts as the home", async ($, on) => {
	world(on, { ...VARS, ANON_HOME: "E:\\data\\anon-test-home" });
	const a = await $.tool.call({ tool: "Read", file_path: "E:/data/anon-test-home/vault.bin" } as never);
	expect(denied(a)).toBe(true);
	const b = await $.tool.call({ tool: "Bash", command: "cat $env:ANON_HOME" } as never);
	expect(denied(b)).toBe(true);
});
