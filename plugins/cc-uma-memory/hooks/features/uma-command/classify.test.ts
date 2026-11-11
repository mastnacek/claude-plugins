import { expect, test } from "claude-code/testing";
import { classify, styleOf, typeColor } from "./classify";

test("errors, warnings and successes are told apart, in Czech and English", () => {
	for (const t of ["uma read skončila kódem 3: no such fact", "Koncepty se nepodařilo načíst: boom", "Neznámý podpříkaz „x“", "Error: not a git repository", "operation failed", "Zamítnuto"]) expect(classify(t)).toBe("error");
	for (const t of ["BLOKUJÍCÍ", "otevřené blokující dluhy", "warning: stale index", "Kontrola konceptů přerušena"]) expect(classify(t)).toBe("warning");
	for (const t of ["Index UMA byl přebudován.", "vyrovnán 2026-11-10", "schváleno", "Cleared 2 debt(s).", "done", "✔ ok"]) expect(classify(t)).toBe("success");
});

test("a failure beats a success word in the same line", () => {
	expect(classify("schváleno, ale zápis selhal")).toBe("error");
});

test("ids, paths, numbers, commands and empty results", () => {
	expect(classify("01M744E20JKEEJRA61M6Z11NBV")).toBe("id");
	expect(classify("/home/jara/.claude/settings.json")).toBe("path");
	expect(classify("~/x/y")).toBe("path");
	expect(classify("0.016")).toBe("number");
	expect(classify("70 %")).toBe("number");
	expect(classify("12")).toBe("number");
	expect(classify("/uma search <dotaz>")).toBe("command");
	expect(classify("nic nenalezeno")).toBe("empty");
	expect(classify("Žádné koncepty ke kontrole v .uma/.staging/")).toBe("empty");
	expect(classify("No facts found.")).toBe("empty");
});

test("plain text and blanks have no meaning", () => {
	expect(classify("Prověřit: falešné poplachy brány")).toBeUndefined();
	expect(classify("   ")).toBeUndefined();
	expect(classify("uma read skončila")).toBeUndefined();
});

test("meaning → style uses theme names and icons; the fact type has its own colour", () => {
	expect(styleOf("error")).toEqual({ color: "error", icon: "❌" });
	expect(styleOf("warning")).toEqual({ color: "warning", icon: "⚠️" });
	expect(styleOf("success")).toEqual({ color: "success", icon: "✅" });
	expect(styleOf("id")).toEqual({ dim: true });
	expect(styleOf("number")).toEqual({ color: "permission", bold: true });
	expect(styleOf("command")).toEqual({ color: "suggestion" });
	expect(styleOf(undefined)).toEqual({});
	expect(typeColor("task")).toBe("planMode");
	expect(typeColor("Decision")).toBe("permission");
	expect(typeColor("whatever")).toBe("subtle");
});
