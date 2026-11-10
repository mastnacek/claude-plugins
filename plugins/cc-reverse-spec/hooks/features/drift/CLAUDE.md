# Slice: drift

## Proč existuje

Pravidla, jejich důkazy a testy se rozcházejí tiše. `/spec-check`
to vypíše modelu a zapíše souhrn do `spec/confidence.md`. Kdyby zmizel,
rozcházení by se našlo až při migraci.

## Co dělá

- `startDrift` — zaregistruje `/spec-check`; `command.run` volá `runDrift`.
- `/spec-check` (bez argumentů) — projde `spec/rules/*.yaml` a `tests/features/**/*.feature`; hlásí pravidla bez/se špatnou `confidence`, bez `source`, s prázdným `verified_by`, ID bez `@<ID>` scénáře, `@BR-…` tagy bez pravidla, název souboru ≠ `id:`; na konci počty confirmed/inferred/gap.
- Zapíše `spec/confidence.md` (tabulka jako v šabloně skillu + „Open problems“).
- Mimo migrační projekt jedna věta s odkazem na skill (krok 0).
- `parse-rule.ts` — hluboký modul: čte klíče nejvyšší úrovně bez YAML knihovny. `check.ts` — čistá analýza. `run.ts` — IO přes malé rozhraní `DriftFs` (v testech falešný disk).

## Kontrakt

- **Čte:** `spec/rules/*.yaml`, `tests/features/**/*.feature`. Nic v `$.state`.
- **Píše:** `spec/confidence.md`.

## Nepatří sem

| co | kam patří |
|---|---|
| stavový řádek s počty | `features/status` (počítá si sám, viz níž) |
| plný YAML parser, kontrola `behavior`/EARS | mimo rozsah; schéma je ve skillu |
| výpis do modelu s víc než 50 problémy | zkrácen; plný seznam je v `spec/confidence.md` také zkrácen — opravit a spustit znovu |

## Pasti

- Text příkazu jde modelu do kontextu, proto je celý vrácený jako `{ text }`; nepoužívat `$.ui.log` (jednořádkový).
- Parser: `#` uvnitř uvozovek bere jako komentář; vnořené položky počítá jako položky (stačí „aspoň jedna“). `[]` a prázdný blok = prázdný seznam.
- Šablonová `BR-XXX-000.yaml` se kontroluje jako každá jiná — po zkopírování ji smazat.
- Tag v komentáři (`# @BR-…`) se nepočítá.
- Příkaz se nesmí jmenovat jako skill pluginu (`reverse-spec`): engine registraci odmítne a výjimka shodí `session.start`.
- `startDrift` chybu registrace zaloguje jedním řádkem (`$.ui.log`) a nevyhodí ji; ostatní řezy startují dál.
