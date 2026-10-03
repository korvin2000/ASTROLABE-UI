# WP-C14 — отчёт линии (хвосты ядра для лимитов Studio)

Ветка `v2/C14` от `main` 98772fb (слияние C11 8a3b5e1 в истории). TODO P8.C.14. Первый вариант (c5bf23c) прошёл ревью
Fable с вердиктом «сначала исправить» (P1 и три P2); ниже описано состояние после исправлений (f23b93f и далее).

## Сделано
1. **Токены контракта на reopen — только вверх** (949abe7, исправлено в f23b93f).
   - `CampaignPolicy.tokens` больше сохранённых → `contract.budget.tokens` переписывается **в той же версии контракта**.
     Значение меньше или равное сохранённому (заглушка хоста, например Studio `StartSpec("resume", 1, …)`) ничего не меняет и
     ничего не пишет; та же политика — тоже (D-392).
   - Подъём делает `Contracts.raiseTokens` (internal): под монитором `Contracts` перечитывает последнюю версию и в **одной
     транзакции** пишет строку контракта и запись журнала `budget: contract tokens raised by the host: <было> → <стало> tokens
     at contract v<N>`. Вызов — в `Controller.open` **после взятия lease**.
   - Контракт не трогается у завершённой кампании (completed/answered/failed/cancelled) и у останова, который токены
     не снимут (`ContractTokens.raisable`).
   - Останов `ContractBudget` несёт типизированную причину: `CampaignState.contractStop = ContractBudgetStop(cause, tokens)`,
     `Transition.Stopped(…, contract = …)`, и в конце `state.reason` — `— contract budget (<cause>)`. Причина определяется
     в точке останова: отказ маршрутизатора → `cost`; `TurnBudget` ячейки → `turns`; вызов без известного числа токенов →
     `unknown_usage`; иначе из токенов и денег — то, чего осталось меньше по доле (`ContractTokens.cause`).
   - Продолжение решается по долговечным фактам, а не по флагу в памяти: `tokens` — если в контракте сейчас больше токенов,
     чем при останове, и остаток > 0; `turns` — если остаток токенов > 0 (новая ячейка получает новый бюджет ходов);
     `cost`, `unknown_usage` и останов до C14 без причины — держат (`budget: contract budget still reached: …`).
     Продолжение = `Transition.LimitRaised("budget: contract budget continued (<cause>) …")` + `Transition.Reconciled`.
   - `BudgetStop.resumable` снова `false` для `ContractBudget`; возобновляемость — `ContractBudgetCause.resumable`
     (`tokens`, `turns`). `Lifecycle` пропускает `LimitRaised` для `ContractBudget` только с возобновляемой причиной.
2. **Типизированный «какой лимит держит»** (f6bbcfc + f23b93f). `OpenedCampaign.limitHold: LimitHold?`,
   `LimitHold(stop: BudgetStop, status: LimitStatus, reason: String, cause: ContractBudgetCause? = null)` и `limit: LimitKind?`.
   Для лимита задачи — вид, который держит сейчас (может отличаться от `CampaignState.budgetStop`); для бюджета контракта —
   `ContractBudget` с причиной (`null` у останова до C14). `null`, если кампания продолжилась, не была на бюджетном стопе,
   `CellCap`, или состояние `budget_exhausted` до C3 без `BudgetStop`. `BudgetStop.limit` — обратное к `BudgetStop.of`.
3. **Wire-имена** (2d3c819). `@SerialName` + `@JsonNames(<имя константы>)` на значениях `LimitKind`, `CostBasis`,
   `BudgetStop`. Старые записи (состояние, журнал, `FinishReceipt.limit`, события) читаются — на всё это есть тесты.
4. **Явный effort хоста сильнее шага профиля** (364be12). `CellModel.effortExplicit: Boolean = false`; `rebind` его
   сохраняет; `BalanceProfiles.effort(model, vector)`. KDoc: строка таблицы функций со своим effort (например,
   `ReviewCritical`) по-прежнему идёт на своём effort — флаг сильнее только шага профиля.
