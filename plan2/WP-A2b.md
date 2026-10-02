# WP-A2b — транспорт, меняющий поведение

**Исполнитель:** суб-агент t3 (worktree ядра; SDK — при необходимости). **Ветка:** `v2/A2b`.
**Общие правила:** `C:\work.astrolab\plan2\COMMON.md`. **TODO:** P8.A.5. **Старт:** после слияния A2a в `main` и
запуска BL (BL меряет поведение **до** A2b).
**План:** §1 строки 12, 22–24, §4.5 (третий пункт), §6 (A2b).

## Что сделать
1. Ключ сессии из id кампании: OpenRouter `session_id`/`x-session-id` (SDK: `CompletionsCodec.java:146`), Responses
   `prompt_cache_key` (`ResponsesCodec.java:163`); адаптер сейчас не передаёт (`ProfileBinding.kt:170-185`). Ключ —
   детерминированная функция id кампании (без wall-clock), одинаков для всех ячеек кампании.
2. Ярусы цен из SDK не сплющиваются в `PriceTable` (`AiGateProfiles.kt:76-80`): цена считается по ярусу фактического
   запроса (например, длинный контекст).
3. Рассуждения в заполненности — по возможностям кодека маршрута: если кодек выбрасывает рассуждения при повторе,
   `ReasoningRef` (`cell/Cell.kt:893`) не учитывается в заполненности (оценщик адаптера `AiGateEstimator`); если
   отправляет — учитывается как сейчас.

## Границы
`provider-ai-gate` (`AiGateProfiles`, `ProfileBinding`, `AiGateEstimator`), SDK только при необходимости (ветка
`v2/A2b` в SDK). `cell/Cell.kt` не трогать (A3) — учёт через оценщик.

## Проверки
- L1: `:provider-ai-gate:test --tests 'io.astrolabe.provider.aigate.AiGateAdapterTest' --tests '...TranslationTest'
  --tests '...QualificationTest'` (с `-Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm`) + новые кейсы.
- L2: `:provider-ai-gate:test`, `:core:test --tests 'io.astrolabe.provider.*' 'io.astrolabe.context.*'`, SDK `test`
  если менялся; `updateKotlinAbi`, если менялся публичный API.

## Готово, когда
Ключ сессии виден в сериализованном запросе (оба wire-API); ярусы влияют на цену; учёт рассуждений зависит от кодека.

## Отчёт
`C:\work.astrolab\plan2\reports\WP-A2b.md` (COMMON.md).
