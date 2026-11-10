import { describe, expect, test } from "claude-code/testing";
import { DEFAULT_CONFIG } from "../../shared/types";
import { buildHelpText, buildStatsText } from "./texts";

const tokens = { inputTokens: 1200, outputTokens: 340 };

describe("stats", () => {
	test("OpenRouter: cena, kredit a kurz v Kč, tokeny", () => {
		const text = buildStatsText({ tokens, costUsd: 0.0012, rate: 23.5, balance: { remaining: 2, total: 10, used: 8 } });
		expect(text).toContain("Cena:    $0.001200 (≈ 0.0282 Kč)");
		expect(text).toContain("Kredit:  $2.00 (≈ 47 Kč) z $10.00");
		expect(text).toContain("1 USD = 23.500 Kč");
		expect(text).toContain("in 1,200, out 340");
	});

	test("OpenRouter bez klíče: kredit nedostupný, zbytek zůstává", () => {
		const text = buildStatsText({ tokens, costUsd: 0, rate: 23.5, balance: null });
		expect(text).toContain("Kredit:  nedostupný");
		expect(text).toContain("Tokeny:");
	});

	test("Claude: jen tokeny, žádná cena ani kredit", () => {
		const text = buildStatsText({ tokens });
		expect(text).toContain("Model Claude");
		expect(text).not.toContain("Cena:");
		expect(text).not.toContain("Kredit:");
		expect(text).toContain("in 1,200, out 340");
	});
});

describe("help", () => {
	test("ukazuje úroveň reasoningu a nemá zrušené příkazy", () => {
		const text = buildHelpText({ ...DEFAULT_CONFIG, think: "medium" });
		expect(text).toContain("off|low|[medium]|high");
		for (const gone of ["status", "balance", "detect", "until"]) expect(text).not.toContain(gone);
	});
});
