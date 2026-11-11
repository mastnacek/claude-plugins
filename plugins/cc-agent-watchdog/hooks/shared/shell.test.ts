import { expect, test } from "claude-code/testing";
import { gitSub, parseCommand, stripHeredocs } from "./shell";

/** The words of each command that has any (a redirect-only group such as `( … ) > f` has none). */
const words = (command: string): string[][] => parseCommand(command).map((c) => c.words).filter((w) => w.length > 0);

test("separators, quotes and escapes", () => {
	expect(words("a && b; c | d || e")).toEqual([["a"], ["b"], ["c"], ["d"], ["e"]]);
	expect(words(`echo "a && b" 'c; d' e\\ f`)).toEqual([["echo", "a && b", "c; d", "e f"]]);
	expect(words("(cd x && make) > /dev/null")).toEqual([["cd", "x"], ["make"]]);
	expect(words("echo $(git commit -m x)")).toEqual([["echo"], ["git", "commit", "-m", "x"]]);
});

test("pipes are marked, redirects are not words, descriptor duplicates are no files", () => {
	const [a, b] = parseCommand("make 2>&1 | tail -3 > out.txt");
	expect(a).toMatchObject({ words: ["make"], pipeOut: true, redirects: [] });
	expect(b).toMatchObject({ words: ["tail", "-3"], pipeIn: true, redirects: [{ op: ">", target: "out.txt" }] });
	expect(parseCommand("cmd &> all.log")[0]?.redirects).toEqual([{ op: ">", target: "all.log" }]);
});

test("wrappers and variable assignments are looked through; bash -c is opened up", () => {
	expect(words("FOO=1 env BAR=2 nohup timeout 5 git status")).toEqual([["git", "status"]]);
	expect(words(`bash -c "git commit -m 'x' && ls"`)).toEqual([["git", "commit", "-m", "x"], ["ls"]]);
	expect(parseCommand("SUDO_ASKPASS=/x sudo -A ls")[0]?.assigns).toEqual(["SUDO_ASKPASS=/x"]);
});

test("heredoc bodies disappear, the line that opens them and what follows stay", () => {
	const src = "cat <<'EOF' > f\ngit push\nEOF\nls";
	expect(stripHeredocs(src)).toBe("cat <<'EOF' > f\nls");
	expect(words(src)).toEqual([["cat"], ["ls"]]);
	expect(words("echo a <<< b")).toEqual([["echo", "a"]]); // a here-string is input, not a command
});

test("git subcommand is found after global options", () => {
	expect(gitSub(parseCommand("git -C /r -c a=b --no-pager log -1")[0] as never)).toEqual({ sub: "log", args: ["-1"] });
	expect(gitSub(parseCommand("ls")[0] as never)).toBeUndefined();
});
