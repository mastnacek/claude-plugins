// The plugin's type contract: every value it keeps in $.state, under its name.
// Add a key here before any atom reads or writes it; `claude plugin validate`
// holds the module to this list.

declare module "claude-code" {
	/** The look of the buddy's head. */
	type Face = "neutral" | "happy" | "worried" | "party" | "asleep" | "thinking";

	/** Frame / text colour by meaning (theme colours, never RGB). */
	type Tone = "normal" | "success" | "warning" | "error" | "dim";

	/** The mood as `mood` last worked it out, with the memory it works from. */
	type MoodState = {
		face: Face;
		/** Shown beside the head, e.g. 😊. */
		emoji: string;
		/** Czech word for the mood, e.g. „spokojený“. */
		label: string;
		tone: Tone;
		/** Tool calls that failed in a row. */
		errorStreak: number;
		/** The last test / build run: passed or failed; null before the first. */
		test: "pass" | "fail" | null;
		/** A commit or push went through; cleared when the next turn starts. */
		party: boolean;
		/** A turn is running. */
		working: boolean;
		/** No turn for 10 minutes. */
		asleep: boolean;
	};

	/** One message of the buddy; shown once, gone when the next turn starts. */
	type Hint = {
		id: "repeat" | "context" | "break" | "commit";
		text: string;
		tone: "success" | "warning" | "error";
	};

	/** What happened on one day (local date `YYYY-MM-DD`). */
	type DayStats = {
		day: string;
		turns: number;
		toolErrors: number;
		edits: number;
		commits: number;
		testsPass: number;
		testsFail: number;
	};

	/** One `/buddy` output as data, drawn by `command` in its round frame. */
	type BuddyCard = {
		/** After `🖥 Buddy · ` in the header. */
		title: string;
		tone: Tone;
		lines: Array<{ text: string; tone?: Tone }>;
	};

	interface PluginState {
		"cc-pixel-buddy": {
			/** Written only by `mood`; read by face (the band, the pane) and command. null until session start. */
			mood: Shaped<MoodState | null>;
			/** The message on show, written only by `hints`; read by face. */
			hint: Shaped<Hint | null>;
			/** Today's counts, written only by `stats` (and kept in $.store); read by face and command. */
			stats: Shaped<DayStats>;
			/** Hints are switched off (the head stays); written only by `command` (and kept in $.store); read by face. */
			muted: boolean;
			/** A /buddy output's first line (what the model reads) → the whole output as data; written and drawn by `command`; at most 20. */
			cards: Shaped<Record<string, BuddyCard>>;
		};
	}
}
