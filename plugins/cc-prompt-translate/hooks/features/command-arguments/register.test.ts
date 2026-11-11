// The slice end to end on invented commands: what the engine reports about a
// command (`command.describe`, `command.list`) decides, no name does.

import { expect, mock, test } from "claude-code/testing";
import type { Engine } from "claude-code/testing";
import type { On } from "claude-code";

// The module has no Node/DOM typings; declare the one global used to let background work finish.
declare function setTimeout(handler: (value: unknown) => void, ms: number): unknown;

type Cmd = { name: string; description: string; source: "plugin" | "user"; argumentHint?: string };

function reply(content: string) {
	return {
		status: 200,
		ok: true,
		headers: {},
		text: JSON.stringify({
			choices: [{ message: { content }, finish_reason: "stop" }],
			usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost: 0.0001 },
		}),
	};
}

function setup(on: On, commands: Cmd[], model: (system: string, user: string) => string) {
	mock.store(on);
	mock.env(on, { OPENROUTER_API_KEY: "k" });
	mock.clock(on);
	on("ui.toast", () => ({ value: undefined }));
	on("ui.status", () => ({ value: undefined }));
	on("ui.invalidate", () => ({ value: undefined }));
	on("session.id", () => ({ value: "s" }));
	on("command.list", () => ({ value: commands.map(({ argumentHint: _h, ...c }) => c) }));
	on("command.describe", (_$, e) => ({ description: e.description, argumentHint: e.argumentHint, isHidden: e.isHidden }));
	const calls: Array<{ system: string; user: string }> = [];
	on("http.fetch", (_$, e) => {
		if (!e.url.includes("chat/completions")) return { value: { status: 404, ok: false, headers: {}, text: "{}" } };
		const body = JSON.parse(String(e.init?.body)) as { messages: Array<{ content: string }> };
		const call = { system: body.messages[0]?.content ?? "", user: body.messages[1]?.content ?? "" };
		calls.push(call);
		return { value: reply(model(call.system, call.user)) };
	});
	// What the command receives after every hook ran.
	const received: string[] = [];
	on("command.run", (_$, e) => {
		received.push(e.args);
		return { text: "ok" };
	});
	return { calls, received };
}

async function describeAll($: Engine, commands: Cmd[]) {
	for (const c of commands) {
		await $.command.describe({ command: c.name, description: c.description, argumentHint: c.argumentHint, isHidden: false, immediate: false, provider: { plugin: "x", tier: "user" } } as never);
	}
}

// The credit refresh a paid translation starts runs in the background: let it end inside the test.
async function run($: Engine, command: string, args: string) {
	await $.command.run({ command, args, origin: { kind: "composer" }, presentation: { layout: "main", width: 80 } } as never);
	for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 5));
}

const sound: Cmd = { name: "beep", description: "Sound control", source: "plugin", argumentHint: "on | off | status" };
const geo: Cmd = { name: "where", description: "Weather at a point", source: "plugin", argumentHint: "<lat> <lon>" };
const skill: Cmd = { name: "pack:do-it", description: "Does a thing", source: "plugin", argumentHint: "[co udělat]" };
const bare: Cmd = { name: "mystery", description: "Unreported", source: "plugin" };

test("a literal from the hint stays, no model call", async ($, on) => {
	const { calls, received } = setup(on, [sound], () => "never");
	await describeAll($, [sound]);
	await run($, "beep", "off");
	expect(calls).toHaveLength(0);
	expect(received).toEqual(["off"]);
});

test("numbers and plain values stay, no model call", async ($, on) => {
	const { calls, received } = setup(on, [geo], () => "never");
	await describeAll($, [geo]);
	await run($, "where", "location 50.1 14.4");
	expect(calls).toHaveLength(0);
	expect(received).toEqual(["location 50.1 14.4"]);
});

test("a Czech sentence is translated with the command as context", async ($, on) => {
	const { calls, received } = setup(on, [skill], () => "do this and that");
	await describeAll($, [skill]);
	await run($, "pack:do-it", "udělej to a to");
	expect(calls).toHaveLength(1);
	expect(calls[0]?.system).toContain("slash command");
	expect(calls[0]?.user).toContain("Argument hint: [co udělat]");
	expect(calls[0]?.user).toContain("Command: /pack:do-it");
	expect(received).toEqual(["do this and that"]);
});

test("a model that changes a literal is degraded: the original goes", async ($, on) => {
	const { calls, received } = setup(on, [sound], () => "Off. and turn the sound down");
	await describeAll($, [sound]);
	await run($, "beep", "off a ztlum zvuk, prosím");
	expect(calls).toHaveLength(1);
	expect(received).toEqual(["off a ztlum zvuk, prosím"]);
});

test("a command never described is translated by name and arguments only", async ($, on) => {
	const { calls, received } = setup(on, [bare], () => "fix the login");
	await run($, "mystery", "oprav přihlášení");
	expect(calls).toHaveLength(1);
	expect(calls[0]?.user).toContain("Command: /mystery");
	expect(calls[0]?.user).not.toContain("Argument hint");
	expect(received).toEqual(["fix the login"]);
});

test("command.describe leaves its result as it was", async ($, on) => {
	setup(on, [sound], () => "x");
	const result = await $.command.describe({ command: "beep", description: "Sound control", argumentHint: "on | off", isHidden: true, immediate: false, provider: { plugin: "x", tier: "user" } } as never);
	expect(result).toEqual({ description: "Sound control", argumentHint: "on | off", isHidden: true });
});

test("the plugin's own settings command gets its subcommand untouched, by the same path", async ($, on) => {
	const own: Cmd = {
		name: "prompt-translate",
		description: "Translation settings",
		source: "plugin",
		argumentHint: "help | on | off | model <m> | boost <level> | stats | …",
	};
	const { calls } = setup(on, [own], () => "Help.");
	// No bottom command.run here: the settings slice answers.
	on("command.register", () => ({ value: { command: "prompt-translate" } }));
	on("session.cwd", () => ({ value: "/work" }));
	await describeAll($, [own]);
	const result = await $.command.run({ command: "prompt-translate", args: "help", origin: { kind: "composer" }, presentation: { layout: "main", width: 80 } } as never);
	for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 5));
	expect(calls, "no model call").toHaveLength(0);
	expect((result.text ?? "").toLowerCase()).not.toBe("help.");
	expect(result.text ?? "", "answered by the settings slice, not the recording bottom").not.toBe("ok");
	expect((result.text ?? "").length).toBeGreaterThan(0);
});
