// The ledger end to end: the hook records a call and never changes its result; where the file goes on every platform.

import { expect, test } from "claude-code/testing";
import { call, eventsOf, fresh, only, setup } from "../../shared/world";
import type { Entry } from "../../shared/world";

test("Linux: <XDG_DATA_HOME>/uma/agent-watchdog/<main repo>/<date>_<role>_<id8>.jsonl, a worktree writes to the main repository's folder", async ($, on) => {
	const w = fresh({ env: { HOME: "/home/t", XDG_DATA_HOME: "/data", CC_ROLE: "coder" } });
	const { files } = setup(on, w);
	await call($, { tool: "Bash", command: "ls" });
	expect(only(files)).toBe("/data/uma/agent-watchdog/main/2026-01-05_coder_01HZABCD.jsonl");
});

test("Linux without XDG_DATA_HOME: ~/.local/share/uma/agent-watchdog", async ($, on) => {
	const w = fresh({ env: { HOME: "/home/t", CC_ROLE: "tester" } });
	const { files } = setup(on, w);
	await call($, { tool: "Bash", command: "ls" });
	expect(only(files)).toBe("/home/t/.local/share/uma/agent-watchdog/main/2026-01-05_tester_01HZABCD.jsonl");
});

test("Windows: %APPDATA%\\uma\\agent-watchdog, beside UMA's data", async ($, on) => {
	const w = fresh({ env: { APPDATA: "C:\\Users\\t\\AppData\\Roaming", USERPROFILE: "C:\\Users\\t" }, root: "D:\\work\\wt", repo: "D:\\work\\main" });
	const { files } = setup(on, w);
	await call($, { tool: "Bash", command: "dir" });
	expect(only(files)).toMatch(/Users\/t\/AppData\/Roaming\/uma\/agent-watchdog\/main\/2026-01-05_orchestrator_01HZABCD\.jsonl$/);
	expect(only(files)).not.toContain("/global/");
	expect(only(files)).not.toContain("/data/");
});

test("macOS: ~/Library/Application Support/uma/agent-watchdog", async ($, on) => {
	const w = fresh({ env: { HOME: "/Users/t" }, dirs: ["/Users/t/Library/Application Support"] });
	const { files } = setup(on, w);
	await call($, { tool: "Bash", command: "ls" });
	expect(only(files)).toBe("/Users/t/Library/Application Support/uma/agent-watchdog/main/2026-01-05_orchestrator_01HZABCD.jsonl");
});

test("outside git the folder name is the project; with no home there is no ledger and no harm", async ($, on) => {
	const w = fresh({ repo: null, root: "/solo/proj", session: "AAAAAAAA-1" });
	const { files } = setup(on, w);
	await call($, { tool: "Bash", command: "ls" });
	expect(only(files)).toBe("/home/t/.local/share/uma/agent-watchdog/proj/2026-01-05_orchestrator_AAAAAAAA.jsonl");
	w.env = {};
	w.session = "BBBBBBBB-1";
	const result = await call($, { tool: "Bash", command: "ls" });
	expect(files.size).toBe(1);
	expect(result.text).toBe("ok");
});

test("--resume continues in the same file, a new id after /clear starts a new one", async ($, on) => {
	const w = fresh({ env: { HOME: "/home/t", CC_ROLE: "coder" }, session: "RESUME01-aaaa-bbbb", listing: [{ name: "2025-12-31_coder_RESUME01.jsonl", kind: "file", size: 1, mtimeMs: 1, isLink: false }] });
	const { files } = setup(on, w);
	await call($, { tool: "Bash", command: "ls" });
	await call($, { tool: "Bash", command: "pwd" });
	expect([...files.keys()]).toEqual(["/home/t/.local/share/uma/agent-watchdog/main/2025-12-31_coder_RESUME01.jsonl"]);
	w.session = "CLEARED2-cccc-dddd";
	await call($, { tool: "Bash", command: "ls" });
	expect([...files.keys()]).toEqual(["/home/t/.local/share/uma/agent-watchdog/main/2025-12-31_coder_RESUME01.jsonl", "/home/t/.local/share/uma/agent-watchdog/main/2026-01-05_coder_CLEARED2.jsonl"]);
});

