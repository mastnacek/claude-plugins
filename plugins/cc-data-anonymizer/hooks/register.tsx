// register.tsx — the composition root: it knows the slices, they don't know
// each other. Nothing else lives here.

import type { Register } from "claude-code";
import { registerMaskNote } from "./features/mask-note/register";
import { registerMediaGuard } from "./features/media-guard/register";
import { registerFindingsBand } from "./features/findings-band/register";
import { registerPromptMask } from "./features/prompt-mask/register";
import { registerReplyUnmask } from "./features/reply-unmask/register";
import { registerShellSecrets } from "./features/shell-secrets/register";
import { registerToolMask } from "./features/tool-mask/register";
import { registerVaultGuard } from "./features/vault-guard/register";

export const register: Register = (on, options) => {
	// First: the guard must be outermost, so nothing (consent scan, unmask) runs on a call it denies.
	registerVaultGuard(on);
	// Before tool-mask: a secret in a command and a PDF or image are decided before anything is unmasked or read.
	registerShellSecrets(on, options);
	registerMediaGuard(on, options);
	registerPromptMask(on, options);
	registerFindingsBand(on);
	registerToolMask(on, options);
	registerMaskNote(on);
	registerReplyUnmask(on, options);
};
