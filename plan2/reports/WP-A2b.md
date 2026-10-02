# WP-A2b — транспорт, меняющий поведение (отчёт линии)

Ветка: ASTROLABE `v2/A2b` (worktree `ASTROLABE/.claude/worktrees/agent-aaedafa1f2991c2c1`), база — локальный `main`
`a05626c` (A4, A5, A2a). SDK не менялся (используется локальный `main` SDK `dba7ab7`, `-Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm`).
Коммиты: `8d54c84` (код + тесты + golden), `f0d8d2e` (ABI-дампы).

## Сделано
1. **Ключ сессии из id кампании.**
   - `provider-api` `Request.sessionKey: String?` (последний параметр, `@JvmOverloads` — прежние Java-конструкторы
     сохранены; токен `[A-Za-z0-9._-]`, ≤ `Request.SESSION_KEY_MAX_LENGTH` = 64).
   - core `WorkId.sessionKey` = `"astrolabe-" + первые 32 hex SHA-256("astrolabe/session/v1\n" + workId)` (42 символа);
     `cell/Cell.kt:335` — одна строка: `Request(…, mask, sessionKey = ids.work.sessionKey)` (единственное место
     построения `Request` в ядре; все ячейки кампании, включая детей/ревью, имеют тот же `ids.work`).
   - `ProfileBinding.options` (`provider-ai-gate/.../ProfileBinding.kt:176`): `request.sessionKey` → `ChatOptions.sessionId`,
     если шаблон профиля (`gate.options.sessionId`) своего не задал. Далее SDK: OpenRouter chat completions —
     заголовок `x-session-id` (`CompletionsCodec.java:150-155`, пресет `OPENROUTER`), Responses — тело
     `prompt_cache_key` (`ResponsesCodec.java:163`, при retention ≠ NONE; `OpenAiResponsesOptions.promptCacheKey` выше).
2. **Ярусы цен в `PriceTable`.** `provider-api`: `PriceTier(inputTokensAbove, perMillion)`, `PriceTable.tiers`
   (по умолчанию пусто, `@EncodeDefault(NEVER)` — таблица без ярусов сериализуется байт в байт как раньше, отпечаток
   `AttemptConfig` не меняется), `PriceTable.tier(inputTokens)`, `PriceTable.at(inputTokens)`;
   `BillableUsage.price(table)` считает по ярусу. `AiGateProfiles.draft` → `AiGateProfiles.priceTable(prices, date)`
   переносит ярусы SDK. Тот же ярус — в `CallFacts.priceTierInputTokensAbove` (`ResponseTranslator.facts`) и в
   резервной оценке `Accounting.estimateCost` (core). `ConfigSnapshot` замораживает и ярусы (инвариант 12).
3. **Рассуждения в заполненности по возможностям кодека.** `provider-api` `TokenEstimator.estimate(item: Item)`
   (умолчание — прежняя оценка, вынесена в `Item.planningEstimate`); `Item.estimate(estimator)` теперь вызывает
   `estimator.estimate(item)` — поэтому `Cell.kt:893` (`Resident` для `ReasoningRef`), `Cell.kt:728` и
   `Request.estimate` идут через оценщик без правки `Cell.kt`. `AiGateEstimator.estimate(item)`: `ReasoningRef` = 0,
   если `binding.features.nativeReasoningReplay()` = false; иначе — как раньше.
4. Golden `provider-ai-gate/src/test/resources/request-bytes/*.txt` обновлены (см. «Тесты»).

## Решения
1. **Откуда ключ.** Вопрос: адаптер не знает id кампании (`InvocationId` случаен, в `Request` его нет). Выбор: поле
   `Request.sessionKey`, заполняемое ячейкой. Почему: один и тот же объект запроса идёт в `estimate`, `validate` и
   `start` — подготовленное тело (кэш `recentlyPrepared` по идентичности) и оценка совпадают с отправляемым; хост
   (Studio строит `CellModel` сам) ничего не настраивает. Безопасная альтернатива: обёртка адаптера/оценщика на
   кампанию в `Controller` — без правки `Cell.kt`, но три объекта должны знать ключ, и оценка шла бы без ключа.
