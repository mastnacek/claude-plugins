// translate.ts — the pure parts; the question itself is exercised through the slices that use it
// (write-gate, uma-command, immune) with a faked network.

import { expect, test } from "claude-code/testing";
import { splitSegments, whyNot } from "./translate";

test("the answer is split back into the parts that were sent", () => {
	expect(splitSegments("<<<UMA-1>>>\nA\n<<<UMA-2>>>\nB\nb2\n", 2)).toEqual(["A", "B\nb2"]);
	expect(splitSegments("<<<UMA-1>>>\nA", 1)).toEqual(["A"]);
});

test("broken markers, a wrong count, an order swap or an empty part are not accepted", () => {
	expect(splitSegments("A\nB", 2)).toBeUndefined();
	expect(splitSegments("<<<UMA-1>>>\nA", 2)).toBeUndefined();
	expect(splitSegments("<<<UMA-2>>>\nA\n<<<UMA-1>>>\nB", 2)).toBeUndefined();
	expect(splitSegments("<<<UMA-1>>>\n\n<<<UMA-2>>>\nB", 2)).toBeUndefined();
	expect(splitSegments("intro\n<<<UMA-1>>>\nA", 1)).toBeUndefined();
});

test("a failure is told in words, never with a request or a key", () => {
	expect(whyNot("no-key")).toBe("chybí klíč OpenRouteru");
	expect(whyNot("timeout")).toBe("vypršel čas");
	expect(whyNot("empty")).toBe("prázdná odpověď");
	expect(whyNot("HTTP 429")).toBe("OpenRouter HTTP 429");
	expect(whyNot("error")).toBe("chyba spojení");
});
