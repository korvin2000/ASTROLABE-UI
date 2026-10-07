# WP-E1w — подключение E1 в горячие файлы; `seedsMaxTokens` на двух путях; оракул теста достижимости (сессия 5)

Читать вместе с `plan2/COMMON.md`. Исполнитель — t3. Ядро: ветка `v2/E1w` от `main` `2e0d4f4` (после D7, E1, B6a, C18), worktree
`C:\work.astrolab\ASTROLABE\.claude\worktrees\E1w`. Вы — временный владелец `campaign/Controller.kt` и `cell/Cell.kt` до D4:
правки точечные, ничего сверх списка. Отчёты-источники: `plan2/reports/WP-E1.md` (раздел части B, «Нужная строка»),
`plan2/reports/WP-C18.md` (хвосты: `seedsMaxTokens`, риск оракула).

## Цель
1. **`routing_log` и снимок работают в продукте.** `campaign/Controller.kt` — вызов `router.selectProfile(function, packet, impact, policy)`
   (около `:2490`, найти по `selectProfile`) → перегрузка `selectProfile(…, io.astrolabe.route.RoutingLog(c.store, clock), c.ids)`;
   то же для второго вызова маршрутизатора в `recover/Repair.kt:~109`. Тест через настоящую сборку (`campaign`-тест с поддельным
   адаптером, как `RoleWiringTest`): после прогона S0 в store есть ≥ 1 строка `routing_log` с `binding_key` и `snapshotSeq`, и строка
   `binding_snapshots` для (work, attempt); повторное открытие читает тот же снимок (`seq` не меняется).
2. **`seedsMaxTokens` доходит до обоих путей переноса.** Перенос на границе ячейки (`Controller.kt` ~1793) и pressure-rebuild
   (`Cell.kt` ~1419) передают константу 4000 вместо `defaults.seedsMaxTokens` — передать настройку (два аргумента). Проверка:
   строки `seedsMaxTokens` в `SettingsReachabilityTest` переводятся из «достигнут частично» в «достигнут» по обоим путям (или
   отдельный тест в `context`/`cell`, если фикстура не даёт pressure-rebuild — тогда хотя бы граница ячейки). WF-14/WF-15: стражи
   `BoundaryCarryScenarioTest`, `AppendOnlyPrefixScenarioTest` зелёные, байты префикса не меняются при значении по умолчанию.
3. **Оракул `SettingsReachabilityTest`** (`campaign`): базовые прогоны расходятся в `Checks @<stamp>` и id CAL-заметок, поэтому
   совпадение двух баз случайно. Нормализовать `@[0-9a-f]{4,}` и `temprepo\d+` (и любой другой найденный недетерминизм) перед
   сравнением, перепрогнать класс; поля `m` и `k` — проверить, что их «достигнут» держится после нормализации; если нет —
   перевести в «отложено» с причиной, не подгоняя. Тест по-прежнему **падает** на поле без строки.

## Границы и проверки
- Ваши файлы: `campaign/Controller.kt` (три места), `recover/Repair.kt` (одно), `cell/Cell.kt` (один аргумент),
  `campaign/SettingsReachabilityTest.kt`, новый тест подключения. Не трогать остальное; `TODO.md`, `CONTINUE-TASK.md`, `docs/reference/workflow-invariants.md` — нет.
- L1 (один раз): `./gradlew :core:test --tests 'io.astrolabe.campaign.SettingsReachabilityTest' --tests 'io.astrolabe.campaign.RoleWiringTest' --tests '<новый тест>' --tests 'io.astrolabe.route.*' -q --console=plain`.
- L2 (один раз): `--tests 'io.astrolabe.campaign.*' --tests 'io.astrolabe.cell.*' --tests 'io.astrolabe.workflow.*' --tests 'io.astrolabe.recover.*'` и
  `./gradlew assemble testClasses checkKotlinAbi -Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm -q --console=plain`.
  Публичный API не должен меняться; если изменился — `updateKotlinAbi` один раз. Не больше трёх циклов.

## Готово, когда
- Тест подключения зелёный; `seedsMaxTokens` достигнут по обоим путям (или один с причиной); оракул нормализован, класс зелёный; L1/L2 зелёные; WF 43/43.

## Отчёт
`C:\work.astrolab\plan2\reports\WP-E1w.md` по COMMON.md · `Статус: …` и последний коммит. Оценка расхода: ≤ 250 тыс. токенов.
