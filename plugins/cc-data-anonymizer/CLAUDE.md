# cc-data-anonymizer

Maskuje citlivá data (jména Notes, e-maily, hesla, tokeny) v promptech, @ souborech a výsledcích nástrojů přes CLI anon

Obecná pravidla pro všechny pluginy (postup, architektura, pasti enginu, git
a vydání) jsou v kořenovém `../../CLAUDE.md` a v `../../docs/`.

Každý řez má vlastní `CLAUDE.md` s kontraktem a tabulkou **„Nepatří sem“**;
než do řezu sáhneš, přečti ji.

## Příkazy

```sh
# vše spouštěj ze složky pluginu (plugins/cc-data-anonymizer/)
claude plugin validate .        # validátor enginu: atomy, on/$, registrace
claude plugin test .            # všechny *.test.ts
scripts/vsa-check.sh            # hranice řezů
npx -y -p typescript tsc -p . --noEmit   # typy (po prvním načtení enginem)
```

**Brána před commitem: všechny čtyři zelené.**

Vývoj naživo: `claude --plugin-dir .` (hot reload). Je-li plugin zároveň
nainstalovaný z marketplace, nejdřív `claude plugin disable cc-data-anonymizer@mastnacek`,
jinak běží dvakrát.

## Architektura

```
hooks/
  register.tsx        kořen kompozice — jen zapojí řezy
  features/<řez>/     jedna funkce = jedna složka (hooky, logika, testy, CLAUDE.md)
  shared/             technika bez obchodní logiky; nezná řezy
types/index.d.ts      kontrakt $.state — jediné místo, kde se řezy potkají
```

## Řezy

- `prompt-mask` — maskuje prompt a `@` soubory (`anon mask`), při prvním souboru ukáže `anon scan` a čeká na povolení.
- `tool-mask` — maskuje výsledky Read, Grep, Bash, PowerShell, Edit, Write, NotebookEdit a MCP; vstupy Edit, Write, NotebookEdit, Bash, PowerShell odmaskuje (`anon unmask`); neznámé a cizí značky (přes `anon unmask --strict`), `REDACTED` zapsané jako hodnota souboru a značky v MCP zamítne.
- `shell-secrets` — příkaz Bash/PowerShell se značkou druhu z `shellSecretKinds` (výchozí password, secret, card, iban, national-id) zamítne (`shellSecrets`: deny | ask | allow); stojí před `tool-mask`.
- `media-guard` — `Read` PDF vrátí jen zamaskovaný text z `pdftotext` (bez něj zamítne); `Read` obrázku se ptá na souhlas (agenti a `-p` zamítnou).
- `findings-band` — barevný panel souhlasu (nálezy po souborech, tlačítka Povolit / Zamítnout; záloha `$.ui.ask`) .
- `mask-note` — malý rámeček pod řádkem nástroje a pod zprávou uživatele: „zamaskováno N hodnot (druhy), styl X“ a hodnoty podle volby `reveal` (jen obrazovka, nikdy model).
- `vault-guard` — fail-closed stráž: agentům zakáže soubory v domově anon (vault, klíč, mapa, pravidla) a příkazy `anon`, které odhalují originály nebo mění trezor, i DPAPI; zamítnutí říká, že to uživatel udělá sám (`!`).
- `reply-unmask` — volitelně (`unmaskReply`, vypnuto) odkryje odpověď asistenta na obrazovce.

Sdílené: `shared/anon.ts` (jediné místo, které spouští `anon`; binárka z `ANON_BIN`, `PATH`, `D:/01_programovani/_tools/anon.exe`) a `shared/consent.ts`. Volby: `consent` (`ask|never`; agenti s `CC_ROLE` a běhy `-p` se neptají nikdy), `reveal` (`partial|full|none`). Čtení `~/.claude/projects/**` a dalších složek stavu agentů se nemaskuje (`shared/paths.ts`), kromě sezení s `ANON_MASK_AGENT_STATE=1` (kolega). Selhání `anon` = zamítnutí, nikdy průchod originálu.
