// classify.ts — pure judgements of one shell command: is it a git write, a system
// install, a remote write …  Each returns what it found (a short label) or undefined.

import { gitSub, hasFlag, nameOf, positionals } from "./shell";
import type { Cmd } from "./shell";

const GIT_WRITE = new Set(["commit", "push", "merge", "rebase", "cherry-pick", "am", "revert", "pull"]);

/** W01: git / gh calls that change history or the remote. Read-only subcommands pass. */
export function gitWrite(cmd: Cmd): string | undefined {
	const g = gitSub(cmd);
	if (g) {
		if (GIT_WRITE.has(g.sub)) return `git ${g.sub}`;
		if (g.sub === "apply" && !g.args.includes("--check")) return "git apply";
		if (g.sub === "tag") {
			const listing = hasFlag(g.args, ["-l"]) || g.args.includes("--list");
			if (!listing && (positionals(["git", ...g.args], new Set(["-m", "-F", "-u"])).length > 0 || hasFlag(g.args, ["-d", "-a", "-s", "-f"]))) return "git tag";
		}
		return undefined;
	}
	if (nameOf(cmd) === "gh") {
		const [a, b] = cmd.words.slice(1).filter((w) => !w.startsWith("-"));
		if (a === "pr" && (b === "create" || b === "merge")) return `gh pr ${b}`;
		if (a === "release" && b === "create") return "gh release create";
		if (a === "repo" && (b === "create" || b === "delete")) return `gh repo ${b}`;
		if (a === "api") {
			const m = cmd.words.findIndex((w) => w === "-X" || w === "--method" || /^-X./.test(w));
			const method = (cmd.words[m]?.length ?? 0) > 2 && /^-X./.test(cmd.words[m] as string) ? (cmd.words[m] as string).slice(2) : cmd.words[m + 1];
			if (m > 0 && /^(POST|PUT|DELETE|PATCH)$/i.test(method ?? "")) return `gh api -X ${method}`;
		}
	}
	return undefined;
}

/** W02: git commands that throw work away. */
export function gitDestructive(cmd: Cmd): string | undefined {
	const g = gitSub(cmd);
	if (!g) return undefined;
	const { sub, args } = g;
	if (sub === "reset" && args.includes("--hard")) return "git reset --hard";
	if (sub === "clean" && hasFlag(args, ["-f"])) return "git clean -f";
	if (sub === "clean" && args.includes("--force")) return "git clean --force";
	if (sub === "stash") return ["list", "show"].includes(args[0] ?? "") ? undefined : "git stash";
	if (sub === "restore") return args.includes("--staged") && !args.includes("--worktree") && !hasFlag(args, ["-W"]) ? undefined : "git restore";
	if (sub === "branch" && (hasFlag(args, ["-D"]) || (args.includes("--delete") && args.includes("--force")))) return "git branch -D";
	if (sub === "push" && (hasFlag(args, ["-f"]) || args.some((a) => a === "--force" || a.startsWith("--force-with-lease")))) return "git push --force";
	if (sub === "checkout" && !hasFlag(args, ["-b", "-B"]) && !args.includes("--orphan") && !args.includes("--detach")) {
		if (args.includes("--")) return "git checkout -- <path>";
		const pathLike = args.filter((a) => !a.startsWith("-")).some((a) => /^(\.{1,2}(\/|$)|\/)/.test(a) || /\.\w{1,6}$/.test(a));
		if (pathLike) return "git checkout <path>";
	}
	return undefined;
}

/** W03 is not in version 1; W06: privilege escalation. */
export function privilege(cmd: Cmd, inside: (path: string) => boolean): string | undefined {
	const name = nameOf(cmd);
	if (name === "sudo" || name === "pkexec" || name === "doas") return name;
	if (name === "su" && cmd.words.includes("-c")) return "su -c";
	if (cmd.assigns.some((a) => a.startsWith("SUDO_ASKPASS=")) || cmd.words.some((w) => w.startsWith("SUDO_ASKPASS="))) return "SUDO_ASKPASS";
	if (name === "chattr" || name === "setcap") return name;
	if (name === "chown") {
		const targets = positionals(cmd.words).slice(1);
		if (targets.some((t) => !inside(t))) return "chown mimo WORKDIR";
	}
	return undefined;
}

export type Install = { what: string; instant: boolean };

const SHELLS = new Set(["sh", "bash", "zsh", "dash"]);

