# WP-WAF2 — починка полного набора метки `v2-wave-W` (Linux, 2 теста; сессия 5, этап 0)

Читать вместе с `plan2/COMMON.md` (обязательно). Исполнитель — t3. Ядро: ветка `v2/WAF2` от `main` ядра,
worktree `C:\work.astrolab\ASTROLABE\.claude\worktrees\WAF2` (создан оркестратором; работать только в нём).
Источник: CI run 37648013657, job `check (ubuntu-latest)`, `./gradlew check`: `2230 tests completed, 2 failed`. Windows ещё идёт —
оркестратор сообщит, если там есть третий дефект. Правило 4B: целевые тесты, без полного набора; Linux-подтверждение — CI метки.

## Дефекты
**Д1. `io.astrolabe.DefaultsTest` «every §17 row maps to existing fields and every field belongs to a row»** —
`fields without a §17 row: [seedFallback, parentCarryMaxTokens]` (`core/src/test/kotlin/io/astrolabe/DefaultsTest.kt:53`; затем
`assertEquals(26, table.size)`). W9 добавил в `Defaults.kt:142,149` два поля переноса без строки в таблице §17. Правка: строка
таблицы для настроек переноса (вместе с `seedsMaxTokens`/`seedRule`, если они уже в другой строке — к ним; иначе новая строка
«Carry settings», счётчик строк ↑) **и та же строка в документе, который тест зеркалит** (найти: `rg -n '§17|## 17' docs/` —
таблица умолчаний; имена и значения по умолчанию из `Defaults.kt`). Тест `declared values match the table` — дополнить значениями
по умолчанию обоих полей (`true`, `4000`), не ослабляя.

**Д2. `io.astrolabe.workflow.OutputPolicyScenarioTest` «T-06 T-07 a nested generated directory is outside identity…»**
(`OutputPolicyScenarioTest.kt:190`, Linux только): `the report moved the candidate, the marker's file did not: acceptance needs a
decision: AC-1: run: /bin/sh -c "echo pyc > tests/__pycache__/x.pyc; echo {} > reports/out.json; cat pytest_pass.txt" (scope touched) — input`.
Проверка `OUT in reason && PYC !in reason` читает **текст причины**, а причина эхом содержит argv команды — на Linux в нём
`tests/__pycache__/x.pyc` буквально (PYC найден), на Windows путь в команде, видимо, с `\` — проверка проходит случайно, по
разделителю. Сама причина путь сдвига **не называет** («(scope touched) — input»). Правка — без ослабления стража (WF-5, WF-3):
утверждение «отчёт сдвинул кандидата, файл маркера — нет» проверяется по **структурным данным**, одинаковым на обеих ОС:
квитанция/состояние остановки (список путей, сдвинувших кандидата / `rewrittenInputs` / `untracked` штампа — что уже есть у
`AcceptanceDecisionRequest`, `Receipt`, `DirtyState`), а не по вхождению строки в reason. Если причина остановки по спецификации
(`docs/verification/scheduler.md` §8.4, D-429, task-workflow §5.3) **должна** называть сдвинувший путь — добавить путь в текст
причины там, где она строится (`campaign/Controller.kt` или `verify/Resolution.kt`; ≤ 20 строк), и тогда проверять и его.
Разберите, что именно печатает reason на Windows (запустите тест локально, посмотрите `run.state?.reason`) — выбор должен держаться
на обеих ОС без ветвления по ОС в тесте. Оба OС: `DirtyRepo`/`Scenario` строят команду по ОС — не трогать фикстуру сверх нужного.

## Границы
- Ваши файлы: `DefaultsTest.kt`, документ таблицы §17, `OutputPolicyScenarioTest.kt` (только утверждение и, если нужно, чтение
  структурных данных), при необходимости место построения reason (`Controller.kt`/`Resolution.kt`, ≤ 20 строк).
- Не трогать: `campaign/Handoffs.kt`, `context/`, `workflow/AnswerScenarioTest.kt`, `GoalEvidenceScenarioTest.kt`,
  `UnreadableFileScenarioTest.kt`, `MessageKindScenarioTest.kt` (их параллельно сливает D7), `docs/reference/workflow-invariants.md`,
  `TODO.md`, `CONTINUE-TASK.md`, `actual_state.md`, `audit/`. Ни один страж не ослабляется (условия, пороги, счётчики).

## Проверки
- L1 (один раз): `./gradlew :core:test --tests 'io.astrolabe.DefaultsTest' --tests 'io.astrolabe.workflow.OutputPolicyScenarioTest' -q --console=plain`
  (`export JAVA_HOME=/c/Users/user/.gradle/jdks/eclipse_adoptium-26-amd64-windows.2`).
- L2 (один раз в конце): `./gradlew :core:test --tests 'io.astrolabe.workflow.*' -q --console=plain` (+ `io.astrolabe.campaign.*`, если
  правили `Controller.kt`; `io.astrolabe.verify.*`, если `Resolution.kt`) и
  `./gradlew assemble testClasses checkKotlinAbi -Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm -q --console=plain`.
- Не больше трёх циклов «правка → тест».

## Готово, когда
- Оба теста зелёные на Windows; утверждение Д2 доказуемо не зависит от разделителя пути и текста команды (объясните в отчёте,
  почему оно пройдёт на Linux); таблица §17 и документ согласованы; WF 43/43; compile + ABI зелёные.

## Отчёт
`C:\work.astrolab\plan2\reports\WP-WAF2.md` по COMMON.md (Сделано · Решения · Тесты с циклами и расходом · Отклонения · Хвосты) ·
`Статус: …` и последний коммит. Оценка расхода: ≤ 200 тыс. токенов.
