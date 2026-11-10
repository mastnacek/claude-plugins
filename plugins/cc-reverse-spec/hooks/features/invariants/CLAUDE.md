# Slice: invariants

## Proč existuje

Pravidla, která musí platit všude a vždy (typ peněz, `legacy/` jen ke čtení…),
leží v `spec/invariants.md`. Řez je vkládá do systémového promptu každého
sezení v migračním projektu, aby je agent nemusel hledat. Kdyby zmizel, soubor
by zůstal, ale nikdo by ho nečetl automaticky.

## Co dělá

- `prompt.compose` — za sekce enginu přidá jednu (`scope: "session"`) s nadpisem „Project invariants (cc-reverse-spec)“ a obsahem souboru.
- `section.ts` — `buildSection(text)`: prázdný text → `null`, nad 8000 znaků oříz a připíše, že byl oříznut.

## Kontrakt

- **Čte:** soubory `spec/rules/` (jen existence) a `spec/invariants.md`. Nic v `$.state`.
- **Píše:** nic.

## Nepatří sem

| co | kam patří |
|---|---|
| kontrola, že pravidla mají důkazy a testy | `features/drift` |
| zákaz zápisu do `legacy/` | `features/guard` |
| samotný obsah invariantů | skill `reverse-spec`, šablona `spec/invariants.md` |

## Pasti

- Detekce migračního projektu je v `shared/project.ts` (`isMigrationProject`), společná všem řezům.
- Limit je v znacích, ne v bajtech (~8 kB pro ASCII).
- `session`, ne `shared`: text se liší projekt od projektu, do sdílené cache nepatří.
