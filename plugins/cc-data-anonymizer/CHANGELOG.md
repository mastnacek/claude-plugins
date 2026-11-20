# Changelog

## 0.5.2

- `vault-guard`: stráž posuzuje i odmaskovaný vstup. Cesta se zástupným symbolem (tag místo uživatelského jména) už neobejde stráž; po kontrole maskovaného vstupu se pole s cestami a příkaz projdou `anon unmask` a zkontrolují se znovu. Selhání odmaskování = zamítnutí.

## 0.5.1

- `vault-guard`: méně falešných zamítnutí. Zástupný znak (`* ? [..] {..}`) se počítá jen tehdy, když ho jde rozvinout na domov anon; hranaté závorky v kódu a textu (`a['b']`, `FRAMES["x"][0]`) už příkaz neblokují. Složka repozitáře s názvem `anon` mimo domov se nezamítá.

## 0.5.0

- Stráž trezoru a mapy anon (`vault-guard`): agenti nesmí číst ani měnit `%APPDATA%\anon` (`vault.bin`, `vault.key`, `map.db`, `rules.toml`) nástroji ani příkazy, nesmí spustit `anon unmask|map|vault|tui|rules|import|export`, `--with-values`, `--reveal`, nastavit `ANON_HOME` na skutečný domov ani volat DPAPI. `anon scan|mask`, `--help`, `--version` a `ANON_HOME=<jiná složka>` zůstávají povoleny.

## 0.4.0

- Agenti bez dialogu, přepisy bez maskování, rámeček potvrzení s hodnotami.
