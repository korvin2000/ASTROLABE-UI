# WP-A1r — доводка волны A: маршрутизатор по правилу резервирования ячейки (отчёт линии)

База: локальный `main` 5b25c29 (Merge v2/A1 + Merge v2/A2b). Ветка `v2/A1r`.

## Сделано
- `core/src/main/kotlin/io/astrolabe/route/Router.kt` — `Router.conservativeCost` больше не считает сам: вызывает
  `Accounting.estimateCost(profile, packet.contextTokens, packet.outputTokens)` (правило D-385: максимум по всем
  достижимым ценовым таблицам — база и каждый tier с порогом ниже входа; всё входное по самой дорогой входной ставке;
  unknown, если хоть одна достижимая таблица не ценит output или любое входное измерение маршрута). Неизвестная оценка
  возвращается как `null` (прежний контракт: `null` = неизвестно). Импорт `BillingDimension` убран.
- `core/src/main/kotlin/io/astrolabe/cell/Layout.kt` — удалены deprecated-перегрузки `Layout.system(role, mask, mode)` и
  `Layout.render(role, mask, mode, …)` (вместе с их `@JvmOverloads`/`render$default`).
- `core/src/main/kotlin/io/astrolabe/context/Compiler.kt` — `Layout.render(role, config.executionMode, …)`; ставшая
  мёртвой локальная `mask` и импорт `Ceiling` удалены.
- `core/src/test/kotlin/io/astrolabe/cell/LayoutTest.kt` — убраны вызовы deprecated-перегрузок (инвариант «маска не
  меняет кэшируемые регионы» теперь держится сигнатурой: маски среди параметров нет).
- `core/api/core.api` — перегенерирован (`:core:updateKotlinAbi`): минус 5 строк mask-перегрузок `Layout`.
  `provider-ai-gate` уже вызывал `Layout.system(role, mode)` — правок не понадобилось.

## Решения
1. Общая функция — существующая `Accounting.estimateCost` (internal, `telemetry/`, тот же модуль `core`): маршрутизатор
   её вызывает, арифметика не дублируется и не переносится. В `provider-api` не выносил: правило опирается только на
   типы `provider-api`, но его единственные потребители — ячейка и маршрутизатор в `core`; перенос расширил бы публичный
   ABI `provider-api` без нужды.
2. Unknown → `null` на выходе `Router.conservativeCost`. Так работает уже существующая политика роутера без изменений:
   под денежным лимитом профиль исключается с причиной `cost unknown at its price table`; без лимита ранжирование
   `expected == null` ставит его после всех известных. Возврат `Money(unknown=true)` сломал бы ранжирование: его
   `amount` = 0 сортировался бы как самый дешёвый.
3. Вход маршрута = `packet.contextTokens` (wire input), выход = `packet.outputTokens`; growth reserve по-прежнему не
   оплачивается (D-384). Ячейка резервирует по `estimate.upperBoundTokens` и `maxOutputTokens` (`Cell.kt:379`) —
   тем же правилом; при равных входах цифры совпадают (тест).

## Тесты
- L1: `:core:test` RouterTest + AccountingTest + LayoutTest — зелёные.
- Новые в `RouterTest`:
  - `a long-context tier prices the route as the cell reserves it so routing never selects what the cell refuses` —
    вход 250k, база $1/M, tier >200k $2/M, output $0: стоимость $0.50 (не $0.25), равна
    `Accounting.estimateCost(…, 250_000, 4_000)`; при бюджете $0.30 — `Refused` (`costs 0.5 USD; 0.30 remain…`), при $0.50 — выбран.
  - `a partially priced table is an unknown cost not a known low one` — таблица ценит только uncached input и output,
    маршрут биллит cache read: `estimateCost` unknown, `Router.conservativeCost` = `null`; под лимитом исключён
    (`cost unknown at its price table`), без лимита выбирается профиль с известной ценой.
- Обновлены ожидания существующих RouterTest: `FakeProfiles.main` 10k+4k теперь $0.12 (вход по самой дорогой
  входной ставке 1h cache write $6/M), было $0.09 (только uncached $3/M).
- L2 (route/telemetry/context/cell/campaign в `:core:test`, `:core:checkKotlinAbi`, `:provider-api:checkKotlinAbi`, `:eval:compileTestKotlin`, `:eval-live:compileTestKotlin`, `:provider-ai-gate:test -Pastrolabe.aiGateBuild=…`) — exit 0; XML своего checkout: 463 теста, 0 падений, 0 ошибок, 4 пропуска. `provider-api` не менялся.

## Отклонения
- Тест `S changes only with the role and the execution mode, never with the turn's mask` потерял две проверки через
  deprecated-перегрузки (они удалены по задаче); имя и прочие проверки сохранены.

## Хвосты
- Консервативная цена роутера выросла для профилей с дорогой cache-write ставкой (fake main: ×1.33). Это и есть
  правило ячейки; денежные пороги в тестах/конфигурациях других модулей, подобранные под старую оценку, L2 проверяет
  только для перечисленных пакетов.
- `Router.conservativeCost` и `Accounting.estimateCost` считают от разных входов (wire context против upper bound
  оценки ячейки); если ячейка добавит к входу запас, который маршрутизатор не видит, расхождение возможно — правило
  одно, входы разные (вне задачи).

Статус: ГОТОВО К СЛИЯНИЮ — ASTROLABE `v2/A1r` `9bb8487`
