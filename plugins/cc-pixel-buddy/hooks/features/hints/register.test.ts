// hints through the engine: shown once on the strip, gone when the next turn starts, silent when muted.

import { expect, test } from "claude-code/testing";
import { bash, fresh, mount, run, setup, start, turnEnd, turnStart } from "../../shared/world";

const BAND = { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 10 }, view: {} };

async function strip($: unknown): Promise<string> {
	const ui = await mount($, "AbovePrompt", BAND);
	const text = (await ui.find({ type: "Text", text: /\[/ } as never))?.text ?? "";
	await ui.unmount();
	return text;
}

test("3× the same failing command: the hint shows, the next turn removes it, no nagging", async ($, on) => {
	setup(on, fresh());
	await start($);
	await bash($, "make FAIL");
	await bash($, "make FAIL");
	expect(await strip($)).not.toContain("stejná chyba");
	await bash($, "make FAIL");
	expect(await strip($)).toContain("3× stejná chyba — zkus jiný postup");
	await bash($, "make FAIL");
	expect(await strip($)).toContain("3× stejná chyba");
	await turnStart($);
	expect(await strip($)).not.toContain("stejná chyba");
	await bash($, "make FAIL");
	expect(await strip($)).not.toContain("stejná chyba");
});

test("three different failing commands: nothing to say", async ($, on) => {
	setup(on, fresh());
	await start($);
	await bash($, "a FAIL");
	await bash($, "b FAIL");
	await bash($, "c FAIL");
	expect(await strip($)).not.toContain("stejná chyba");
});

test("context 80 %: shown at the end of a turn, once; gone with the next turn", async ($, on) => {
	const w = fresh({ percent: 50 });
	setup(on, w);
	await start($);
	await turnStart($);
	await turnEnd($);
	expect(await strip($)).not.toContain("kontext");
	w.percent = 83;
	await turnStart($);
	await turnEnd($);
	expect(await strip($)).toContain("kontext 83 % — zvaž /compact");
	await turnStart($);
	expect(await strip($)).not.toContain("kontext");
	await turnEnd($);
	expect(await strip($)).not.toContain("kontext");
});

test("no context figure from the engine: no hint", async ($, on) => {
	setup(on, fresh({ percent: undefined }));
	await start($);
	await turnStart($);
	await turnEnd($);
	expect(await strip($)).not.toContain("kontext");
});

test("2 hours of work: a break hint once per 2 hours", async ($, on) => {
	const clock = setup(on, fresh());
	await start($);
	await turnStart($);
	expect(await strip($)).not.toContain("pauzu");
	await clock.advance(2 * 3_600_000);
	await turnStart($);
	expect(await strip($)).toContain("2 h práce — dej si pauzu ☕");
	await turnStart($);
	expect(await strip($)).not.toContain("pauzu");
	await clock.advance(30 * 60_000);
	await turnStart($);
	expect(await strip($)).not.toContain("pauzu");
});

test("a commit congratulates, until the next turn", async ($, on) => {
	setup(on, fresh());
	await start($);
	await bash($, "git commit -m x");
	expect(await strip($)).toContain("commit je venku");
	await turnStart($);
	expect(await strip($)).not.toContain("commit je venku");
});

test("a more important hint wins over a congratulation, not the other way", async ($, on) => {
	setup(on, fresh());
	await start($);
	await bash($, "make FAIL");
	await bash($, "make FAIL");
	await bash($, "make FAIL");
	await bash($, "git commit -m x");
	expect(await strip($)).toContain("3× stejná chyba");
	expect(await strip($)).not.toContain("commit je venku");
});

test("mute: no hint on the strip, the head stays; unmuting shows it again", async ($, on) => {
	setup(on, fresh());
	await start($);
	await run($, "mute on");
	await bash($, "git commit -m x");
	const muted = await strip($);
	expect(muted).not.toContain("commit je venku");
	expect(muted).toContain("🎉");
	await run($, "mute off");
	expect(await strip($)).toContain("commit je venku");
});
