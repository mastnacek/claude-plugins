import { expect, test } from "claude-code/testing";
import { argsAreProse, pendingFor } from "./pending";
import type { TranslateConfig } from "../../shared/types";

const config = { enabled: true, targetLanguage: "Czech", translateResponses: true } as TranslateConfig;
const run = { command: "cc-reverse-spec:reverse-spec", originKind: "composer", source: "plugin" };
const expected = { targetLanguage: "Czech", translateResponses: true };

test("plugin and user commands set pending", () => {
	expect(pendingFor(config, run)).toEqual(expected);
	expect(pendingFor(config, { ...run, source: "user" })).toEqual(expected);
	expect(pendingFor(config, { ...run, originKind: "bridge" })).toEqual(expected);
});

test("built-in or unknown command does not", () => {
	expect(pendingFor(config, { ...run, source: "builtin" })).toBeNull();
	expect(pendingFor(config, { ...run, source: undefined })).toBeNull();
});

test("disabled plugin does not", () => {
	expect(pendingFor({ ...config, enabled: false }, run)).toBeNull();
});

test("own command does not", () => {
	expect(pendingFor(config, { ...run, command: "prompt-translate", source: "plugin" })).toBeNull();
});

test("origin outside composer/bridge does not", () => {
	expect(pendingFor(config, { ...run, originKind: "hook" })).toBeNull();
});

test("skill arguments are prose; a plugin's code command reads exact values", () => {
	expect(argsAreProse(run), "plugin:skill").toBe(true);
	expect(argsAreProse({ ...run, command: "my-command", source: "user" }), "the person's own command").toBe(true);
	expect(argsAreProse({ ...run, command: "tts", source: "plugin" }), "/tts help").toBe(false);
	expect(argsAreProse({ ...run, command: "spec-check", source: "plugin" }), "/spec-check").toBe(false);
	expect(argsAreProse({ ...run, command: "prompt-translate", source: "plugin" }), "own command").toBe(false);
	expect(argsAreProse({ ...run, source: "builtin" }), "built-in").toBe(false);
	expect(argsAreProse({ ...run, originKind: "hook" }), "not typed by the person").toBe(false);
});
