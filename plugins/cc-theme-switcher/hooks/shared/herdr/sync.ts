// sync.ts — makes herdr's config.toml follow the active palette.
//
// Deep module: `syncHerdr` hides where the config lives, whether herdr is
// there at all, the line-based TOML edit (./toml.ts) and the server reload.
// It never throws: the outcome says what happened, and nothing is read or
// written unless the caller asked for it (`syncHerdr: true` in the settings).

import type { EngineInterface } from "claude-code";
import { PALETTES } from "../palettes";
import { updateTomlThemeDetails } from "./toml";

type $ = EngineInterface;
type Env = Readonly<Record<string, string | undefined>>;

export type HerdrOutcome =
	| { status: "skipped" } // no herdr here: nothing read, written or started
	| { status: "unchanged" }
	| { status: "updated"; autoSwitchDisabled: boolean }
	| { status: "error"; error: string };

/** `HERDR_CONFIG_PATH`, else `$XDG_CONFIG_HOME/herdr/config.toml`, else `~/.config/herdr/config.toml`. */
export function herdrConfigPath(env: Env): string {
	if (env.HERDR_CONFIG_PATH) return env.HERDR_CONFIG_PATH;
	if (env.XDG_CONFIG_HOME) return `${env.XDG_CONFIG_HOME}/herdr/config.toml`;
	return `${env.HOME ?? ""}/.config/herdr/config.toml`;
}

/** Running inside herdr: it sets `HERDR_ENV=1` or `TERM_PROGRAM=herdr`. */
export function isHerdr(env: Env): boolean {
	return env.HERDR_ENV === "1" || env.TERM_PROGRAM?.toLowerCase() === "herdr";
}

/** `HERDR_BIN_PATH`, else `herdr` from PATH. */
export function herdrBin(env: Env): string {
	return env.HERDR_BIN_PATH?.trim() || "herdr";
}

async function readEnv($: $): Promise<Env> {
	// Literal names: the validator lists the variables a module reads.
	const [HERDR_CONFIG_PATH, XDG_CONFIG_HOME, HERDR_ENV, TERM_PROGRAM, HERDR_BIN_PATH, HOME_, USERPROFILE, PATH] = await Promise.all([
		$.env.get("HERDR_CONFIG_PATH"),
		$.env.get("XDG_CONFIG_HOME"),
		$.env.get("HERDR_ENV"),
		$.env.get("TERM_PROGRAM"),
		$.env.get("HERDR_BIN_PATH"),
		$.env.get("HOME"),
		$.env.get("USERPROFILE"),
		$.env.get("PATH"),
	]);
	// Windows has USERPROFILE and no HOME.
	const HOME = HOME_?.trim() || USERPROFILE?.trim() || undefined;
	return { HERDR_CONFIG_PATH, XDG_CONFIG_HOME, HERDR_ENV, TERM_PROGRAM, HERDR_BIN_PATH, HOME, PATH };
}

/** Points herdr's `[theme]` at the palette's herdr theme and reloads the server when the file changed. */
export async function syncHerdr($: $, paletteName: string): Promise<HerdrOutcome> {
	const palette = PALETTES[paletteName];
	if (!palette) return { status: "error", error: `neznámá paleta ${paletteName}` };
	try {
		const env = await readEnv($);
		const path = herdrConfigPath(env);
		const exists = await $.fs.exists(path);
		// No herdr: creating a config or starting a missing binary would only leave litter.
		if (!isHerdr(env) && !exists) return { status: "skipped" };

		const original = exists ? await $.fs.read(path) : "";
		const { content, autoSwitchDisabled } = updateTomlThemeDetails(original, palette.herdr, palette.bg);
		if (content === original) return { status: "unchanged" };
		await $.fs.write(path, content);

		const extra = [`${env.HOME}/.local/bin`, `${env.HOME}/.cargo/bin`, "/usr/local/bin"];
		const PATH = [env.PATH, ...extra].filter(Boolean).join(":");
		// Herdr not running or not installed is no failure of ours.
		await $.process.run([herdrBin(env), "server", "reload-config"], { env: { PATH }, timeoutMs: 5000 }).catch(() => undefined);
		return { status: "updated", autoSwitchDisabled };
	} catch (error) {
		return { status: "error", error: error instanceof Error ? error.message : String(error) };
	}
}
