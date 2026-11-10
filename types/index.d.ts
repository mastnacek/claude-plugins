// The mod's type contract: every value it keeps in $.state, under its name.

export type BoostLevel = "off" | "boost" | "plus" | "mega";

export type HistoryMode = "off" | "ask" | "auto" | "always";

export type TranslateConfig = {
	enabled: boolean;
	translateResponses: boolean;
	targetLanguage: string;
	/** `openrouter/<vendor>/<model>`, `current`, or a Claude alias / id (`haiku`). */
	translateModel: string;
	/** Temporary override, active through the end of `temporaryModelUntil` (YYYY-MM-DD). */
	temporaryModel?: string;
	temporaryModelUntil?: string;
	translateReasoning: boolean;
	boost: BoostLevel;
	historyMode: HistoryMode;
	confirm: boolean;
	showOriginal: boolean;
	diff: boolean;
	autodetect: boolean;
	/** Translate AskUserQuestion dialogs the model opens into the target language. */
	translateToolUi: boolean;
	/** Add a hidden "work in English" note to every translated prompt (off: CLAUDE.md says it). */
	englishNote: boolean;
	debug: boolean;
};

export type TranslationUsage = {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	totalTokens: number;
	costUsd?: number;
};

/** One translated prompt, keyed in state by the English text the transcript shows. */
export type OriginalRecord = {
	source: string;
	english: string;
	boost: BoostLevel;
	model: string;
	usage?: TranslationUsage;
	costUsd?: number;
	costCzk?: number;
	conversationContext?: string;
};

export type PendingTranslation = {
	targetLanguage: string;
	translateResponses: boolean;
};

export type Telemetry = {
	totalRequests: number;
	promptRequests: number;
	answerRequests: number;
	toolRequests: number;
	openRouterRequests: number;
	claudeRequests: number;
	cachedTokens: number;
	cacheWriteTokens: number;
	cacheHitTurns: number;
	promptAnswerCacheHits: number;
	savedCostUsd: number;
	inputTokens: number;
	outputTokens: number;
};

export type BalanceInfo = { remaining: number; total: number; used: number };

/** The indicator at the end of the hint line: the flag, and the credit coloured by level. */
/** The indicator at the end of the prompt hint: `[🇬🇧 49 Kč]`, or `[🇬🇧 ⟳ překládám…]` while a translation runs. */
export type Badge = { flag: string; credit: string; level: "ok" | "low" | "critical"; translating?: boolean };

declare module "claude-code" {
	interface PluginState {
		"prompt-translate": {
			config: Shaped<TranslateConfig>;
			pending: PendingTranslation | null;
			/** English final answer (trimmed) → translated text, drawn in its place. */
			finals: Shaped<Record<string, string>>;
			/** English prompt (trimmed) → what the person typed. */
			originals: Shaped<Record<string, OriginalRecord>>;
			sessionCostUsd: number;
			telemetry: Shaped<Telemetry>;
			/** The indicator drawn at the end of the hint line under the prompt. */
			badge: Badge | null;
			/** True while a prompt, answer or command-argument translation runs (drawn in the indicator). */
			translating: boolean;
			/** A /prompt-translate output's first line (what the model reads) → the whole output, drawn in its row. */
			commandOutputs: Record<string, string>;
		};
	}
}