/** W07: installs. `next` is the command after a pipe, if any. */
export function install(cmd: Cmd, next: Cmd | undefined): Install | undefined {
	const name = nameOf(cmd);
	const pos = positionals(cmd.words);
	const args = cmd.words.slice(1);
	const sys = (what: string): Install => ({ what, instant: true });
	if ((name === "curl" || name === "wget") && cmd.pipeOut && next && SHELLS.has(nameOf(next))) return sys(`${name} | ${nameOf(next)}`);
	if ((name === "apt" || name === "apt-get" || name === "aptitude" || name === "brew" || name === "dnf" || name === "yum") && pos[0] === "install") return sys(`${name} install`);
	if (name === "zypper" && (pos[0] === "in" || pos[0] === "install")) return sys("zypper install");
	if (name === "pacman" && args.some((a) => /^-S[yuw]*$/.test(a) || a === "-U")) return sys("pacman -S");
	if ((name === "yay" || name === "paru") && !args.some((a) => /^-(Ss|Si|Q.*)$/.test(a))) return sys(name);
	if (name === "npm" || name === "pnpm" || name === "yarn") {
		const global = args.includes("-g") || args.includes("--global") || (name === "yarn" && pos[0] === "global");
		if (global && pos.some((p) => ["i", "install", "add", "global"].includes(p))) return sys(`${name} -g`);
	}
	if (name === "cargo" && pos[0] === "install") return sys("cargo install");
	if (name === "sdk" && pos[0] === "install") return sys("sdk install");
	if (name === "sdkmanager" && (args.includes("--install") || pos.length > 0)) return sys("sdkmanager --install");
	if (name === "pi" && pos[0] === "install") return sys("pi install");
	if (name === "claude" && pos[0] === "plugin" && (pos[1] === "install" || pos[1] === "i" || (pos[1] === "marketplace" && pos[2] === "add"))) {
		const scope = args.findIndex((a) => a === "--scope" || a === "-s");
		return { what: "claude plugin install", instant: args[scope + 1] === "user" || args.includes("--scope=user") };
	}
	if ((name === "pip" || name === "pip3" || (name.startsWith("python") && args[0] === "-m" && args[1] === "pip")) && (pos[0] === "install" || pos[1] === "install")) {
		if (/venv/.test(cmd.words[0] ?? "")) return undefined;
		return { what: "pip install", instant: args.includes("--break-system-packages") };
	}
	return undefined;
}

/**
 * W14 without a configured gate: is this a command that verifies work (tests, build, lint, type check)?
 * cargo test|clippy|build · npm test|run test|check|build|typecheck · npx tsc · tsc · node --test · pytest ·
 * python -m pytest|unittest · ruff · pyright · go test|vet · claude plugin test|validate · vsa-check.sh ·
 * make test|check · just test|ci · gradle test|build|assemble*
 */
export function isVerification(cmd: Cmd): boolean {
	const name = nameOf(cmd);
	const args = cmd.words.slice(1);
	const pos = positionals(cmd.words);
	if (name === "cargo") return ["test", "clippy", "build"].includes(pos[0] ?? "");
	if (name === "npm" || name === "pnpm" || name === "yarn" || name === "bun") return pos[0] === "test" || (pos[0] === "run" && ["test", "check", "build", "typecheck"].includes(pos[1] ?? ""));
	if (name === "npx") return args.includes("tsc") || args.includes("pytest") || args.includes("vitest") || args.includes("jest");
	if (name === "tsc" || name === "pytest" || name === "ruff" || name === "pyright" || name === "vsa-check.sh") return true;
	if (name === "node") return args.includes("--test");
	if (name.startsWith("python")) return args[0] === "-m" && ["pytest", "unittest"].includes(args[1] ?? "");
	if (name === "go") return pos[0] === "test" || pos[0] === "vet";
	if (name === "claude") return pos[0] === "plugin" && (pos[1] === "test" || pos[1] === "validate");
	if (name === "make") return pos[0] === "test" || pos[0] === "check";
	if (name === "just") return pos[0] === "test" || pos[0] === "ci";
	if (name === "gradle" || name === "gradlew") return pos.some((p) => /^(test|build|assemble\w*)$/.test(p) || /^:?[\w:-]*:(test|build|assemble\w*)$/.test(p));
	return false;
}

