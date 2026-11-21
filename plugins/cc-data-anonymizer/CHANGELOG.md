# Changelog

## 0.8.0

- Tajemství se nevracejí do příkazů: volba `shellSecrets` (`deny` výchozí | `ask` | `allow`) a `shellSecretKinds`. Příkaz Bash/PowerShell se značkou druhu `password`, `secret`, `card`, `iban` nebo `national-id` se zamítne; `ask` se zeptá (agenti a `-p` zamítnou). Ostatní druhy se obnovují jako dřív. Jen značky: u stylu `fake` druh není znát.
- PDF: `Read` souboru `.pdf` vrátí jen zamaskovaný text z `pdftotext`; bez `pdftotext` v PATH se čtení zamítne. Dokument se modelu nikdy nepředá.
- Obrázky: `Read` obrázku se ptá „Obrázek nejde zamaskovat. Poslat ho modelu?“ (agenti, `-p` a `consent: never` zamítnou). Vložený obrázek v promptu nejde zamaskovat: pod zprávou je řádek s varováním.

## 0.7.0

- Odmaskování je přísné: plugin volá `anon unmask --strict`; značky, které anon nezná (zapomenuté, cizí, poškozené, escapované), anon vypíše a plugin zamítne stávající zprávou „Neznámá nebo poškozená značka …“. Vlastní kontrola zbytků po odmaskování odpadla.
- Značka je jen skutečná značka: `REDACTED:druh:číslo` s číslicemi. Obecný zápis v dokumentaci (`druh` a `n` písmeny, zástupné symboly) je text a jde zapsat; značka v MCP vstupu se zamítá jen s číslem.
- `REDACTED` se zamítá jen jako zapsaná hodnota: v Edit, Write a NotebookEdit jako hodnota v uvozovkách nebo hned za `=` či `:`; v Bash a PowerShellu jen u příkazu, který zapisuje soubor (`>`, `>>`, `tee`, `Set-Content`, `Add-Content`, `Out-File`, `sed -i`, `-OutFile`). Čtení, hledání a text o `REDACTED` projdou.
- Odstraněn mrtvý čtenář `redactWarning` (pás nad promptem ve `findings-band`) a jeho klíč v kontraktu `$.state`.
- `vault-guard` odmaskovává nepřísně (kontroluje jen cesty).
- Vyžaduje anon s `unmask --strict`.

## 0.6.0

- PowerShell: výstup se maskuje jako u Bash, `command` se před spuštěním odmaskuje. NotebookEdit: odmaskuje se `new_source` i cesta k notebooku; maskují se i výsledky NotebookRead.
- Neznámé značky: po odmaskování vstupu cokoli, co připomíná značku (úplná, jiná velikost písmen, částečná, HTML/XML escape, JSON escape), se zamítne: „Neznámá nebo poškozená značka …“. Značka se nikdy nezapíše.
- Značky sezení: plugin si pamatuje značky, které anon v tomto sezení vydal (`issuedTags` v `$.state`); vstupní značka mimo ně se zamítne dřív, než se zavolá `anon unmask`.
- Styl `redact`: zápis (Edit, Write, NotebookEdit, Bash, PowerShell) se samostatným `REDACTED` se zamítá, už ne jen varuje.
- MCP: vstup `mcp__*` se značkou se zamítá („MCP nástroje značky neodmaskují; použij Edit/Write.“).
## 0.5.2

- `vault-guard`: stráž posuzuje i odmaskovaný vstup. Cesta se zástupným symbolem (tag místo uživatelského jména) už neobejde stráž; po kontrole maskovaného vstupu se pole s cestami a příkaz projdou `anon unmask` a zkontrolují se znovu. Selhání odmaskování = zamítnutí.

## 0.5.1

- `vault-guard`: méně falešných zamítnutí. Zástupný znak (`* ? [..] {..}`) se počítá jen tehdy, když ho jde rozvinout na domov anon; hranaté závorky v kódu a textu (`a['b']`, `FRAMES["x"][0]`) už příkaz neblokují. Složka repozitáře s názvem `anon` mimo domov se nezamítá.

## 0.5.0

- Stráž trezoru a mapy anon (`vault-guard`): agenti nesmí číst ani měnit `%APPDATA%\anon` (`vault.bin`, `vault.key`, `map.db`, `rules.toml`) nástroji ani příkazy, nesmí spustit `anon unmask|map|vault|tui|rules|import|export`, `--with-values`, `--reveal`, nastavit `ANON_HOME` na skutečný domov ani volat DPAPI. `anon scan|mask`, `--help`, `--version` a `ANON_HOME=<jiná složka>` zůstávají povoleny.

## 0.4.0

- Agenti bez dialogu, přepisy bez maskování, rámeček potvrzení s hodnotami.
