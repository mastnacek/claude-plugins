import { expect, test } from "claude-code/testing";
import { completions } from "./complete";

const texts = (text: string, token: string) => completions(text, token).map((s) => s.text);

test("/watch completes the subcommand, then the rule id, the action and --global", () => {
	expect(texts("/watch ", "")).toEqual(["report", "rules", "rule"]);
	expect(texts("/watch ru", "ru")).toEqual(["rules", "rule"]);
	expect(texts("/watch rule W2", "W2")).toEqual(["W20", "W21", "W26", "W28", "W29"]);
	expect(texts("/watch rule W29 ", "")).toEqual(["on", "off", "report", "block"]);
	expect(texts("/watch rule W29 block ", "")).toEqual(["--global"]);
	expect(texts("/watch report ", "")).toEqual(["last", "all"]);
});

test("anything else is left to other plugins", () => {
	expect(texts("/uma rule ", "")).toEqual([]);
	expect(texts("/watch rules x", "x")).toEqual([]);
});
