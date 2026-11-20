// Ported from pi-uma's approval_gate tests: the pure logic only.

import { expect, test } from "claude-code/testing";
import { isBypassingBashCommand as bypass, isUmaMemoryFilePath, musclePlanOfCommand } from "./bypass";

test("isUmaMemoryFilePath detects project and global UMA memory paths", () => {
	expect(isUmaMemoryFilePath(".uma/decision/01ABC.md")).toBe(true);
	expect(isUmaMemoryFilePath("d:/repo/.uma/preference/01ABC.md")).toBe(true);
	expect(isUmaMemoryFilePath("C:\\Users\\user\\AppData\\Roaming\\uma\\uma\\data\\global\\fact\\01.md")).toBe(true);
	expect(isUmaMemoryFilePath("src/main.rs")).toBe(false);
	expect(isUmaMemoryFilePath(".claude/settings.json")).toBe(false);
});

test("isUmaMemoryFilePath covers the macOS and Linux global stores", () => {
	expect(isUmaMemoryFilePath("/Users/x/Library/Application Support/com.uma.uma/global/decision/01.md")).toBe(true);
	expect(isUmaMemoryFilePath("/home/x/.local/share/uma/global/fact/01.md")).toBe(true);
	expect(isUmaMemoryFilePath("/home/x/projects/app/src/main.rs")).toBe(false);
});

test("isUmaMemoryFilePath guards the short Windows/macOS global stores", () => {
	expect(isUmaMemoryFilePath("C:\\Users\\user\\AppData\\Roaming\\uma\\global\\fact\\01.md")).toBe(true);
	expect(isUmaMemoryFilePath("/Users/x/Library/Application Support/uma/global/decision/01.md")).toBe(true);
});

test("isUmaMemoryFilePath ignores the watchdog log next to the store", () => {
	expect(isUmaMemoryFilePath("C:\\Users\\user\\AppData\\Roaming\\uma\\agent-watchdog\\log.jsonl")).toBe(false);
	expect(isUmaMemoryFilePath("/Users/x/Library/Application Support/uma/agent-watchdog/log.jsonl")).toBe(false);
	expect(isUmaMemoryFilePath("/home/x/.local/share/uma/agent-watchdog/log.jsonl")).toBe(false);
});

test("bash guard covers the short global store and not the watchdog dir", () => {
	expect(bypass('echo x >> "$APPDATA/uma/global/f.md"')).toBe(true);
	expect(bypass('echo x >> "$APPDATA/uma/agent-watchdog/log"')).toBe(false);
});

test("catches quoted, uma-cli and every memory-writing subcommand", () => {
	expect(bypass('"/path/to/uma.exe" write --title x')).toBe(true);
	expect(bypass("uma-cli supersede 01ABC --title x")).toBe(true);
	expect(bypass("uma staging approve 01ABC")).toBe(true);
	expect(bypass("uma skill new --name x")).toBe(true);
	expect(bypass("uma muscle new r --template '[]'")).toBe(true);
	expect(bypass("uma plasticity reinforce rule-01")).toBe(true);
	expect(bypass("uma plasticity frustrate rule-01")).toBe(true);
	expect(bypass("uma mcp serve --allow-writes")).toBe(true);
	expect(bypass("uma staging list")).toBe(false);
	expect(bypass("uma plasticity status")).toBe(false);
	expect(bypass("uma mcp serve")).toBe(false);
	expect(bypass("uma list --json")).toBe(false);
});

test("catches shell writes into a store path, not reads", () => {
	expect(bypass("echo hi > .uma/decision/x.md")).toBe(true);
	expect(bypass("cp /tmp/a .uma/x.md")).toBe(true);
	expect(bypass("sed -i s/a/b/ .uma/x.md")).toBe(true);
	expect(bypass("python -c \"open('.uma/x','w')\"")).toBe(true);
	expect(bypass("cat .uma/decision/x.md")).toBe(false);
	expect(bypass("ls .uma/")).toBe(false);
});

