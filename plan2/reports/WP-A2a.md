# WP-A2a — чистая телеметрия (отчёт линии)

Ветки: ASTROLABE `v2/A2a` (worktree `ASTROLABE/.claude/worktrees/mystifying-gates-4981b8`), SDK `v2/A2a`
(worktree `llm-transport-sdk/.claude/worktrees/v2-A2a`). База: ASTROLABE `a245ac7` (+ слит `main` `adc65a7` перед L2),
SDK `91d432b`. **Порядок слияния: сначала SDK, затем ASTROLABE** (`provider-ai-gate` использует `Usage.charge()`,
`Prices.tier(…)`, `ResponseInfo.route()` из SDK-ветки).

## Сделано
**SDK (`llm/`, `net.ai.gate`), коммит `8f68dc5`:**
- `metadata/Charge` (currency, amount, upstream) и `Usage.charge()`: сколько провайдер/шлюз сообщил, что списал —
  отдельно от оценки `Usage.cost()` (её по-прежнему считает `Engine.priced` из `Model.prices()`). `CompletionsCodec`
  читает OpenRouter `usage.cost` и `cost_details.upstream_inference_cost` (USD); то же правило в `ResponsesCodec`.
  `null`, если ответ суммы не назвал; на повторах из кэша ответов (`spent=false`) сбрасывается. Архив ответа
  (`ConversationJson`) пишет/читает `usage.charge`.
- Токены рассуждений: `completion_tokens_details.reasoning_tokens` уже мапился в `Usage.reasoning()` — покрыто тестом
  (в т.ч. «ноль остаётся нулём, отсутствие — отсутствием»).
- `ResponseInfo.route()` заполняется апстримом шлюза (OpenRouter `provider`): `complete` — через `info` ответа
  декодера, поток — через новый `ChatEvent.Started.route()` (+ перегрузка `Started.of(id, model, route)`) и
  `Accumulator`; `Engine.finish` и `Call.fail` сохраняют маршрут. Фактическая модель — существующий `responseModel`.
- Тайминги: `DefaultChatStream` отмечает `FirstOutput` только на содержательном выводе (text/reasoning/tool-call
  дельты, `PartEnd`) — не на `UsageUpdate` (Anthropic `message_start`), `Started`, `Unknown`, `Done`; поток без вывода
  — без `FirstOutput`. `Call.fail` даёт частичному ответу `ResponseInfo` (request id, latency, time to first output,
  attempts + ledger, route) — раньше у partial его не было. Документация `RequestEvent.FirstOutput` /
  `ResponseInfo.timeToFirstOutput()`: «время до первого вывода от старта вызова, не TTFT».
- `Prices.tier(Usage)` — ярус, которым `cost(…)` оценивает usage (пусто = базовые цены); `cost` переписан через него
  без изменения поведения. CHANGELOG — запись 2026-10-02.

**ASTROLABE, коммиты `e911bb4`, `a550e9d`, merge `main` `21c9a38`, ABI `b2a0abc`:**
- `provider-api`: `BillableUsage.billed` / `billedUpstream` (`Money`, как сообщено, не вычисляется; `price(table)` —
  оценка) и `reasoningTokens` (`null` = неизвестно, не 0; AX-09, FX-59); новый `CallFacts` (`latencyMillis`,
  `firstOutputMillis`, `upstream`, `responseModel`, `priceTierInputTokensAbove`) на `Response.facts`. Поля добавлены
  в конец с умолчаниями, `@JvmOverloads` сохраняет прежние Java-конструкторы.
- `provider-ai-gate`: `UsageMapper.billable` мапит `charge()`/`reasoning()` (только итоговый usage);
  `ResponseTranslator.facts` — из SDK `ResponseInfo`, `responseModel`, ярус через `binding.model.prices().tier(usage)`
  (`PriceTable` не тронут — A2b); `AiGateInvocation`: усечённый/отменённый ответ несёт facts частичного ответа.
- core: `AgentEvent.Cell.ModelResponded.facts: CallFacts?` (в конце, `@JvmOverloads`); эмиссия в `cell/Cell.kt` —
  одна строка (`facts = response.facts`). Счёт и рассуждения едут в `usage` события.
