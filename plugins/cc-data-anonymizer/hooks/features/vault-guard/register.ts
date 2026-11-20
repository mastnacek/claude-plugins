import type { Register } from "claude-code";
import { AnonError, convert } from "../../shared/anon";
import { checkInput, guardedFields, homesOf } from "./rules";

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
			const input = e as unknown as Record<string, unknown>;
			const masked = checkInput(input, guard);
			if (masked !== null) return { deny: advice(masked) };
			// The model may write a placeholder (a tag standing for the user name in a path) that tool-mask
			// turns into the real path later: judge the input the tool would really get. Failure = deny (catch).
			const real = await convert($, "unmask", guardedFields(input));
			const reason = checkInput({ ...input, ...real }, guard);
			if (reason !== null) return { deny: advice(reason) };
		} catch (error) {
			// anon missing or failing: say so (the guard cannot unmask), fail closed all the same.
			if (error instanceof AnonError) return { deny: "anon guard: call blocked, it could not be checked. " + error.message };
			return { deny: advice("a call the guard could not check") };
		}
		return next(e);
	});
}) satisfies Register;
