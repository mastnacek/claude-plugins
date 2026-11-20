import type { Register } from "claude-code";
import { checkInput, homesOf } from "./rules";

const advice = (reason: string) =>
	"anon guard: blocked " + reason + ". The anon vault, map and original values are off limits to agents. " +
	"The user can do this themselves (type ! <command> in the prompt).";

export const registerVaultGuard = ((on) => {
	// No matcher: every tool, MCP file tools included. Fail closed: any error is a deny.
	on("tool.call", async ($, e, next) => {
		try {
			// $.env.get takes literal names only.
			const vars = {
				ANON_HOME: await $.env.get("ANON_HOME"),
				ANON_BIN: await $.env.get("ANON_BIN"),
				APPDATA: await $.env.get("APPDATA"),
				HOME: await $.env.get("HOME"),
				USERPROFILE: await $.env.get("USERPROFILE"),
				XDG_CONFIG_HOME: await $.env.get("XDG_CONFIG_HOME"),
			};
			// The engine always knows the directory; if it did not, relative paths resolve from the root.
			const cwd = (await $.session.cwd().catch(() => "")) || "/";
			const guard = { homes: homesOf(vars, cwd), cwd, vars };
			const reason = checkInput(e as unknown as Record<string, unknown>, guard);
			if (reason !== null) return { deny: advice(reason) };
		} catch {
			return { deny: advice("a call the guard could not check") };
		}
		return next(e);
	});
}) satisfies Register;
