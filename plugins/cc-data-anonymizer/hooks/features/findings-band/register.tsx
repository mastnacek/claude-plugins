import type { Register } from "claude-code";
import { atom, read } from "claude-code";
import { kindColor } from "../../shared/findings";

// Declared in each file that touches it: the engine's scan reads the ref where it is used.
const findings = atom({ plugin: "cc-data-anonymizer", key: "findings" } as const, null);

// While the consent dialog is open, the band above the prompt shows what
// `anon scan` found: each file once, then its lines (kind colored).
export const registerFindingsBand = ((on) => {
	on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
		const groups = await read($, findings);
		if (groups === null) return next(e);
		const { Box, Text } = $.ui.resolve(e);
		return (
			<Box flexDirection="column" borderStyle="round" borderColor="error" paddingX={1}>
				<Text bold>🔒 anon · nalezeno v {groups.length} souborech</Text>
				{groups.map((g) => (
					<Box key={g.path} flexDirection="column">
						<Text bold color="claude">
							{g.path}
						</Text>
						{g.lines.map((l) => (
							<Text key={`${l.line}:${l.column}`}>
								{"  "}
								<Text dimColor>
									{l.line}:{l.column}
								</Text>
								{"  "}
								<Text color={kindColor(l.kind)} bold={kindColor(l.kind) === "error"}>
									{l.kind}
								</Text>
								{"  "}
								<Text dimColor>{l.rule}</Text>
								{"  "}
								{l.chars} znaků
							</Text>
						))}
					</Box>
				))}
			</Box>
		);
	});
}) satisfies Register;
