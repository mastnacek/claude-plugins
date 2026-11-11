import { expect, test } from "claude-code/testing";
import { failedRun, isQuery, missingBinary, planQuery } from "./queries";

const argv = (sub: Parameters<typeof planQuery>[0], args: string[]) => {
	const plan = planQuery(sub, args);
	return "argv" in plan ? plan.argv : plan.usage;
};

test("each subcommand builds its argv", () => {
	expect(argv("search", ["jak", "řešit", "VSA"])).toEqual(["uma", "search", "--", "jak řešit VSA"]);
	expect(argv("list", [])).toEqual(["uma", "list"]);
	expect(argv("list", ["global"])).toEqual(["uma", "list", "--scope", "global"]);
	expect(argv("read", ["01ABC"])).toEqual(["uma", "read", "--", "01ABC"]);
	expect(argv("timeline", [])).toEqual(["uma", "timeline"]);
	expect(argv("timeline", ["--all"])).toEqual(["uma", "timeline", "--all"]);
	expect(argv("timeline", ["--id", "01ABC", "--all"])).toEqual(["uma", "timeline", "--id", "01ABC", "--all"]);
	expect(argv("doctor", [])).toEqual(["uma", "doctor"]);
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

test("a listing is a summary line followed by the full output; one-sentence commands stay one line", () => {
	const list = planQuery("list", []);
	expect("render" in list && list.render("a\nb\n")).toBe("Fakta: 2 řádků výpisu (ukázán uživateli)\na\nb");
	expect("render" in list && list.render("")).toBe("Fakta: nic nenalezeno");
	const reindex = planQuery("reindex", []);
	expect("render" in reindex && reindex.render("lots\nof\noutput")).toBe("Index UMA byl přebudován.");
	const exp = planQuery("export", ["--out", "o"]);
	expect("render" in exp && exp.render("x")).toContain("zapsán do o");
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
	expect("render" in plan && plan.render("garbage")).toBe("uma debt list vrátila nečitelnou odpověď");
});