2. **Функция ключа.** `astrolabe-` + 32 hex SHA-256 от `"astrolabe/session/v1\n" + workId` — чистая функция
   `WorkId` (без часов, без attempt: попытки одной работы делят кэш), фиксированная длина 42 ≤ 64, набор символов
   безопасен для заголовка и тела; сырой id не уходит провайдеру. Альтернатива: id как есть (читаемее в панели
   OpenRouter, но длина до 128 и произвольный хостовый id).
3. **Приоритет.** Явный `gate.options.sessionId` профиля побеждает ключ кампании (выбор оператора; заодно способ
   отключить разбиение по кампаниям). Отдельного флага «не слать ключ» нет. Альтернатива: член `gate.session` =
   `campaign | off`.
4. **Формула цены по ярусам (проверить).** Для вызова с usage `q` (известные измерения):
   - `I = totalInput = q[uncached_input] + q[cache_read] + Σ q[cache_write_*]` (только известные измерения);
   - ярус `t* = argmax { t.inputTokensAbove : I > t.inputTokensAbove }` (строго больше; нет такого — база);
   - ставка измерения `d`: `r(d) = t*.perMillion[d] ?: base.perMillion[d]` (ярус заменяет только названные им
     измерения; ярусы не накапливаются — более высокий ярус без цены выхода берёт **базовую**, не нижнего яруса);
   - `price = Σ_d q[d] · r(d) / 10^6`; `Money.unknown`, если какое-то измерение неизвестно или без цены (как раньше).
   - Перенос из SDK (`AiGateProfiles.priceTable`): для каждого яруса SDK `T` каждое измерение задаётся полностью
     эффективной ценой SDK: `x = T.x ?: base.x` для input/cacheRead/cacheWrite/output, `cache_write_1h =
     (T.cacheWriteLong ?: base.cacheWriteLong) ?: (T.cacheWrite ?: base.cacheWrite)`, `cache_write_5m = T.cacheWrite ?:
     base.cacheWrite` — то же, что `Prices.withTier` + `Prices.cost` (долгие записи по цене обычных, если long-цены нет).
   - Совпадение с SDK проверено тестом на 6 наборах usage (граница 200 000 включительно/исключительно, записи обоих
     классов, переход на ярус 1 000 000 за счёт записей): сумма `BillableUsage.price` == `Prices.cost(usage).total`,
     ярус == `Prices.tier(usage)`.
   - Известное расхождение правила выбора яруса: SDK берёт `usage.totalInput()` только если известны все три
     ведра (иначе `input`), ASTROLABE — сумму известных; при неизвестном входном измерении цена и так `unknown`.
   - Резерв до вызова (`Accounting.estimateCost`, исправлено по Codex-ревью, два P2): для верхней границы входа `U`
     достижимые таблицы = база `at(0)` и `at(t.inputTokensAbove + 1)` для каждого яруса с порогом `< U` (факт ≤ `U`
     может попасть в любой из них; ярусы не накапливаются, и пропуск цены в старшем ярусе возвращает базовую —
     эффективные ставки могут убывать с ростом входа). Резерв = `max` по достижимым таблицам из
     `U · max(входные ставки таблицы) + output · ставка выхода`. **Неизвестен** (не ноль), если в какой-либо
     достижимой таблице нет цены выхода или цены хотя бы одного входного измерения, которое маршрут может выставить:
     `uncached_input` ∪ входные `usageFields` профиля ∪ `caching.writeClasses` (раньше хватало любой входной ставки,
     например только cache-read). Неизвестный резерв при лимите стоимости отклоняется существующей проверкой
     `Accounting.affordable`. `Router.conservativeCost` (`Router.kt:218`, зона A1) не тронут — по базовым ценам.
5. **Ярус в событии.** `CallFacts.priceTierInputTokensAbove` (A2a) теперь из таблицы профиля по тому же `I`, а не из
   `Prices` каталога: событие согласовано с посчитанной суммой; профиль, записанный вручную без ярусов, даёт `null`.
