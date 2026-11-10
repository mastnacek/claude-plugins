/**
 * Degraded translations: when the model call fails, translate() returns the
 * ORIGINAL unmasked text and flags it. The point is that a masked string has no
 * path out — the two exits are a restored translation, or clean input.
 */
import { describe, expect, test as it } from "claude-code/testing";
import { protectPromptSegments, restoreProtectedSegments } from "./protect";
import type { TranslationResult } from "./translate";

const original = [
  "Uprav prosím D:/repo/src/plugin.ts aby šlo do buildu.",
  "",
  "| ID | Platí |",
  "| --- | --- |",
  "| `a-1` | ano |",
].join("\n");

function degrade(originalText: string): TranslationResult {
  const { text: masked } = protectPromptSegments(originalText, []);
  // A failure means nothing comes back from the model, so nothing is restored.
  // The caller must still receive the ORIGINAL, never the masked form.
  void masked;
  void restoreProtectedSegments;
  return {
    text: originalText,
    degraded: true,
  };
}

describe("degraded translation", () => {
  it("hands back the original text, never the masked one", () => {
    const result = degrade(original);
    expect(result.text).toBe(original);
    expect(result.text).not.toContain("__PI_PROMPT_TRANSLATE_PROTECTED_");
  });

  it("is flagged so callers do not treat it as a successful translation", () => {
    expect(degrade(original).degraded).toBe(true);
  });

  it("the success shape is not degraded", () => {
    const { segments } = protectPromptSegments(original, []);
    const ok: TranslationResult = {
      text: restoreProtectedSegments("__PI_PROMPT_TRANSLATE_PROTECTED_0__", segments),
    };
    expect(ok.degraded).toBeUndefined();
  });
});
