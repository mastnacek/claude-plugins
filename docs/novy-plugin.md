# Nový plugin

Tři kroky. Každý končí souhlasem uživatele; další krok začíná až po něm.

## 1. Název

Navrhni 2–3 názvy s jednou větou, co plugin dělá, a nech uživatele vybrat.

Dobrý název:

- začíná předponou **`cc-`** (Claude Code), stejně jako pi rozšíření
  začínají `pi-`: `cc-prompt-translate`, `cc-uma`;
- za předponou **říká, co plugin dělá pro uživatele**, ne jak to dělá:
  `cc-prompt-translate`, ne `cc-openrouter-hooks`;
- je **kebab-case**, za předponou 1–3 slova, anglicky (je to klíč
  v `$.state` a název v marketplace);
- je v `.claude-plugin/marketplace.json` **jedinečný**;
- neobsahuje `claude`, `plugin` ani jméno cizího produktu jako značku.

Port z pi vymění předponu `pi-` za `cc-` a zahodí přípony fork verze
(`pi-prompt-translate-czk` → `cc-prompt-translate`, `pi-uma` → `cc-uma`).
Příkaz pluginu předponu mít nemusí (`/prompt-translate`, `/uma`): je to
slovo, které uživatel píše, a na názvu pluginu nezávisí.

**Hotovo:** uživatel název výslovně schválil.

## 2. Kostra

```sh
git checkout main && git checkout -b feat/<název>
scripts/new-plugin.sh <název> "<popis jednou větou>"
```

Skript zkopíruje `templates/plugin/` do `plugins/<název>/`, doplní název, popis
a rok, přidá položku do `.claude-plugin/marketplace.json` a spustí oba
validátory. Kostra obsahuje:

```
.claude-plugin/plugin.json   verze 0.1.0, homepage na tento repozitář
hooks/hooks.json             { "modules": ["./register.tsx"] }
hooks/register.tsx           kořen kompozice: session.start + místo pro řezy
hooks/features/ shared/      prázdné
types/index.d.ts             kontrakt $.state (zatím prázdný)
scripts/vsa-check.sh         hlídá hranice řezů
CLAUDE.md README.md LICENSE tsconfig.json .gitignore
```

Pak plugin poprvé načti, ať engine vygeneruje typy pro `tsc`
(`.claude-plugin/types/`, je v `.gitignore`):

```sh
claude --plugin-dir plugins/<název>
```

**Hotovo:** oba validátory `✔`, `tsc` projde, commit
`✨ feat(<název>): kostra pluginu`.

## 3. Programování

Řez po řezu. Jeden řez = jedna funkce, kterou jde samostatně vypnout nebo
smazat; jak řez poznat a postavit, je v `architektura.md`. Pro API enginu
(události, `$`, `ui.render`, `$.state`, testy) načti skill `plugin-authoring`
a grepuj typy v `.claude-plugin/types/claude-code/index.d.ts`.

Pro každý řez:

1. Složka `hooks/features/<řez>/` s `register.ts(x)`: funkce
   `registerXxx(on)` a případně `startXxx($)`.
2. Zapoj ji v `hooks/register.tsx` jedním řádkem (bez smyček).
3. Hodnoty v `$.state` nejdřív do `types/index.d.ts`, pak atom v každém
   souboru, který je čte nebo zapisuje.
4. Logiku s větvemi, které stojí za test, vytáhni do vedlejšího souboru řezu
   a otestuj (`*.test.ts` vedle ní).
5. `CLAUDE.md` řezu: co dělá, kontrakt (co čte a píše v `$.state`), tabulka
   „Nepatří sem“, pasti. Vzor: `plugins/cc-prompt-translate/hooks/features/*/CLAUDE.md`.
6. Řádek o řezu do `CLAUDE.md` pluginu (§ Řezy) a funkce do README.
7. **Brána** (kořenový `CLAUDE.md`), pak commit.

**Hotovo:** každá funkce, na které se uživatel s tebou dohodl, má řez,
test logiky a zelenou bránu, a uživatel plugin viděl běžet naživo
(`claude --plugin-dir plugins/<název>`).

Vydání (merge do `main`, verze, push): `git-a-vydani.md`.
