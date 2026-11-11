import { expect, test } from "claude-code/testing";
import { appended, parseLog, statsOut, statsText, summarize } from "./log";

test("log: junk dropped, capped, summarized like pi", () => {
	expect(parseLog("x")).toEqual([]);
	expect(parseLog([{ ts: "t", approved: true }, { approved: "yes" }, null])).toEqual([{ ts: "t", approved: true }]);
	let log = parseLog([]);
	for (let i = 0; i < 510; i++) log = appended(log, { ts: String(i), approved: true });
	expect(log).toHaveLength(500);
	expect(log[0]?.ts).toBe("10");
	const s = summarize([
		{ ts: "1", relation: "unrelated", approved: true },
		{ ts: "2", relation: "unrelated", approved: false },
		{ ts: "3", relation: "violates", approved: false },
		{ ts: "4", relation: "violates", approved: true },
		{ ts: "5", approved: true },
	]);
	expect(s).toEqual({ total: 5, yesRecommended: 2, yesApproved: 1, noRecommended: 2, noBlocked: 1 });
	expect(statsText(s)).toContain("5 celkem");
	expect(statsText(summarize([]))).toContain("Zatím žádná");
});

test("stats as data: fields for the person, a framed sentence when the log is empty", () => {
	expect(statsOut(summarize([])).lines?.[0]?.text).toContain("Zatím žádná");
	const out = statsOut({ total: 5, yesRecommended: 2, yesApproved: 1, noRecommended: 2, noBlocked: 1 });
	expect(out.fields).toEqual([
		{ label: "rozhodnutí celkem", value: "5" },
		{ label: "doporučeno Ano", value: "2 (schválil jsi 1)" },
		{ label: "doporučeno Ne", value: "2 (zablokoval jsi 1)" },
	]);
});