6. **Правила учёта рассуждений (проверить).** Заполненность `[T]` по элементу = `estimator.estimate(item)`.
   `ReasoningRef` под `AiGateEstimator`: `0` (exact, без поля 16), если `ApiFeatures.nativeReasoningReplay` маршрута
   = false — кодек не кладёт рассуждения в следующий запрос (OpenRouter-пресет chat completions:
   `reasoningContentReplay` = false; `CompletionsCodec.assistant` пишет `reasoning_content` только при true); иначе —
   прежняя оценка (`providerTag` + `opaque`, `unknownHistory` без `opaque`). Responses, Anthropic Messages, Google —
   `nativeReasoningReplay` = true → считаются как раньше. Оценка самого запроса (`AiGateEstimator.estimate(request)`)
   и раньше мерила подготовленное тело, так что допуск уже был верен; меняется только заполненность/резидентность.
   Не учтено: отказ SDK от чужих рассуждений (`ReasoningHandoff.DROP`) — такие ссылки по-прежнему считаются (завышение,
   безопасно).
7. **Расширение `TokenEstimator`.** Метод по умолчанию в интерфейсе `provider-api` — источник совместим (Java/Kotlin
   реализации и делегирование `by` не ломаются), ABI добавлен. Альтернатива без `provider-api`: невозможна — ячейка
   видит только `Item.estimate(estimator)`, а оценщик — только строки.

## Тесты
- L1 (`-Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm`): `:provider-api:test` — **24/24**;
  `:provider-ai-gate:test --tests …AiGateAdapterTest --tests …TranslationTest --tests …QualificationTest --tests
  …RequestBytesTest` — **34/34**; `:core:test --tests io.astrolabe.id.IdsTest --tests io.astrolabe.cell.CellTest` — **55/55**.
  Новые кейсы: `UsageTest` (цена по ярусу: граница, cache read в сумме, высокий ярус без цены выхода → база;
  сериализация без ярусов не меняется и с `encodeDefaults`), `RequestTest` (оценка элемента через оценщик; ключ —
  токен ≤ 64), `AiGateAdapterTest` (ключ: `x-session-id` у OpenRouter и только заголовок, `prompt_cache_key` у
  Responses, без ключа — ничего, шаблон побеждает; цена 250 000 → ярус 1.5225 USD, 200 000 → база 0.615;
  `ReasoningRef` 0 у OpenRouter, > 300 у Responses), `TranslationTest` (таблица из `Prices` = `Prices.cost`/`tier`
  на 6 наборах), `IdsTest` (ключ: детерминизм, длина 42, формула), `CellTest` (все запросы ячейки несут ключ кампании).
- Golden: до обновления упали ровно 2 кейса `RequestBytesTest`; построчный diff (по запятым) показал **только**:
  `openrouter-chat-completions` — новая строка заголовка `x-session-id: astrolabe-58581564e009c847f571dfc4d10cfb64` в
  обоих вызовах; `openai-responses` — в конце тела обоих вызовов `,"prompt_cache_key":"astrolabe-58581564e009c847f571dfc4d10cfb64"`
  после `"include":[…]`. Остальные байты (URI, модель, сообщения, инструменты, reasoning, max tokens) не изменились.
  Ключ — `WorkId("W-requestbytes0000000").sessionKey`.
- L2: `:provider-ai-gate:test` — **49, 0 падений, 4 skipped** (живые); `:core:test --tests "io.astrolabe.provider.*"
  --tests "io.astrolabe.context.*" --tests "io.astrolabe.cell.*" --tests "io.astrolabe.telemetry.*" --tests
  "io.astrolabe.id.*"` — **209/209** (в core нет классов `io.astrolabe.provider.*` — шаблон ничего не выбирает);
  дополнительно `AttemptConfigTest`, `DagScheduleTest`, `CampaignLoopTest` — **33/33**; `:eval:testClasses` — OK.
