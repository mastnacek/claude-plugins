// fixture.ts — ledger events and a config for tests (only *.test.ts files import it).

import { defaultConfig } from "./config";
import type { Config, Ev, Role, ScanEv, ToolEv, TurnEv, WaiverEv } from "./types";

export const CFG: Config = { ...defaultConfig("/work/repo", "/home/t"), gate: ["claude plugin test .", "scripts/vsa-check.sh"] };

let clock = 1_700_000_000_000;

const base = (role: Role) => ({ ts: (clock += 1000), session: "s1", role, cwd: "/work/repo" });

export const bash = (command: string, over: Partial<ToolEv> = {}, role: Role = "coder"): ToolEv => ({ kind: "tool", ...base(role), tool: "Bash", command, exitCode: 0, isError: false, denied: false, durationMs: 10, ...over });

export const file = (tool: string, path: string, over: Partial<ToolEv> = {}, role: Role = "coder"): ToolEv => ({ kind: "tool", ...base(role), tool, path, isError: false, denied: false, durationMs: 5, ...over });

export const turn = (answer: string, role: Role = "coder"): TurnEv => ({ kind: "turn", ...base(role), answer });

export const scan = (leftovers: string[], role: Role = "coder"): ScanEv => ({ kind: "scan", ...base(role), leftovers });

export const waiver = (rule: string, over: Partial<WaiverEv> = {}, role: Role = "coder"): WaiverEv => ({ kind: "waiver", ...base(role), rule, reason: "mechanická hromadná úprava", scope: {}, decision: "allow", decidedBy: "dialog", ...over });

export const denied =(e: ToolEv, reason = "Blocked by hook"): ToolEv => ({ ...e, denied: true, isError: true, deniedReason: reason });

export const failing = (command: string): ToolEv => bash(command, { exitCode: 1, isError: true });

export type Events = Ev[];