test("the redirection target decides, not a bare mention", () => {
	expect(bypass("ls .uma/ 2>/dev/null")).toBe(false);
	expect(bypass("cat .uma/decision/x.md 2>/dev/null | head")).toBe(false);
	expect(bypass("grep -r foo .uma/ > /tmp/out.txt")).toBe(false);
	expect(bypass("uma list --json 2>/dev/null")).toBe(false);
	expect(bypass("wc -l < .uma/decision/x.md")).toBe(false);
	expect(bypass("echo hi 2>/dev/null > .uma/x.md")).toBe(true);
	expect(bypass("echo hi >>.uma/x.md")).toBe(true);
	expect(bypass("echo hi &> .uma/x.md")).toBe(true);
	expect(bypass("echo hi | tee .uma/x.md")).toBe(true);
	expect(bypass("rm .uma/x.md")).toBe(true);
	expect(bypass("dd if=/dev/zero of=.uma/x.md")).toBe(true);
	expect(bypass("truncate -s 0 .uma/x.md")).toBe(true);
	expect(bypass("sudo rm .uma/x.md")).toBe(true);
	expect(bypass("env FOO=1 rm .uma/x.md")).toBe(true);
	expect(bypass("python3 -c \"open('.uma/x','w')\"")).toBe(true);
	expect(bypass('echo x >> "$APPDATA/uma/uma/data/global/f.md"')).toBe(true);
	expect(bypass("ls .uma/ 2>/dev/null && rm -rf .uma")).toBe(true);
	expect(bypass("echo ok > /tmp/a; cat .uma/x.md > /tmp/b")).toBe(false);
});

test("uma write / supersede in every spelling", () => {
	expect(bypass("uma write --title test --body hello")).toBe(true);
	expect(bypass("./bin/uma.exe supersede 01ABC --title test")).toBe(true);
	expect(bypass("uma.exe write --type decision")).toBe(true);
	expect(bypass("uma search 'query'")).toBe(false);
	expect(bypass("uma doctor")).toBe(false);
	expect(bypass("cargo test")).toBe(false);
});

test("shell wrappers cannot hide a memory write", () => {
	expect(bypass('bash -c "D:/bin/uma.exe write --title bypass-test --body x --type note"')).toBe(true);
	expect(bypass("bash -c 'uma write --title a --body b'")).toBe(true);
	expect(bypass('sh -lc "uma supersede 01ABC --title t"')).toBe(true);
	expect(bypass("sudo bash -c 'uma staging approve 01X'")).toBe(true);
	expect(bypass("cmd /c uma.exe write --title a --body b")).toBe(true);
	expect(bypass('cmd.exe /C "uma-cli.exe write --title a"')).toBe(true);
	expect(bypass('powershell -Command "uma write --title a --body b"')).toBe(true);
	expect(bypass("pwsh -NoProfile -c 'uma plasticity reinforce 01X'")).toBe(true);
	expect(bypass('bash -c "cmd /c uma write --title a"')).toBe(true);
	expect(bypass("powershell -Command \"Set-Content .uma/x.md 'y'\"")).toBe(true);
	expect(bypass('pwsh -c "Out-File -FilePath .uma/x.md -InputObject y"')).toBe(true);
	expect(bypass("cmd /c copy nul .uma\\x.md")).toBe(true);
	expect(bypass("bash -c 'printf y | tee .uma/x.md'")).toBe(true);
	expect(bypass("bash -c 'echo y > .uma/x.md'")).toBe(true);
	expect(bypass("bash -c 'uma search leaf'")).toBe(false);
	expect(bypass("cmd /c type .uma\\x.md")).toBe(false);
	expect(bypass('powershell -Command "Get-Content .uma/x.md"')).toBe(false);
	expect(bypass("bash script.sh")).toBe(false);
	expect(bypass("bash -c 'npm test'")).toBe(false);
	expect(bypass("Set-Content src/app.js 'x'")).toBe(false);
});

