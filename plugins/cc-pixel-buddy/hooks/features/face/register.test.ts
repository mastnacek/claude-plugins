// face drawing: the strip above the prompt (3 rows, also at 60 columns) and the panel.

import { expect, test } from "claude-code/testing";
import { big, mini } from "./art";
import { bash, edit, fresh, mount, setup, start, turnStart } from "../../shared/world";

const band = (over: Record<string, unknown> = {}) => ({ hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 10 }, view: {}, ...over });
const PANE = { title: "Buddy", isFocused: false, bodyColumns: 40, placement: "dock", scroll: { offset: 0, bodyRows: 20 }, view: {} };

test("nothing to say: the strip is a round frame with the head, the mood and today's turns", async ($, on) => {
	setup(on, fresh());
	await start($);
	await turnStart($);
	const ui = await mount($, "AbovePrompt", band({ bodyColumns: 60 }));
	const frame = await ui.find({ type: "Box" } as never);
	expect(frame?.props).toMatchObject({ borderStyle: "round", borderColor: "claude" });
	expect((await ui.find({ type: "Text", text: /^\[•…•\] 🤔 přemýšlí$/ } as never))?.props).toMatchObject({ bold: true });
	expect(await ui.find({ type: "Text", text: / · dnes 1 tahů/ } as never)).toBeDefined();
	await ui.unmount();
});

test("a hint takes the place of the numbers, in the colour of its meaning", async ($, on) => {
	setup(on, fresh());
	await start($);
	await bash($, "make FAIL");
	await bash($, "make FAIL");
	await bash($, "make FAIL");
	const ui = await mount($, "AbovePrompt", band());
	expect((await ui.find({ type: "Text", text: /^ · 3× stejná chyba — zkus jiný postup$/ } as never))?.props).toMatchObject({ color: "error" });
	expect(await ui.find({ type: "Text", text: /dnes/ } as never)).toBeUndefined();
	expect((await ui.find({ type: "Box" } as never))?.props).toMatchObject({ borderColor: "warning" });
	await ui.unmount();
});

test("the strip yields to a survey, and draws nothing before the first mood", async ($, on) => {
	setup(on, fresh());
	const early = await mount($, "AbovePrompt", band());
	expect(await early.find({ type: "Box" } as never)).toBeUndefined();
	await early.unmount();
	await start($);
	const ui = await mount($, "AbovePrompt", band({ hasSurvey: true }));
	expect(await ui.find({ type: "Box" } as never)).toBeUndefined();
	await ui.unmount();
});

test("the strip shows from the start with the default mood, framed to the band's width", async ($, on) => {
	setup(on, fresh());
	await start($);
	const ui = await mount($, "AbovePrompt", band({ bodyColumns: 60 }));
	expect((await ui.find({ type: "Box" } as never))?.props).toMatchObject({ borderStyle: "round", width: 60 });
	expect(await ui.find({ type: "Text", text: /^\[•_•\] 🙂 v klidu$/ } as never)).toBeDefined();
	await ui.unmount();
});

test("a band under 3 rows gets one bare row, no frame", async ($, on) => {
	setup(on, fresh());
	await start($);
	for (const maxRows of [1, 2]) {
		const ui = await mount($, "AbovePrompt", band({ maxRows }));
		expect(await ui.find({ type: "Box" } as never)).toBeUndefined();
		expect(await ui.find({ type: "Text", text: /^\[•_•\] 🙂 v klidu$/ } as never)).toBeDefined();
		await ui.unmount();
	}
});

test("a narrow panel drops the big head and truncates its rows", async ($, on) => {
	setup(on, fresh());
	await start($);
	const ui = await mount($, "Pane", { ...PANE, bodyColumns: 16 }, "buddy");
	expect((await ui.find({ type: "Box" } as never))?.props).toMatchObject({ width: 16 });
	expect(await ui.find({ type: "Text", text: big("neutral")[0] } as never)).toBeUndefined();
	expect((await ui.find({ type: "Text", text: /tahy 0/ } as never))?.props).toMatchObject({ wrap: "truncate-end" });
	await ui.unmount();
});

test("the panel: big head, mood, today's numbers, the hint", async ($, on) => {
	setup(on, fresh());
	await start($);
	await edit($, "/a.ts");
	await bash($, "git commit -m x");
	const ui = await mount($, "Pane", PANE, "buddy");
	expect((await ui.find({ type: "Box" } as never))?.props).toMatchObject({ borderStyle: "round", borderColor: "success" });
	for (const row of big("party")) expect((await ui.find({ type: "Text", text: row } as never))?.text).toBe(row);
	expect(await ui.find({ type: "Text", text: "🎉 slaví" } as never)).toBeDefined();
	expect(await ui.find({ type: "Text", text: /✏️ +úpravy souborů 1/ } as never)).toBeDefined();
	expect(await ui.find({ type: "Text", text: "📦 commity 1" } as never)).toBeDefined();
	expect(await ui.find({ type: "Text", text: /💬 commit je venku/ } as never)).toBeDefined();
	await ui.unmount();
});

test("every face has a head of the same size", () => {
	for (const f of ["neutral", "happy", "worried", "party", "asleep", "thinking"] as const) {
		expect(mini(f)).toHaveLength(5);
		expect(big(f).map((r) => r.length)).toEqual([13, 13, 13, 13, 13]);
	}
});
