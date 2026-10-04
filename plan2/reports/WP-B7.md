# WP-B7 — один `RunSpec` для Studio и `eval-live`; runner для длинных сценариев (шаг ядра)

Ветка `v2/B7` от `main` `b0901dc`, запушена. Исполнитель: суб-агент (Opus), worktree ядра. Итог: 11 файлов, +605 / −107.

## Сделано
- **`core/src/main/kotlin/io/astrolabe/RunSpec.kt`** (новый, публичный, `explicitApi`, `data class`, Java-форма через
  `@JvmOverloads`/`@JvmStatic`/`@JvmField`): `config: Config` (в нём флаги и пороги формы), `policy: CampaignPolicy`
  (токен-страж, лимиты, профиль баланса), `maxCells`, `leaseMinutes`, `effort`, `effortExplicit`, `maxOutputTokens`;
  `leaseDuration`, `outputHeadroom(profile)` (правило `AutoProfiles.outputHeadroom`), `cellModel(adapter, profile, estimator)`.
  Одна фабрика `RunSpec.defaults(profile, stateRoot?, mode = Autonomous)`; константы `MAX_CELLS` 48, `LEASE_MINUTES` 480,
  `TOKEN_GUARD_WINDOWS` 10000, `EFFORT` Medium, `LIMITS` (50.00 USD, 480 мин, 3000 запросов), `tokenGuard(window)`.
  ABI-дамп `core/api/core.api` обновлён (+50 строк, только добавления).
- **`eval-live` читает `RunSpec`**: `StudioPolicy` больше не держит `MAX_CELLS`/`LEASE_MINUTES`/`BUDGET_WINDOWS`/`config`/
  `budget`/`outputHeadroom`; `StudioAttempt.run(…, spec: RunSpec, …)` берёт оттуда Config, политику, аренду, модель ячейки,
  число ячеек. `BenchPlan.spec(profile, stateRoot)` — плечо по умолчанию = `RunSpec.defaults(...)` с `maxCells`/`effort` плана;
  умолчания `BenchPlan` и CLI (`--max-cells`, `--effort`) — константы `RunSpec`. CLI и поля `result.json`/CSV не сломаны
  (только добавлены необязательные поля).
- **Runner для длинных сценариев** (поля `task.json`, все необязательные):
  (а) `"baseCommit": false` — `git init` без коммита, база — дерево базы через собственный индекс runner'а
  (`GIT_INDEX_FILE` вне workspace, индекс репозитория пуст), diff и `changedFiles` — против этого дерева (`GitBase`);
  (б) `"message": {afterResponses, text}` — после K ответов `campaign.contracts.amendByUser(work, text)` на живой кампании,
  как `StudioHost.amend`; в результате `message.deliveredAt`, `contractVersion`;
  (в) `"reopen": {afterResponses}` — после K ответов задание `controller.run` отменяется (как при остановке backend Studio,
  «resumable»), проект и store закрываются, затем та же работа (`WorkId`) открывается в том же state root и идёт дальше
  (как `StudioHost.resume`); в результате `reopen.closedAt`, `segments` (у сегмента — `openedContractVersion`).
  `interrupt` и `reopen` вместе запрещены (`require`).
- Коммиты: `de198a7` (код), `219a81f` (тесты), `fd67abb` (ABI).

## Решения
1. Число ячеек: `Defaults.campaignCells`/`Controller.DEFAULT_MAX_CELLS` (12) **не тронуты** — они влияют на `Guards.requestCap`,
   бюджет фасада и fingerprint; `Controller.kt` вне границ. 48 живёт в `RunSpec.MAX_CELLS` как умолчание запуска хоста.
   Альтернатива — поднять библиотечное умолчание: меняет поведение фасада, отдельное решение.
2. `mode` — параметр фабрики, по умолчанию `Autonomous` (задача Studio `auto`; `eval-live` безголовый). Умолчание композера
   Studio — `ask` (`Preferences` `defaultMode`); шаг Studio передаёт режим задачи.
3. `effortExplicit`: `--effort`, названный в CLI, считается явным (как `TaskService.named(effort)` в Studio); без флага —
   `false`, как в Studio по умолчанию. Раньше `eval-live` всегда передавал `false`.