test("store-mutating CLI commands are caught, read-only and dry-run spellings are not", () => {
	expect(bypass("uma domains set --domain gatetest 01M60MRAHCE754NDY032ZTV2WA")).toBe(true);
	expect(bypass("D:/x/bin/uma.exe migrate")).toBe(true);
	expect(bypass("uma migrate --reindex")).toBe(true);
	expect(bypass("uma sync push --message x")).toBe(true);
	expect(bypass("uma sync pull")).toBe(true);
	expect(bypass("uma staging discard 01M60N92B1MDJ7YXMF79FQWCZ7")).toBe(true);
	expect(bypass("uma muscle run git-status-log --confirm")).toBe(true);
	expect(bypass("bash -c 'uma sync push'")).toBe(true);
	expect(bypass("uma migrate --dry-run")).toBe(false);
	expect(bypass("uma sync status")).toBe(false);
	expect(bypass("uma staging list")).toBe(false);
	expect(bypass("uma muscle run git-status-log")).toBe(false);
	expect(bypass("uma domains --help")).toBe(false);
});

test("musclePlanOfCommand reads name and --plan-hash in every spelling", () => {
	const one = (c: string) => musclePlanOfCommand(c).runs;
	expect(one("uma muscle run verify --confirm --plan-hash 9f2c41d07a3be518")).toEqual([{ name: "verify", planHash: "9f2c41d07a3be518" }]);
	expect(one("uma muscle run verify --confirm --plan-hash=9f2c41d07a3be518 --json")).toEqual([{ name: "verify", planHash: "9f2c41d07a3be518" }]);
	expect(one('uma muscle run "verify" --confirm --plan-hash "9f2c41d07a3be518"')).toEqual([{ name: "verify", planHash: "9f2c41d07a3be518" }]);
	expect(one("uma muscle run --plan-hash abc --confirm verify")).toEqual([{ name: "verify", planHash: "abc" }]);
	expect(one("uma muscle run verify --confirm")).toEqual([{ name: "verify", planHash: undefined }]);
	expect(one("uma muscle run verify --confirm --plan-hash")).toEqual([{ name: "verify", planHash: undefined }]);
	expect(one("uma muscle run --confirm")).toEqual([{ name: "", planHash: undefined }]);
});

test("musclePlanOfCommand sees through wrappers and counts every run", () => {
	expect(musclePlanOfCommand("sudo env X=1 /usr/bin/uma muscle run a --confirm").runs).toHaveLength(1);
	expect(musclePlanOfCommand('bash -c "uma muscle run a --confirm --plan-hash h"').runs).toEqual([{ name: "a", planHash: "h" }]);
	expect(musclePlanOfCommand("uma-cli muscle run a --confirm").runs).toHaveLength(1);
	expect(musclePlanOfCommand("uma muscle run a --confirm && uma muscle run b --confirm").runs).toHaveLength(2);
});

test("musclePlanOfCommand: dry-runs and other commands are no runs; other memory changes are flagged", () => {
	expect(musclePlanOfCommand("uma muscle run a --json").runs).toEqual([]);
	expect(musclePlanOfCommand("uma muscle list").runs).toEqual([]);
	expect(musclePlanOfCommand("echo uma muscle run a --confirm").runs).toEqual([]);
	expect(musclePlanOfCommand("uma muscle run a --confirm").other).toBe(false);
	expect(musclePlanOfCommand("uma muscle run a --confirm | tee /tmp/out").other).toBe(false);
	expect(musclePlanOfCommand("uma write --title x && uma muscle run a --confirm").other).toBe(true);
	expect(musclePlanOfCommand("uma muscle run a --confirm > .uma/x.md").other).toBe(true);
});

