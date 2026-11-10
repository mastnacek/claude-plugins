// The mod's type contract: every value it keeps in $.state, under its name.

export type BoostLevel = "off" | "boost" | "plus" | "mega";

export type HistoryMode = "off" | "ask" | "auto" | "always";

/** Reasoning effort of the translation model; `off` sends none. */
export type ThinkLevel = "off" | "low" | "medium" | "high";

export type TranslateConfig = {
	enabled: boolean;
	translateResponses: boolean;
	targetLanguage: string;
	/** `openrouter/<vendor>/<model>`, `current`, or a Claude alias / id (`haiku`). */
	translateModel: string;
	think: ThinkLevel;
	boost: BoostLevel;
	historyMode: HistoryMode;
	confirm: boolean;
	/** The frame in place of a translated prompt: original, English and any attached history. */
	showOriginal: boolean;
	/** Translate AskUserQuestion dialogs the model opens into the target language. */
	translateToolUi: boolean;
	/** Add a hidden "work in English" note to every translated prompt (off: CLAUDE.md says it). */
	englishNote: boolean;
	/** Write ~/.claude/prompt-translate/log/<day>.jsonl for evaluating quality, speed and autodetection. */
	log: boolean;
	debug: boolean;
};

/** One translated prompt, keyed in state by the English text the transcript shows. */
export type OriginalRecord = {
	source: string;
	english: string;
	boost: BoostLevel;
	conversationContext?: string;
};

export type PendingTranslation = {
	targetLanguage: string;
	translateResponses: boolean;
};

/** Tokens the translation model used this session (shown by /prompt-translate stats). */
export type Telemetry = {
	inputTokens: number;
	outputTokens: number;
};

export type BalanceInfo = { remaining: number; total: number; used: number };

/** What the indicator shows of the money: the day's rate and, on an OpenRouter model, the credit left. */
export type CreditInfo = { rate?: number; remainingUsd?: number };

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
			/** The rate and credit left, refreshed by shared/credit, drawn by the indicator slice. */
			credit: CreditInfo;
			/** True while a prompt, answer or command-argument translation runs (drawn in the indicator). */
			translating: boolean;
			/** A /prompt-translate output's first line (what the model reads) → the whole output, drawn in its row. */
			commandOutputs: Record<string, string>;
		};
	}
}
