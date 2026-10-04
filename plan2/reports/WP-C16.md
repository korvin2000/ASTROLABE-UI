# WP-C16 — условная цена подписочных моделей (шаг ядра) — отчёт линии

Ветка `v2/C16` от `main` `b0901dc`. Исполнитель: суб-агент (Opus) в worktree ядра.

## Шаг 0
1. **Официальная цена подписочных моделей в каталоге AI Gate.** В `models.json` единственный подписочный провайдер —
   `openai-codex` (ChatGPT Plus/Pro через Codex backend, `OpenAi.codex()`; OAuth). Все 7 его моделей (`gpt-5.5`,
   `gpt-5.6-luna|sol|terra`, `gpt-6-astra|luna|sol`) **без `prices`**. У каждой есть запись с тем же `id` у платного
   провайдера `openai` с ценами (база + тир `above 272000`), например `gpt-5.5`: 5 / 30 / cacheRead 0,5 USD за 1 M,
   тир 10 / 45 / 1. Других подписочных провайдеров в SDK нет (`anthropic`, `google` — только API-ключ).
   Сопоставление: тот же `modelId` у провайдера, чей id — префикс подписочного до `-` (`openai-codex` → `openai`);
   иначе — единственный другой провайдер каталога с ценой для этого `modelId`; несколько кандидатов — цены нет
   (пользователь вводит сам). Собственная цена записи (если она есть) всегда сильнее. API: `Llm.models()`
   (`ModelCatalog.all()`, `find`, `require`), `Model.prices()`.
2. **Остаток 5-часового и недельного лимита.** SDK его **не отдаёт**: `ResponseInfo.rateLimits()` (`RateLimits`:
   только requests/tokens remaining и reset) нигде во внутреннем коде не заполняется; заголовков Codex
   (`x-codex-*`) SDK не разбирает; событий об остатке нет. Исчерпание распознаётся только по ошибке:
   `ErrorCode.QUOTA_EXHAUSTED` (`quota_exhausted`, класс `RateLimitedException`) — HTTP 402 или код провайдера
   `usage_limit_reached` / `insufficient_quota` / `usage_not_included` (`HttpErrors.QUOTA`, `Codecs`); SDK его не
   повторяет (`Call.java:217`), `retryAfter()` — если провайдер его прислал. Окно (5 ч или неделя) из ошибки не
   различимо. Сейчас `provider-ai-gate` сводит его в `ProviderError.RateLimit` вместе с `rate_limited`/`overloaded`,
   а ячейка — в `failed(...)`: тупик инкремента.

## Сделано
- `provider-api` `Usage.kt`: `PriceTable` с `Billing.Plan` может нести цену модели (условную); новый `enum Charge`
  (`paid` / `nominal` / `unpriced`, wire-слова) и вычисляемое `PriceTable.charge` (не сериализуется — байты и отпечатки
  прежних таблиц не меняются). Условие init: план без базовой цены — без тиров. `PriceTable.at()` сохраняет `billing`.
  `ProviderAdapter.kt`: `ProviderError.QuotaExhausted(message, retryAfterSeconds)`.
- `core` `telemetry/Accounting.kt`: `CallAccount.charge` (умолчание `Paid` — старые строки `usage` читаются без
  миграции); `record`/`reserve` пишут `charge` профиля; nominal-вызов оценивается по цене таблицы (раньше `Money.zero`),
  unpriced — ноль; `estimateCost` возвращает ноль только для `unpriced`, nominal оценивается как per-token.
  `AccountTotals`: `money = paid + nominal`, плюс `paidMoney`, `nominalMoney`, `unpricedCalls` (с умолчаниями).
- `core` `budget/Limits.kt`: `CostBasis.Nominal` (`nominal`, `@JsonNames("Nominal")`); `LimitSpend` и `LimitStatus`:
  `paidCost`, `nominalCost`, `unpricedRequests` (с умолчаниями); `LimitSpend.of` считает их раздельно, `cost` = сумма.
- Выбор модели: `Router.conservativeCost`, `campaign/Limits.kt`, `Cell.kt` (допуск) и `Balance.modelClass` читают цену
  через `Accounting.estimateCost` / `perMillion` — после правки учёта они видят условную цену; `route/` не менялся.
- `provider-ai-gate`: `QUOTA_EXHAUSTED` → `ProviderError.QuotaExhausted` (`RATE_LIMITED`/`OVERLOADED` — как было);
  `AiGateProfiles.planPriceTable(llm, provider, model, date)` и `officialPrices(...)` — цена из каталога (шаг 0).
