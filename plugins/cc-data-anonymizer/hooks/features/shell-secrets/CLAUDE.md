# Slice: shell-secrets

## Proč existuje

Odmaskování vrací do příkazu originál; hesla a tajemství by tak skončila v shellu,
jeho historii a výstupu. Řez je do příkazů nevrací.

## Co dělá

- `tool.call` na `Bash|PowerShell` (`register.ts`): značky `«REDACTED:druh:n»` v `command`; je-li druh v `shellSecretKinds` (výchozí password, secret, card, iban, national-id), příkaz se zamítne zprávou „Hesla a tajemství se do příkazů nevracejí…“.
- `shellSecrets`: `deny` (výchozí), `ask` (dialog; agent s `CC_ROLE` a běh `-p` zamítnou), `allow` (řez nic nedělá).
- Ostatní druhy projdou do `tool-mask`, který je odmaskuje. Edit/Write/NotebookEdit se netýkají.

## Kontrakt

- **`$.state`:** nic.
- **Shared:** `consent` (`isAsking`, `policyOf`), `tags` (`issuedKinds`).

## Nepatří sem

| co | kam patří |
|---|---|
| odmaskování vstupu, neznámé značky | `features/tool-mask` |
| PDF a obrázky | `features/media-guard` |

## Pasti

- Počítají se jen značky, které anon v tomto sezení vydal; cizí nebo poškozené zamítne až `tool-mask` svou zprávou.
- Druh je znát jen ze značky: se stylem `fake` řez heslo v příkazu nepozná.
- Řez musí být registrován před `tool-mask`, jinak se odmaskuje dřív, než ho vidí.
