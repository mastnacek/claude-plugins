// register.tsx — the composition root: it knows the slices, they don't know
// each other. Nothing else lives here.

import type { Register } from "claude-code";
import { registerFindingsBand } from "./features/findings-band/register";
import { registerPromptMask } from "./features/prompt-mask/register";
import { registerReplyUnmask } from "./features/reply-unmask/register";
import { registerToolMask } from "./features/tool-mask/register";

export const register: Register = (on, options) => {
	registerPromptMask(on, options);
	registerFindingsBand(on);
	registerToolMask(on, options);
	registerReplyUnmask(on, options);
};
