// /buddy through the engine: status card, panel open / close (also when it does not fit), mute kept in the store.

import { expect, test } from "claude-code/testing";
import { bash, fresh, mount, run, setup, start } from "../../shared/world";

test("/buddy: one line for the model, a framed card for the person", async ($, on) => {
	setup(on, fresh());
	await start($);
	await bash($, "cargo test");
	const { text } = await run($, "");
	expect(text).toBe("Buddy: spokojený, dnes 0 tahů, 0 chyb, 0 úprav, 0 commitů, testy 1✔/0✘");
	expect(text).not.toContain("\n");
	const card = await mount($, "CommandOutput", { command: "buddy", isErrored: false, text });
	expect((await card.find({ type: "Box" } as never))?.props).toMatchObject({ borderStyle: "round", borderColor: "success" });
	expect(await card.find({ type: "Text", text: "🖥 Buddy · stav" } as never)).toBeDefined();
	expect(await card.find({ type: "Text", text: "😊 spokojený" } as never)).toBeDefined();
	expect(await card.find({ type: "Text", text: "🧪 testy ✔ 1 · ✘ 0" } as never)).toBeDefined();
	await card.unmount();
});

test("an output the plugin did not make is left to the engine", async ($, on) => {
	setup(on, fresh());
	await start($);
	const card = await mount($, "CommandOutput", { command: "buddy", isErrored: false, text: "something else" });
	expect(await card.find({ type: "Box" } as never)).toBeUndefined();
	await card.unmount();
});

test("open and close ask for the pane", async ($, on) => {
	const w = fresh();
	setup(on, w);
	await start($);
	expect((await run($, "open")).text).toBe("Panel je otevřený.");
	expect((await run($, "close")).text).toBe("Panel je zavřený.");
	expect(w.panes).toEqual(["open:buddy", "close:buddy"]);
});

test("a narrow window: the pane is not seated and the buddy says so; the strip stays", async ($, on) => {
	setup(on, fresh({ placed: false }));
	await start($);
	const { text } = await run($, "open");
	expect(text).toContain("Panel se nevešel — okno je úzké");
	const card = await mount($, "CommandOutput", { command: "buddy", isErrored: false, text: text as string });
	expect((await card.find({ type: "Box" } as never))?.props).toMatchObject({ borderColor: "warning" });
	expect(await card.find({ type: "Text", text: /⚠ panel se nevešel/ } as never)).toBeDefined();
	await card.unmount();
});

test("mute is kept in the store and read at the next start", async ($, on) => {
	const w = fresh({ store: { muted: true } });
	setup(on, w);
	await start($);
	expect((await run($, "")).text).toContain("hlášky vypnuté");
	expect((await run($, "mute off")).text).toBe("Hlášky jsou zapnuté.");
	expect(w.store.muted).toBe(false);
	await run($, "mute on");
	expect(w.store.muted).toBe(true);
	expect((await run($, "")).text).toContain("hlášky vypnuté");
});

test("a value an earlier version kept as `muted` is read as not muted", async ($, on) => {
	setup(on, fresh({ store: { muted: "yes" } }));
	await start($);
	expect((await run($, "")).text).not.toContain("hlášky vypnuté");
});

test("unknown arguments say how to use it; there is no feeding or petting", async ($, on) => {
	setup(on, fresh());
	await start($);
	for (const args of ["feed", "pet", "mute", "open wide"]) expect((await run($, args)).text).toBe("Použití: /buddy · /buddy open · /buddy close · /buddy mute on|off");
});
