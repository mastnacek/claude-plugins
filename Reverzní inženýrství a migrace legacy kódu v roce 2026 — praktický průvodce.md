# Reverzní inženýrství a migrace legacy kódu v roce 2026 — praktický průvodce

Nov 10, 2026 · @Jarda

## TL;DR — co funguje a co je zatím hype

Tvé tři techniky nejsou jedna metodika, ale tři vrstvy s velmi odlišnou vyzrálostí. Charakterizační testy a Gherkin jsou dnes jediná část, kterou lze doporučit bez výhrad. Jazykově neutrální IR je reálný trend, ale jako *jediný* zdroj pravdy ještě ne — Birgitta Böckeler na Fowlerově blogu varuje, že "spec-as-source" riskuje kombinaci nevýhod model-driven developmentu a LLM: nepružnost plus nedeterminismus.

| Vrstva | Stav v 11/2026 | Verdikt |
| --- | --- | --- |
| Charakterizační testy + Gherkin (executable spec) | Vyzrálé, 25 let staré, dnes jen zrychlené LLM | Dělej vždy, jako první krok |
| Strukturované spec soubory (markdown + YAML) jako trvalý artefakt | Mainstream v tooling, metodicky nedořešené | Dělej, ale kód zůstává zdrojem pravdy |
| IR jako jediný zdroj pravdy, kód jen generovaný výstup | Experiment (Tessl, Reversa); nedeterministické i při stejném vstupu | Nespoléhej na to u produkční migrace |
| Stavové automaty (SCXML / XState) | Vyzrálé, ale úzké | Dělej jen tam, kde automat v kódu skutečně je |

Thoughtworks drží spec-driven development v kategorii *Assess*, ne *Adopt*, a trvá na tom, že spustitelný kód je zdrojem pravdy. To je i moje doporučení: IR je nástroj pro *přenos* sémantiky, testy jsou nástroj pro *důkaz* ekvivalence.

Doporučený postup v pěti krocích:

1. **Zafixuj chování** charakterizačními testy na stávajícím systému — ještě než se podíváš na architekturu.
2. **Vytěž sémantiku** do strukturovaného IR (entity, pravidla, omezení), odděleně od implementačních detailů.
3. **Modeluj stav** jako statechart jen u modulů se skutečným větvením stavů.
4. **Generuj kód** z IR — deterministickým generátorem tam, kde to jde, LLM tam, kde ne, ale vždy proti testům z kroku 1.
5. **Verifikuj diferenčně** — starý i nový systém běží paralelně na stejných vstupech, dokud se výstupy neshodují.

&#91;embedded content: migrační pipeline · 5 kroků a jedna smyčka\]

Klíčová je ta spodní smyčka: každá odchylka v diferenční verifikaci se řeší doplněním pravidla do IR, nikdy záplatou v kódu.

## Proč klasický přepis selže a co se změnilo

Překlad řádek po řádku přenáší *jak* to funguje, ale nikoliv *proč* — a zachovává i chyby a náhodné chování, které uživatelé mezitím začali používat jako featuru. Hození souboru do LLM s "přepiš to do Pythonu" naráží na totéž plus na kontextové okno: model nevidí, co volají okolní moduly, a doplňuje si to.

Co se za poslední rok změnilo, je možnost obrátit směr práce: AI agent dokáže systém nejprve **přečíst a zdokumentovat**, a až z té dokumentace se generuje cílový kód. Akademicky se tomu říká *reverse documentation engineering*; prakticky to znamená, že mezi starým a novým kódem stojí artefakt, který si člověk může přečíst a opravit.

