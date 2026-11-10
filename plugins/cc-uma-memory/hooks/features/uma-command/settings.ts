// settings.ts — pure logic of uma-command: the two persisted switches, how a
// stored value is read back, and what `/uma recall` / `/uma write-gate` answer.

export type Settings = { recall: boolean; writeGate: "ask" | "off" };

export const DEFAULTS: Settings = { recall: true, writeGate: "ask" };

/** What `$.store` held; anything unreadable falls back to the default for that key. */
export function parseStored(value: unknown): Settings {
	const obj = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
	return {
		recall: typeof obj.recall === "boolean" ? obj.recall : DEFAULTS.recall,
		writeGate: obj.writeGate === "off" ? "off" : DEFAULTS.writeGate,
	};
}

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
