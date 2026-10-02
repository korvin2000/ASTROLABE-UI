# WP-A2a — чистая телеметрия (без изменения поведения)

**Исполнитель:** задача (spawn task), тир t3. **cwd:** `C:\work.astrolab\ASTROLABE`; второй worktree — SDK.
**Ветки:** `v2/A2a` в **обоих** репозиториях (ASTROLABE и `C:\work.astrolab\llm-transport-sdk`).
**Общие правила:** `C:\work.astrolab\plan2\COMMON.md`. **TODO:** P8.A.2.
**План:** §1 строки 22–23, §4.5 (второй пункт), §6 (A2a), §9.1.

## Цель
В каждом `ModelResponded` — оплаченная сумма и тайминги, чтобы baseline (BL) и все последующие сравнения мерили одно и
то же. **Байты запросов не меняются** (ключ сессии, ярусы цен в `PriceTable`, учёт рассуждений в заполненности — это
A2b, не здесь).

## Что сделать
1. **SDK** (`llm/`, `net.ai.gate`): worktree `git -C C:/work.astrolab/llm-transport-sdk worktree add
   C:/work.astrolab/llm-transport-sdk/.claude/worktrees/v2-A2a -b v2/A2a main`.
   - `CompletionsCodec`: `usage.cost` OpenRouter (и `cost_details.upstream_inference_cost`, если есть),
     `completion_tokens_details.reasoning_tokens` → `Usage` (`Usage.java:69`: `cost()`/`reasoning()`).
   - `DefaultChatStream` (`:227`): не терять тайминги (FirstOutput/Finished): полное время, первый содержательный вывод
     (не первый байт; `firstOutput` ≠ TTFT — назвать честно).
   - `ResponseInfo.route()` (`ResponseInfo.java:76`) заполнять апстримом/фактической моделью (OpenRouter `provider`,
     `model`), где ответ их несёт.
   - Тесты SDK: `OpenAiWireTest`, `StreamContractTest`, `AccumulatorTest`, `KotlinUsageTest` (+ новые кейсы).
2. **ASTROLABE**, собирать с `-Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/.claude/worktrees/v2-A2a/llm`:
   - `provider-api` `Usage`: оплаченная сумма (деньги, валюта; отдельно от оценки), токены рассуждений — `null` =
     неизвестно, не 0 (AX-09, FX-59).
   - `provider-ai-gate` `ResponseTranslator` (`:102-125`), `AiGateAdapter` (`progress`): мапить новые поля; ярусы цен
     из SDK передать **в событие** (не менять `PriceTable` — это A2b).
   - core `AgentEvent.ModelResponded`: счёт, рассуждения, тайминги (длительности — метаданные, не идентичность),
     апстрим/фактическая модель, ярус цены. Поля добавлять обратно совместимо (Java-потребители, ABI).
     Место эмиссии может быть в `cell/Cell.kt` — горячий файл линии A3: правка там — минимальная, одним блоком.
3. Тест «байты запросов не изменились»: сериализованный запрос до/после (golden или сравнение с `main`) для
   chat-completions и Responses на поддельном транспорте SDK.

## Границы
Не трогать: `AiGateProfiles`/`ProfileBinding`/`PriceTable` (A2b), `context/`, `route/`, `campaign/Controller.kt` (A1),
`cell/Layout.kt` (A3). Studio не трогать (Studio подхватит поля позже, C4/E3).

## Проверки
- L1: SDK `./gradlew test --tests '<классы выше>'` в `llm/` worktree SDK; ASTROLABE `:provider-ai-gate:test --tests
  'io.astrolabe.provider.aigate.TranslationTest' --tests '...AiGateAdapterTest'`, `:core:test --tests
  'io.astrolabe.event.EventsTest' --tests 'io.astrolabe.telemetry.SpansTest'`.
- L2: SDK `./gradlew test` (целиком, быстро); `:provider-api:test`, `:provider-ai-gate:test`, `:core:test --tests
  'io.astrolabe.event.*' --tests 'io.astrolabe.telemetry.*' --tests 'io.astrolabe.cell.*'`, `:eval:compileTestKotlin`;
  `updateKotlinAbi` для `provider-api` и `core` один раз, дампы закоммитить.

## Готово, когда
`ModelResponded` несёт счёт (оплаченная сумма отдельно от оценки), рассуждения, тайминги, апстрим и ярус; байты
запросов не изменились (тест); ABI-дампы обновлены; обе ветки `v2/A2a` запушены.
**Отказ:** если SDK не получает какое-то поле от провайдера (нет в протоколе) — поле `null`, записать в «Хвосты».

## Отчёт
`C:\work.astrolab\plan2\reports\WP-A2a.md` (COMMON.md); указать последние коммиты **обеих** веток и порядок слияния
(SDK раньше ASTROLABE).