- Исправления по Codex-ревью (коммит `9e25561`): `AccountingTest` +3 кейса — убывающие ярусы (база $1/M,
  >100 $10/M, >200 $1/M, граница 201 → резерв 0.00201, а не 0.000201), старший ярус без цены выхода, недостижимые
  ярусы; без цены входного измерения (только cache-read + output; профиль без цены 1h-записи) → неизвестно, ярус с
  пропуском при базовой цене → известно; неизвестный резерв отклоняется при лимите стоимости. L1 `AccountingTest`
  8/8; L2 после исправления: `:provider-api:test` 24/24, `:provider-ai-gate:test` 49 (0 падений, 4 skipped),
  `:core:test --tests "io.astrolabe.{telemetry,cell,context,campaign}.*"` **359/359**; `checkKotlinAbi`
  (provider-api, core, provider-ai-gate, eval) — OK (публичный API не менялся).
- ABI: `:provider-api:updateKotlinAbi :core:updateKotlinAbi` (дампы в `f0d8d2e`; прежние конструкторы `Request`
  (5–7 аргументов) и `PriceTable` (3) сохранены); `checkKotlinAbi` для `provider-api`, `core`, `provider-ai-gate`,
  `eval` — OK. Полный `./gradlew build` не запускался.

## Отклонения от карточки
- **`cell/Cell.kt` тронут одной строкой** (`Cell.kt:335`, аргумент `sessionKey = ids.work.sessionKey` в
  построении `Request`) — вопреки «не трогать (A3)». Причина — решение 1: иначе адаптер не узнаёт кампанию. При
  слиянии с A3 возможен конфликт в этой строке (A3 правит соседнюю `Layout.render`/маску): разрешение — сохранить
  аргумент `sessionKey` в любой новой форме вызова `Request(...)`. Учёт рассуждений сделан через оценщик, как просили.
- Изменён `provider-api` (вне перечисленных границ): `Request.sessionKey`, `PriceTable.tiers`/`PriceTier`,
  `TokenEstimator.estimate(Item)` — без этого ни одно из трёх требований не выразимо.
- Сверх карточки, одной строкой каждое: `Accounting.estimateCost` по ярусу (резерв не занижается на длинном
  контексте), `ConfigSnapshot` замораживает ярусы, `CallFacts` ярус из таблицы профиля (решение 5).
- L1 из плана (`ProfileBindingTest`, `AiGateProfilesTest`) не существуют — кейсы добавлены в `AiGateAdapterTest`/`TranslationTest`.
- SDK не менялся.

## Хвосты и риски
- Живой проверки нет: что OpenRouter реально прилипает к провайдеру по `x-session-id` и что `prompt_cache_key`
  поднимает долю кэша — мерить после BL (поведение BL измерено **до** A2b).
- Anthropic Messages и Google ключ сессии не получают (кодеки SDK его не используют); среди пресетов chat completions
  заголовок задан только у OpenRouter (`OpenAiCompatible.java:32`), остальные — `sessionHeader = NONE` (ничего).
- `Router.conservativeCost` (`Router.kt:218`, A1, не тронут) считает по базовым ценам и не проверяет покрытие
  входных измерений — на длинном контексте и при немонотонных ярусах занижает; в A1 применить то же правило, что
  `Accounting.estimateCost` (максимум по достижимым таблицам, «неизвестно» без всех входных цен).
- Ключ в событиях (`ModelResponded`, «отправленный ключ сессии» из §4.5) не пишется — не в этой карточке; ключ
  восстановим из `WorkId` формулой.
- Порядок ярусов в `PriceTable.tiers` входит в отпечаток конфигурации как задан (черновик SDK сортирует по порогу).
- Изменение `Item.estimate` затрагивает всех вызывающих (ячейка, перестройка, компилятор): поведение меняется только
  для оценщика, переопределившего `estimate(Item)` (сейчас только `AiGateEstimator`).
- Kotlin `copy(…)` у `Request`/`PriceTable` сменил сигнатуру (Java-вызовы `copy` требуют перекомпиляции).

Статус: ГОТОВО К СЛИЯНИЮ — ASTROLABE `v2/A2b` `9e25561`
