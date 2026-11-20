// consent.ts — the first time a file is masked, the user sees what `anon scan`
// found (kinds and counts, never values) and chooses to allow it.
// Allowed paths live in this module's memory: a reload asks again.

import type { EngineInterface } from "claude-code";
import { scan } from "./anon";

type $ = EngineInterface;

const ALLOW = "Povolit (agent uvidí zamaskovanou verzi)";
const DENY = "Zamítnout";
const allowed = new Set<string>();

const normalize = (path: string) => path.replace(/\\/g, "/").replace(/^[A-Za-z]:/, (drive) => drive.toLowerCase());

/** True when the agent may get this file (masked). Throws AnonError when anon fails. */
export async function isFileAllowed($: $, path: string): Promise<boolean> {
	const key = normalize(path);
	if (allowed.has(key)) return true;
	if (!(await $.fs.stat(path).catch(() => undefined))) return true; // nothing to read, the tool reports it
	const found = await scan($, path);
	if (!found.isFound) {
		allowed.add(key);
		return true;
	}
	const answer = await $.ui
		.ask(`${path} obsahuje citlivé hodnoty:\n${found.summary}\nAgent uvidí jen falešné náhrady. Povolit?`, [ALLOW, DENY])
		.catch(() => DENY);
	if (answer !== ALLOW) return false;
	allowed.add(key);
	return true;
}