test("heredoc body written to a file is ignored; its redirect target is not", () => {
	expect(bypass("cat > README.md <<'EOF'\numa muscle run x --confirm\numa write --title x\nEOF")).toBe(false);
	expect(bypass("tee docs/a.md <<EOF\numa write --title x\nEOF")).toBe(false);
	expect(bypass('cat > docs/a.md <<"EOF"\numa write --title x\nEOF')).toBe(false);
	expect(bypass("cat > docs/a.md <<-EOF\n\tuma write --title x\n\tEOF")).toBe(false);
	expect(musclePlanOfCommand("cat > README.md <<'EOF'\numa muscle run x --confirm\nEOF").runs).toEqual([]);
	expect(bypass("cat > .uma/x.md <<'EOF'\nhello\nEOF")).toBe(true);
	expect(bypass("tee .uma/x.md <<EOF\nhello\nEOF")).toBe(true);
});

test("heredoc body given to a shell or interpreter is still judged", () => {
	expect(bypass("bash <<'EOF'\numa write --title x\nEOF")).toBe(true);
	expect(bypass("python3 - <<'EOF'\nimport os; os.system('uma write --title x')\numa write --title x\nEOF")).toBe(true);
	expect(bypass("sudo env A=1 /bin/sh <<EOF\numa write --title x\nEOF")).toBe(true);
	expect(bypass("cat <<EOF | sh\numa write --title x\nEOF")).toBe(true);
	expect(bypass("xargs <<EOF\numa write --title x\nEOF")).toBe(true);
	expect(musclePlanOfCommand("bash <<'EOF'\numa muscle run x --confirm\nEOF").runs).toHaveLength(1);
});

test("two heredocs, commands after the terminator, unterminated and here-strings", () => {
	expect(bypass("cat > a.md <<EOF\numa write --title x\nEOF\ncat > b.md <<EOF\numa write --title y\nEOF")).toBe(false);
	expect(bypass("cat > a.md <<EOF\nhello\nEOF\numa write --title x")).toBe(true);
	expect(bypass("cat a.md b.md <<A <<B\numa write --title x\nA\numa write --title y\nB")).toBe(false);
	expect(bypass("cat > a.md <<EOF\numa write --title x")).toBe(true);
	expect(bypass("cat <<< 'uma write --title x'")).toBe(false); // here-string: unchanged (the text is an argument, not a command)
});

test("uma debt clear is gated; add, settle, list and check stay free", () => {
	expect(bypass("uma debt clear")).toBe(true);
	expect(bypass("sudo uma debt clear")).toBe(true);
	expect(bypass("bash -c 'uma debt clear'")).toBe(true);
	expect(bypass("uma debt add --source a --required b")).toBe(false);
	expect(bypass("uma debt settle debt-1")).toBe(false);
	expect(bypass("uma debt list --all --json")).toBe(false);
	expect(bypass("uma debt check --origin claude-code --json")).toBe(false);
});

test("false alarms: text of an expression or value is not a write target", () => {
	expect(bypass("sed -i 's|x|.uma/.state/debts.json|' README.md")).toBe(false);
	expect(bypass("sed -i 's/x/see .uma/a.md/' README.md")).toBe(false);
	expect(bypass("sed -i s/x/.uma\\/a/ README.md")).toBe(false);
	expect(bypass("sed -e 's/x/.uma/y/' -e p README.md")).toBe(false);
	expect(bypass("sed --expression='s/x/.uma/y/' README.md")).toBe(false);
	expect(bypass("sed -n 's/new/.uma/f/p' README.md")).toBe(false);
	expect(bypass("cp x /tmp/y 2>/dev/null")).toBe(false);
	expect(bypass("cp .uma/a /tmp/b")).toBe(false);
	expect(bypass("cp -t /tmp .uma/a")).toBe(false);
	expect(bypass("echo '.uma/x.md' > out.txt")).toBe(false);
	expect(bypass('echo "see .uma/x.md; and > .uma/y" > out.txt')).toBe(false);
	expect(bypass('git commit -m "docs: .uma/ and uma write"')).toBe(false);
	expect(bypass("dd if=.uma/x.md of=/tmp/y")).toBe(false);
	expect(bypass("touch -r .uma/x.md /tmp/y")).toBe(false);
	expect(bypass("truncate -r .uma/x.md /tmp/y")).toBe(false);
	expect(bypass("ln -s .uma/a link")).toBe(false);
	expect(bypass("rsync -a .uma/ /tmp/backup/")).toBe(false);
	expect(bypass("it's fine; echo hi")).toBe(false);
});