- `docs/platform/adapters.md` §15.2: абзац «billed рядом с оценкой; тайминги/апстрим/модель/ярус — телеметрия, не
  идентичность (I-05); отсутствие — неизвестно».
- Тест «байты запросов не изменились»: `provider-ai-gate` `RequestBytesTest` (chat-completions через OpenRouter и
  Responses через OpenAI на поддельном транспорте SDK `WireScript`; второй вызов повторяет reasoning + tool call +
  result; скриптованные ответы несут `provider`/`cost`). Golden-файлы
  `provider-ai-gate/src/test/resources/request-bytes/*.txt` записаны **на `main`** (ASTROLABE `8fc09ef` + SDK
  `91d432b`, временные detached-worktree, удалены) и совпадают на ветке байт в байт.

## Решения
1. Оплаченная сумма в SDK → новый `Usage.charge()`, а не `cost()`: `cost()` — оценка из цен модели, её перезаписывает
   `Engine.priced`; карточка требует «отдельно от оценки». Безопасная альтернатива: нет.
2. `usage.cost` читается без флага совместимости, валюта USD (кредиты OpenRouter), отрицательное/нечисловое —
   «не сообщено». Почему: поле есть только у OpenRouter; флаг добавил бы поверхность `OpenAiCompletionsCompat`
   (`fields()`, JSON). Альтернатива: флаг `reportsCharge` только в пресете OpenRouter, если другой шлюз начнёт слать
   `usage.cost` в иной единице.
3. В адаптере billed и reasoning берутся только из итогового usage (`finalForCall`), для наблюдённого до обрыва —
   `null`, как OUTPUT (AX-09). Альтернатива: хранить частичный счёт как нижнюю границу.
4. `firstOutput` = первое содержательное событие (не первый байт и не usage). Это меняет момент события SDK (не байты
   запроса): прежний маркер для Anthropic фактически был TTFB. Альтернатива: оставить старое и добавить второе событие.
5. Маршрут передаётся декодером через `info()` ответа (`ResponseInfo.empty()` + route) и `Started.route()`; ядро SDK
   достраивает остальные факты. Альтернатива: отдельное поле `AssistantMessage.route` — шире API.
6. Ярус в событии — порог `inputTokensAbove` применённого яруса (`null` = база); вычисляется адаптером через новый
   `Prices.tier(Usage)` (то же правило, что `cost`). Альтернатива: SDK кладёт ярус в `Usage`.
7. Форма события: `facts: CallFacts?` (тип из `provider-api`, тот же на `Response`), billed/reasoning — в
   `BillableUsage`, который уже в событии. Длительности — `Long` миллисекунд, единицы в именах.
8. `AiGateAdapter.progress` не менялся: тайминги приходят в `Response` из `ResponseInfo` — авторитетно и без
   зависимости от наличия слушателей; не нужен новый вариант sealed `InvocationProgress` и второй блок в `Cell.kt`.
   Альтернатива (для C4/E3): `InvocationProgress.FirstOutput` → `ModelProgress(stage="first_output")` для живого показа.
9. `main` (A4, A5) влит в `v2/A2a` перед L2 и `updateKotlinAbi`, чтобы дампы и L2 были на слитом состоянии.

## Тесты
- SDK L1 (`llm/`, `./gradlew :test --tests …OpenAiWireTest --tests …StreamContractTest --tests …AccumulatorTest
  --tests …KotlinUsageTest --tests …CatalogTest`): существующие кейсы после правок кода 23/23; с новыми — **33/33**. Новые кейсы:
  `openRouterChargeRouteAndReasoningTokensReachTheReply` (complete + stream + без суммы + архив),
  `usageAndLifecycleEventsAreNotTheFirstOutput`, `aPartialReplyKeepsItsCallFacts`,
  `theRouteOfTheStartReachesThePartialAndTheFinalReply`, Kotlin `kotlin callers read the charge, the route and the
  timings with their nullability`, `CatalogTest` + `Prices.tier`.
  (Без `:`-префикса `--tests` падает на подпроекте `ai-gate-kotlin` «No tests found» — использовать `:test`.)
