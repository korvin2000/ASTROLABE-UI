# WP-B4a3 — абляция A3: плечо `waveA-noA3` (P8.B.4)

## Сборка

**Ветка `v2/B4a3`** (от тега `v2-wave-A` = `4bb181b`), worktree `ASTROLABE/.claude/worktrees/b4-noA3`, запушена.
- `db85fe1` — eval-live from 940ef5a for the bench arm (`git checkout 940ef5a -- eval-live`, тот же eval-live, что у плеча `waveA`).
- `9191afd` — Bench arm waveA-noA3: pre-A3 wire (ядро, 2 файла, +23/−8).
- SDK: `C:/work.astrolab/llm-transport-sdk/llm` (через `-Pastrolabe.aiGateBuild`).

**Diff ядра (только провод):**
- `core/src/main/kotlin/io/astrolabe/cell/Layout.kt:172-175` — публичный `system(role, mode)` делегирует во внутренний
  `system(role, mask: ToolMask?, mode)`; публичный ABI не менялся.
- `Layout.kt:189-191` — строка `tools:` снова как в `v2/BL` (`look, edit, run, verify, state, task, kb (masked, never removed)`),
  и сразу за ней, если маска передана, `enabled this turn: <mask.allowed sorted, через ", ">` — ровно место и формат `v2/BL`.
- `Layout.kt:254-267` — публичный `render(...)` делегирует во внутренний `render(role, mask, ...)`; маска уходит в `[S]`.
- `core/src/main/kotlin/io/astrolabe/cell/Cell.kt:181-182` — `schemaSelection = ToolSchemas.forLineage(..., ToolMask(ToolOps.all))`:
  все 7 семейств в каждом запросе, как до A3 (порядок `ToolFamily.entries`, как в `v2/BL`).
- `Cell.kt:341` — `Layout.render(ctx.role, mask, ...)`: в `[S]` идёт маска хода.
- `Cell.kt:735` — в `Anchor.render` передаётся `enabled = null`: в `[A]` строки маски больше нет (до A3 её там не было).
- Не тронуто: маски ролей и хода (`Request.mask`), гейты (включая `REPAIR_GATE` в nudges), `wait`, `sessionKey`,
  проверка инварианта 12 в `Cell` (с полным набором она выполняется всегда), фингерпринты `Precompile` (`system(role, mode)`,
  `ToolSchemas.fingerprint(role.toolMask)` — не провод), A1/A2b/A4/A5/A6.

**Решение:** строка `tools:` возвращена к тексту `v2/BL` вместе со строкой маски. Почему: текст A3 говорит
«[A] names those enabled this turn» и перечисляет только операции роли — с полной схемой и маской в `[S]` он был бы
неверен и не равен проводу до A3. Безопасная альтернатива — оставить строку A3 (на одну строку меньше diff, но `[S]`
не совпадает с до-A3).

**Отклонение (ожидаемое для плеча):** утверждения A3 в тестах падают, не чинились:
- `LayoutTest` 10 тестов, 2 падения: golden `[S]`-digest (`311827f8…` → `f0877545…`); «S carries … the role's tools»
  (ждёт сгруппированную строку `tools:` роли).
- `CellTest` 50 тестов, 3 падения: poller (ждёт `run(run, poll, wait, cancel)` в `tools:`), reserve-ход
  (ждёт `enabled this turn: all role tools except …` в `[A]`), reserve-repair (ищет строку `enabled this turn` в `[A]`).

**`eval-live check`** (`C:/work.astrolab/bench/b4-2026-10-02/waveA-noA3/bin/eval-live check`): **8/8 task(s) sound**
(api-currency, bugfix-pagination, env-launcher, interrupt-csv, investigate-totals, red-test, rest-todo, ui-clear-done:
base и wrong падают, reference проходит, видимые тесты на reference зелёные).

