# prompt-translate

Plugin pro Claude Code: prompt odchází do modelu anglicky, finální odpověď se
vykreslí česky. Uložená zpráva zůstává anglicky, takže kontext modelu se nikdy
nemíchá. Port pi-prompt-translate-czk; uživatelský popis je v `README.md`.

Obecná pravidla pro všechny pluginy (pasti enginu, kdy nový řez, hluboké
vs. mělké moduly, git a vydání) jsou v kořenovém `../../CLAUDE.md`.

Struktura je čitelná ze stromu. Každý řez má vlastní `CLAUDE.md` s kontraktem
a tabulkou **„Nepatří sem“** — než do řezu sáhneš, přečti ji. Je kratší
a přesnější než tenhle soubor.

## Příkazy

```sh
# vše spouštěj ze složky pluginu (plugins/prompt-translate/)
claude plugin validate .        # validátor enginu: atomy, on/$, registrace
claude plugin test .            # všechny *.test.ts (i ve složkách řezů)
scripts/vsa-check.sh            # hranice řezů (viz níž)
npx -y -p typescript tsc -p . --noEmit   # typy; chyby v *.test.ts jsou starší dluh
```

**Brána před commitem: všechny čtyři.** Typy hooků musí být čisté, testy zelené,
`vsa-check` OK.

Vývoj naživo: `claude plugin disable prompt-translate@mastnacek`
a pak `claude --plugin-dir .` (hot reload). **Nikdy obě kopie najednou** —
každý prompt by se přeložil dvakrát. Vývojová kopie má vlastní `$.store`, takže
nevidí překlady uložené instalovanou kopií; to není chyba.

`.claude/prompt-translate.json` je lokální nastavení — necommitovat (je
v `.gitignore`).

## Architektura: vertical slices + hluboké moduly

```
hooks/
  register.tsx                  kořen kompozice — jen zapojí řezy
  pipeline.test.ts              end-to-end přes všechny řezy
  features/<řez>/               jedna funkce = jedna složka (hooky, logika, testy, CLAUDE.md)
    prompt-to-english/  answer-to-target/  question-dialog/
    command-arguments/  indicator/         settings-command/
  shared/                       jádro, které řezy používají; nezná je
    translation/                HLUBOKÝ modul: translate(), detectLanguageOrCode()
    config.ts credit.ts log.ts progress.ts session-archive.ts state.ts …
types/index.d.ts                kontrakt $.state — jediné místo, kde se řezy „potkají“
```

Pravidla (hlídá `scripts/vsa-check.sh`):

1. **Řez neimportuje z jiného řezu.** Řez musí jít smazat jako složka.
   Konstantu, kterou potřebují dva řezy, radši zduplikuj (viz `OWN_COMMAND`
   v `command-arguments`) — duplicita je levnější než špatná abstrakce.
2. **Závislosti míří dolů:** `register.tsx → features → shared`. `shared/`
   nezná řezy ani kořen.
3. **Řezy spolu mluví jen přes `$.state`**, ne voláním: prompt nastaví
   `pending` a odpověď ho přečte; překlad nastaví `translating` a indikátor ho
   kreslí. Kdo hodnotu píše a kdo čte, stojí v `CLAUDE.md` řezu (Kontrakt).
4. **Vnitřnosti hlubokého modulu jsou soukromé:** zvenku jen
   `translation/translate.ts` a `translation/detect.ts`; `protect.ts`
   a `prompts.ts` ne.
5. **Síť (`$.http.fetch`) jen v `shared/`.**

Pasti enginu, které tvar řezů určují (jedna událost bez matcheru na plugin,
`on`/`$` jen do funkce volané jménem, atom deklarovaný v souboru, který ho
používá), jsou v kořenovém `CLAUDE.md`.
