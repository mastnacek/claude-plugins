import { expect, test } from "claude-code/testing";
import { APPROVE, REJECT } from "../../shared/proposal";
import { EDIT_DRAFT, SKIP_DRAFT, approveArgv, discardArgv, isDraftId, parseDrafts, proposalOf, questionOf, renderList, renderShow, reviewSummary } from "./policy";

const RAW = JSON.stringify([
	{ id: "01AAA", status: "draft", confidence: 0.7, provenance: { trigger_type: "user_correction" }, fact: { id: "01AAA", scope: { Project: "app" }, fact_type: "Preference", title: "Použij logger", body: "### Rule\nbez console.log", tags: ["guidance"], template: null } },
	{ id: "01BBB", confidence: 0.8, provenance: { trigger_type: "muscle_synthesis" }, fact: { scope: "Global", fact_type: "Skill", title: "muscle:x", body: "b", tags: [], template: "[{}]" } },
	{ nonsense: true },
]);

test("drafts are read from the engine's JSON; scope object or string, type lower-cased, junk skipped", () => {
	const drafts = parseDrafts(RAW);
	expect(drafts.map((d) => [d.id, d.scope, d.type, d.trigger, d.template])).toEqual([
		["01AAA", "app", "preference", "user_correction", ""],
		["01BBB", "Global", "skill", "muscle_synthesis", "[{}]"],
	]);
	expect(parseDrafts("nope")).toEqual([]);
	expect(parseDrafts("{}")).toEqual([]);
});

test("approve passes only the fields that changed, as --key=value; discard is bare", () => {
	const orig = { title: "T", body: "B" };
	expect(approveArgv("01A", orig, orig)).toEqual(["uma", "staging", "approve", "01A"]);
	expect(approveArgv("01A", { title: "-T2", body: "B" }, orig)).toEqual(["uma", "staging", "approve", "01A", "--title=-T2"]);
	expect(approveArgv("01A", { title: "T2", body: "B2" }, orig).slice(4)).toEqual(["--title=T2", "--body=B2"]);
	expect(discardArgv("01A")).toEqual(["uma", "staging", "discard", "01A"]);
});

test("a draft becomes the shared dialog's proposal and question; the engine's approve cannot take tags or scope, so the dialog has no such options", () => {
	const [d] = parseDrafts(RAW);
	if (!d) throw new Error("no draft");
	const v = proposalOf(d, "app");
	expect(v).toMatchObject({ title: "Použij logger", scope: "app", initialScope: "app", type: "preference", supersedes: null });
	const q = questionOf(d, v, 0, 2);
	expect(q.split("\n")[0]).toBe("📝 UMA • Koncept 1 z 2 • spouštěč user_correction • jistota 70 %");
	expect(q).toContain("📌 Název\n  Použij logger");
	expect(q).toContain("bez console.log");
	expect([APPROVE, EDIT_DRAFT, SKIP_DRAFT, REJECT]).toHaveLength(4);
	expect(EDIT_DRAFT).not.toContain("tagy");
});

test("texts of the commands: list, show, summary, id guard", () => {
	const drafts = parseDrafts(RAW);
	expect(renderList(drafts).split("\n")[0]).toBe("Koncepty: 2 čeká na /uma review (výpis ukázán uživateli)");
	expect(renderList(drafts)).toContain("1. [preference] Použij logger (70 %, user_correction)  01AAA");
	expect(renderList([])).toBe("Žádné koncepty ke kontrole v .uma/.staging/");
	const shown = renderShow(drafts[1] as never);
	expect(shown).toContain("šablona (nespouští se): [{}]");
	expect(shown).toContain("tagy: (žádné)");
	expect(reviewSummary({ approved: 1, discarded: 2, skipped: 3, failed: 0 }, false)).toBe("Kontrola konceptů dokončena: 1 schváleno, 2 zahozeno, 3 ponecháno.");
	expect(reviewSummary({ approved: 0, discarded: 0, skipped: 2, failed: 1 }, true)).toContain("přerušena");
	expect(isDraftId("01M747H6WA2S08FEVNJ4B2NK9E")).toBe(true);
	expect(isDraftId("--all")).toBe(false);
	expect(isDraftId(undefined)).toBe(false);
});
