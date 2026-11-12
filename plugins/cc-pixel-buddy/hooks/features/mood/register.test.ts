// mood through the engine: events → the face on the strip.

import { expect, test } from "claude-code/testing";
import { bash, edit, fresh, mount, setup, start, turnEnd, turnStart } from "../../shared/world";

const BAND = { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 10 }, view: {} };

async function seen($: unknown): Promise<string> {
	const ui = await mount($, "AbovePrompt", BAND);
	const text = (await ui.find({ type: "Text", text: /\[/ } as never))?.text ?? "";
	await ui.unmount();
	return text;
}

test("a running turn thinks, its end goes back; a subagent's turn does not count", async ($, on) => {
	setup(on, fresh());
	await start($);
	expect(await seen($)).toContain("🙂");
	await turnStart($, "sub1");
	expect(await seen($)).toContain("🙂");
	await turnStart($);
	expect(await seen($)).toContain("🤔");
	await turnEnd($);
	expect(await seen($)).toContain("🙂");
});

test("a passing test is happy, three failing calls in a row worry, a commit celebrates", async ($, on) => {
	setup(on, fresh());
	await start($);
	await bash($, "cargo test");
	expect(await seen($)).toContain("😊");
	await bash($, "ls FAIL");
	await bash($, "ls FAIL");
	expect(await seen($)).not.toContain("😰");
	await edit($, "/bad/file");
	expect(await seen($)).toContain("😰");
	await bash($, "git commit -m x");
	expect(await seen($)).toContain("🎉");
	await turnStart($);
	await turnEnd($);
	// the party is over; the test that passed earlier still counts
	expect(await seen($)).toContain("😊");
});

test("10 minutes without a turn: 😴; the timer is checked every minute; a call wakes it", async ($, on) => {
	const clock = setup(on, fresh());
	await start($);
	await clock.advance(9 * 60_000);
	expect(await seen($)).toContain("🙂");
	await clock.advance(2 * 60_000);
	expect(await seen($)).toContain("😴");
	await bash($, "ls");
	expect(await seen($)).toContain("🙂");
});

test("sleep never interrupts a running turn", async ($, on) => {
	const clock = setup(on, fresh());
	await start($);
	await turnStart($);
	await clock.advance(30 * 60_000);
	expect(await seen($)).toContain("🤔");
});

test("a value an earlier version stored is declined (no strip until the first mood)", async ($, on) => {
	setup(on, fresh());
	let stale = false;
	on("state.get", (_$, e, next) => (stale ? { value: { value: { face: "old" }, version: 1 } } : next(e)));
	await start($);
	expect(await seen($)).toContain("🙂");
	stale = true;
	const ui = await mount($, "AbovePrompt", BAND);
	expect(await ui.find({ type: "Text", text: /\[/ } as never)).toBeUndefined();
	await ui.unmount();
});