- `core` `cell/Cell.kt` (одна ветка): `QuotaExhausted` → `CellExit.Blocked` без вопроса → `BlockedExternal` (resumable).
- `eval-live` `Recorder.kt`: `Totals.costBasis` = `prices.charge.wire`; сумма `cost` уже считалась по таблице профиля
  (с условной ценой — условная сумма).
- testFixtures: `FaultKind.QuotaExhausted` в `ScriptedModel.kt`/`FakeAdapter.kt`.

## Решения
1. Где хранить признак «условно» → `PriceTable.charge` (вычисляется из `billing` + наличия цены), в записи вызова —
   `CallAccount.charge`. Почему: без нового сериализуемого поля таблицы (отпечатки попыток не меняются), без миграции
   store. Альтернатива: явное поле `nominal` в `PriceTable` — лишняя степень свободы.
2. Подписка без цены → `unpriced`: ноль денег, явная пометка (`charge`, `unpricedCalls`, `unpricedRequests`), денежный
   лимит её не держит (как D-409), запросы и минуты держат. Безопасная альтернатива: считать её «неизвестной» и
   отказывать под денежным лимитом — ломает локальные модели, которые D-409 разрешил.
3. Основание суммы: `Billed` / `Estimated` / `Nominal` — когда все оценённые вызовы одного рода; иначе `Mixed`
   (смысл `Mixed` расширен: «разные основания»). Вызовы `unpriced` в основание не входят; только они → `None`
   (смысл `None` расширен: «нет оценённого вызова»).
4. (Заменено по ревью P1-1, см. ниже.) Nominal-вызов **не** берёт `usage.billed` (то, что подписка «выставила», — не официальная цена); оплаченный — как
   раньше (D-378). Альтернатива: брать billed и у подписки — тогда возможен ноль, против №25.
5. Сопоставление цены в каталоге: собственная цена записи → тот же `modelId` у провайдера-префикса до `-`
   (`openai-codex` → `openai`) → единственный другой провайдер с ценой; иначе `null` (вводит пользователь). Цены
   берутся из `Llm.models().all()` — в нём есть только зарегистрированные в `Llm` провайдеры (нужен `openai`).
6. Исчерпание подписки → `CellExit.Blocked` (как ошибка аутентификации, D-331), исход `BlockedExternal`, `resumable`;
   повторное открытие продолжает. Отдельный `BudgetStop` не вводился: он требовал бы `campaign/Controller.kt`.

## Тесты
L1 (названы до запуска): `:core:test` — `io.astrolabe.telemetry.AccountingTest`, `io.astrolabe.budget.LimitsTest`,
`io.astrolabe.campaign.TaskLimitsTest`, `io.astrolabe.cell.CellTest`, `io.astrolabe.cell.TerminalAccountingTest`,
`io.astrolabe.route.RouterTest`, `io.astrolabe.BalanceProfilesTest`; `:provider-api:test` — `io.astrolabe.provider.UsageTest`;
`:provider-ai-gate:test` — `io.astrolabe.provider.aigate.TranslationTest`; `:eval-live:test` — `io.astrolabe.evallive.TotalsTest`.
Новые тесты критерия «готово»: (1) `TaskLimitsTest` «a task only on a subscription shows nominal spend and stops on its
money limit» + `AccountingTest` «a subscription model is charged at its official price…»; (2) `LimitsTest` «a mixed task
shows paid and nominal spend apart…»; (3) `TaskLimitsTest` «a model without a price runs without money accounting…» +
`AccountingTest` «a plan-billed profile without a price is marked unpriced…» (переписан из D-409-теста); (4) `LimitsTest`
«a spend, a limit status and a call recorded before nominal charges read back…»; (5) `CellTest` «a spent subscription
quota is a typed resumable stop…» + `TranslationTest` «a spent plan quota is its own provider error…». Плюс
`TranslationTest` «a subscription model takes the official price of the same model at its paying provider…».

Результаты (Windows, JDK 26, `-Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm`):
- Компиляция `:provider-api/:core/:provider-ai-gate/:eval-live:testClasses` — OK.
- L1 (одна команда, все классы выше) — **142 теста, 0 падений**: AccountingTest 10, LimitsTest 12, TaskLimitsTest 27,
  CellTest 53, TerminalAccountingTest 3, RouterTest 11, BalanceProfilesTest 7, UsageTest 6, TranslationTest 9, TotalsTest 4.
- `./gradlew updateKotlinAbi` — дампы `core`, `provider-api`, `provider-ai-gate` обновлены и закоммичены.
- L2 `./gradlew assemble testClasses checkKotlinAbi -q --console=plain` (с тем же свойством) — OK.
- Циклов «правка → тест»: **1**. Изменённый существующий тест: `AccountingTest` D-409 — проверка «план с ценой
  запрещён» устарела по №25 (теперь это условная цена); тест переписан на `unpriced` + добавлены лимиты запросов и минут.

