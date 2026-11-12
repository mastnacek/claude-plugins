// scaffold.ts — the files of a starter herdr plugin (rust | typescript | bash). Pure; no `$`.
//
//   scaffoldFiles(opts) → { path → text }   paths relative to the plugin folder
//   checkScaffold(opts) → error text | undefined

export type Language = "rust" | "typescript" | "bash";
export const LANGUAGES: readonly Language[] = ["rust", "typescript", "bash"];

export type ScaffoldOptions = { id: string; name: string; language: Language; description?: string };

const ID = /^[A-Za-z0-9._:-]+$/;

export function checkScaffold(o: ScaffoldOptions): string | undefined {
	if (!LANGUAGES.includes(o.language)) return `Unknown language '${o.language}' (use ${LANGUAGES.join(", ")}).`;
	if (!ID.test(o.id)) return `Invalid id '${o.id}' (letters, digits, '.', ':', '_', '-').`;
	if (o.name.trim() === "") return "The name must not be empty.";
	return undefined;
}

/** A string literal valid in TOML, TypeScript and Rust. */
const q = (s: string): string => JSON.stringify(s);
/** A POSIX-shell single-quoted word. */
const sh = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`;
const slug = (id: string): string => id.replace(/[^a-zA-Z0-9_-]/g, "_");

function manifest(o: ScaffoldOptions): string {
	const head = `id = ${q(o.id)}
name = ${q(o.name)}
version = "0.1.0"
min_herdr_version = "0.7.0"
${o.description ? `description = ${q(o.description)}\n` : ""}platforms = ["linux", "macos", "windows"]
`;
	if (o.language === "typescript") {
		return `${head}
[[build]]
command = ["npm", "ci"]

[[build]]
command = ["npm", "run", "build"]

[[actions]]
id = "hello"
title = "Hello Action"
contexts = ["workspace"]
command = ["node", "dist/index.js"]
`;
	}
	if (o.language === "rust") {
		const bin = slug(o.id);
		return `${head}
[[build]]
command = ["cargo", "build", "--release"]

[[actions]]
id = "notify"
title = "Quick Notify"
contexts = ["workspace"]
command = ["target/release/${bin}", "notify"]

[[panes]]
id = "dashboard"
title = ${q(`${o.name} Dashboard`)}
placement = "popup"
width = "70%"
height = 16
command = ["target/release/${bin}", "dashboard"]
`;
	}
	return `${head}
[[actions]]
id = "hello"
title = "Hello Action"
contexts = ["workspace"]
command = ["sh", "action.sh"]
platforms = ["linux", "macos"]
`;
}

function readme(o: ScaffoldOptions): string {
	const vsa =
		o.language === "rust"
			? "\n## Architecture (VSA)\n- `src/main.rs`: composition root and CLI dispatch\n- `src/shared/`: kernel (Herdr client, context); knows no slice\n- `src/slices/`: isolated feature slices; slices never import each other\n"
			: "";
	return `# ${o.name}\n\n${o.description ?? "Herdr plugin."}\n${vsa}\n## Local testing\n\`\`\`bash\nherdr plugin link .\nherdr plugin action list --plugin ${o.id}\n\`\`\`\n`;
}

