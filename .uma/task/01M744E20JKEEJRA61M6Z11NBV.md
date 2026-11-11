---
id: 01M744E20JKEEJRA61M6Z11NBV
scope: "project:claude-plugins"
type: task
title: "Prověřit: falešné poplachy brány write-gate u sed/cp, které cestu .uma/ jen zmiňují v textu"
tags:
  - cc-uma-memory
  - write-gate
  - k-revizi
status: stable
generated:
  by: pi-agent/1.1
  at: "2026-11-11T01:44:20.754945778+00:00"
since: "2026-11-11T01:44:20.754946652+00:00"
---
Zjištěno 2026-11-11 při práci programátora na pi-uma (Proposal 11, krok 3): brána `write-gate` v cc-uma-memory (`hooks/features/write-gate/bypass.ts`) ukázala dialog u `sed -i … README.md`, protože výraz sedu obsahoval text `.uma/.state/debts.json`. Paměti se příkaz nedotkl.

Příčina: u mutujících utilit (`sed`, `cp`, `tee`…) brána bere jakýkoli token s `.uma/` jako cíl zápisu, i když je to jen text uvnitř výrazu, ne soubor, na kterém příkaz pracuje.

Možná úprava: za cíl považovat jen operandy-soubory (u `sed` poslední argumenty po výrazu, u `cp`/`mv` cíl), ne text výrazu. Riziko: přestat chytat skutečné zápisy (`sed -i s/x/y/ .uma/a.md`, `cp x .uma/`), proto testy na obě strany.

Rozhodnutí uživatele: zatím neopravovat; sledovat, jak často se poplachy opakují, a pak se vrátit. Mezitím: soubory upravovat nástroji Edit/Write (brána zná přesnou cestu a do `.uma/` je vždy zamítne) — ne kvůli vyhnutí se dialogu. Dialogy dál posuzovat jednotlivě, nikdy je neodklikávat automaticky.