## Отклонения от карточки
- `cell/Cell.kt` был в «не трогать», но п. 5 без него невыполним: ошибки провайдера разбирает только ячейка. Добавлена
  одна ветка `when` (4 строки, рядом с `Authentication`); остальной `Cell.kt` не менялся. Возможен конфликт с D1
  (общий `Cell.kt`) — тривиальный.
- testFixtures (`ScriptedModel.kt`, `FakeAdapter.kt`): одно значение `FaultKind.QuotaExhausted` для теста (5).
- Лимиты окна подписки (5 ч / неделя) заранее не учитываются: SDK не отдаёт остаток (шаг 0) — только остановка по ошибке.

## Хвосты и риски
- Старые строки `usage` подписочных профилей (D-409, `Money.zero`) читаются как `paid` с нулём — исторические суммы не
  пересчитываются (цены в строке нет).
- `Balance.modelClass` теперь видит условную цену: дорогая подписочная модель получает шаг effort «дорогой» в Economy /
  Thorough. Это следствие №25 (модель не бесплатная), но поведение для подписки меняется.
- `ProviderError` — sealed: новый подкласс ломает исчерпывающие `when` у внешних потребителей (в ядре таких нет;
  Studio не проверялся на это).
- Окно 5 ч / неделя из ошибки не различается; `retryAfterSeconds` — только если провайдер его прислал.
- `planPriceTable` зависит от того, зарегистрирован ли платный провайдер в `Llm` хоста (по ревью P1-2 закрыто: добавлен встроенный каталог).
- Возобновление после исчерпания квоты без ответа authority: нужна причина блока, которой владеет runtime (поле в
  checkpoint, не текст) — H3.

## Для шага Studio
- Где цена теряется сейчас: `backend/bridge/.../AutoProfiles.kt:62-63` — при `planBilled` ставит `Billing.Plan` только
  на пустую таблицу; нужно `AiGateProfiles.planPriceTable(llm, providerId, modelId, today) ?: <пустая Plan-таблица>`.
  `ModelService.java:94` `priceMark` возвращает `included` для OAuth без цены — показывать условную цену с пометкой
  «условно» (та же `officialPrices`-логика или цена из профиля). `ModelService.java:252` `PLAN_KINDS` — без изменений.
  `StatsService.java:140-157` сам пересчитывает деньги по `perMillion` и не знает `charge`: условную сумму считать по той
  же таблице, но выводить отдельно (`charge` профиля или `CallAccount.charge`); `unpricedCalls` — из `charge = unpriced`.
- Поля ядра: `PriceTable.charge` (`paid|nominal|unpriced`), `CallAccount.charge`, `AccountTotals.{money, paidMoney,
  nominalMoney, unpricedCalls}`, `LimitStatus.{cost, costBasis, paidCost, nominalCost, unpricedRequests}` (событие
  `budget.spent`), `CostBasis.Nominal` (`nominal`); исчерпание подписки — `BlockedRequest.reason` начинается с
  `provider plan quota exhausted`, исход `blocked_external` (resumable), `ProviderError.QuotaExhausted`.

## Для ревью Codex
- Вызов: `money = usage.price(table)` для `paid` и `nominal` (тир по `totalInput`, `BigDecimal` без округления:
  `rate × qty / 10^6`, `divide` точное); `unpriced` → `0`; нет usage → `unknown`.
- `LimitSpend.of`: для каждого вызова, кроме `unpriced`: `amount = billed (только paid) ?: money (если известна) ?:
  fundedMoney (удержание) ?: unknown`; чужая валюта → `unknown`. `paidCost = Σ paid`, `nominalCost = Σ nominal`,
  `cost = paidCost + nominalCost`; `largestCallCost` — по обоим. `unpricedRequests` входят в `requests`, не в деньги.
- `AccountTotals.money = paidMoney + nominalMoney` (по `call.money`, без `billed` — как раньше), `costPerAcceptedTask =
  money / accepted` (scale 10, HALF_EVEN — без изменений).
- Лимит: без изменений формул D-401 (`Exhausted` при `S + C > L`, `Reserve` при `S + C + R > L`), но `S` — сумма
  оплачено + условно, `C = max(E, u)`, где `E = estimateCost` теперь по условной цене (ноль только для `unpriced`).
- Округление: только в `costPerAcceptedTask` и в выводе причин (`stripTrailingZeros`); суммы не округляются.

