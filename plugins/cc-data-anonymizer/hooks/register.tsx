// register.tsx — the composition root: it knows the slices, they don't know
// each other. Nothing else lives here.

import type { Register } from "claude-code";
import { registerPromptMask } from "./features/prompt-mask/register";
import { registerReplyUnmask } from "./features/reply-unmask/register";
import { registerToolMask } from "./features/tool-mask/register";

export const register: Register = (on, options) => {
	registerPromptMask(on);
	registerToolMask(on);
	registerReplyUnmask(on, options);
};
