# WP-AR — исправления по adversarial-review Codex волны A (отчёт линии)

База: локальный `main` 64f9f98 (Merge v2/A1r). Ветка `v2/AR`, пять коммитов по находкам.

## Сделано
- **AR-1 (P1, readiness wait как оракул секретов)** — `core/src/main/kotlin/io/astrolabe/tool/run/Run.kt`:
  `until_line` сопоставляется с текстом, отредактированным на уровне захвата (`ReadinessScan`): строки редактируются
  прогонами (как capture), блок приватного ключа с открывающим маркером удерживается до `-----END` через границы poll,
  затем редактируется целиком; незакрытый блок (или превысивший лимит прогона) не сопоставляется и не показывается.
  Ожидание, начавшееся внутри блока (`since` посреди ключа, напр. второй `wait` после истёкшего), определяет это по
  префиксу лога (`insideKeyBlock`) и пропускает остаток блока. Хвост вывода `wait` (ready/expired) редактируется
  `Redaction.applyLive` (`auth/Redaction.kt`, internal): END без BEGIN скрывает всё до него, BEGIN без END — всё после,
  `openAtEnd` скрывает окно целиком, если блок открыт, а BEGIN в окне нет. Совпавшая строка в `line matched: …` — всегда
  строка из capture-level редактирования. Маркеры `PRIVATE_KEY_BEGIN/END` — internal в companion `Redaction`.
- **AR-2 (P1, провалившиеся/отменённые вызовы выпадали из итогов)** — `cell/Cell.kt`: в `finally` вызова модели после
  `accounting.record` каждый диспатченный, но не отвеченный вызов (ошибка, отмена корутины, `terminal.cancelled`) эмитит
  ровно один `ModelResponded` с согласованным usage (`null`, если неизвестен) и стопом `Cancelled` для отмены, иначе стоп
  terminal-ответа или по классу ошибки (`OutputLimit`/`Refusal`/`Truncated`). `event/AgentEvent.kt`: `ModelResponded`
  получил trailing `failure: String? = null` (имя класса ошибки, без сообщения), `@JvmOverloads` уже был.
  `eval-live/.../Recorder.kt`: `Totals.modelFailures`; `failure` исключён из сумм. README eval-live обновлён.
- **AR-3 (P2, Java-конструкторы)** — `tool/Args.kt` `RunArgs` и `tool/edit/Edit.kt` `EditResult`: `@JvmOverloads`;
  `Defaults.kt`: явный v1.0 secondary-конструктор (62 параметра; новый `growthReserveFullWindowTokens` не trailing),
  дефолт вынесен в private const `GROWTH_RESERVE_FULL_WINDOW_TOKENS`, чтобы secondary делегировал в primary без цикла;
  `context/ContextCover.kt` `ContextArithmetic`: v1.0 конструктор из 5 полей (`wire = total`, `reserve = output = 0`).
  `core/src/test/java/io/astrolabe/java/JavaConsumptionSmokeTest.java`: `theVersionOneConstructorsStillCompileFromJava`
  вызывает v1.0 полные конструкторы RunArgs, EditResult, ContextArithmetic, Defaults, ModelResponded, Response,
  BillableUsage, PriceTable, Request, RoutingPacket. `core/api/core.api` перегенерирован.
- **AR-4 (P2, суммирование фактов)** — `Recorder.kt`: `responded: Map<String, Quantity>`, `Quantity(sum, known, calls)`
  — сумма по `known` из `calls` ответов, частичная сумма видна как таковая; пороги ценовых tier больше не суммируются:
  `priceTiers: Map<String, Int>` — число ответов на порог, `none` для ответа без tier. README: формат результата.
- **AR-5 (P2, `run.wait` при маске только с `run.poll`)** — правило в одном месте: `ToolOps.implied(mask)`
  (`tool/ToolFamily.kt`, internal): `run.poll` ⇒ `run.wait`. `Role.ops` (internal) = нормализованная маска роли; из неё
  читают `effectiveOps` (маска хода/запроса), `Refusals.masked`, потолок в `Cell.refusalOf`, строки `[S] tools:` и
  `[A] enabled this turn` (`Layout`). `Run.execute` проверяет `ToolOps.implied(mask)` вместо частного случая.

## Решения
1. AR-1: удержание по маркерам PEM, а не «перередактировать весь накопленный вывод на каждом poll»: память ограничена
   (прогон ≤ `maxBytes/4` символов, удерживаемый блок ≤ того же, далее — режим пропуска до END), при этом многострочный
   ключ распознаётся тем же правилом `private-key-block`, что и в capture. Незакрытый к концу процесса блок не
   сопоставляется и не эхоится (строже capture, где незакрытый блок без cap не скрывается).
2. AR-2: переиспользован `ModelResponded` (а не span/новое событие): Recorder и `CellMetrics` уже агрегируют его;
   неотвеченный вызов с неизвестным usage делает итоговое измерение `null`, а не частичной суммой. Для провала без
   terminal-ответа стоп `Truncated` (ответ не завершён) + `failure`; новый `StopReason.Failed` не вводил — он сломал бы
   исчерпывающие `when`/`switch` у потребителей `provider-api`.