/** W14: a sentence that denies the claim ("není hotovo", "not done", "NOT VERIFIED", "neověřeno" …). */
const NEGATION_RE = /(?<![\p{L}\d])(není|nehotov\p{L}*|neověřen\p{L}*|neopraven\p{L}*|nedokončen\p{L}*|nebylo|ještě\s+ne\p{L}*|zatím\s+ne\p{L}*|not\s+(?:yet|done|verified|finished|ready|fixed|implemented)|isn'?t|aren'?t|wasn'?t|unverified|incomplete)(?![\p{L}\d])/iu;

export const isNegated = (sentence: string): boolean => NEGATION_RE.test(sentence);

/** W08: deletion that is not a plain `rm file`. Returns a label and whether the targets matter (rm/find) or not (docker …). */
export function destructiveDelete(cmd: Cmd): { what: string; byTarget: boolean } | undefined {
	const name = nameOf(cmd);
	const args = cmd.words.slice(1);
	if (name === "rm" && (hasFlag(args, ["-r", "-R", "-f"]) || args.some((a) => a === "--recursive" || a === "--force" || /[*?]/.test(a)))) return { what: "rm -rf", byTarget: true };
	if (name === "rmdir") return { what: "rmdir", byTarget: true };
	if (name === "find" && args.includes("-delete")) return { what: "find -delete", byTarget: true };
	if (name === "shred") return { what: "shred", byTarget: true };
	if (name === "dd" && args.some((a) => a.startsWith("of="))) return { what: "dd", byTarget: false };
	if (name === "sed" && hasFlag(args, ["-i"]) && args.some((a) => /^['"]?\d+(,\d+)?d['"]?$/.test(a))) return { what: "sed -i Nd", byTarget: false };
	if (name === "docker" || name === "podman") {
		const pos = positionals(cmd.words);
		if (pos[0] === "rm" || pos[0] === "rmi" || (pos[1] === "rm" && ["container", "image", "volume"].includes(pos[0] ?? "")) || (pos[1] === "prune")) return { what: `${name} ${pos.slice(0, 2).join(" ")}`, byTarget: false };
	}
	return undefined;
}

const SSH_READ = new Set(["cat", "ls", "uname", "df", "du", "head", "tail", "grep", "uptime", "hostname", "whoami", "pwd", "echo", "ps", "journalctl", "stat", "id", "date", "which", "free", "lsblk", "wc", "find"]);
const SSH_OPT_ARG = new Set(["-i", "-p", "-o", "-l", "-F", "-J", "-L", "-R", "-D", "-b", "-c", "-E", "-S", "-W", "-w", "-B", "-m"]);

function readOnlyRemote(words: string[]): boolean {
	const first = words[0] ?? "";
	if (SSH_READ.has(first)) return true;
	if (first === "docker") return ["ps", "logs", "inspect", "images", "stats", "version", "info"].includes(words[1] ?? "");
	if (first === "systemctl") return ["status", "is-active", "list-units", "show", "cat"].includes(words[1] ?? "");
	if (first === "sqlite3") return words.includes("-readonly");
	if (first === "git") return ["status", "log", "diff", "show"].includes(words[1] ?? "");
	return false;
}

const hostAllowed = (host: string, allow: readonly string[]): boolean => allow.some((a) => host === a || host.endsWith(`@${a}`) || host.replace(/^.*@/, "") === a.replace(/^.*@/, ""));

const ADB_READ_SHELL = new Set(["ls", "cat", "getprop", "dumpsys", "logcat", "ps", "df", "id", "pwd", "echo", "uname", "wm", "date"]);

/** W26: writes on a remote host or device outside REMOTE_ALLOW. */
export function remoteWrite(cmd: Cmd, allow: readonly string[]): string | undefined {
	const name = nameOf(cmd);
	const args = cmd.words.slice(1);
	if (name === "ssh") {
		const pos = positionals(cmd.words, SSH_OPT_ARG);
		const host = pos[0];
		if (!host || hostAllowed(host, allow)) return undefined;
		const remote = pos.slice(1);
		const words = remote.length === 1 ? (remote[0] as string).trim().split(/\s+/) : remote;
		if (words.length === 0 || readOnlyRemote(words)) return undefined;
		return `ssh ${host} ${words[0]}`;
	}
	if (name === "scp" || name === "rsync") {
		const remote = positionals(cmd.words).find((a) => /^([\w.-]+@)?[\w.-]+:/.test(a) && !/^[A-Za-z]:[\\/]/.test(a));
		return remote && !hostAllowed(remote.split(":")[0] as string, allow) ? `${name} ${remote.split(":")[0]}` : undefined;
	}
	if (name === "adb") {
		const s = args.indexOf("-s");
		if (s >= 0 && args[s + 1] !== undefined && allow.includes(args[s + 1] as string)) return undefined;
		const pos = positionals(cmd.words, new Set(["-s", "-t", "-H", "-P"]));
		const sub = pos[0];
		if (sub === "push" || sub === "install" || sub === "uninstall" || sub === "install-multiple" || sub === "sideload") return `adb ${sub}`;
		if (sub === "shell") {
			const rest = pos.slice(1);
			const words = rest.length === 1 ? (rest[0] as string).trim().split(/\s+/) : rest;
			const first = words[0] ?? "";
			if (first === "settings" && words[1] !== "put") return undefined;
			if (first === "pm" && words[1] === "list") return undefined;
			if (first === "" || ADB_READ_SHELL.has(first)) return undefined;
			return `adb shell ${first}`;
		}
		return undefined;
	}
	if (name === "udisksctl" || name === "umount") return name;
	if (name === "mount" && positionals(cmd.words).length > 0) return "mount";
	return undefined;
}