- ASTROLABE L1, `-Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/.claude/worktrees/v2-A2a/llm`:
  `:provider-ai-gate:test --tests …TranslationTest --tests …AiGateAdapterTest --tests …RequestBytesTest` — **25/25**
  (новые: billed/reasoning/неизвестно, facts из `ResponseInfo` и пусто для архива, end-to-end OpenRouter с ярусом
  200 000, AX-01 partial с latency, 2 golden-кейса); `:core:test --tests io.astrolabe.event.EventsTest --tests
  io.astrolabe.telemetry.SpansTest` — **12/12** (новые: round-trip `ModelResponded` с facts/billed; JSON без новых
  полей декодируется с `null`). Java `JavaConsumptionSmokeTest` (`new Response(items, stop, null, null)`) компилируется.
- Golden: на `main` (`8fc09ef` + SDK `91d432b`) записано, на ветке совпало.
- SDK L2 `./gradlew test` (весь SDK, оба проекта): **258 тестов, 0 падений, 3 skipped**.
- ASTROLABE L2 (на слитом с `main` `adc65a7` состоянии, тот же `-Pastrolabe.aiGateBuild`): `:provider-api:test` —
  **20/20**; `:provider-ai-gate:test` — **45, 0 падений, 4 skipped** (живые); `:core:test --tests 'io.astrolabe.event.*'
  --tests 'io.astrolabe.telemetry.*' --tests 'io.astrolabe.cell.*'` — **188/188**; `:eval:compileTestKotlin` — OK.
- ABI: `:provider-api:updateKotlinAbi :core:updateKotlinAbi` (дампы в `b2a0abc`; прежние Java-конструкторы
  `Response`/`BillableUsage`/`ModelResponded` в дампе сохранены); `:provider-ai-gate:checkKotlinAbi
  :eval:checkKotlinAbi` — без изменений.
- Полный `./gradlew build` не запускался (по карточке).

## Отклонения от карточки
- «`Usage.java:69` `cost()`/`reasoning()`»: `reasoning()` уже мапился; `cost()` — оценка, поэтому оплаченная сумма —
  в новом `charge()` (решение 1).
- «`DefaultChatStream:227` не терять тайминги»: для успешных ответов SDK уже клал latency/TTFO в `ResponseInfo`;
  потери были в адаптере (не читал `ResponseInfo`), у partial (не было `ResponseInfo`) и в семантике `firstOutput`
  (срабатывал на usage) — исправлено там, где теряется.
- `AiGateAdapter (progress)` не изменён (решение 8).
- `ResponsesCodec` тоже читает `usage.cost` (OpenRouter Responses) — одна строка сверх карточки.
- Добавлены `docs/platform/adapters.md` §15.2 (DoD п.3) и `CatalogTest`-кейс к L1 SDK.

## Хвосты и риски
- Где провайдер суммы не шлёт (Anthropic, Google, OpenAI напрямую) — `billed = null` (критерий отказа). Маршрут есть
  только у OpenRouter Chat Completions (`provider`); у Responses его нет.
- `billedUpstream` у OpenRouter — «стоимость у апстрима» (для BYOK списывается с ключа пользователя вне `cost`);
  `is_byok` не моделируется (лежит в `native`). Для BL не складывать billed + upstream вслепую.
- Живой проверки нет (линия офлайн): BL должен подтвердить, что OpenRouter шлёт `provider` и `cost` в потоковых чанках.
- Для непотокового вызова `firstOutputMillis` = время всего тела ответа.
- Агрегации billed/latency в `CellMetrics`/`CampaignMetrics` нет — BL читает события; агрегаты — B/C4/E3.
- Kotlin `copy(…)` у `Response`/`BillableUsage`/`ModelResponded` сменил сигнатуру (Java-вызовы `copy` потребуют
  перекомпиляции); конструкторы сохранены `@JvmOverloads`.
- SDK: поведение `RequestEvent.FirstOutput` изменилось (решение 4) — потребители SDK, мерявшие TTFB по нему, увидят
  более поздний момент.
- `audit/validate.py` уже падает на `main` (не в CI); правка §15.2 его не чинит и не ломает дополнительно по сути.

Статус: ГОТОВО К СЛИЯНИЮ — SDK `v2/A2a` `8f68dc5` (сливать первым), ASTROLABE `v2/A2a` `b2a0abc`
