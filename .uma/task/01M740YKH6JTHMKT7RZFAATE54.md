---
id: 01M740YKH6JTHMKT7RZFAATE54
scope: "project:claude-plugins"
type: task
title: "Prověřit: cc-prompt-translate překládá odpovědi do dialogů i obsah zápisů do UMA"
tags:
  - cc-prompt-translate
  - cc-uma-memory
  - k-revizi
status: deprecated
supersedes: 01M7400H42FN9XDVGFS6M9YP4Q
generated:
  by: pi-agent/1.1
  at: "2026-11-11T00:43:28.678825248+00:00"
since: "2026-11-11T00:27:03.170364778+00:00"
until: "2026-11-11T17:48:37.559881212+00:00"
---
Zjištěno 2026-11-11 při živých testech cc-uma-memory:

1. Odpovědi do dialogů (0.5.0): text napsaný do pole Type something v dialogu $.ui.ask (AskUserQuestion) přeloží cc-prompt-translate do angličtiny (Upraveny nazev se zapsalo jako Modified name). Debug log: hooks module cc-prompt-translate: tool.call nested in cc-uma-memory.

2. Jazyk faktů (0.6.0): tester dostal český pokyn zapsat rozhodnutí 'Odsazení tabulátorem', ale fakt se uložil anglicky ('Tab indentation: The project uses tab indentation, not spaces.'). Prompt přeložil cc-prompt-translate do angličtiny a model pak psal i obsah faktu anglicky.

Uživatel zatím neví, jestli to chce. Rozhodnout: (a) vynechat odpovědi na AskUserQuestion z překladu v cc-prompt-translate, (b) jakým jazykem se mají psát fakta UMA (pi ukládá originál a překládá jen pro zobrazení).