5. **«Поднять и продолжить» через фасад** (15af5af + f23b93f). `Astrolabe.resume(project, work, policy? = null,
   publication? = null)`, `AstrolabeJava.resume`/`resumeBlocking`, `CampaignHandle.limitHold`, `JavaCampaignHandle.limitHold()`.
   Без политики сохраняется всё хранимое: лимиты, токены и деньги контракта, а также заметки хоста и `resumeExpected`
   последнего открытия (контроллер журналирует их при изменении: `host: policy set`, internal `HostPolicy`). Контракт без
   запроса → `IllegalArgumentException`.

Файлы (код): `core/src/main/kotlin/io/astrolabe/{budget/Limits.kt, campaign/Lifecycle.kt, campaign/Limits.kt,
campaign/Controller.kt, contract/Contracts.kt, contract/SqliteContractRepository.kt, evidence/Journal.kt (append в
транзакции), event/AgentEvent.kt (KDoc), cell/CellContext.kt, Balance.kt, Config.kt (KDoc), Astrolabe.kt, java/AstrolabeJava.kt}`.
Тесты: `budget/LimitsTest.kt`, `campaign/TaskLimitsTest.kt`, `campaign/LifecycleTest.kt`, `BalanceProfilesTest.kt`,
`AstrolabeTest.kt`, `java/AstrolabeJavaTest.kt`, `java/JavaConsumptionSmokeTest.java`. Docs: `architecture/lifecycle.md`,
`reference/defaults.md`. ABI: `core/api/core.api`.

## Ревью (Fable, c5bf23c: находка → что сделано)
- **P1. Уменьшение бюджета на любом reopen** (`Tokens(1)` от Studio → бюджет := spent → `contract_budget`). Теперь — только
  вверх; меньшее или равное значение оставляет сохранённое без записи; контракт завершённой кампании не трогается.
  Тесты: «a reopen never lowers the contract's tokens — a placeholder policy keeps them and the task continues» (`CellCap`,
  reopen с `Tokens(1)` → 400 000 без записи, `Running`, затем `Completed`); переписывание бюджета `Completed`-работы убрано
  из теста и запрещено кодом (reopen `Completed` с 800 000 оставляет 400 000).
- **P2.1. Подъём не идемпотентен.** Строка контракта и журнал — одна транзакция (`SqliteContractRepository.replaceLatest(work,
  change, also)` + `Journal.append(tx, …)`); продолжение решается по долговечному факту «токенов в контракте больше, чем
  при останове» (`ContractBudgetStop.tokens`). Тест «a raise that died before its transition still continues the stop on
  the next open»: подъём записан, переход не применён → следующее открытие с той же политикой продолжает, запись одна.
- **P2.2. `resumable = true` и «raise the policy's tokens» неверны для не-токенных причин.** Типизированная причина
  (`ContractBudgetCause`: `tokens` · `turns` · `cost` · `unknown_usage`) в состоянии, в `LimitHold.cause` и в `state.reason`;
  возобновляемы только `tokens` и `turns`; для `cost` и `unknown_usage` контракт не переписывается, причина названа.
  Тест «a contract budget stop by its money, its turns or unknown usage says so, and only turns continue» (три сценария).
- **P2.3. Чтение-изменение-запись мимо `Contracts`, до lease.** `Contracts.raiseTokens` перечитывает последнюю версию и
  заменяет только бюджет в одной транзакции под монитором `Contracts`; вызов после `leases.acquire`.
- **P3.** KDoc `CampaignPolicy` (токены — только вверх на reopen, деньги заморожены), `campaign.finished.budgetStop`
  (возобновляемость по причине), `OpenedCampaign.limitHold` (состояние до C3 без `BudgetStop` → `null`),
  `CellModel.effortExplicit` (строка таблицы функций перекрывает явный effort). Фасад: `policy = null` сохраняет заметки и
  `resumeExpected` (тест в `AstrolabeTest`), пустые `requests` → `IllegalArgumentException`. Недостающие тесты: `ContractBudget`
  по деньгам, ходам, неизвестному usage; чтение старых `FinishReceipt.limit` и событий (`budget.spent` с `"Estimated"`).