## Ревью Codex и исправления (один раунд)
Каждое замечание сверено с кодом, все пять подтвердились.
- **P1-1 исправлено.** `Accounting.record`: положительный `usage.billed` → `charge = Paid`, `money` = счёт (в валюте
  таблицы, иначе `unknown`); `LimitSpend.of`: положительный счёт — оплачено при любом `charge`, считается один раз;
  нулевой/нет счёта при цене → `nominal`. Решение 4 выше этим заменено.
- **P1-2 исправлено.** `AiGateProfiles.planPriceTable`: к `llm.models().all()` добавляются записи всех SDK-бандлов
  (`ServiceLoader<ProviderBundle>.catalogModels()`, встроенный `models.json`); записи runtime идут первыми и для того же
  `ModelRef` побеждают. Тест: runtime только с `Providers.openAiCodex()` → `gpt-5.5` 5 / 30 USD, `nominal`.
- **P2-3 исправлено, затем отменено при сужении (см. «Сужение пакета»).** `Cell.kt`: константа `PLAN_QUOTA_EXHAUSTED` — начало причины блокировки по квоте (пишется в
  checkpoint). `Controller.reassessBlocked` (только эта ветка): такой блок снимается следующим запуском хоста без вопроса
  authority — строка журнала `Reconcile` и `Transition.Unblocked`. Тип задаёт источник (`ProviderError.QuotaExhausted`),
  а в checkpoint признак хранится префиксом причины: отдельное поле потребовало бы менять схему `CellCheckpoint`/`BlockedRequest`.
- **P2-4 исправлено.** `FinishReceipt.BudgetLine` и `EconomicsReport` получили `paidMoney`, `nominalMoney`,
  `unpricedCalls` (с умолчаниями); `EconomicsReport.render()` печатает строку `paid …; nominal …; calls without money accounting N`.
- **P2-5 исправлено.** `TaskLimitsTest`: подписочный тест переписан — профиль с ценой только на вход; лимит 5× цены
  первого вызова → вызовы идут, затем остановка `TaskLimitMoney` по накопленному условному расходу (`Nominal`, оплачено 0);
  поднятие лимита → та же попытка завершается; проверено деление в квитанции и в отчёте экономики. Новый тест: квота
  исчерпана на первом вызове I1 → `BlockedExternal`; повторное открытие без ответа authority снова отправляет вызовы,
  кампания завершается, у каждого вызова (и у неудачного) ровно одна запись `usage`.
- Тесты цикла 2 (только изменённые классы): AccountingTest 10, LimitsTest 12, TaskLimitsTest 28, TranslationTest 10 —
  0 падений. `git merge main` (до `2c8b288`) без конфликтов; `updateKotlinAbi` (изменился `core.api`), L2
  `assemble testClasses checkKotlinAbi` — OK. Циклов «правка → тест» всего: 2 из 3.

## Сужение пакета (после перепроверки Codex, план §8.8 п. 5)
Перепроверка нашла новый P1 в исправлении P2-3: снятие блока по префиксу причины обходит authority — модель может
написать ту же причину через `state(blocked)` (`StateTool.kt:156` сохраняет её как есть). Решение оркестратора — сузить:
- Убрано: ветка в `Controller.reassessBlocked`; `Controller.kt` снова совпадает с `main`.
- Осталось: остановка по `ProviderError.QuotaExhausted` в `Cell.kt:509` (`Blocked`, исход `BlockedExternal`, причину пишет
  runtime). Константа `PLAN_QUOTA_EXHAUSTED` (`Cell.kt:120`) — только текст причины, решений на ней нет. Блок по квоте —
  обычный внешний блок: его снимает ответ authority.
- Тесты `TaskLimitsTest:231`, `:246`: квота исчерпана → `BlockedExternal` с этой причиной, у каждого вызова (и у
  неудачного) ровно одна запись `usage`; повторное открытие без ответа authority блок не снимает и ничего не отправляет;
  блок с той же причиной, поставленный моделью через `state(blocked)`, повторное открытие тоже не снимает. Готового пути
  «authority ответила — блок снят» в `TaskLimitsTest` нет (в `CampaignLoopTest` блок снимается поправкой контракта, а не
  ответом authority) — такая проверка не строилась.
- Цикл 3 (последний): TaskLimitsTest 29, CellTest 53 — 0 падений. L2 `assemble testClasses checkKotlinAbi` — OK
  (публичный API не менялся, дампы прежние).

Статус: ГОТОВО К СЛИЯНИЮ — ветка `v2/C16`, последний коммит `aad3dcc` (запушен).