To je ta část, která je skutečně nová a užitečná. Tři úrovně podle [Böckelerové taxonomie](https://www.martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html) říkají, kam se vyplatí dojít:

- **spec-first** — specifikace nastartuje práci a pak se zahodí nebo zestará. Tak funguje většina dnešních nástrojů.
- **spec-anchored** — specifikace se udržuje a edituje spolu s kódem. **To je cíl pro migraci.**
- **spec-as-source** — člověk edituje jen specifikaci, kód je generovaný výstup. Zatím experiment; Böckeler zaznamenala, že i generování jednoho souboru ze stejné specifikace bylo nedeterministické.

Dvě střízlivé poznámky, které se vyplácí vzít vážně. První: hodnota je v myšlení při psaní specifikace, ne v nástrojích kolem ní — velká část SDD je přeznačkovaný waterfall nebo contract-first design. Druhá: Böckeler popisuje u Spec Kitu "falšivý dojem kontroly" — agent instrukce často neúplně následoval, ignoroval výsledky vlastní research fáze a vygeneroval duplikáty existujících tříd. U malé opravy pak celý workflow působí jako kanon na vrabce: jednoduchý bug se v Kiru rozpadl na 4 user stories se 16 akceptačními kritérii.

Z toho plyne praktické pravidlo: **spec-driven přístup se vyplácí při migraci a u nových vertikál, ne u každé změny.** Migrace je přesně ten případ, kde ceremonie má návratnost, protože stejný artefakt použiješ opakovaně pro každý cílový jazyk.

## Krok 1: Zafixuj chování, než začneš cokoliv přepisovat

Toto je nejdůležitější krok a nejvíc se přeskakuje. [Charakterizační test](https://www.freecodecamp.org/news/characterization-tests-before-refactoring-legacy-code/) (Michael Feathers, *Working Effectively with Legacy Code*) netestuje, co by systém měl dělat — dokumentuje, co dělá **dnes**, včetně bugů. Postup je mechanický: napíšeš assert s nesmyslným očekávaným výsledkem, test spustíš, a skutečnou hodnotu z chybového výpisu vlepíš do assertu.

### Dvě vrstvy, nepletení dohromady

Tohle je rozdíl, který většina článků o BDD zamlučuje. Potřebuješ **obě** vrstvy, každou na něco jiného:

|  | Golden-file / approval testy | Gherkin scenáře |
| --- | --- | --- |
| K čemu | Masové pokrytí, síť proti regresím | Obchodní pravidla, která jsi *pochopil* |
| Jak vznikají | Automaticky z produkčních dat | Ručně nebo LLM + lidská revize |
| Počet | Stovky až tisíce | Desítky |
| Čtení člověkem | Ne | Ano, to je celý smysl |
| Cena za jeden | Skoro nula | Vysoká |

Gherkin je drahý na jeden scenář, proto ho nepoužívej na zachycení všeho chování. Použij ho na pravidla, kde potom budeš řešit spor "dělá to správně?" — DPH, zaokrouhlování, lůty, stavy dokumentu, autorizace. Zbytek pokryj snapshoty.

### Jak nasbírat golden files z Excelu nebo z Domina

Princip je stejný: obal původní kód tak, aby šel vstup i výstup serializovat, a pak projdi reálná data.

- **VBA / Excel** — napiš ve VBA malý harness, který pro každý testovací workbook uloží vstupní listy do CSV, spustí makro a uloží výstupní listy do dalšího CSV. Dvojice `vstup.csv` / `ocekavano.csv` je tvůj kontrakt. Kde má makro side-effecty (soubory, maily, DB), zalogujeme je do třetího souboru `effects.jsonl`.
- **LotusScript / Domino** — pro agenta nebo knihovnu dumpni všechna pole `NotesDocument` před a po běhu do JSONu (včetně `@Formula` položek a autorů). Dvojice před/po je charakterizační test. Rozdíly v `$Revisions` a timestampech normalizuj, jinak budeš mít šum.
- **Data** — ber vstupy z produkce, ne vymyšlené. Hraniční případy, které bys vymyslel, jsou ty, na které už autor myslel; ty, které systém reálně dostal, jsou ty zajímavé. Anonymizuj, pokud jsou data citlivá.

### Jedno pravidlo, které se nesmí obejít

**Test, který nikdy neběžel proti starému systému, není specifikace, ale hypotéza.** LLM ti scenáře napíše rychle a přesvědčivě, ale očekávané hodnoty si domýšlí. Platná je jen ta hodnota, kterou vrátil původní kód. Tohle je i hlavní slabá stránka vendorských řešení: [AWS Transform custom](https://aws.amazon.com/blogs/devops/modernizing-excel-vba-to-python-at-scale-with-aws-transform-custom/) generuje "validační testy na základě původního chování VBA", ale ukázkové testy v tom článku neobsahují žádné asserty — jen docstringy. Golden files ani paralelní běh proti originálu tam nejsou zmíněny vůbec.

### Co s chybami, které najdeš

Najdeš je. Neopravuj je v tomhle kroku. Zafixuj je testem a označ tagem (`@legacy-bug`), aby bylo výslovně vidět, že jde o vědomě zachované chování. Rozhodnutí "opravit nebo zachovat" je obchodní, ne technické, a patří až za úspěšnou migraci — jinak se ti při diferenčním testování míchají dva druhy odchylek a nepoznáš, která je ta zlá.

## Krok 2: Vytěž sémantiku do vlastního IR

Začnu nepopulární zprávou: **žádný standardní "LLM-native IR" v listopadu 2026 neexistuje.** Není na to norma, není na to dominantní formát a nástroje, které to slibují, používají každý svůj. Kiro používá tři markdown soubory (`requirements.md`, `design.md`, `tasks.md`), GitHub Spec Kit osm souborů v `specs/001-nazev/`, Tessl soubory `*.spec.md` s tagy `@generate` a `@test`, [Reversa](https://arxiv.org/html/2605.18684v1) desítky artefaktů v `_reversa_sdd/`. Nemá smysl čekat na konvergenci — definuj si minimální schéma sám a drž ho.

### Co do IR patří a co ne

Hranice je jednoduchá: **do IR jde to, co by platilo i kdyby cílový jazyk byl jiný.**

- **Ano:** entity a jejich pole s typy a jednotkami, obchodní pravidla s ID, omezení (invarianty), stavy a přechody, side-effecty (co to pošle, zapíše, smazí), glosář doménových pojmů, autorizace.
- **Ne:** volba jazyka a knihoven, struktura modulů, způsob ošetření chyb, logování, formuláře a UI widgety, výkonnostní optimalizace. Tohle patří do odděleného `target-architecture.md`, jednoho pro každý cílový jazyk.

Böckeler upozorňuje, že oddělit funkční a technickou specifikaci je v praxi obtížné a dnešní nástroje to nezvládají. Proto to drž fyzicky — dva adresáře, nejen dvě sekce v jednom souboru.

### Nejlepší myšlenka, kterou si vzít: značkování spolehlivosti

Reversa označuje každé tvrzení ve specifikaci jedním ze tří stavů, a tohle přejmi bez ohledu na to, jaký nástroj použiješ:

- **confirmed** — přímý důkaz v kódu, s citací souboru a řádku.
- **inferred** — odvozeno ze vzorů, jmen nebo toků. Může být špatně.
- **gap** — nelze zjistit z kódu, musí potvrdit člověk.

Bez tohoto rozlišení se ti halucinace agenta smrskne na stejně důvěryhodně vypadající řádek jako fakt citovaný z kódu. V jejich evaluaci na ATM systému v GnuCOBOLu vyšlo z 517 tvrzení 490 confirmed, 24 inferred a 3 gaps — ale autorský tým sám přiznává, že šlo o jeden školní systém, index spolehlivosti nikdo nezauditoval a finální parita migrace nebyla dokončena. Ber to jako dobrý nápad, ne jako dokázaný výsledek.

### Minimální schéma, které stačí

```yaml
# rules/BR-INV-014.yaml
id: BR-INV-014
title: DPH u zákazníka s DIČ v EU mimo ČR
confidence: confirmed
source:
  - file: modInvoice.bas
    lines: "412-438"
  - file: modVatRates.bas
    lines: "88-93"
glossary: [zakaznik, dic, reverse-charge]

inputs:
  - name: customer.vat_id
    type: string|null
  - name: customer.country
    type: iso3166_alpha2
  - name: line.amount_net
    type: decimal(14,2)
    unit: CZK

# EARS syntaxe: UBIQUITOUS / WHEN / WHILE / IF-THEN / WHERE
behavior:
  - ears: WHEN
    text: >
      WHEN customer.country != "CZ" AND customer.vat_id je platné VIES ID,
      THE system SHALL nastavit vat_rate = 0 a vat_note = "reverse charge".
  - ears: IF-THEN
    text: >
      IF customer.vat_id je null nebo neplatné,
      THEN THE system SHALL použít tuzemskou sazbu podle line.vat_category.

constraints:
  - vat_amount >= 0
  - round(vat_amount, 2) == vat_amount   # bankers rounding, viz BR-INV-009

side_effects:
  - kind: audit_log
    detail: zápis do tabulky VatDecisionLog při reverse charge

open_questions:
  - "Co při neaktivním VIES? Starý kód tiše spadne do tuzemské sázby."

verified_by:
  - features/dph_eu.feature:12
  - golden/invoices/eu_reverse_charge_*.json
```

### ID pravidel jsou celý trik

To `BR-INV-014` je to, co drží systém pohromadě. Stejné ID se objeví v Gherkin tagu (`@BR-INV-014`), v komentáři u vygenerované funkce a v commit message. Pak umíš odpovědět na otázku, která u migrací rozhoduje: *které pravidlo je ještě nepokryté a který řádek nového kódu nemá žádné pravidlo za sebou?* Druhá polovina té otázky je důležitější — to je místo, kde agent přidal, co si vymyslel.

## Krok 3: Stavový automat — ale jen kde skutečně je

Tady si dovolím opravit jeden předpoklad. "Tisíce podmínek a větvení" obvykle **není** stavový automat. Stavový automat má paměť: výsledek závisí na tom, čím systém prošel. Masa podmínek, kde výsledek závisí jen na aktuálních hodnotách vstupů, je **rozhodovací tabulka** — a ta se modeluje úplně jinak a mnohem levněji.

Test, který to rozhodne za půl minuty: *dokážeš stavy pojmenovat podstatnými jmény, které by poznal i člověk z provozu?* "Rozpracovaná", "Schválená", "Stornovaná" — ano, to je automat. Když si stavy musíš vymýšlet, aby ti to vyšlo, není to automat a snažíš se nacpat větvení do tvaru, do kterého nepatří.

| Co v kódu vidíš | Správný zápis |
| --- | --- |
| Výsledek závisí na pořadí akcí a na předchozím stavu | Statechart (SCXML / XState JSON) |
| Mnoho kombinací vstupů → jeden výsledek, bez paměti | Rozhodovací tabulka (CSV nebo YAML matice) |
| Workflow s čekaním na externí událost, timeouty, eskalace | Statechart s `after` přechody |
| Validace — dlouhá řada `If ... Then Exit Sub` | Seznam pravidel s ID, krok 2 |

U rozhodovací tabulky máš navrch to, že ji umíš strojově zkontrolovat na úplnost a na rozpory — což u starého kódu odhalí nedosažitelné větve, které tam leží léta.

### Formát, když to automat je

Tři možnosti, a jedno doporučení:

- **SCXML** — W3C norma, stabilní, XML. Dobré, když už nějaký SCXML máš nebo potřebuješ formální verifikaci. XState umí SCXML dokumenty **načíst** (`@xstate/scxml`), ale export do SCXML nikde v dokumentaci není — je to jednosměrná cesta.
- **XState JSON** — živější ekosystém a vizuální editor. V XState v6 (zatím beta) je serializace prvotříní: `machineToJSON()`, `machineFromJSON()` a typy `MachineJSON` / `TransitionJSON` / `GuardJSON`.
- **Vlastní minimální JSON** — states, events, transitions, guards, entry/exit akce. Padesát řádků schématu.

**Doporučení: XState JSON, ale s jedním železným pravidlem — žádné inline funkce.** Guardy a akce drž jako pojmenované řetězce (`"guard": "maZustatekNaUhradu"`), ne jako kód. Důvod je přímo v dokumentaci XState: inline funkce se při serializaci změní na `{"@code": ..., "@lang": "ts"}` a definice je "plně portabilní, dokud neobsahuje žádné `@code` výrazy". Jakmile v ní TypeScript máš, přestala být jazykově neutrální a Rust generátor s ní nic neudělá. Implementace guardů pak dodáváš při oživení automatu v každém jazyce zvlášť — a každý guard je samostatně testovatelná čistá funkce, což je mimochodem to nejlepší, co se dá s legacy podmínkou udělat.

Praktické poznámky k nástrojům: [Stately Studio](https://stately.ai/) umí automat nakreslit a exportovat, ale podle jejich vlastní dokumentace jen do JavaScriptu/TypeScriptu — žádný Rust ani Python. Pro Rust existuje [xstate-statemachine-rs](https://github.com/basiltt/xstate-statemachine-rs), který hlásí kompatibilitu s XState v5; v Pythonu si generátor z JSONu napíšeš za odpoledne, a to je stejně správnější cesta — vlastní šablona pod kontrolou je v tomhle lepší než závislost na cizim generátoru.

### Co z automatu získáš navíc

Z definice přechodů se dají strojově vygenerovat testy, které bys ručně nenapsal: pokrytí všech přechodů, detekce nedosažitelných stavů a stavů bez výstupu. Nedosažitelný stav ve starém kódu je buď mrtvý kód, nebo chybějící přechod, který někdo řeší ručním zásahem do dat. Obojí je zjištění, které patří do `gaps.md`, ne do kódu.

## Krok 4: Generování kódu z IR

Rozděl generování na dvě části podle toho, zda je potřeba úsudek:

- **Deterministický generátor** (Jinja2, Tera, Handlebars nad tvým YAML/JSON) — entity a datové třídy, DTO, migrace schématu, kostra stavového automatu, signatury funkcí pro každé pravidlo, kostry testů, rozhodovací tabulky. Tohle je 60–80 % objemu kódu a LLM tam nemá co dělat — jen to znečistí variabilitou.
- **LLM** — těla funkcí obchodní logiky, kde zápis pravidla v přirozeném jazyce musí někdo přeložit do kódu. Jedno pravidlo na jedno zadání, s testy z kroku 1 jako bránou.

Proč to tak striktně dělit: generování z LLM není reprodukovatelné. Böckeler zaznamenala nedeterminismus i při generování jednoho souboru z jedné a té samé specifikace. **Netvrd si tedy, že codegen je build step.** Je to normální commit, který prošel revizí — jen jsi ho neodepsal znak po znaku.

### Dva režimy, vyber si jeden a nemíchej je

|  | Regenerate (spec-as-source) | Generate once, then own (spec-anchored) |
| --- | --- | --- |
| Co se edituje | Jen IR | IR i kód, každé na svoji roli |
| Hlavička generovaných souborů | `GENERATED — DO NOT EDIT` | Není |
| Podmínka funkčnosti | 100 % souboru generovaného, žádné ruční zásahy | Matice sledovatelnosti IR ↔ kód |
| Vhodné na | Deterministickou část (DTO, automat, tabulky) | Obchodní logiku, celý zbytek |
| Riziko | Při první ruční opravce v generovaném souboru se režim tiše rozpadne | Drift mezi IR a kódem |

Pro migraci doporučuji **spec-anchored na celek a regenerate jen na deterministickou podmnožinu**, a fyzicky oddělené adresáře `generated/` a `src/`. Nikdy ne generovaný a ruční kód v jednom souboru — to je ta chyba, po které už nikdo neregeneruje nic.

### Pořadí a velikost dávek

Tohle je jediná věc, kterou vendorští nástroje opravdu umějí a vyplácí se je okopírovat. AWS Transform rozseká kódovou bázi na logické moduly, zpracuje je **v pořadí podle závislostí** (datové modely → obchodní logika → UI) a po každém modulu validuje build; když selže, vrátí modul zpátky a zkusí ho znovu, než jede dál. Bez tého rollbacku se ti chyby kumulují a při 20. modulu už nevíš, odkud se vzaly.

Praktické dávkování, které funguje s agentem:

1. Vygeneruj deterministickou kostru celého modulu najednou (žádný LLM).
2. Pro každé pravidlo zvlášť: dej agentovi **jen** YAML toho pravidla, signaturu funkce a příslušné testy. Ne celý projekt.
3. Spusť testy. Zelené → commit s ID pravidla v message. Červené → jeden pokus o opravu, pak to vezmi ručně.
4. Až po dokončení modulu přidej integrační vrstvu a spusť modulové golden testy.

Bod 2 je kritický. Čím širší kontext agentovi dáš, tím větší šance, že začne "vylepšovat" a přidá chování, které v IR není. Böckeler popisuje případ, kdy agent ignoroval výsledky vlastní research fáze a vygeneroval duplikáty tříd, které v projektu už byly.

## Krok 5: Diferenční verifikace a přechod

Starý systém je tvůj orákl. Dokud běží, máš něco, co žádný nový projekt nemá: zdroj správných odpovědí na libovolný vstup. Nezahazuj ho dřív, než ho vytěžíš.

### Tři brány, v tomhle pořadí

1. **Golden korpus z kroku 1** — nový kód musí projít všemi nahranými dvojicemi vstup/výstup. Levné, rychlé, běží v CI.
2. **Diferenční property testy** — nejsilnější a nejvíc nedoceněná technika v celém postupu. Generátor vstupů (Hypothesis v Pythonu, proptest v Rustu) vyrobí tisíce vstupů, každý pustíš oba systémy a tvrzení je jediné: výstupy se rovnají. Najde přesně ty hraniční případy, na které v golden korpusu nedosáhneš, a shrinking ti rovnou dá minimální reprodukci.
3. **Shadow run na živých datech** — nový systém dostává produkční vstupy, výstupy se porovnávají a logují, ale nic nedoručuje. Typicky dva až čtyři týdny.

Bod 2 funguje jen tehdy, když umíš starý systém spustit programově a rychle. U Excelu to znamená jednu headless instanci Excelu s COM a dávkovým harnessem; u Domina agenta spouštěného přes API nad testovací replikou. Investice do toho harnessu se vrátí nejvíc z celé migrace.

### Normalizace šumu — kde se to vždy zasekne

Porovnávání výstupů vždy nejdřív zhavaruje na věcech, které nejsou chyba. Deklaruj pravidla srovnání explicitně v IR, ne ad hoc v testu:

- **Desetinná čísla.** Největší past VBA → Python. VBA `Currency` je fixed-point se čtyřmi desetinnými místy, `Double` je IEEE 754 a Excel navíc zaokrouhluje zobrazení. V Pythonu použij `Decimal`, nikdy `float`, a zaokrouhlovací režim napiš do pravidla — `ROUND_HALF_UP` versus `ROUND_HALF_EVEN` vyrobí rozdíl na haléře, který účetní najde a nebude mu věřit.
- **Pořadí** položek v seznamech a kolekcích. Starý kód měl často pořadí dané náhodou implementace.
- **Časy, GUID, čísla revize, uživatel poslední změny.** Normalizuj na konstantu.
- **Prázdno.** `Empty` / `Null` / `""` / `0` jsou ve VBA i v LotusScriptu čtyři různé věci a v Pythonu snadno splynou v jednu.
- **Kódování a diakritika.** LMBCS v Dominu a Windows-1250 v CSV z Excelu nejsou UTF-8.

### Přechod po částech, ne najednou

Strangler fig: nový kód přebírá jeden modul, starý systém stále běží a obsluhuje zbytek, přepínání je ve konfiguraci a dá se vrátit jedním zápisem. Napiš si předem **číselná výstupní kritéria** pro každý modul — například: všechny golden testy zelené, 10 000 property běhů bez odchylky, 14 dní shadow runu s nula neočekávanými rozdíly, všechna pravidla modulu mají `verified_by`. Bez čísla se cutover odkládá do nekonečna nebo se udělá z nervozity.

A jedno poučení z Reversy, které je užitečnější než jejich čísla: měli 53 Gherkin parity scenářů, 11 migračních úkolů, 9 hotových — a finální validaci parity a cutover **nedokončili**. Posledních deset procent migrace je ta drahá část a žádný nástroj ti ji neušetří.

## Tooling: co vzít a co nechat být

| Nástroj | K čemu | Vyzrálost | Pro solo projekt |
| --- | --- | --- | --- |
| [GitHub Spec Kit](https://github.com/github/spec-kit) | Scaffolding spec workflow, příkazy `/specify`, `/plan`, `/tasks` | Referenční implementace, aktivní | Vezmi strukturu, ne celý framework — u malé změny je to kanon na vrabce |
| Kiro (AWS) | IDE s workflow requirements → design → tasks | Produkt, uzavřený ekosystém | Jen když chceš jejich IDE |
| Tessl Framework | Jediný nástroj mířící na spec-anchored až spec-as-source; `*.spec.md`, `tessl document` reverzuje spec z kódu | V době Fowlerova testu private beta | Sleduj, nesázej na to |
| OpenSpec | Lehký, framework-agnostický, Markdown + YAML | Mladé, minimální ceremonie | Nejbližší tomu, co solo dev opravdu chce |
| [Reversa](https://github.com/sandeco/reversa) | Reverzní dokumentace legacy → spec, multi-agent, 5 fází | Jedna akademická evaluace na jednom školním systému | Vezmi z toho confidence značkování a seznam artefaktů, ne CLI |
| AWS Transform custom | VBA → Python ve velkém, dependency-aware chunking | Vendorský produkt, žádná nezávislá čísla | Vezmi pořadí a rollback vzor, zbytek přeplaťuješ |
| behave / pytest-bdd / cucumber-rs | Gherkin jako spustitelné testy | Vyzrálé | Ano, pro pravidla |
| syrupy, approvaltests, insta (Rust) | Snapshot a approval testy | Vyzrálé | Ano, pro masové pokrytí |
| Hypothesis, proptest | Diferenční property testy | Vyzrálé | Ano — nejlepší poměr přínosu k práci |
| XState v6 + Stately Studio | Statechart jako JSON + vizuální editor | v6 beta; export jen JS/TS | Ano na modelování, generátor si napiš sám |
| SCXML | Norma W3C pro automaty | Stabilní, úzké použití | Jen když už SCXML máš |
| AGENTS.md / CLAUDE.md | Trvalý kontext pro agenta napríč sezeními | De facto standard | Ano, založ je dřív než první spec |

### Jedna věta, která ti ušetří týden

Neadoptuj žádný SDD framework jako celek. Všechny jsou navržené na greenfield a přinášejí ceremonii, jejíž návratnost Böckeler v brownfieldu nenašla — dva ze tří nástrojů se podle ní do existující kódové báze zaváděly obtížně. Vezmi si z nich tři konkrétní věci — adresářovou konvenci, confidence značkování a matici sledovatelnosti — a vlož je do svého vlastního, čtyřstránkového procesu. Jejich hodnota je v myšlení při psaní specifikace, ne v tooling kolem ní.

## Struktura repozitáře a práce s agentem

```
legacy/                      # původní kód, read-only, nikdy needitovat
  modInvoice.bas
  ...
spec/
  domain/
    glossary.md              # doménové pojmy, jedno místo pravdy pro jména
    entities/*.yaml          # entity, pole, typy, jednotky
  rules/
    BR-INV-014.yaml          # jedno pravidlo = jeden soubor = jedno ID
  machines/
    invoice-lifecycle.json   # statechart, guardy jen jako jména
  tables/
    vat-matrix.csv           # rozhodovací tabulky
  gaps.md                    # co nelze zjistit z kódu — čeká na člověka
  questions.md               # otevřené otázky na zadavatele
  confidence.md              # souhrn confirmed / inferred / gap
target/
  python/target-architecture.md   # volba jazyka, knihoven, chybové strategie
  rust/target-architecture.md
tests/
  golden/                    # vstup/výstup dvojice z původního systému
  features/*.feature         # Gherkin, tagy = ID pravidel
  differential/              # property testy proti starému systému
harness/                     # spouštěč starého systému pro záznam a shadow run
generated/                   # GENERATED — DO NOT EDIT
src/                         # ruční a LLM kód, vlastněný
traceability.md              # matice IR ↔ kód ↔ test
CLAUDE.md
```

Tři věci na téhle struktuře mají význam a zbytek je vkus. `legacy/` je read-only, aby šlo vždy přečíst originál. `spec/` neobsahuje nic o cílovém jazyce — proto je `target/` zvlášť a pro každý jazyk jeden. A `generated/` je oddělený adresář, ne hlavička v souboru mezi ručním kódem.

### Co patří do CLAUDE.md

Založ ho **dřív než první specifikaci**. Kratší je lepší; co je v něm, musí platit vždy:

- Invarianty projektu: žádné `float` na peníze, vždy `Decimal`; zaokrouhlování podle `BR-INV-009`; české názvy doménových pojmů zůstávají české.
- Hranice: `legacy/` se nikdy nemění, `generated/` se nikdy needituje ručně, nové chování nesmí vzniknout bez pravidla v `spec/rules/`.
- Pracovní režim: jedno pravidlo na jedno zadání; nenavrhovat refaktoring, dokud není migrace hotová; při nejistotě zápis do `questions.md`, ne dohad v kódu.
- Odkaz na `traceability.md` a povinnost každý commit označit ID pravidla.

Ten třetí bod je ten, který skutečně mění výsledek. Instrukce "když nevíš, zapiš otázku" dostává z agenta `gap` tam, kde by jinak napsal přesvědčivý nesmysl. A počítej s tím, že se instrukce stejně časem přestanou dodržovat — Böckeler to pojmenovává jako "falšivý dojem kontroly" a platí to i tady. Proto je bránou test, ne instrukce.

## Antipatterny a kde se to pokazí

**Přespecifikování.** Když se specifikace zvrhne v pseudokód, napsal jsi program dvakrát. Test: když by pravidlo šlo přeložit do kódu mechanicky bez rozmyšlení, je příliš detailní. IR popisuje *co*, ne *jak*.

**Nikdo to nepřečte.** Böckelerova nejpřímější věta o Spec Kitu: raději by revidovala kód než všechny ty markdown soubory. Když ti IR narůstá nad několik desítek stran, přestal být artefaktem k čtení a stal se další kódovou bází bez kompilátoru.

**Spec drift.** Kód má kompilátor a testy, specifikace nemá nic. Zestará ti tiše a poznáš to až tehdy, když podle ní někdo něco vygeneruje. Jediná fungující obrana: každé pravidlo má `verified_by` a CI hlásí pravidla bez testu jako chybu.

**Specifikace od LLM se považuje za ověřenou.** Agent popíše i to, co v kódu není, a popis bude číst lépe než ten správný. Bez rozlišení confirmed / inferred / gap a bez citace `soubor:řádek` nemáš jak oddělit jedno od druhého.

**Opravování chyb v průběhu migrace.** Míchá dva druhy odchylek a znehodnotí diferenční testování. Nejdřív parita, pak opravy.

**Migrace všeho.** Ve starém systému je typicky velká část kódu mrtvá. Zjisti to měřením, ne úsudkem — instrumentuj původní kód na čítač volaní a nech ho běžet měsíc. Nejlevnější migrace je ta, kterou neuděláš.

**Statechart tam, kde žádný není.** Viz krok 3 — masa podmínek bez paměti je rozhodovací tabulka.

**Neportabilní IR.** Jakmile do automatu nebo do pravidla propadne kód v jednom jazyce, přestalo být IR a je to zdrojový kód s divným rozšířením.

**Zahození orákla.** Odstavení starého systému před dokončením shadow runu je nevratné. Dokud běží, máš odpovědi na vstupy, které ještě ani neznáš.

**Věření vendorským číslům.** "Weeks into hours" v AWS blogu není doložené žádným měřením, ukázkové testy tam jsou prázdné stuby a parita se řeší ručním checklistem. Reversa své limity přiznává otevřeně: jeden školní systém, žádné srovnání s kontrolní skupinou, nedokončená parita.

## Zdroje

Všechny niže uvedené stránky byly pro tento dokument otevřeny a přečteny.

| Zdroj | Co z něj je | Poznámka |
| --- | --- | --- |
| [Böckeler: Understanding Spec-Driven-Development — Kiro, spec-kit, Tessl](https://www.martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html) | Taxonomie spec-first / anchored / as-source, struktura spec souborů, kritika | Nejlepší jediný text k tématu; testováno 09/2025 |
| [Spec-Driven Development in 2026 (DEV)](https://dev.to/krlz/spec-driven-development-in-2026-what-it-is-the-tooling-and-how-teams-actually-use-it-2fk2) | Stav tooling, EARS syntaxe, Thoughtworks "Assess" | Kompilace z druhé ruky, část tvrzení neověřená |
| [Reversa (arXiv 2605.18684)](https://arxiv.org/html/2605.18684v1) | Confidence značkování, taxonomie artefaktů, 5-fázový pipeline | Jedna evaluace, školní systém, parita nedokončena |
| [Reversa na GitHubu](https://github.com/sandeco/reversa) | Seznam artefaktů, agenti, CLI | MIT licence |
| [Modernizing Excel VBA to Python at Scale (AWS)](https://aws.amazon.com/blogs/devops/modernizing-excel-vba-to-python-at-scale-with-aws-transform-custom/) | Dependency-aware chunking, rollback per modul, mapovací pravidla VBA→Python | Vendorský materiál, žádná čísla |
| [XState v6: serialization](https://stately.ai/docs/xstate/v6/serialization) | `machineToJSON`, portabilita, `@code` výrazy | v6 je v betě |
| [XState v5 → v6](https://stately.ai/docs/xstate/v6/xstate-v5-to-v6) | SCXML import přes `@xstate/scxml` |  |
| [Characterization tests before refactoring (freeCodeCamp)](https://www.freecodecamp.org/news/characterization-tests-before-refactoring-legacy-code/) | Mechanika charakterizačních testů |  |
| [Stately Studio](https://stately.ai/) | Vizuální editor automatů, export JS/TS |  |
| [xstate-statemachine-rs](https://github.com/basiltt/xstate-statemachine-rs) | Rust runtime kompatibilní s XState v5 | Nevyzkoušeno |

Mimo web: Michael Feathers, *Working Effectively with Legacy Code* — stále nejlepší zdroj pro kroky 1 a 5, a nic z posledních dvou let ho nenahradilo.
