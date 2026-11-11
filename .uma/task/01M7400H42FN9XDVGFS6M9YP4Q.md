---
id: 01M7400H42FN9XDVGFS6M9YP4Q
scope: "project:claude-plugins"
type: task
title: "Prověřit: cc-prompt-translate překládá odpovědi do dialogů (Type something)"
tags:
  - cc-prompt-translate
  - cc-uma-memory
  - k-revizi
status: deprecated
generated:
  by: pi-agent/1.1
  at: "2026-11-11T00:27:03.170364313+00:00"
since: "2026-11-11T00:27:03.170364778+00:00"
until: "2026-11-11T00:43:28.702943672+00:00"
---
Zjištěno 2026-11-11 při živém testu okna návrhu zápisu v cc-uma-memory 0.5.0: text napsaný do pole Type something v dialogu $.ui.ask (AskUserQuestion) přeloží cc-prompt-translate do angličtiny (Upraveny nazev se zapsalo jako Modified name). Debug log: hooks module cc-prompt-translate: tool.call nested in cc-uma-memory. Uživatel zatím neví, jestli to chce; rozhodnout a případně v cc-prompt-translate vynechat odpovědi na AskUserQuestion z překladu.