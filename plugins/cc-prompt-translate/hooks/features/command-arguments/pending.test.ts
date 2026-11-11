import { expect, test } from "claude-code/testing";
import { pendingFor } from "./pending";
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

test("origin outside composer/bridge does not", () => {
	expect(pendingFor(config, { ...run, originKind: "hook" })).toBeNull();
});
