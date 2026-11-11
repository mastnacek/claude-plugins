import { expect, test } from "claude-code/testing";
import { failedRun, isQuery, missingBinary, planQuery } from "./queries";

const argv = (sub: Parameters<typeof planQuery>[0], args: string[]) => {
	const plan = planQuery(sub, args);
	return "argv" in plan ? plan.argv : plan.usage;
};

test("each subcommand builds its argv", () => {
	expect(argv("search", ["jak", "řešit", "VSA"])).toEqual(["uma", "search", "--json", "--", "jak řešit VSA"]);
	expect(argv("list", [])).toEqual(["uma", "list", "--json"]);
	expect(argv("list", ["global"])).toEqual(["uma", "list", "--json", "--scope", "global"]);
	expect(argv("read", ["01ABC"])).toEqual(["uma", "read", "--json", "--", "01ABC"]);
	expect(argv("timeline", [])).toEqual(["uma", "timeline", "--json"]);
	expect(argv("timeline", ["--all"])).toEqual(["uma", "timeline", "--json", "--all"]);
	expect(argv("timeline", ["--id", "01ABC", "--all"])).toEqual(["uma", "timeline", "--json", "--id", "01ABC", "--all"]);
	expect(argv("doctor", [])).toEqual(["uma", "doctor", "--json"]);
	expect(argv("reindex", [])).toEqual(["uma", "search", "", "--reindex"]);
	expect(argv("export", ["--out", "/tmp/o"])).toEqual(["uma", "export", "--okf", "--out", "/tmp/o"]);
});

test("missing or surplus arguments give the usage, never a process", () => {
	expect(argv("search", [])).toContain("Použití");
	expect(argv("list", ["a", "b"])).toContain("Použití");
	expect(argv("list", ["--scope"])).toContain("Použití");
	expect(argv("read", [])).toContain("Použití");
	expect(argv("read", ["--json"])).toContain("Použití");
	expect(argv("timeline", ["--id"])).toContain("Použití");
	expect(argv("timeline", ["--zombies"])).toContain("Použití");
	expect(argv("export", [])).toContain("Použití");
	expect(argv("export", ["--out"])).toContain("Použití");
	expect(argv("export", ["--out", "x", "--json"])).toContain("Použití");
});

test("doctor takes no flags: --confirm would archive facts", () => {
	expect(argv("doctor", ["--confirm"])).toContain("Použití");
});

test("a listing answers a model line and data for the person; one-sentence commands are one framed line", () => {
	const list = planQuery("list", []);
	const facts = JSON.stringify([{ id: "01A", title: "A", fact_type: "Task", scope: "project:x", tags: [] }, { id: "01B", title: "B", fact_type: "Decision", scope: "global", tags: [] }]);
	const listed = "render" in list ? list.render(facts) : undefined;
	expect(listed?.text).toBe("Fakta: 2 fakty (výpis ukázán uživateli)");
	expect(listed?.out?.items).toHaveLength(2);
	expect("render" in list && list.render("[]").text).toBe("Fakta: nic nenalezeno");
	const reindex = planQuery("reindex", []);
	expect("render" in reindex && reindex.render("lots\nof\noutput")).toEqual({ text: "Index UMA byl přebudován.", out: { title: "reindex", tone: "success", lines: [{ text: "Index UMA byl přebudován.", tone: "success" }] } });
	const exp = planQuery("export", ["--out", "o"]);
	expect("render" in exp && exp.render("x").text).toContain("zapsán do o");
});

test("helpers", () => {
	expect(isQuery("doctor")).toBe(true);
	expect(isQuery("recall")).toBe(false);
	expect(missingBinary("spawn uma ENOENT")).toContain("github.com/mastnacek/claude-plugins");
	expect(failedRun("read", 1, "\nno such fact\nx")).toBe("uma read skončila kódem 1: no such fact");
});

test("debt: list reads the whole ledger as json, clear is a bare `uma debt clear`, anything else is usage", () => {
	expect(argv("debt", [])).toEqual(["uma", "debt", "list", "--all", "--json"]);
	expect(argv("debt", ["list"])).toEqual(["uma", "debt", "list", "--all", "--json"]);
	expect(argv("debt", ["clear"])).toEqual(["uma", "debt", "clear"]);
	expect(argv("debt", ["add"])).toBe("Použití: /uma debt [list|clear]");
	expect(argv("debt", ["clear", "x"])).toBe("Použití: /uma debt [list|clear]");
	expect(isQuery("debt")).toBe(true);
});

test("debt: unreadable list output is reported, not thrown", () => {
	const plan = planQuery("debt", ["list"]);
	const out = "render" in plan ? plan.render("garbage") : undefined;
	expect(out?.text).toBe("uma debt list vrátila nečitelnou odpověď");
	expect(out?.out?.tone).toBe("error");
});
