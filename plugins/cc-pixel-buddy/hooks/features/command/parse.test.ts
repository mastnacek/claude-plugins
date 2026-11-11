import { expect, test } from "claude-code/testing";
import { completions, parse } from "./parse";

test("arguments", () => {
	expect(parse("")).toEqual({ kind: "status" });
	expect(parse("  open ")).toEqual({ kind: "open" });
	expect(parse("close")).toEqual({ kind: "close" });
	expect(parse("mute on")).toEqual({ kind: "mute", on: true });
	expect(parse("MUTE off")).toEqual({ kind: "mute", on: false });
	for (const bad of ["mute", "mute maybe", "open now", "feed", "mute on please"]) expect(parse(bad)).toEqual({ kind: "usage" });
});

test("completion of /buddy arguments", () => {
	expect(completions("/buddy ", "").map((s) => s.text)).toEqual(["open", "close", "mute"]);
	expect(completions("/buddy m", "m").map((s) => s.text)).toEqual(["mute"]);
	expect(completions("/buddy mute ", "").map((s) => s.text)).toEqual(["on", "off"]);
	expect(completions("/buddy mute on ", "")).toEqual([]);
	expect(completions("/other ", "")).toEqual([]);
});