test("every line carries the full session id and the role; parallel calls lose nothing; no output is stored", async ($, on) => {
	const w = fresh({ env: { HOME: "/h", CC_ROLE: "coder" }, answer: { result: {}, text: "SECRET-CONTENT-OF-A-FILE" }, session: "FULLID01-aaaa-bbbb-cccc" });
	const { files } = setup(on, w);
	await Promise.all([call($, { tool: "Bash", command: "first" }), call($, { tool: "Read", file_path: "/work/wt/a.ts" }), call($, { tool: "WebFetch", url: "https://example.com/x" })]);
	const path = only(files);
	const events = eventsOf(files, path);
	expect(events.length).toBe(3);
	expect(events.every((e) => e.session === "FULLID01-aaaa-bbbb-cccc" && e.role === "coder" && e.cwd === "/work/wt")).toBe(true);
	expect(events.map((e) => e.tool).sort()).toEqual(["Bash", "Read", "WebFetch"]);
	expect(events.find((e) => e.tool === "Read")?.path).toBe("/work/wt/a.ts");
	expect(events.find((e) => e.tool === "WebFetch")?.url).toBe("https://example.com/x");
	expect(files.get(path)).not.toContain("SECRET-CONTENT");
});

test("the hook returns the tool's result untouched, errors and denials included", async ($, on) => {
	const w = fresh({ env: { HOME: "/h" } });
	setup(on, w);
	const same = { result: { stdout: "x" }, text: "x" };
	w.answer = same;
	expect(await call($, { tool: "Bash", command: "ls" })).toEqual(same);
	const err = { isError: true, result: "boom", text: "Exit code 2\nboom" };
	w.answer = err;
	expect(await call($, { tool: "Bash", command: "false" })).toMatchObject(err);
	const deny = { deny: "Blocked: no" };
	w.answer = deny;
	expect(await call($, { tool: "Bash", command: "x" })).toEqual(deny);
});

test("a failing write is a quiet log line; the tool still goes through", async ($, on) => {
	const w = fresh({ env: { HOME: "/h" }, breakFs: true, session: "BROKEN01-x" });
	const { files, logged } = setup(on, w);
	const result = await call($, { tool: "Bash", command: "ls" });
	expect(result.text).toBe("ok");
	expect(files.size).toBe(0);
	expect(logged.join("\n")).toContain("deník: zápis selhal");
});

test("a call is written with exit code, error excerpt, denial reason — secrets masked", async ($, on) => {
	const w = fresh({ env: { HOME: "/h", CC_ROLE: "coder" }, session: "FIELDS01-x", answer: { isError: true, result: "x", text: "Exit code 3\nfatal: token ghp_abcdefghijklmnopqrstuvwxyz0123456789 rejected" } });
	const { files } = setup(on, w);
	await call($, { tool: "Bash", command: "curl -H 'Authorization: Bearer abcdefghijklmnop12345' https://x --password=hunter2hunter2" });
	const [ev] = eventsOf(files, only(files));
	expect(ev).toMatchObject({ kind: "tool", tool: "Bash", exitCode: 3, isError: true, denied: false });
	expect(ev?.excerpt).toContain("[REDACTED]");
	expect(JSON.stringify(ev)).not.toMatch(/ghp_abc|abcdefghijklmnop12345|hunter2hunter2/);
	expect(ev?.secretOut).toBe(true);
	expect(ev?.durationMs).toBe(0);

	w.session = "DENIED01-x";
	w.answer = { deny: "Blocked: git commit is the orchestrator's" };
	await call($, { tool: "Bash", command: "git commit -m x" });
	const denied = eventsOf(files, [...files.keys()].find((k) => k.includes("DENIED01")) as string)[0];
	expect(denied).toMatchObject({ denied: true, isError: true, deniedReason: "Blocked: git commit is the orchestrator's" });

	w.session = "USERRJ01-x";
	w.answer = { isError: true, result: "x", text: "The user doesn't want to proceed with this tool use." };
	await call($, { tool: "Bash", command: "ls" });
	expect(eventsOf(files, [...files.keys()].find((k) => k.includes("USERRJ01")) as string)[0]?.denied).toBe(true);
});
