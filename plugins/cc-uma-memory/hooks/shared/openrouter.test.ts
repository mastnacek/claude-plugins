// openrouter.ts — the pure parts. complete() itself needs the engine host and is exercised
// through the immune slice (features/immune/register.test.ts) with a faked network.

import { expect, test } from "claude-code/testing";
import { keyFromAuthFile, textOfCompletion } from "./openrouter";

test("pi's auth file: oauth access until it expires, a plain key, nothing else", () => {
	const now = 1_000_000_000_000;
	expect(keyFromAuthFile(JSON.stringify({ openrouter: { type: "oauth", access: "a", expires: now + 1 } }), now)).toBe("a");
	expect(keyFromAuthFile(JSON.stringify({ openrouter: { type: "oauth", access: "a", expires: now - 1 } }), now)).toBeUndefined();
	expect(keyFromAuthFile(JSON.stringify({ openrouter: { type: "oauth", access: "a", expires: (now - 5000) / 1000 } }), now)).toBeUndefined();
	expect(keyFromAuthFile(JSON.stringify({ openrouter: { type: "oauth", access: "a" } }), now)).toBe("a");
	expect(keyFromAuthFile(JSON.stringify({ openrouter: { key: "k" } }), now)).toBe("k");
	expect(keyFromAuthFile(JSON.stringify({ anthropic: { key: "k" } }), now)).toBeUndefined();
	expect(keyFromAuthFile("junk", now)).toBeUndefined();
});

test("answer text out of a chat-completions body", () => {
	expect(textOfCompletion('{"choices":[{"message":{"content":"hi"}}]}')).toBe("hi");
	expect(textOfCompletion('{"choices":[]}')).toBeUndefined();
	expect(textOfCompletion("x")).toBeUndefined();
});