3. AR-3: где новый параметр trailing с дефолтом — `@JvmOverloads`; где не trailing (`Defaults`) или без дефолта, но со
   смысловым значением v1.0 (`ContextArithmetic`: v1.0 не учитывала reserve/output) — явный secondary.
4. AR-5: нормализация в `core` (`ToolOps`/`Role`), не в `provider-api` `ToolMask`: семантика run-операций — знание ядра.
   Встроенные роли уже содержат `run.wait`, поэтому их `[S]`/`[A]` и отпечатки не меняются.

## Тесты
- L1 AR-1: `RunTest` (48) + `RedactionTest` (10) — зелёные; новые: полный PEM-блок в одном poll, блок, разрезанный на два
  poll, ожидание, истёкшее внутри открытого блока, и следующий `wait` с `since` внутри него (`^MII|ready` совпадает
  только с `ready`), блок вместе с терминальным poll — ни строк payload, ни `line matched` внутри секрета.
- L1 AR-2: `TerminalAccountingTest` (3, новый: ответ, затем провал/отмена — 2 `ModelRequested` ↔ 2 `ModelResponded`,
  usage terminal'а, `failure = Transport` / стоп `Cancelled`), `EventsTest`, `SpansTest`, `TotalsTest` (новый: ответ +
  отмена + провал с неизвестным usage → `modelFailures = 1`, `uncachedInputTokens = null`, `costPricedPart` по известным).
- L1 AR-4: `:eval-live:test` (BenchTest 2, LiveModelsTest 1, TaskValidityTest 1, TotalsTest 4) — зелёные; новый:
  latency 1200 + 800 из 4 вызовов → `Quantity("2000", 2, 4)`, два вызова с порогом 200000 → `priceTiers {200000: 2, none: 2}`.
- L1 AR-5: `CellTest` (50, новый: кастомная роль `poller` без `run.wait` — маска запроса содержит `run.wait`, `[S]`
  `run(run, poll, wait, cancel)`, `[A]` не исключает `run.wait`, вызов `run.wait` диспатчится и получает отказ Run по
  хэндлу, а не отказ маски), `LayoutTest` (10), `RoleTest` (3), `RunTest` (48).
- L1 AR-3: `JavaConsumptionSmokeTest` (3), `DefaultsTest` (3), `ContextCoverTest` (14).
- L2 (Windows, JDK 26, `-Pastrolabe.aiGateBuild`): `:core:test` tool.*/cell.*/event.*/java.*/telemetry.* — 50 классов,
  476 тестов, 0 падений (1 skipped); `:eval-live:test` 8/8; `:provider-ai-gate:test` 49 (4 skipped), 0 падений;
  `:core:checkKotlinAbi`, `:eval-live:checkKotlinAbi`, `:eval:compileTestKotlin` — зелёные (по XML своего checkout).
- `updateKotlinAbi` для core/eval-live/provider-api: изменился только `core/api/core.api` (закоммичен в AR-3).

## Отклонения
- `Precompile.Fingerprint` (`io.astrolabe.context.Fingerprint`) остаётся Java-разрывом: новые `system` и `schemas` —
  поля идентичности (дайджест `[S]` и набора схем), разумного дефолта нет (пустая строка дала бы отпечаток, который
  никогда не совпадает с настоящим).
- Kotlin-only бинарный разрыв (исходники совместимы, Java не затронута): исчезли synthetic `<init>(…, int,
  DefaultConstructorMarker)` у `Defaults`, `ModelResponded`, `RoutingPacket`, `RunArgs`, `EditResult`,
  `BillableUsage`, `Request`, `Response` — Kotlin-код, собранный против v1.0.1 и вызывавший их с дефолтными аргументами,
  нужно перекомпилировать. Вернуть их через `@Deprecated(HIDDEN)`-конструктор нельзя без конфликта JVM-сигнатур с
  перегрузками `@JvmOverloads`.
- `Defaults` не был в списке находки, но имел тот же разрыв (удалённый полный `<init>`), исправлен тем же способом.

## Хвосты
- `run(op=poll)` (не `wait`) по-прежнему редактирует каждый срез отдельно: срез посреди многострочного ключа без
  маркеров покажет payload (предсуществующее, вне находки; лечится тем же `applyLive` + префиксом лога).
- Хост-паттерны редактирования, охватывающие несколько строк (кроме PEM), распознаются только внутри одного прогона
  строк одного poll.
- `Totals.responded` не агрегирует поля внутри `usage` (`billed`, `reasoningTokens`) — `usage` в KNOWN, как и до AR.

Статус: готово, 5/5 находок исправлены (Fingerprint остаётся Java-разрывом, см. отклонения); ветка `v2/AR` запушена, последний коммит ea46331.