## Решения
- **Где хранить поднятые токены.** Строка контракта в той же версии + запись журнала в одной транзакции. Версию не
  повышаем: подъём версии снял бы блокировку инкрементов при reopen и обесценил бы ревью, привязанные к `contractVersion` (C11).
- **Долговечный факт продолжения.** Вместо порядка записей журнала («SET новее останова») — сравнение токенов контракта с
  токенами, записанными в останове (`ContractBudgetStop.tokens`): оба факта в долговечных строках, порядок записей и
  часы не нужны. Эквивалентно правилу ревью.
- **Причина при останове.** Классификация в точке останова (`ContractTokens.cause`): у маршрутизатора бюджет —
  только деньги (D-109); частичная ячейка: `TurnBudget` → ходы; `TokenBudget`/`Reserve` → токены или деньги по меньшей
  доле остатка; вызов неизвестного объёма имеет приоритет. Останов до C14 (без причины) — не возобновляется (как до C14).
- **Ходы.** `turns` продолжается при reopen без подъёма (как `CellCap`): новая ячейка получает новый бюджет ходов; при
  нулевом остатке токенов держит с причиной `tokens`.
- **Где делать подъём.** После lease, поэтому переходы `LimitRaised` + `Reconciled` для `ContractBudget` применяются там
  же, после lease (у лимитов задачи и `CellCap` — как раньше, до сверки).
- **Заметки хоста для фасада.** Контроллер журналирует `HostPolicy(hostNotes, resumeExpected)` при изменении; фасад читает
  последнюю запись. По умолчанию (пустые заметки, `false`) ничего не пишется.
- **Wire-имена:** `@SerialName` + `@JsonNames` (дескриптор остаётся ENUM). **Явный effort:** флаг на `CellModel`
  (effort приходит с моделью на каждый `run`).

### Итоговые имена API и wire-слова (для Studio)
- `BudgetStop`: `task_limit_money`, `task_limit_minutes`, `task_limit_requests`, `cell_cap`, `contract_budget`;
  `resumable` — `true` для всех, кроме `contract_budget`; `limit: LimitKind?`.
- `ContractBudgetCause`: `tokens`, `turns`, `cost`, `unknown_usage`; `resumable` — `tokens`, `turns`.
  `ContractBudgetStop(cause, tokens)`; `CampaignState.contractStop`; `Transition.Stopped(…, contract)`.
- **Какая причина останова возобновляема:** лимит задачи — после подъёма хостом, пока лимиты оставляют место; `cell_cap` —
  всегда при reopen; `contract_budget/tokens` — после подъёма `CampaignPolicy.tokens` выше токенов при останове (и остаток > 0);
  `contract_budget/turns` — при reopen, пока остаются токены; `contract_budget/cost`, `contract_budget/unknown_usage` и
  `contract_budget` без причины (до C14) — нет.
- `LimitKind`: `money`, `minutes`, `requests`. `CostBasis`: `billed`, `estimated`, `mixed`, `none`. Старые имена констант читаются.
- `LimitHold(stop, status, reason, cause)` + `limit`; `OpenedCampaign.limitHold`; `CampaignHandle.limitHold`;
  `JavaCampaignHandle.limitHold()`; `Astrolabe.resume`, `AstrolabeJava.resume`/`resumeBlocking`;
  `CellModel(…, effortExplicit = true)`; `BalanceProfiles.effort(model, vector)`.
- Журнал: `budget: contract tokens raised by the host`, `budget: contract budget continued`, `budget: contract budget still
  reached`, `host: policy set`.

## Тесты
- Базовая L1 до правок: 7 классов, 55 тестов, 0 падений.
- Первый вариант (пункты 1–5): красные прогоны до исправлений — п. 3 `expected "money" but was "Cost"`; п. 1 legal из
  'contract budget' и нет подъёма; п. 2 `limitHold = null`; п. 4 `Economy … was Low`, эффорт `[Medium…]`; п. 5 — ошибка
  компиляции (API не было). L1 после циклов: 58 → 58 → 60; с фасадом и `java.*` — 73.
