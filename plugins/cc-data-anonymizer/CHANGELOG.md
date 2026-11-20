# Changelog

## 0.5.0

- Stráž trezoru a mapy anon (`vault-guard`): agenti nesmí číst ani měnit `%APPDATA%\anon` (`vault.bin`, `vault.key`, `map.db`, `rules.toml`) nástroji ani příkazy, nesmí spustit `anon unmask|map|vault|tui|rules|import|export`, `--with-values`, `--reveal`, nastavit `ANON_HOME` na skutečný domov ani volat DPAPI. `anon scan|mask`, `--help`, `--version` a `ANON_HOME=<jiná složka>` zůstávají povoleny.

## 0.4.0

- Agenti bez dialogu, přepisy bez maskování, rámeček potvrzení s hodnotami.
