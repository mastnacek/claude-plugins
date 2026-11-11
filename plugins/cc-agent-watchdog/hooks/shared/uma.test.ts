import { expect, test } from "claude-code/testing";
import { factCount, factsAt, factsLine, parseUmaContext, sidecarPath } from "./uma";

test("factCount declines: 1 fakt, 2–4 fakty, 0 and 5+ faktů", () => {
	expect([0, 1, 2, 4, 5, 11, 21].map(factCount)).toEqual(["0 faktů", "1 fakt", "2 fakty", "4 fakty", "5 faktů", "11 faktů", "21 faktů"]);
});

test("the sidecar sits beside the ledger", () => {
	expect(sidecarPath("/d/main/2026-01-05_coder_abcd1234.jsonl")).toBe("/d/main/2026-01-05_coder_abcd1234.uma.jsonl");
	expect(sidecarPath("C:\\r\\main\\2026-01-05_coder_abcd1234.jsonl")).toBe("C:\\r\\main\\2026-01-05_coder_abcd1234.uma.jsonl");
});

test("parse keeps uma-context lines only; torn and foreign lines are skipped", () => {
	const text = [`{"ts":5,"kind":"uma-context","source":"recall","factIds":["A","B",3,""]}`, "{broken", `{"ts":6,"kind":"other","factIds":["X"]}`, `{"kind":"uma-context","factIds":["Y"]}`, ""].join("\n");
	expect(parseUmaContext(text)).toEqual([{ ts: 5, source: "recall", factIds: ["A", "B"] }]);
});

test("factsAt: distinct ids delivered up to the moment", () => {
	const ctx = [{ ts: 1, source: "rules", factIds: ["A", "B"] }, { ts: 5, source: "recall", factIds: ["B", "C"] }];
	expect(factsAt(ctx, 3)).toEqual(["A", "B"]);
	expect(factsAt(ctx, 5)).toEqual(["A", "B", "C"]);
	expect(factsAt(ctx)).toEqual(["A", "B", "C"]);
});

test("factsLine: id8, at most six, then (+N)", () => {
	expect(factsLine([])).toBe("🧠 fakty v kontextu: žádné");
	expect(factsLine(["01M744E20JKEEJRA61M6Z11NBV", "01M744E3AAAA"])).toBe("🧠 fakty v kontextu: 01M744E2, 01M744E3");
	expect(factsLine(Array.from({ length: 8 }, (_, i) => `ID00000${i}XXXX`))).toBe("🧠 fakty v kontextu: ID000000, ID000001, ID000002, ID000003, ID000004, ID000005 (+2)");
});