- Исправления по ревью: тесты написаны вместе с исправлением (код уже менялся одним шагом); красный путь подтверждён
  разбором ревью на c5bf23c (P1 — `target = max(requested, spent)`, P2.1 — флаг `raised` в памяти), отдельный красный прогон
  не делался. L1 + `AstrolabeTest` + `java.*`: 10 классов, 76 тестов, 0 падений.
- `git merge main` — «Already up to date» (`origin/main` 878d5fe и локальный `main` 98772fb в истории ветки).
- L2 (один раз, после исправлений): `./gradlew :core:test --tests 'io.astrolabe.budget.*' --tests 'io.astrolabe.campaign.*'
  --tests 'io.astrolabe.java.*' --tests 'io.astrolabe.event.*' --tests 'io.astrolabe.AstrolabeTest' --tests
  'io.astrolabe.BalanceProfilesTest' :eval:compileTestKotlin :provider-ai-gate:compileTestKotlin
  -Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm --continue -q` — exit 0; по XML своего checkout: 43 класса,
  299 тестов, 0 падений, 0 пропусков (до ревью: 43 / 296). `:eval` и `:provider-ai-gate` перекомпилированы.
  Известные нестабильные не проявились. Полный `./gradlew build` не запускался.
- ABI: `./gradlew :core:updateKotlinAbi` — добавления (`ContractBudgetCause`, `ContractBudgetStop`,
  `CampaignState.getContractStop`, `Transition.Stopped.getContract`, `LimitHold.getCause` и др.); изменились сигнатуры
  `copy`/синтетического конструктора у data class `Transition.Stopped` (новый параметр; `@JvmOverloads`-конструкторы на
  месте) и `CellModel` — исходники совместимы, предкомпилированный Kotlin-код пересобрать. Коммиты c5bf23c, 7a2862b.

## Отклонения от карточки
- `cell/CellContext.kt`: параметр `CellModel.effortExplicit` — без него «явный effort» в ядре невыразим.
- `campaign/Controller.kt` вне ветки open/resume: две строки в `route()` (effort) и точки останова `contract_budget`
  (отказ маршрутизатора, частичная ячейка плана и S0, перенос причины из `plan()`) — помощник `contractBudget`. Строки
  проводки baseline линии C10 (≈2101) не тронуты.
- `contract/Contracts.kt`, `contract/SqliteContractRepository.kt`, `evidence/Journal.kt` — по требованию ревью (подъём
  через `Contracts` в одной транзакции с журналом): internal-методы.
- `Config.kt`, `event/AgentEvent.kt` — только KDoc.
- `LifecycleTest`: «contract budget» без причины — снова без переходов; добавлены состояния с причинами.

## Хвосты и риски
- **`StopCode`** (`verify/Resolution.kt`, `verify/*` у C10) не тронут: `CampaignState.stopCode` пишет имя константы.
  Тот же приём после слияния C10. Имена констант пишут и `CampaignOutcome` (в теле состояния), `BalanceProfile`,
  `VerificationDepth` — вне карточки.
- Деньги контракта (`policy.cost`) на reopen не следуют политике: останов `contract_budget/cost` — тупик для этой попытки.
- Классификация `TokenBudget`/`Reserve` при заданных деньгах контракта — эвристика «меньшая доля остатка».
- Переходы `LimitRaised` + `Reconciled` для `contract_budget` идут после lease, то есть после цикла снятия блокировок по
  поправке контракта: инкремент, заблокированный и при этом остановленный по бюджету контракта, после поправки хоста
  снимется со следующим открытием (крайний случай).
- Два открытия одной работы в одном процессе берут lease одним держателем (`controller:<pid>`), так что lease их не
  разделяет; защита от устаревшей копии — перечитывание в транзакции (`strengthen` сам по себе — read-modify-write, как раньше).
- Для `contract_budget` событие `budget.limit_reached` не выпускается; число токенов — в `LimitHold.reason` и журнале.
- Studio: чтобы явный effort был сильнее подхода, передавать `effortExplicit = true`; может убрать сопоставление
  `StopCodes.wire` для `BudgetStop` и поиск держащего лимита по `event_log`; `resume`-заглушка `Tokens(1)` теперь безопасна.

Статус: ГОТОВО К СЛИЯНИЮ — последний коммит ветки `v2/C14`: 7a2862b (запушен)
