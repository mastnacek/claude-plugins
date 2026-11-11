import { expect, test } from "claude-code/testing";
import { APPROVE, EDIT, REJECT, approvedInput, fieldQuestion, fullTextQuestion, normalizeScope, parseTags, previewOf, scopeOption, toggleScope, withField, wrap } from "./proposal";
import type { Proposal } from "./proposal";
import { optionOf } from "./dialog";

const base: Proposal = {
	title: "Použít VSA", body: "Tělo", tags: ["a", "b"], type: "decision", scope: "proj", initialScope: "proj", projectName: "proj",
	supersedes: null, since: "", staleAfter: "", template: "",
};

test("main dialog options are exactly the agreed texts", () => {
	expect([APPROVE, EDIT, scopeOption(base), REJECT]).toEqual([
		"✅ Schválit a uložit do paměti",
		"✏️ Upravit (název, obsah, tagy, celý text)",
		"🔄 Přepnout rozsah ➔ 🌐 globální",
		"❌ Zamítnout a zahodit",
	]);
	expect(scopeOption({ ...base, scope: "global" })).toBe("🔄 Přepnout rozsah ➔ 📁 proj");
});

test("preview: header, chips, title, body", () => {
	const text = previewOf(base).split("\n");
	expect(text[0]).toBe("🧠 UMA • Návrh zápisu do paměti");
	expect(text).toContain("⚖️  DECISION   📁 Projekt (proj)");
	expect(text).toContain("🏷️  Tagy: #a #b");
	expect(text).toContain("📌 Název");
	expect(text).toContain("  Použít VSA");
	expect(text).toContain("📄 Obsah");
	expect(text).toContain("    Tělo");
	expect(previewOf({ ...base, tags: [], scope: "global" })).toContain("🌐 Globální (všechny projekty)");
	expect(previewOf({ ...base, tags: [] })).toContain("🏷️  Tagy: (žádné tagy)");
	expect(previewOf({ ...base, supersedes: "01OLD" }).split("\n")[0]).toBe("🔁 UMA • Návrh nahrazení faktu 01OLD");
});

test("preview shows eight body lines then '… (+N řádků)'", () => {
	const body = Array.from({ length: 20 }, (_, i) => `r${i}`).join("\n");
	const lines = previewOf({ ...base, body }).split("\n");
	expect(lines.filter((l) => /^ {4}r\d+$/.test(l))).toHaveLength(8);
	expect(lines).toContain("    … (+12 řádků)");
	expect(previewOf({ ...base, body: "krátké" })).not.toContain("…");
});

test("field and full-text questions carry the current value", () => {
	expect(fieldQuestion(base, "title")).toContain("Upravit název:");
	expect(fieldQuestion(base, "title")).toContain("Použít VSA");
	expect(fieldQuestion(base, "tags")).toContain("a, b");
	expect(fieldQuestion(base, "body")).toContain("Upravit obsah (Markdown):");
	expect(fullTextQuestion({ ...base, body: "celé\ntělo" })).toContain("celé\ntělo");
});

test("typed text sets a field; empty title/body is ignored; tags are comma separated", () => {
	expect(withField(base, "title", " Nový ").title).toBe("Nový");
	expect(withField(base, "title", "  ").title).toBe("Použít VSA");
	expect(withField(base, "body", "a\nb").body).toBe("a\nb");
	expect(withField(base, "tags", "x, y ,, z").tags).toEqual(["x", "y", "z"]);
	expect(withField(base, "tags", "").tags).toEqual([]);
});

test("wrap, scope and tags helpers; approvedInput", () => {
	expect(wrap("aaaa bbbb cccc", 9)).toEqual(["aaaa bbbb", "cccc"]);
	expect(wrap("abcdefghij", 4)).toEqual(["abcd", "efgh", "ij"]);
	expect(normalizeScope("project", "p")).toBe("p");
	expect(normalizeScope("", "p")).toBe("p");
	expect(normalizeScope("GLOBAL", "p")).toBe("global");
	expect(normalizeScope("mozek_rust", "p")).toBe("mozek_rust");
	expect(toggleScope("global", "p")).toBe("p");
	expect(toggleScope("p", "p")).toBe("global");
	expect(parseTags(" a, b ,, c ")).toEqual(["a", "b", "c"]);
	expect(approvedInput({ title: "t", body: "b", scope: "project" }, { ...base, title: "T", body: "B", tags: [] })).toEqual({ title: "T", body: "B", scope: "project" });
	expect(approvedInput({ title: "t", body: "b" }, { ...base, scope: "global" }).scope).toBe("global");
	expect(approvedInput({ title: "t", body: "b", scope: "global" }, { ...base, scope: "proj", initialScope: "global" }).scope).toBe("proj");
});

test("a pick handed back without its variation selector still names the option", () => {
	expect(optionOf("✏ Upravit (název, obsah, tagy, celý text)", [APPROVE, EDIT, REJECT])).toBe(EDIT);
	expect(optionOf("vlastní text", [APPROVE, EDIT])).toBe("vlastní text");
});
