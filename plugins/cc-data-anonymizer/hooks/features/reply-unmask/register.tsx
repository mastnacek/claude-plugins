import type { Register } from "claude-code";
import { unmask } from "../../shared/anon";

// Off by default (userConfig `unmaskReply`): the screen then shows what the
// agent said, fake values included. The stored message is never changed.
export const registerReplyUnmask = ((on, options) => {
	if (options.unmaskReply !== true) return;

	on("ui.render", { component: "AssistantMessage" }, async ($, e, next) => {
		try {
			const { Markdown } = $.ui.resolve(e);
			return <Markdown text={await unmask($, e.props.text)} />;
		} catch {
			return next(e); // fail open on screen only: the model never sees this
		}
	});
}) satisfies Register;
