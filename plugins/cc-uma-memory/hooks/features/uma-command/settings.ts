// settings.ts — pure logic of uma-command: the three persisted switches, how a
// stored value is read back, and what `/uma recall` / `/uma write-gate` / `/uma append` answer.

export type ImmuneMode = "off" | "warn" | "ask" | "auto";
/** `immuneModel` "" = the default model of the immune recommendation (OpenRouter). */
export type Settings = { recall: boolean; writeGate: "ask" | "off"; append: boolean; immune: ImmuneMode; immuneModel: string; humility: boolean };

/** The model the immune recommendation asks by default (kept equal to immune/recommendation.ts: slices share no code). */
export const DEFAULT_IMMUNE_MODEL = "google/gemini-3.5-flash-lite";

export const DEFAULTS: Settings = { recall: true, writeGate: "ask", append: true, immune: "warn", immuneModel: "", humility: false };

/** What `$.store` held; anything unreadable falls back to the default for that key. */
export function parseStored(value: unknown): Settings {
	const obj = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
	return {
		recall: typeof obj.recall === "boolean" ? obj.recall : DEFAULTS.recall,
		writeGate: obj.writeGate === "off" ? "off" : DEFAULTS.writeGate,
		append: typeof obj.append === "boolean" ? obj.append : DEFAULTS.append,
		immune: obj.immune === "off" || obj.immune === "warn" || obj.immune === "ask" || obj.immune === "auto" ? obj.immune : DEFAULTS.immune,
		immuneModel: typeof obj.immuneModel === "string" && MODEL_ID_RE.test(obj.immuneModel) ? obj.immuneModel : DEFAULTS.immuneModel,
		humility: typeof obj.humility === "boolean" ? obj.humility : DEFAULTS.humility,
	};
}

/** An OpenRouter model id: `vendor/model`, optionally `:variant`. */
const MODEL_ID_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._:+-]+$/;

export type SettingResult = { settings: Settings; text: string };

const recallWord = (on: boolean) => (on ? "zapnut" : "vypnut");

/** `/uma recall [on|off]`. Without an argument it only reports. */
export function recallCommand(current: Settings, arg: string | undefined, extra: number): SettingResult {
	if (arg === undefined) return { settings: current, text: `Recall do promptu: ${recallWord(current.recall)}` };
	if ((arg !== "on" && arg !== "off") || extra > 0) return { settings: current, text: "Neznámý argument. Zkus /uma recall [on|off]." };
	const settings = { ...current, recall: arg === "on" };
	return { settings, text: `Recall do promptu: ${recallWord(settings.recall)} (platí hned, ve všech sezeních)` };
}

/** `/uma write-gate [ask|off]`. Without an argument it only reports. */
export function writeGateCommand(current: Settings, arg: string | undefined, extra: number): SettingResult {
	const describe = (mode: Settings["writeGate"]) =>
		mode === "ask" ? "ptát se před každým zápisem do paměti" : "bez dotazu — uma_write a uma_supersede projdou; Write/Edit do úložiště zůstává zakázáno";
	if (arg === undefined) return { settings: current, text: `Schvalování zápisu: ${describe(current.writeGate)}` };
	if ((arg !== "ask" && arg !== "off") || extra > 0) return { settings: current, text: "Neznámý argument. Zkus /uma write-gate [ask|off]." };
	return { settings: { ...current, writeGate: arg }, text: `Schvalování zápisu: ${describe(arg)} (platí hned, ve všech sezeních)` };
}

/** `/uma append [on|off]` — UMA rules (decisions, patterns) in the system prompt. Without an argument it only reports. */
export function appendCommand(current: Settings, arg: string | undefined, extra: number): SettingResult {
	const word = (on: boolean) => (on ? "zapnuta" : "vypnuta");
	if (arg === undefined) return { settings: current, text: `Pravidla UMA v system promptu: ${word(current.append)}` };
	if ((arg !== "on" && arg !== "off") || extra > 0) return { settings: current, text: "Neznámý argument. Zkus /uma append [on|off]." };
	const settings = { ...current, append: arg === "on" };
	return { settings, text: `Pravidla UMA v system promptu: ${word(settings.append)} (platí od dalšího požadavku, ve všech sezeních)` };
}

const IMMUNE_DESCRIPTIONS: Record<ImmuneMode, string> = {
	off: "vypnut, úpravy kódu se nekontrolují",
	warn: "varování jedním řádkem, nikdy neblokuje",
	ask: "při dotyku pravidla nebo kontraktu dialog; Ne úpravu zablokuje",
	auto: "porušený ověřený kontrakt zablokuje hned, ostatní se ptá",
};

/** `/uma immune [off|warn|ask|auto]` (`stats` belongs to the immune slice). Without an argument it only reports. */
export function immuneCommand(current: Settings, arg: string | undefined, extra: number): SettingResult {
	if (arg === undefined) return { settings: current, text: `Imunitní interceptor: ${current.immune} — ${IMMUNE_DESCRIPTIONS[current.immune]}` };
	if ((arg !== "off" && arg !== "warn" && arg !== "ask" && arg !== "auto") || extra > 0) return { settings: current, text: "Neznámý argument. Zkus /uma immune [off|warn|ask|auto|stats]." };
	return { settings: { ...current, immune: arg }, text: `Imunitní interceptor: ${arg} — ${IMMUNE_DESCRIPTIONS[arg]} (platí hned, ve všech sezeních)` };
}

/** `/uma immune-model [<openrouter-id>|default]` — the model of the immune dialog's recommendation. Without an argument it only reports. */
export function immuneModelCommand(current: Settings, arg: string | undefined, extra: number): SettingResult {
	const shown = (m: string) => (m === "" ? `${DEFAULT_IMMUNE_MODEL} (výchozí)` : m);
	if (arg === undefined) return { settings: current, text: `Model imunitního doporučení (OpenRouter): ${shown(current.immuneModel)}` };
	if (extra > 0) return { settings: current, text: "Neznámý argument. Zkus /uma immune-model [<openrouter-id>|default]." };
	if (arg === "default") return { settings: { ...current, immuneModel: "" }, text: `Model imunitního doporučení (OpenRouter): ${shown("")}` };
	if (!MODEL_ID_RE.test(arg) || arg.length > 100) return { settings: current, text: "Neplatné ID modelu. Čekám tvar OpenRouteru, např. google/gemini-3.5-flash-lite." };
	return { settings: { ...current, immuneModel: arg }, text: `Model imunitního doporučení (OpenRouter): ${arg} (platí od dalšího dialogu, ve všech sezeních)` };
}

/** `/uma humility [on|off]` — the humility gate before Write/Edit after a LOW `uma_humility` verdict. Without an argument it only reports. */
export function humilityCommand(current: Settings, arg: string | undefined, extra: number): SettingResult {
	const word = (on: boolean) => (on ? "zapnuta" : "vypnuta");
	if (arg === undefined) return { settings: current, text: `Brána pokory: ${word(current.humility)}` };
	if ((arg !== "on" && arg !== "off") || extra > 0) return { settings: current, text: "Neznámý argument. Zkus /uma humility [on|off]." };
	const settings = { ...current, humility: arg === "on" };
	return { settings, text: `Brána pokory: ${word(settings.humility)} (po verdiktu LOW z uma_humility zastaví první úpravu kódu, dokud nepřečteš soubory a nevyslovíš hypotézu; platí hned, ve všech sezeních)` };
}
