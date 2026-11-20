import { expect, test } from "claude-code/testing";
import { groupByFile, kindColor, plainList, shortPath } from "../../shared/findings";

const at = (path: string, line: number, column: number, kind: string) => ({ path, line, column, kind, rule: "vault", chars: 8 });

test("findings are grouped once per file, sorted, with short paths", () => {
	const groups = groupByFile(
		[at("D:\\w\\b.txt", 3, 1, "name"), at("D:\\w\\a.txt", 9, 2, "password"), at("D:\\w\\a.txt", 2, 5, "email"), at("/other/c.txt", 1, 1, "name")],
		"D:/w",
	);
	expect(groups.map((g) => g.path)).toEqual(["/other/c.txt", "a.txt", "b.txt"]);
	expect(groups[1]?.lines.map((l) => l.line)).toEqual([2, 9]);
	expect(shortPath("D:\\w\\sub\\x.txt", "D:\\w\\")).toBe("sub/x.txt");
});

test("kinds get their colors", () => {
	expect(kindColor("password")).toBe("error");
	expect(kindColor("secret")).toBe("error");
	expect(kindColor("name")).toBe("warning");
	expect(kindColor("email")).toBe("suggestion");
	expect(kindColor("ip")).toBe("permission");
});

test("the plain list names each file once and holds no values", () => {
	const text = plainList(groupByFile([at("/w/a.txt", 1, 1, "password"), at("/w/a.txt", 2, 1, "name")], "/w"));
	expect(text.match(/a\.txt/g)?.length).toBe(1);
	expect(text).toContain("password");
	expect(text).toContain("8 znaků");
});