**Проверка провода (без живых вызовов):** одноразовый тест `cell/WireNoA3ProbeTest` (не закоммичен, удалён) через
`CellFixture` + `ScriptedModel` (поддельный адаптер) брал первый `Request` ячейки для ролей implementing, probe, review — 1/1 зелёный:
- `[S]`: `tools: look, edit, run, verify, state, task, kb (masked, never removed)`, следующая строка —
  `enabled this turn: <Request.mask.allowed sorted>` (равенство проверено; implementing 35 оп., probe 21, review 15),
  затем `evidence:` — порядок как в `v2/BL`;
- `Request.tools` = `[look, edit, run, verify, state, task, kb]` для всех трёх ролей (в волне A у probe/review семейств меньше);
- в `[A]` строки `enabled this turn` нет.

## Команда запуска

Оба плеча одновременно (два терминала Git Bash), deepseek, seed 13:

```bash
export JAVA_HOME=/c/Users/user/.gradle/jdks/eclipse_adoptium-26-amd64-windows.2
C:/work.astrolab/bench/b4-2026-10-02/waveA/bin/eval-live run --models deepseek/deepseek-v4.1-flash --out C:/work.astrolab/bench/b4-2026-10-02/waveA/results-deepseek-a3 --tasks all --repeats 2 --seed 13 --effort Medium --max-cells 12 --deadline-minutes 60 --credentials "$LOCALAPPDATA/AstrolabeStudio/credentials.json"
```

```bash
export JAVA_HOME=/c/Users/user/.gradle/jdks/eclipse_adoptium-26-amd64-windows.2
C:/work.astrolab/bench/b4-2026-10-02/waveA-noA3/bin/eval-live run --models deepseek/deepseek-v4.1-flash --out C:/work.astrolab/bench/b4-2026-10-02/waveA-noA3/results-deepseek-a3 --tasks all --repeats 2 --seed 13 --effort Medium --max-cells 12 --deadline-minutes 60 --credentials "$LOCALAPPDATA/AstrolabeStudio/credentials.json"
```

## Хвосты и риски
- Ветка только для бенчмарка, в `main` не сливать (тесты A3 на ней красные по замыслу).
- `installDist` собран из рабочего дерева, идентичного `9191afd` (одноразовый тест появился после сборки и удалён).
- Результаты прогонов и вывод (A3 — причина / не обнаружено) — за оркестратором.

Статус: ГОТОВО К ПРОГОНАМ — последний коммит ветки `9191afd`.

## Результат абляции A3 (оркестратор, 2026-10-03)
deepseek, `waveA` против `waveA-noA3`, 8 задач × 2, seed 13, одновременно; апстрим Relace во всех 352 ответах.
| плечо | принято | wall, с | ответов | время модели, с | медиана ток/с | billed $ | cache % | вход/запрос |
|---|---|---|---|---|---|---|---|---|
| waveA | 16/16 | 1287 | 170 | 983 | 125 | 0.0877 | 77 | 9 507 |
| waveA-noA3 | 16/16 | 1383 | 182 | 1074 | 114 | 0.0996 | 76 | 9 901 |

Пары waveA/noA3 (номинальные поисковые 95 % t по 8 задачам): ток/с **0.97 [0.89; 1.05]**, wall 1.01 [0.85; 1.20],
billed 0.94 [0.80; 1.11], N 0.94 [0.81; 1.10]. **Эффекта A3 не обнаружено**; замедление декодирования от A3 больше
≈ 11 % интервал исключает. Вместе с абляцией ключа сессии: ни A2b-ключ, ни A3 не объясняют замедление deepseek в B4;
обе версии волны A теперь шли 114–125 ток/с (в B4 — 89). Рабочая гипотеза — дрейф/различие сессий у провайдера
(в B4 старты пар расходились до 723 с). Проверка: повтор B4 (base против waveA, обе модели, seed 17).

Статус: ГОТОВО (A3 оставить)
