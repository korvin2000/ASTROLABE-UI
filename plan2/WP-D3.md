# WP-D3 — `finish` / `finish(after_checks)`, счётчик финализаций, `PartialReason.Handoff`, предел handoff

**Исполнитель:** суб-агент t4 (Opus) в worktree ядра (cwd `C:\work.astrolab\ASTROLABE`). **Ветка:** `v2/D3` от `main`
(в `main` слита D1). **TODO:** P8.D.3. **Общие правила:** `C:\work.astrolab\plan2\COMMON.md`.
**Ревью:** Fable (один раунд). **Оценка:** ≈ 1,1 тыс. строк с тестами, ≈ 2,0 млн токенов; вдвое больше — `БЛОКЕР`.
**Спецификация (главный документ):** `docs/reference/kernel-contract.md`, A-D.5 (завершение и счётчик финализаций),
A-D.6 (handoff эпох) и строки A-D.7, помеченные D3 (T6, C1–C4, E1–E4). Правила A-D.6 про S2/S3-lead и writer
(H1, H8) — **не** твои.
**Места по коду:** `C:\work.astrolab\plan2\reports\WP-Dp3.md` («Для карточек D1–D3», абзац D3, и «Ревью Codex и
исправления») и `C:\work.astrolab\plan2\reports\WP-D1.md` («Для D2 и D3» — точки подключения на `main`).
**Из ревью D1** (раздел «Ревью Fable» отчёта D1): `TaskTool` не знает протокол (образец передачи — `Edit.protocol`
в `Cell.kt`), отказ `finish` в `TaskTool.kt` стоит до проверки маски — порядок «маска, затем finish».
**План:** `C:\work.astrolab\ASTROLABE-2-PLAN.md` §4.3 (абзац «Завершение»), §4.6 (эпохи и handoff), §6 строка D3;
решение владельца №4 (отдельный предел handoff, инвариант 10 соблюдается).

## Что сделать (ровно то, что спецификация помечает D3)
1. **`task(finish)`** без других вызовов в ходе — обычная заявка, считается в счётчик финализаций.
   **`finish(after_checks)`** в ходе с вызовами — условная заявка: после исполнения harness разрешает обязательства;
   при отказе показывает пробелы и продолжает, **не** увеличивая счётчик. Счётчик: предел 2 без прогресса между
   заявками (правило спецификации). `propose` / `delegate` / `collect` в классификацию `finish` не входят; `propose`
   идёт прежним путём, в direct опустить совет из `TaskTool.kt` (место — в отчёте Dp3).
2. **Handoff:** `PartialReason.Handoff` → `Disposition.Continue`; по давлению — в любом цикле; по бюджету ходов —
   только при флаге от `runS0` (ячейка форму не читает). **Отдельный предел handoff** (8), не `maxCells`; учёт: не в
   маршрутизацию, не в статистику размера, `boundaryReason = Epoch`.
3. **Типизированная причина** (правка после ревью Codex): `HandoffCause { Pressure, TurnBudget }`, поле
   `CellExit.Partial.handoffCause` (с явной перегрузкой конструктора для Java) → `returned_handoff` → запись расхода.
4. **Запись расхода handoff называет преемника** (`to`; id выделяется до записи). Недиспетчеризованное оплаченное
   продолжение после сбоя переигрывается без второго списания и без отказа по нулевому остатку.
5. Красная необязательная проверка: кода не требует (C1b слит) — только сверить.

## Границы
`K/cell/CellContext.kt`, `K/cell/CellExit.kt`, `K/cell/Cell.kt` (завершение и handoff), `K/tool/task/TaskTool.kt`,
`K/campaign/Controller.kt`, `Escalations.kt`, `Lifecycle.kt` — места строк D3. Не трогать: `Anchor.kt`, `Layout.kt`,
`tool/state/`, `register/Validator.kt` (линия D2 идёт параллельно и правит `Cell.kt` в нескольких местах рендера —
не форматируй и не переставляй чужие участки файла). Перед финальным L1 выполни `git merge main`: туда могут быть
слиты D2 и C16; конфликты решай, сохраняя обе правки. Структурный протокол не меняет поведения: его завершение,
его счётчики и его перенос (`Partial` → `Continue`) — прежние.

## Тесты (L1 один раз в конце; назвать в отчёте до запуска)
Новые: `finish` без вызовов считается; `finish(after_checks)` с вызовами при отказе показывает пробелы и счётчик не
растёт; третья заявка без прогресса останавливает по правилу спецификации; handoff по давлению даёт `Continue` и
запись расхода с причиной и преемником; handoff по бюджету ходов — только с флагом `runS0`; девятый handoff
отклонён пределом, `maxCells` не затронут; сбой после списания и до диспетчеризации — продолжение переиграно, второго
списания нет; после resume предел и расход handoff восстановлены; структурная ячейка завершается как раньше.
Существующие: `io.astrolabe.cell.CellTest`, `ResultPacketTest`, `TerminalAccountingTest`,
`io.astrolabe.tool.task.TaskToolTest`, `io.astrolabe.campaign.LifecycleTest`, `ControllerTest`, `CampaignLoopTest`,
`ResumeTest`, `EscalationCampaignTest`, `TaskLimitsTest`.
L2 в конце один раз: `./gradlew assemble testClasses checkKotlinAbi -q --console=plain
-Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm`; публичный API менялся → `:core:updateKotlinAbi`.
Нужна миграция store для записи расхода — сначала опиши в отчёте вариант без миграции; миграция — только если его нет.

## Готово, когда
Новые тесты, L1 и L2 зелёные; поведение структурного протокола прежнее; ветка `v2/D3` запушена; отчёт написан.

## Отчёт `C:\work.astrolab\plan2\reports\WP-D3.md` (формат COMMON.md). Ответ оркестратору — до 40 строк.