function typescript(o: ScaffoldOptions): Record<string, string> {
	const pkg = { name: o.id.replace(/[^a-zA-Z0-9_-]/g, "-"), version: "0.1.0", type: "module", scripts: { build: "tsc", watch: "tsc -w" }, devDependencies: { "@types/node": "^22.0.0", typescript: "^5.5.0" } };
	const tsconfig = { compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", outDir: "dist", rootDir: "src", strict: true, skipLibCheck: true }, include: ["src/**/*"] };
	return {
		"package.json": `${JSON.stringify(pkg, null, 2)}\n`,
		"tsconfig.json": `${JSON.stringify(tsconfig, null, 2)}\n`,
		"src/index.ts": `import { spawnSync } from "node:child_process";

const herdrBin = process.env.HERDR_BIN_PATH ?? "herdr";

console.log("Invoked action from pane:", process.env.HERDR_PANE_ID);

// Example: notify Herdr
spawnSync(herdrBin, ["notification", "show", ${q(o.name)}, "--body", "Action executed!"], {
  stdio: "inherit",
});
`,
	};
}

function bash(o: ScaffoldOptions): Record<string, string> {
	return {
		"action.sh": `#!/usr/bin/env sh
HERDR="\${HERDR_BIN_PATH:-herdr}"
echo "Bash plugin executed from pane: \${HERDR_PANE_ID:-unknown}"
"$HERDR" notification show ${sh(o.name)} --body "Action executed from Bash!"
`,
	};
}

function rust(o: ScaffoldOptions): Record<string, string> {
	const name = q(o.name);
	return {
		"Cargo.toml": `[package]
name = ${q(slug(o.id))}
version = "0.1.0"
edition = "2021"

[dependencies]
ratatui = { version = "0.30", features = ["all-widgets"] }
crossterm = { version = "0.28", features = ["event-stream"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
`,
		"src/main.rs": `mod shared;
mod slices;

use std::env;
use std::io;

fn main() -> io::Result<()> {
    let args: Vec<String> = env::args().collect();
    let command = args.get(1).map(|s| s.as_str()).unwrap_or("dashboard");

    match command {
        "dashboard" => slices::dashboard::run_popup()?,
        "notify" => slices::notify::run_action()?,
        unknown => eprintln!("Unknown command: {}", unknown),
    }

    Ok(())
}
`,
		"src/shared/mod.rs": "pub mod client;\npub mod context;\n",
		"src/shared/client.rs": `use std::env;
use std::process::Command;

pub struct HerdrClient {
    bin: String,
}

impl HerdrClient {
    pub fn new() -> Self {
        Self {
            bin: env::var("HERDR_BIN_PATH").unwrap_or_else(|_| "herdr".to_string()),
        }
    }

    pub fn notify(&self, title: &str, body: &str) {
        let _ = Command::new(&self.bin)
            .args(["notification", "show", title, "--body", body])
            .status();
    }
}
`,
		"src/shared/context.rs": `use serde::{Deserialize, Serialize};
use std::env;

#[derive(Debug, Deserialize, Serialize, Default)]
pub struct HerdrContext {
    pub workspace_id: Option<String>,
    pub tab_id: Option<String>,
    pub pane_id: Option<String>,
    pub invocation_source: Option<String>,
}

impl HerdrContext {
    pub fn from_env() -> Self {
        match env::var("HERDR_PLUGIN_CONTEXT_JSON") {
            Ok(json_str) => serde_json::from_str(&json_str).unwrap_or_default(),
            Err(_) => HerdrContext::default(),
        }
    }
}
`,
		"src/slices/mod.rs": "pub mod dashboard;\npub mod notify;\n",
		"src/slices/notify/mod.rs": `use crate::shared::client::HerdrClient;
use crate::shared::context::HerdrContext;
use std::env;
use std::io;

const NAME: &str = ${name};

pub fn run_action() -> io::Result<()> {
    let client = HerdrClient::new();
    let ctx = HerdrContext::from_env();
    let pane_id = env::var("HERDR_PANE_ID").unwrap_or_else(|_| "unknown".to_string());

    let body = format!("Pane: {} | WS: {:?}", pane_id, ctx.workspace_id);
    client.notify(NAME, &body);
    println!("[Notify Slice] Notified: {}", body);
    Ok(())
}
`,
		"src/slices/dashboard/mod.rs": `use crossterm::{
    event::{self, Event, KeyCode},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::{
    backend::CrosstermBackend,
    style::{Color, Style},
    widgets::{Block, Clear, Paragraph},
    Terminal,
};
use std::env;
use std::io::{self, stdout};

const NAME: &str = ${name};

pub fn run_popup() -> io::Result<()> {
    enable_raw_mode()?;
    let mut stdout = stdout();
    execute!(stdout, EnterAlternateScreen)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    let pane_id = env::var("HERDR_PANE_ID").unwrap_or_else(|_| "unknown".to_string());

    loop {
        terminal.draw(|f| {
            let area = f.area();
            let block = Block::bordered()
                .title(format!(" {} (Press 'q' to exit) ", NAME))
                .border_style(Style::default().fg(Color::Cyan));
            let content = Paragraph::new(format!("Host Pane: {}\\nReady for agent operations.\\n[Vertical Slice Architecture]", pane_id))
                .block(block);

            f.render_widget(Clear, area);
            f.render_widget(content, area);
        })?;

        if let Event::Key(key) = event::read()? {
            if key.code == KeyCode::Char('q') || key.code == KeyCode::Esc {
                break;
            }
        }
    }

    disable_raw_mode()?;
    execute!(terminal.backend_mut(), LeaveAlternateScreen)?;
    terminal.show_cursor()?;
    Ok(())
}
`,
	};
}

export function scaffoldFiles(o: ScaffoldOptions): Record<string, string> {
	const files: Record<string, string> = {
		"herdr-plugin.toml": manifest(o),
		".gitignore": "dist/\nnode_modules/\ntarget/\n.env\n",
		"README.md": readme(o),
	};
	const lang = o.language === "typescript" ? typescript(o) : o.language === "rust" ? rust(o) : bash(o);
	return { ...files, ...lang };
}
