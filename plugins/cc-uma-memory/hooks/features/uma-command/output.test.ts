import { expect, test } from "claude-code/testing";
import { debtOutput, doctorOutput, failure, fromText, helpOutput, listOutput, plural, readOutput, searchOutput, timelineOutput, usage } from "./output";

const HIT = { fact_type: "task", file_path: "/x/y.md", id: "01M744E20JKEEJRA61M6Z11NBV", scope: "project:claude-plugins", score: 5.342742233796033, snippet: "…", status: "stable", supersedes: null, tags: ["cc-uma-memory", "write-gate"], title: "Prověřit: brána" };

test("search: hits become items with type, scope, id, tags, score; the model gets one counted line", () => {
	const r = searchOutput("write-gate", JSON.stringify({ degraded: false, hits: [HIT], note: null }));
	expect(r.text).toBe("Hledání „write-gate“: 1 výsledek (výpis ukázán uživateli)");
	expect(r.out).toEqual({
		title: "hledání „write-gate“ · 1 výsledek",
		tone: "normal",
		items: [{ title: "Prověřit: brána", type: "task", scope: "project:claude-plugins", id: "01M744E20JKEEJRA61M6Z11NBV", tags: ["cc-uma-memory", "write-gate"], score: "5.343" }],
	});
});

test("search: nothing found, a degraded run and unreadable output", () => {
	expect(searchOutput("x", JSON.stringify({ degraded: false, hits: [], note: null }))).toEqual({ text: "Hledání „x“: nic nenalezeno", out: { title: "Hledání „x“ · nic nenalezeno", tone: "normal", lines: [{ text: "nic nenalezeno" }] } });
	const degraded = searchOutput("x", JSON.stringify({ degraded: true, hits: [HIT], note: "vektory nejsou" }));
	expect(degraded.out?.tone).toBe("warning");
	expect(degraded.out?.lines).toEqual([{ text: "vektory nejsou", tone: "warning" }]);
	const raw = searchOutput("x", "plain\ntext\n");
	expect(raw.text).toBe("Hledání „x“: 2 řádků výpisu (ukázán uživateli)");
	expect(raw.out?.lines).toEqual([{ text: "plain" }, { text: "text" }]);
});

test("list: facts with a scope object, a non-stable status becomes a badge", () => {
	const r = listOutput("Fakta", JSON.stringify([{ id: "01A", title: "A", fact_type: "Task", scope: { Project: "p" }, tags: [] }, { id: "01B", title: "B", fact_type: "decision", scope: "Global", status: "deprecated", tags: ["t"] }]));
	expect(r.text).toBe("Fakta: 2 fakty (výpis ukázán uživateli)");
	expect(r.out?.items?.[0]).toEqual({ title: "A", type: "task", scope: "project:p", id: "01A" });
	expect(r.out?.items?.[1]).toMatchObject({ scope: "global", tags: ["t"], badge: { text: "deprecated", tone: "dim" } });
	expect(listOutput("Fakta", "[]").text).toBe("Fakta: nic nenalezeno");
});

test("read: the whole body under the fact", () => {
	const r = readOutput("01A", JSON.stringify({ id: "01A", title: "T", fact_type: "Decision", scope: "Global", status: "Stable", tags: [], body: "řádek 1\nřádek 2" }));
	expect(r.text).toBe("Fakt 01A: T (výpis ukázán uživateli)");
	expect(r.out?.items?.[0]?.lines).toEqual(["řádek 1", "řádek 2"]);
	expect(r.out?.items?.[0]?.badge).toBeUndefined();
});

test("timeline: revisions flattened, the current one marked", () => {
	const chain = { current: "01B", length: 2, revisions: [{ id: "01A", title: "starý", status: "deprecated", revised_at: "2026-11-11T01:02:27Z", until: "2026-11-11T01:04:35Z" }, { id: "01B", title: "nový", status: "stable", revised_at: "2026-11-11T01:04:35Z", until: null }] };
	const r = timelineOutput(JSON.stringify([chain]));
	expect(r.text).toBe("Vývoj faktů: 1 řetěz, 2 revize (výpis ukázán uživateli)");
	expect(r.out?.items?.map((i) => i.badge)).toEqual([{ text: "deprecated", tone: "dim" }, { text: "aktuální", tone: "success" }]);
	expect(r.out?.items?.[0]?.lines).toEqual(["řetěz 1 · 2026-11-11 01:02 → 2026-11-11 01:04"]);
	expect(timelineOutput("[]").text).toBe("Vývoj faktů: nic nenalezeno");
});

test("doctor: checks are fields toned by level; the frame follows the worst", () => {
	const ok = { check: "store", detail: "/x", level: "ok", remedy: null };
	const warn = { check: "coverage", detail: "6 of 10", level: "warn", remedy: "reindex" };
	const fail = { check: "schema", detail: "old", level: "fail", remedy: null };
	const r = doctorOutput(JSON.stringify({ findings: [ok, warn] }));
	expect(r.out?.tone).toBe("warning");
	expect(r.out?.fields).toEqual([{ label: "store", value: "/x", tone: "success" }, { label: "coverage", value: "6 of 10", tone: "warning", hint: "→ reindex" }]);
	expect(doctorOutput(JSON.stringify({ findings: [ok, fail] })).out?.tone).toBe("error");
	expect(doctorOutput(JSON.stringify({ findings: [ok] })).out?.tone).toBe("success");
	expect(r.text).toBe("Zpráva uma doctor: 2 kontroly: 1 varování, 0 selhání (výpis ukázán uživateli)");
});

test("debt: the model line is the old summary; blocking warns, settled succeeds; unreadable is an error", () => {
	const debts = [
		{ id: "d1", sourceAction: "a", requiredAction: "b", blocking: true, origin: "cc", createdAt: "2026-11-11T09:12:00Z", settledAt: null },
		{ id: "d2", sourceAction: "c", requiredAction: "d", blocking: false, origin: "pi", createdAt: "2026-11-10T08:00:00Z", settledAt: "2026-11-10T09:00:00Z" },
	];
	const r = debtOutput(JSON.stringify(debts));
	expect(r.text).toBe("Dluhy: otevřených 1 (blokujících 1), vyrovnaných 1 (výpis ukázán uživateli)");
	expect(r.out?.tone).toBe("warning");
	expect(r.out?.items?.map((i) => i.badge)).toEqual([{ text: "BLOKUJÍCÍ", tone: "warning" }, { text: "vyrovnán 2026-11-10 09:00", tone: "success" }]);
	expect(debtOutput("[]").text).toBe("Dluhy: žádné");
	expect(debtOutput("garbage").out?.tone).toBe("error");
});

test("help, errors, usage, multi-line texts and plurals", () => {
	const help = helpOutput([["/uma help", "tato nápověda"]]);
	expect(help.text).toBe("/uma — paměť UMA");
	expect(help.out?.fields).toEqual([{ label: "/uma help", value: "tato nápověda" }]);
	expect(failure("boom").out).toEqual({ title: "chyba", tone: "error", lines: [{ text: "boom", tone: "error" }] });
	expect(usage("Použití: /uma x").out?.tone).toBe("warning");
	expect(fromText("one", () => undefined)).toEqual({ text: "one" });
	expect(fromText("head\nmore", () => "warning").out?.tone).toBe("warning");
	expect([plural(1, "fakt", "fakty", "faktů"), plural(3, "fakt", "fakty", "faktů"), plural(5, "fakt", "fakty", "faktů")]).toEqual(["1 fakt", "3 fakty", "5 faktů"]);
});