test("real writes stay caught: sed, cp, mv, tee, rm, dd and friends", () => {
	expect(bypass("sed -i s/x/y/ .uma/a.md")).toBe(true);
	expect(bypass("sed -i.bak 's/x/y/' .uma/a.md")).toBe(true);
	expect(bypass("sed -e 's/x/y/' -i .uma/a.md")).toBe(true);
	expect(bypass("sed 's/x/y/w .uma/f'")).toBe(true);
	expect(bypass("sed -n 's/x/y/gw .uma/f' README.md")).toBe(true);
	expect(bypass("sed -n -e 'p;w .uma/f' README.md")).toBe(true);
	expect(bypass("sed -i 's/x/y/' README.md .uma/a.md")).toBe(true);
	expect(bypass("cp x .uma/")).toBe(true);
	expect(bypass("cp x .uma/y 2>/dev/null")).toBe(true);
	expect(bypass("cp -t .uma x")).toBe(true);
	expect(bypass("cp --target-directory=.uma x")).toBe(true);
	expect(bypass('cp x ".uma/a b.md"')).toBe(true);
	expect(bypass("cp -rt .uma src")).toBe(true);
	expect(bypass("mv .uma/a /tmp")).toBe(true);
	expect(bypass("mv a .uma/b")).toBe(true);
	expect(bypass("install -m 644 x .uma/y")).toBe(true);
	expect(bypass("install -d .uma/new")).toBe(true);
	expect(bypass("rsync -a --remove-source-files .uma/ /tmp/b/")).toBe(true);
	expect(bypass("rsync -a src/ .uma/")).toBe(true);
	expect(bypass("ln -s x .uma/link")).toBe(true);
	expect(bypass("tee .uma/x")).toBe(true);
	expect(bypass("tee -a .uma/x")).toBe(true);
	expect(bypass("rm .uma/x")).toBe(true);
	expect(bypass("rm -rf .uma")).toBe(true);
	expect(bypass("touch .uma/x")).toBe(true);
	expect(bypass("chmod 600 .uma/x")).toBe(true);
	expect(bypass("dd if=/dev/zero of=.uma/x bs=1")).toBe(true);
	expect(bypass("truncate -s 0 .uma/x")).toBe(true);
	expect(bypass("echo hi >> .uma/x")).toBe(true);
	expect(bypass('echo hi > ".uma/a b.md"')).toBe(true);
});

test("wrappers and heredocs still see the real operands", () => {
	expect(bypass("bash -c 'sed -i s/x/y/ .uma/a.md'")).toBe(true);
	expect(bypass("bash -c 'echo ok; cp x .uma/'")).toBe(true);
	expect(bypass('sudo bash -c "uma write --title x; echo done"')).toBe(true);
	expect(bypass("sudo cp x .uma/")).toBe(true);
	expect(bypass("sudo mv .uma/a /tmp")).toBe(true);
	expect(bypass("bash -c 'sed -i \"s|x|.uma/y|\" README.md'")).toBe(false);
	expect(bypass("sudo sed -i 's|x|.uma/y|' README.md")).toBe(false);
	expect(bypass("tee .uma/x <<EOF\nhello\nEOF")).toBe(true);
	expect(bypass("cat > README.md <<EOF\nsed -i s/x/y/ .uma/a.md\nEOF")).toBe(false);
	expect(bypass("python3 -c \"open('.uma/x','w')\"")).toBe(true);
});
