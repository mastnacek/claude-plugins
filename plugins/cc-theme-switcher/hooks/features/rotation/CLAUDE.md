# Slice: rotation

## Proč existuje

Téma Claude Code se má samo měnit podle slunce. Řez při startu zapíše téma
aktuálního slotu a pak to dělá každou minutu. Kdyby zmizel, plugin by
nepřepínal nic; `/tts` by pořád uměl téma zapsat na požádání.

## Co dělá

- `startRotation` (`register.ts`) — hned `applyRotation`, pak `$.clock.every(60 s)`.
- `startNotes` — jednořádkové rady po prvním zápisu: vadný soubor nastavení, chyba herdr, vypnutý `auto_switch`, „vyber v /theme téma tts“ (s „jednou restartuj Claude Code“, když složka `~/.claude/themes` před zápisem neexistovala).

## Kontrakt

- **Čte / píše:** nic ze `$.state`. Zdrojem pravdy jsou soubory: `~/.claude/cc-theme-switcher.json` (sdílené všemi sezeními) a výsledný `~/.claude/themes/tts.json`.
- **Shared:** `apply` (vlastní zápis, výběr slotu, herdr), `selected-theme`.

## Nepatří sem

| co | kam patří |
|---|---|
| výběr slotu (slunce, hold), mapování palety na tokeny, zápis souboru | `shared/apply.ts`, `shared/palettes.ts` |
| herdr `config.toml` | `shared/herdr/` |
| změna nastavení, `hold`, `off` | `features/tts-command` |
| `$.theme.set` | nikam — v terminálu se nečte, přepíná jen soubor v `~/.claude/themes` |

## Pasti

- Tik zapisuje jen při změně obsahu `tts.json` (porovná s tím, co v souboru je), takže víc sezení naráz si nepřekáží. Vypnutá rotace nezapisuje nic; `off` zapíše jednou `tts.json` jen s `base`.
- Selhání tiku se loguje jednou za sérii, ne každou minutu.
- Claude Code načte změnu `tts.json` za běhu; složku, která při jeho startu neexistovala, nesleduje — proto rada s restartem.
