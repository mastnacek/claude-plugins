# Slice: prompt-mask

## Proč existuje

Agent nesmí vidět originály z promptu ani z `@` souborů. Řez maskuje, co
uživatel napíše, a soubory z `@`. Bez něj by prompt i soubor odešly nezměněné.

## Co dělá

- `prompt.submit` (`register.ts`) — text prochází `anon mask`; selže-li anon, prompt se zahodí (`drop`), nikdy neodejde původní. Řádek slash příkazu engine přepsat nedovolí, ten se nemění.
- `prompt.mention` — při prvním čtení souboru ukáže `anon scan` v panelu souhlasu (`shared/consent`); bez „Povolit“ je `deny`.
- `prompt.attachment` (`file`, `edited_text_file`, `nested_memory`) — text přílohy projde `anon mask`; selže-li, příloha se vynechá (`text: null`).

## Kontrakt

- **`$.state`:** nic nečte ani nepíše.
- **Shared:** `anon` (`mask`), `consent` (`isFileAllowed`, `policyOf`), `notes` (`recordPromptNote`).

## Nepatří sem

| co | kam patří |
|---|---|
| výsledky nástrojů (Read, Grep, Bash, MCP) | `features/tool-mask` |
| spouštění `anon`, hledání binárky | `shared/anon.ts` |
| odkrytí odpovědi na obrazovce | `features/reply-unmask` |

## Pasti

- Argumenty slash příkazu tenhle řez nemaskuje (`e.command` engine nedovolí přepsat).
- Obrázky vložené do promptu se nemaskují; `prompt.submit` si zapamatuje jejich počet (`promptImages`) a `mask-note` pod zprávou ukáže varování.
