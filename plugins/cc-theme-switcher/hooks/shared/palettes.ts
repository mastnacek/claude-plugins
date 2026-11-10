// palettes.ts — the five bundled palettes and how they become a Claude Code
// theme file (`~/.claude/themes/tts.json`).
//
// Palettes are data in code, not JSON files: the plugin reads nothing from its
// own folder, and the ported colours stay next to the one function that maps
// them. Each palette keeps the pi colours it is built from (already resolved
// from the pi theme's `vars`; tts-night's okhsl colours are converted to hex),
// and `buildTheme` maps them to Claude Code tokens.

export type Base = "dark" | "light";

/** The pi colours a Claude Code theme is built from. */
export interface PaletteColors {
	accent: string;
	text: string;
	dim: string;
	muted: string;
	border: string;
	borderMuted: string;
	borderAccent: string;
	success: string;
	error: string;
	warning: string;
	thinkingMedium: string;
	bashMode: string;
	userMessageBg: string;
	selectedBg: string;
}

export interface Palette {
	base: Base;
	/** Background of the palette, for the herdr sidebar. */
	bg: string;
	/** Name of the herdr built-in theme that goes with the palette. */
	herdr: string;
	colors: PaletteColors;
}

export const PALETTES: Readonly<Record<string, Palette>> = {
	// Gruvbox Material Soft Dark
	"tts-dawn": {
		base: "dark",
		bg: "#32302f",
		herdr: "gruvbox",
		colors: {
			accent: "#d8a657",
			text: "#d4be98",
			dim: "#5a524c",
			muted: "#928374",
			border: "#45403d",
			borderMuted: "#45403d",
			borderAccent: "#7daea3",
			success: "#a9b665",
			error: "#ea6962",
			warning: "#d8a657",
			thinkingMedium: "#89b482",
			bashMode: "#e78a4e",
			userMessageBg: "#3a3837",
			selectedBg: "#45403d",
		},
	},
	// Solarized Light
	"tts-day": {
		base: "light",
		bg: "#fdf6e3",
		herdr: "solarized-light",
		colors: {
			accent: "#268bd2",
			text: "#586e75",
			dim: "#839496",
			muted: "#93a1a1",
			border: "#d8cfb8",
			borderMuted: "#e3dccb",
			borderAccent: "#268bd2",
			success: "#859900",
			error: "#dc322f",
			warning: "#b58900",
			thinkingMedium: "#268bd2",
			bashMode: "#cb4b16",
			userMessageBg: "#eee8d5",
			selectedBg: "#e3dccb",
		},
	},
	// Catppuccin Macchiato
	"tts-dusk": {
		base: "dark",
		bg: "#24273a",
		herdr: "catppuccin",
		colors: {
			accent: "#8aadf4",
			text: "#cad3f5",
			dim: "#5b6078",
			muted: "#a5adcb",
			border: "#363a4f",
			borderMuted: "#494d64",
			borderAccent: "#8aadf4",
			success: "#a6da95",
			error: "#ed8796",
			warning: "#eed49f",
			thinkingMedium: "#8aadf4",
			bashMode: "#eed49f",
			userMessageBg: "#1e2030",
			selectedBg: "#494d64",
		},
	},
	// Dark red-brown with warm accents (the pi palette is written in okhsl)
	"tts-night": {
		base: "dark",
		bg: "#180e0e",
		herdr: "rose-pine",
		colors: {
			accent: "#cc5d4d",
			text: "#eae7e8",
			dim: "#7a7677",
			muted: "#9a9496",
			border: "#3b282f",
			borderMuted: "#311c1a",
			borderAccent: "#894a40",
			success: "#364c3d",
			error: "#7a3c42",
			warning: "#f47242",
			thinkingMedium: "#75535a",
			bashMode: "#f7926f",
			userMessageBg: "#261616",
			selectedBg: "#311c1a",
		},
	},
	// Osaka Jade
	"tts-osaka-jade": {
		base: "dark",
		bg: "#1a221e",
		herdr: "osaka-jade",
		colors: {
			accent: "#509475",
			text: "#d4c8a0",
			dim: "#4a5d51",
			muted: "#6a7d71",
			border: "#354a3e",
			borderMuted: "#27372f",
			borderAccent: "#63b07a",
			success: "#63b07a",
			error: "#ff5345",
			warning: "#e5c736",
			thinkingMedium: "#63b07a",
			bashMode: "#e5c736",
			userMessageBg: "#1f2a24",
			selectedBg: "#27372f",
		},
	},
};

export const PALETTE_NAMES: readonly string[] = Object.keys(PALETTES);

export interface ThemeFile {
	name: string;
	base: string;
	overrides: Record<string, string>;
}

/** The theme's name in Claude Code: the file is `tts.json`, it shows as `custom:tts`. */
export const THEME_SLUG = "tts";

const HEX = /^#[0-9a-f]{6}$/i;

export function isHexColor(value: unknown): value is string {
	return typeof value === "string" && HEX.test(value);
}

/** Mixes two `#rrggbb` colours: `t` = 0 gives `a`, 1 gives `b`. Not hex in, `a` out. */
export function mix(a: string, b: string, t: number): string {
	if (!isHexColor(a) || !isHexColor(b)) return a;
	const channel = (hex: string, at: number): number => Number.parseInt(hex.slice(at, at + 2), 16);
	let out = "#";
	for (const at of [1, 3, 5]) {
		const value = Math.round(channel(a, at) * (1 - t) + channel(b, at) * t);
		out += value.toString(16).padStart(2, "0");
	}
	return out;
}

/** Claude Code token → the pi colour it takes (`warning` is toned down in `buildTheme`). */
const TOKEN_SOURCES: Readonly<Record<string, keyof PaletteColors>> = {
	claude: "accent",
	text: "text",
	inactive: "dim",
	subtle: "borderMuted",
	suggestion: "borderAccent",
	permission: "border",
	remember: "accent",
	promptBorder: "borderMuted",
	success: "success",
	error: "error",
	planMode: "thinkingMedium",
	autoAccept: "success",
	bashBorder: "bashMode",
	userMessageBackground: "userMessageBg",
	selectionBg: "selectedBg",
};

export const THEME_TOKENS: readonly string[] = [...Object.keys(TOKEN_SOURCES), "warning"];

/** The `overrides` of a palette: every token with a usable colour, others left out. */
export function buildOverrides(colors: PaletteColors): Record<string, string> {
	const overrides: Record<string, string> = {};
	for (const [token, source] of Object.entries(TOKEN_SOURCES)) {
		const value = colors[source];
		if (isHexColor(value)) overrides[token] = value;
	}
	// Plain pi `warning` is a loud yellow in the `auto mode on` line: half-way to `muted`.
	if (isHexColor(colors.warning)) overrides.warning = mix(colors.warning, colors.muted, 0.5);
	return overrides;
}

/** The theme file of a bundled palette, or undefined for any other name. */
export function buildTheme(paletteName: string): ThemeFile | undefined {
	const palette = PALETTES[paletteName];
	if (!palette) return undefined;
	return { name: THEME_SLUG, base: palette.base, overrides: buildOverrides(palette.colors) };
}

/** The theme file of "rotation off": the base only, so Claude Code's own colours show. */
export function baseOnlyTheme(base: Base): ThemeFile {
	return { name: THEME_SLUG, base, overrides: {} };
}

/** Serialised the same way every time, so "did it change" is a string comparison. */
export function serializeTheme(theme: ThemeFile): string {
	return `${JSON.stringify(theme, null, 2)}\n`;
}
