# Git a vydání

- **Strukturální změna (nový řez, přesuny, refaktor) na vlastní větvi**
  (`refactor/…`, `feat/<řez>`). Do `main` se merguje až po bráně a se
  souhlasem uživatele; drobná oprava může jít rovnou na `main`.
- **Před riskantní operací `🔖 snapshot:` commit** — je zadarmo a vrací čas.
- **Jeden commit = jedna logická změna**, ideálně jeden řez. Přesuny souborů
  přes `git mv`, ať historie souboru přežije.
- Tvar zprávy jako v `mozek_rust` (skill `git-commit` tam):
  `<emoji> <typ>: <subject ≤72 znaků>`; u `fix`/`feat`/`refactor` povinné
  `## Kontext` (proč) a `## Poučení` (co neopakovat — test: ušetří to příště
  hodinu?). Emoji: 🐛 fix, ✨ feat, ♻️ refactor, 🔖 snapshot, 📝 docs,
  🔧 config, 📦 deps, 🔥 remove.
- Commituj až po bráně; tvrzení v těle („testy zelené“) jen z výstupu.
- **Vydání** (jen se souhlasem uživatele, vždy znovu): zvedni `version` v `plugins/<plugin>/.claude-plugin/plugin.json`
  a pushni na `main`. Marketplace má auto-update: Claude Code novou verzi
  stáhne po startu příštího sezení (načte ji `/reload-plugins`). Hned teď:
  `claude plugin marketplace update mastnacek` a
  `claude plugin update <plugin>@mastnacek`. **Bez zvednuté verze se nic
  nestáhne.** Verze se zvedá jen u pluginu, který se změnil: oprava → patch
  (`0.4.0` → `0.4.1`), nová funkce nebo změna nastavení → minor (`0.5.0`).
- **Commit se týká jednoho pluginu**; subject začni jeho jménem, pokud to není
  zřejmé (`✨ feat(prompt-translate): …`).