4. Тексты и поведение хоста Studio (`WORKING_NOTES`, `platform`, `verificationText`, `choose/apply`, авто-authority, `recap`,
   `routed`/`profileId`) остаются копиями в `StudioPolicy`: это не описание запуска, а логика хоста Studio. Перенос — отдельный WP.
5. Повторное открытие внутри попытки повторяет `StudioHost.launch`: второе `open` с заметками не делается, если открытие
   оставило `limitHold` (теперь, когда в политике есть лимиты, это нужно).
6. Плечо по умолчанию теперь несёт лимиты Studio (50 USD / 480 мин / 3000 запросов) и страж 10000 окон вместо 12 окон без лимитов:
   прогоны `eval-live` после слияния не сравнимы с прежними B4 по бюджету и числу ячеек (48 вместо 12).

## Тесты
- L1 (названы до запуска): `./gradlew :eval-live:test -Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm -q --console=plain`
  — **17/17 зелёные, 0 пропущено**: BenchTest 4, TotalsTest 4, TaskValidityTest 3, EnvironmentTest 1, LiveModelsTest 1 (без сети),
  новые RunSpecTest 1 (равенство: плечо `eval-live` = фабрика ядра = транскрипция запуска Studio, плюс headroom/effort модели
  ячейки, на двух профилях), ScenarioTest 3 (без коммита; сообщение посреди работы; две сессии — тот же `WorkId`, вторая
  сессия нашла сохранённый контракт v≥2, первая — v1, итог по второй сессии). Тестов ядра с перенесёнными умолчаниями нет
  (существующие классы ядра не менялись).
- `./gradlew :core:updateKotlinAbi -q` — дамп закоммичен.
- L2: `./gradlew assemble testClasses checkKotlinAbi -Pastrolabe.aiGateBuild=… -q --console=plain` — зелёный.
- Циклов «правка → тест»: **1** (без падений). Расход токенов не виден.
- Изменён существующий тест `EnvironmentTest`: `StudioPolicy.config(...)` удалён, тот же Config берётся из `RunSpec.defaults(...).config`.

## Отклонения от карточки
- Тест равенства с Studio — транскрипция значений Studio в `RunSpecTest.studioLaunch` (Studio не зависимость `eval-live`);
  настоящая сверка Studio ↔ ядро — в шаге Studio (тест там должен сравнивать свой `StartSpec`→`RunSpec` с `RunSpec.defaults`).
- `mode` в фабрике — параметр (см. Решение 2), а не одно значение.
- В ядре правок существующих файлов нет (кроме ABI-дампа): умолчания Studio перенесены в новый `RunSpec`, библиотечные
  `Defaults` не менялись (Решение 1).

## Хвосты и риски
- Сообщение посреди работы доходит до контракта (проверено); увидит ли его модель в текущей ячейке — поведение ядра, тест этого
  не утверждает. Не доставленное (работа кончилась раньше K) сообщение не переносится в следующий запуск (Studio ставит его в очередь).
- `reopen` проверен на поддельном адаптере в одном процессе; вторая сессия в отдельном процессе не проверялась.
- Плечо по умолчанию теперь с денежным лимитом: модель без цен в каталоге может упереться в лимит (известный хвост хотфикса про
  неизвестную цену).
- Копии текстов Studio в `StudioPolicy` (Решение 4) по-прежнему могут разойтись со Studio.

## Для шага Studio
Вызов ядра: `RunSpec.defaults(profile, stateRoot, mode)` и затем `.copy(...)` с настройками проекта/задачи; в `launch` —
`spec.leaseDuration`, `spec.policy`, `spec.cellModel(adapter, main, estimator)`, `spec.maxCells`.
- `ASTROUI/backend/server/.../tasks/TaskService.java`:
  - `config(TaskRun, Bound, instructions)` (~663–676): roles/mode/dClass/unknownOutcomeReconciliation руками → из
    `RunSpec.defaults(...).config` (слои настроек сливаются поверх, как сейчас поверх `Config()`).
  - `TOKEN_GUARD_WINDOWS` (~486) → `RunSpec.TOKEN_GUARD_WINDOWS` / `RunSpec.tokenGuard(window)`.
  - `spec(...)` (~687–706): `runtime.path("maxCells").asInt(48)`, `leaseMinutes asLong(480)`, `"Medium"` → константы `RunSpec`.
