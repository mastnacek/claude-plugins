#!/usr/bin/env bash
# new-plugin.sh — kostra nového pluginu ze šablony templates/plugin/.
#
#   scripts/new-plugin.sh <název> "<popis jednou větou>"
#
# Zkopíruje šablonu do plugins/<název>/, doplní název, popis a rok, přidá
# položku do .claude-plugin/marketplace.json a řádek do tabulky v README.md
# a spustí oba validátory.
# Spouštěj z kořene repozitáře.
set -euo pipefail

ROOT="$(realpath "$(dirname "${BASH_SOURCE[0]}")/..")"
cd "$ROOT"

name="${1:-}"
description="${2:-}"

if [[ -z "$name" || -z "$description" ]]; then
  echo "Použití: scripts/new-plugin.sh <název> \"<popis jednou větou>\"" >&2
  exit 2
fi
if [[ ! "$name" =~ ^cc-[a-z0-9]+(-[a-z0-9]+)+$ ]]; then
  echo "Název musí mít tvar cc-<název>-<funkce> v kebab-case (např. cc-uma-memory): $name" >&2
  exit 2
fi
if [[ -e "plugins/$name" ]]; then
  echo "plugins/$name už existuje." >&2
  exit 1
fi

target="plugins/$name"
cp -r templates/plugin "$target"
find "$target" -name .gitkeep -delete

# Popis jde do JSON i Markdownu: escapuje se jednou, přes python (json.dumps).
python3 - "$target" "$name" "$description" "$(date +%Y)" <<'PY'
import json, pathlib, sys
target, name, description, year = sys.argv[1:]
json_desc = json.dumps(description, ensure_ascii=False)[1:-1]
for path in pathlib.Path(target).rglob("*"):
    if not path.is_file():
        continue
    text = path.read_text()
    desc = json_desc if path.suffix == ".json" else description
    new = text.replace("__NAME__", name).replace("__DESCRIPTION__", desc).replace("__YEAR__", year)
    if new != text:
        path.write_text(new)

market = pathlib.Path(".claude-plugin/marketplace.json")
data = json.loads(market.read_text())
data["plugins"].append({"name": name, "source": f"./plugins/{name}", "description": description})
market.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")

# Row in the plugin table of the repository README (after its last row).
readme = pathlib.Path("README.md")
lines = readme.read_text().split("\n")
last = max(i for i, l in enumerate(lines) if l.startswith("| ["))
lines.insert(last + 1, f"| [{name}](plugins/{name}) | {description} |")
readme.write_text("\n".join(lines))
PY

mkdir -p "$target/hooks/features" "$target/hooks/shared"

echo "== claude plugin validate $target"
claude plugin validate "$target"
echo "== claude plugin validate . (marketplace)"
claude plugin validate .

cat <<EOF

Hotovo: $target
Další krok: větev feat/$name, pak programování (docs/novy-plugin.md, krok 3).
Typy enginu (.claude-plugin/types/) vzniknou při prvním načtení:
  claude --plugin-dir $target
EOF
