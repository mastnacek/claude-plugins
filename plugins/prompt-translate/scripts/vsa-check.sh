#!/usr/bin/env bash
# vsa-check.sh — hlídá hranice vertikálních řezů (VSA) v hooks/.
#
# Struktura:
#   hooks/register.tsx          kořen kompozice (smí importovat cokoli)
#   hooks/features/<řez>/**     jedna složka = jedna funkce
#   hooks/shared/**             sdílené jádro (hooks/shared/translation/ je hluboký modul)
#
# Výstup: každé porušení jako "soubor:řádek: zpráva", exit 1; jinak "VSA OK (<n> files)".
# Kontrolují se všechny *.ts a *.tsx pod hooks/ kromě *.test.ts.
set -euo pipefail

ROOT="$(realpath -m "$(dirname "${BASH_SOURCE[0]}")/..")"
cd "$ROOT"

HOOKS="$ROOT/hooks"
FEATURES="$HOOKS/features"
SHARED="$HOOKS/shared"
TRANSLATION="$SHARED/translation"

violations=0
report() { # $1=soubor (relativně) $2=řádek $3=zpráva
  printf '%s:%s: %s\n' "$1" "$2" "$3"
  violations=$((violations + 1))
}

# Seznam kontrolovaných souborů (testy se přeskakují: smí sahat do vnitřností).
mapfile -t FILES < <(find hooks -type f \( -name '*.ts' -o -name '*.tsx' \) ! -name '*.test.ts' | sort)

# Regulární výraz pro řetězec v uvozovkách a pro `from "..."` / `import("...")`.
STR_RE='["'"'"']([^"'"'"']+)["'"'"']'
IMPORT_GREP='(from[[:space:]]+|import\()["'"'"'][^"'"'"']+["'"'"']'

for file in "${FILES[@]}"; do
  abs="$ROOT/$file"
  dir="$(dirname "$abs")"

  # Řez, ve kterém soubor leží (prázdné, pokud není pod hooks/features/<řez>/).
  slice=""
  if [[ "$abs" == "$FEATURES"/*/* ]]; then
    rest="${abs#"$FEATURES"/}"
    slice="${rest%%/*}"
  fi

  # --- Pravidla 1–3: importy ----------------------------------------------
  while IFS= read -r match; do
    [[ -n "$match" ]] || continue
    line="${match%%:*}"
    text="${match#*:}"
    [[ "$text" =~ $STR_RE ]] || continue
    spec="${BASH_REMATCH[1]}"
    [[ "$spec" == .* ]] || continue # jen relativní cesty (balíčky jako "claude-code" ignorujeme)

    target="$(realpath -m "$dir/$spec")"
    target="${target%.tsx}"; target="${target%.ts}"; target="${target%.js}"

    # 1) Řez nesmí záviset na jiném řezu. Proč: řez musí jít smazat jako celek
    #    (složka pryč = funkce pryč), aniž by se rozbil kdokoli jiný.
    if [[ -n "$slice" && "$target" == "$FEATURES"/*/* ]]; then
      rest="${target#"$FEATURES"/}"
      other="${rest%%/*}"
      if [[ "$other" != "$slice" ]]; then
        report "$file" "$line" "řez '$slice' importuje z jiného řezu '$other' ($spec)"
      fi
    fi

    # 2) Sdílené jádro nesmí znát funkce ani kořen kompozice. Proč: závislosti
    #    míří dolů (register -> features -> shared); opačný směr dělá cykly.
    if [[ "$abs" == "$SHARED"/* ]]; then
      if [[ "$target" == "$FEATURES"/* || "$target" == "$FEATURES" ]]; then
        report "$file" "$line" "shared importuje z hooks/features ($spec)"
      elif [[ "$target" == "$HOOKS/register" ]]; then
        report "$file" "$line" "shared importuje hooks/register ($spec)"
      fi
    fi

    # 3) Hluboký modul schovává vnitřnosti. Proč: veřejné vstupy shared/translation
    #    jsou jen translate.ts a detect.ts; protect.ts a prompts.ts jsou interní,
    #    takže je lze měnit bez dopadu na okolí.
    if [[ "$abs" != "$TRANSLATION"/* ]]; then
      if [[ "$target" == "$TRANSLATION/protect" || "$target" == "$TRANSLATION/prompts" ]]; then
        report "$file" "$line" "import interního modulu shared/translation/${target##*/} zvenčí ($spec)"
      fi
    fi
  done < <(grep -noE "$IMPORT_GREP" "$file" || true)

  # --- Pravidlo 4: síť patří jen sdílenému jádru ---------------------------
  # Proč: jedno místo pro HTTP (klíče, chyby, opakování, telemetrie); řezy volají
  # překlad přes shared, ne přímo $.http.fetch.
  if [[ "$abs" != "$SHARED"/* ]]; then
    while IFS= read -r match; do
      [[ -n "$match" ]] || continue
      report "$file" "${match%%:*}" 'použití "$.http.fetch" mimo hooks/shared (síť je úkol sdíleného jádra)'
    done < <(grep -nF '$.http.fetch' "$file" || true)
  fi
done

if ((violations > 0)); then
  exit 1
fi
echo "VSA OK (${#FILES[@]} files)"
