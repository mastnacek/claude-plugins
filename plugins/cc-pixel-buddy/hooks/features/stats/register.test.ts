// stats through the engine: counts reach /buddy and the store; a new day starts over; an old stored shape is read safely.

import { expect, test } from "claude-code/testing";
import { bash, edit, fresh, run, setup, start, turnEnd, turnStart } from "../../shared/world";

test("a working day is counted, and /buddy tells it", async ($, on) => {
	setup(on, fresh());
	await start($);
	await turnStart($);
	await turnStart($, "sub1");
	await edit($, "/a.ts");
	await edit($, "/b.ts", "Write");
	await edit($, "/bad.ts");
	await bash($, "cargo test");
	await bash($, "cargo test FAIL");
	await bash($, "git commit -m x");
	await turnEnd($);
	const { text } = await run($, "");
	expect(text).toBe("Buddy: slaví, dnes 1 tahů, 2 chyb, 2 úprav, 1 commitů, testy 1✔/1✘");
});

test("the numbers are written through to the store", async ($, on) => {
	const w = fresh();
	setup(on, w);
	await start($);
	await turnStart($);
	await edit($, "/a.ts");
	expect(w.store.stats).toEqual({ day: "2026-01-05", turns: 1, toolErrors: 0, edits: 1, commits: 0, testsPass: 0, testsFail: 0 });
});

test("yesterday's record in the store is not today's", async ($, on) => {
	setup(on, fresh({ store: { stats: { day: "2026-01-04", turns: 40, toolErrors: 3, edits: 9, commits: 2, testsPass: 1, testsFail: 1 } } }));
	await start($);
	expect((await run($, "")).text).toContain("dnes 0 tahů, 0 chyb, 0 úprav, 0 commitů, testy 0✔/0✘");
});

test("today's record in the store survives a new session", async ($, on) => {
	setup(on, fresh({ store: { stats: { day: "2026-01-05", turns: 5, toolErrors: 1, edits: 2, commits: 0, testsPass: 3, testsFail: 0 } } }));
	await start($);
	expect((await run($, "")).text).toContain("dnes 5 tahů, 1 chyb, 2 úprav, 0 commitů, testy 3✔/0✘");
});

test("midnight passes in the middle of a session: the count starts over", async ($, on) => {
	const clock = setup(on, fresh());
	await start($);
	await turnStart($);
	await turnStart($);
	expect((await run($, "")).text).toContain("dnes 2 tahů");
	await clock.advance(13 * 3_600_000);
	await turnStart($);
	expect((await run($, "")).text).toContain("dnes 1 tahů");
});

test("an old shape of the stored record is read safely", async ($, on) => {
	setup(on, fresh({ store: { stats: { day: "2026-01-05", turns: "lots", edits: 4 } } }));
	await start($);
	expect((await run($, "")).text).toContain("dnes 0 tahů, 0 chyb, 4 úprav");
});
