# WP-A3 — стабильный префикс

**Исполнитель:** суб-агент t3 (worktree ядра). **Ветка:** `v2/A3`. **Общие правила:** `C:\work.astrolab\plan2\COMMON.md`.
**TODO:** P8.A.6. **План:** §1 строки 8, 25, §4.5 (третий пункт), §6 (A3), §4.6 (инвариант 12: наборы схем и маски
заморожены на попытку). **Старт:** после слияния A5 в `main` (A5 может менять схему `run`).

## Цель
Байты `[S]` и набора схем инструментов не меняются ход от хода: кэш префикса не сбрасывается из-за маски или резерва.

## Что сделать
1. Строка маски `enabled this turn:` (`cell/Layout.kt:186`) уходит из `[S]` — в изменяемую часть хода (якорь `[A]`
   или хвост; выбрать по `cell/Anchor.kt`/`Layout.kt` так, чтобы модель видела маску в том же ходе). Маскированная
   операция по-прежнему отклоняется гейтом во время исполнения (поведение безопасности не меняется).
2. Набор схем (`tool/ToolSchemas.kt:55` отдаёт все 7 семейств всегда) выбирается **ролью** и фиксирован на линию
   (ячейку/роль) — не зависит от маски хода и резерва.
3. Golden-тест `[S]`: включение резерва / смена маски хода не меняют байты `[S]` и схем; явные breakpoints кэша
   Anthropic по `S R K T` (`Layout.kt:206-234`, D-329) сохраняются.
4. Версии текстов (`kernel/2`, `role-texts/2`): если меняется текст `[S]` — поднять версию по существующему правилу
   и записать в «Решения».

## Границы
Горячие файлы этой линии: `cell/Layout.kt`, `cell/Cell.kt` (`:323`), `tool/ToolSchemas.kt`. Не трогать `campaign/`,
`context/` (A1), `tool/edit/Edit.kt` (A4), `tool/run/` (A5), `auth/` (A6).

## Проверки
- L1: `:core:test --tests 'io.astrolabe.cell.LayoutTest' --tests 'io.astrolabe.tool.ToolContractsTest' --tests
  'io.astrolabe.cell.CellTest'` + новый golden `[S]`.
- L2: `--tests 'io.astrolabe.cell.*' 'io.astrolabe.tool.*' 'io.astrolabe.context.*'`, `:eval:compileTestKotlin`,
  `:provider-ai-gate:compileTestKotlin` (с `-Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm`);
  `updateKotlinAbi`, если менялся публичный API.

## Готово, когда
Включение резерва не меняет байты `[S]` (golden); набор схем зависит только от роли.
**Отказ:** если перенос маски требует смены контракта провайдера — описать и остановиться.

## Отчёт
`C:\work.astrolab\plan2\reports\WP-A3.md` (COMMON.md).