- `.../settings/SettingsService.java` `RUNTIME_DEFAULTS` (57–64): `leaseMinutes` 480, `maxCells` 48, `effort` "Medium" →
  `RunSpec.LEASE_MINUTES`, `RunSpec.MAX_CELLS`, `RunSpec.EFFORT.name()`.
- `.../tasks/Limits.java:19` `DEFAULTS` ("50.00", 480, 3000) → из `RunSpec.LIMITS`.
- `.../Preferences.java` 55/58: `defaultEffort` "medium", `defaultPreset` "balanced" — согласовать с `RunSpec.EFFORT` и
  `BalanceProfile.Balanced.wire`.
- `ASTROUI/backend/bridge/.../HostApi.kt:21–51` `StartSpec`: умолчания `maxCells` 48, `leaseMinutes` 480, `effort` "Medium",
  `preset` "balanced" → константы `RunSpec` (или `StartSpec` строит `RunSpec`).
- `.../bridge/StudioHost.kt`: `launch` (~242–330) `Duration.ofMinutes(spec.leaseMinutes…)` → `runSpec.leaseDuration`;
  `controller.run(…, maxCells = spec.maxCells…)` (~323) → `runSpec.maxCells`; `corePolicy(spec)` (361–368) → собирает
  `runSpec.policy` (`policy.copy(tokens = guard + contractStop, limits, balance)`); `cellModel(...)` (374–378) →
  `runSpec.copy(effort, effortExplicit, maxOutputTokens).cellModel(adapter, main, estimator)`.
- `.../bridge/AutoProfiles.kt:79–82` `outputHeadroom` → `RunSpec.outputHeadroom(profile)` (то же правило).
- Тест шага Studio: `StartSpec` по умолчанию → `RunSpec` равен `RunSpec.defaults(profile, stateRoot, Mode.Autonomous)`.

## Для B5
Готово: `BenchPlan.spec(profile, stateRoot)` — плечо по умолчанию (= запуск Studio); `--arm` строит варианты через
`RunSpec.copy(...)` и передаёт в `StudioAttempt.run(workspace, prompt, binding, events, spec, deadline, script, work)`.
`SessionScript` (interrupt / close / message), `GitBase` (с коммитом и без), поля `RunResult.baseCommit/message/reopen`,
`SegmentResult.openedContractVersion`. Ключ результата с плечом и отпечатками и цена по профилю вызова — не сделаны (B5).

Статус: ГОТОВО К СЛИЯНИЮ — fd67abb

## Ревью (Opus, один раунд) и слияние
Вердикт: можно сливать, P1 нет. Слито оркестратором в `main` ядра (`--no-ff`). Замечания — хвосты, в этой линии не чинятся:
- P2-1 (→ B5): `StudioAttempt.kt:387, 361, 400` — `closed.set(true)` до `job.cancel`: если `controller.run` уже завершился,
  исход теряется (outcome null, reason CLOSED) и `Bench.kt:133` открывает вторую сессию законченной работы. Считать сессию
  закрытой по факту отмены (`job.isCancelled`).
- P2-2 (→ B5): `StudioAttempt.kt:374-375` — `deliveredAt` / `closedAt` несут число из сценария, а не измеренное число ответов;
  `ScenarioTest.kt:111, 128` проходят тривиально. Записывать реальный счётчик `ModelResponded`.
- P2-3 (→ первый живой прогон): плечо по умолчанию несёт денежный лимит 50 USD; модель без цены может остановиться на нём.
- P3 (→ шаг Studio): `RunSpecTest.kt:68` — равенство со Studio проверено транскрипцией, настоящая сверка в тесте моста;
  `RunSpec.kt:35-37` — `require ≥ 1` строже, чем `coerceAtLeast(1)` в Studio; `RunSpec.kt:83` — режим по умолчанию
  `Autonomous`, Studio обязан передавать режим задачи; из Java `copy` требует все 7 аргументов.
- P3: `StudioAttempt.kt:394, 403` — результат `amendByUser` теряется, если прогон кончился во время доставки (только отчётность).
