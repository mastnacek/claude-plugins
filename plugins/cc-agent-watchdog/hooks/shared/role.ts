// role.ts — who this Claude Code process is: `CC_ROLE` = coder | tester, else the orchestrator.

import type { EngineInterface } from "claude-code";
import type { Role } from "./types";

export function parseRole(value: string | undefined): Role {
	const v = value?.trim().toLowerCase();
	return v === "coder" || v === "tester" ? v : "orchestrator";
}

export async function currentRole($: EngineInterface): Promise<Role> {
	return parseRole(await $.env.get("CC_ROLE"));
}
