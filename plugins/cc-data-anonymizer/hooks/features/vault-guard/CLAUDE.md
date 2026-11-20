# Slice: vault-guard

## Proč existuje

Agent běží pod uživatelem, takže DPAPI ho od `%APPDATA%\anon` (`vault.bin`, `vault.key`,
`map.db`, `rules.toml`) neoddělí. Řez technicky zakáže nástrojům sáhnout na domovskou
složku anon a spustit příkazy anon, které odhalují originály nebo mění trezor.

## Co dělá

- `tool.call` na všechny nástroje (`register.ts`), zaregistrovaný v `register.tsx` jako první, aby byl nejvnější: nic (souhlas, `anon scan`, `unmask`) nepoběží na volání, které zamítne.
- Domov anon = `ANON_HOME` sezení a výchozí umístění všech platforem, jejichž základ je v prostředí (`APPDATA`, `HOME`, `XDG_CONFIG_HOME`). Cesty se porovnávají bez ohledu na velikost písmen, `/` = `\`, `..`, `~`, proměnné, `/c/…`, relativní k cwd a názvy 8.3 (`rules.ts`).
- Nástroje s cestou (jakýkoli klíč `*path`, `file`, `dir`, `uri`, …, také MCP) uvnitř domova → zamítnuto; Grep a Glob také tehdy, když jejich kořen (nebo cwd) domov obsahuje, a vzorek Globu s cestou.
- Bash/PowerShell (každý nástroj s polem `command`) → zamítnuto, když příkaz: zmiňuje domov v jakémkoli zápisu nebo jmenuje `vault.bin|vault.key|map.db`; volá DPAPI; spouští `anon` (i cestou, přes `env`, `&`, `Start-Process`, uvnitř `bash -c "…"`) s `unmask|map|vault|tui|rules|import|export`, `--with-values` nebo `--reveal`.
- Povoleno: `anon scan|mask` bez těchto voleb, `--help`, `--version`, `help …`, `ANON_HOME=<jiná složka> anon mask soubor`.
- Zpráva uvádí důvod, říká, že to může uživatel udělat sám (`! <příkaz>`), a nikdy necituje cestu ani obsah. Chyba stráže = zamítnutí.

## Kontrakt

- **`$.state`:** nic. **Čte:** proměnné prostředí a `$.session.cwd()`. **Shared:** nic.

## Nepatří sem

| co | kam patří |
|---|---|
| maskování výsledků a vstupů nástrojů | `features/tool-mask` |
| vlastní volání `anon` pluginu (`$.process.run`) | `shared/anon.ts` (nejsou to volání nástrojů, stráž je nevidí) |

## Pasti

- Stráž musí zůstat první v `register.tsx`; test „not even the consent scan ran“ to hlídá.
- Hrubá heuristika: nezachytí přejmenovanou kopii binárky, zástupné znaky v shellu (`an*`), složené řetězce ani rekurzivní průchod shellem z nadřazené složky. Jistotu dá až oprávnění OS.
- Falešné poplatky jsou záměr (fail-closed): `echo "anon unmask"` se zamítne.
