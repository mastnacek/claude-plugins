// types.ts — config shape, defaults and the plain data the mod keeps.
// Pure data, no engine access. The $.state contract lives in ../../types/index.d.ts
// and re-uses these shapes.

export type {
	BoostLevel,
	HistoryMode,
	ThinkLevel,
	TranslateConfig,
	OriginalRecord,
	PendingTranslation,
	Telemetry,
	BalanceInfo,
	CreditInfo,
} from "../../types";

import type { TranslateConfig, Telemetry } from "../../types";

export type ProtectedSegment = {
	placeholder: string;
	value: string;
};

export type ProtectedText = {
	text: string;
	segments: ProtectedSegment[];
};

export type Purpose = "prompt" | "answer" | "tool";

/**
 * Model setting:
 *  - `openrouter/<vendor>/<model>`  → OpenRouter chat completions over $.http.fetch
 *  - `current`                      → the session's own Claude model via $.model.complete
 *  - anything else (`haiku`, `sonnet`, `claude-haiku-…`, `anthropic/…`) → $.model.complete
 */
export type ModelBackend = "openrouter" | "claude";

export const DEFAULT_CONFIG: TranslateConfig = {
	enabled: true,
	translateResponses: true,
	targetLanguage: "Czech",
	translateModel: "openrouter/google/gemini-3.1-flash-lite",
	think: "low",
	boost: "boost",
	historyMode: "off",
	confirm: false,
	showOriginal: true,
	translateToolUi: true,
	englishNote: false,
	debug: false,
};

export const EMPTY_TELEMETRY: Telemetry = {
	inputTokens: 0,
	outputTokens: 0,
};
