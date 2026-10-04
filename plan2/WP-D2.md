# WP-D2 — якорь direct: без STATE, блок Runs, заметки; операция `note`

**Исполнитель:** суб-агент t3 (Opus) в worktree ядра (cwd `C:\work.astrolab\ASTROLABE`). **Ветка:** `v2/D2` от `main`
(в `main` слита D1). **TODO:** P8.D.2. **Общие правила:** `C:\work.astrolab\plan2\COMMON.md`.
**Ревью:** Fable (один раунд). **Оценка:** ≈ 0,9 тыс. строк с тестами, ≈ 1,5 млн токенов; вдвое больше — `БЛОКЕР`.
**Спецификация (главный документ):** `docs/reference/kernel-contract.md`, A-D.4 (`state(note)`) и строки A-D.7,
помеченные D2 (V4, G6, A1–A5, T5, T7, T8); `docs/reference/rendered-turn.md` §5.10-D (рендер `[A]` direct).
**Места по коду:** `C:\work.astrolab\plan2\reports\WP-Dp3.md` («Для карточек D1–D3», абзац D2) и
`C:\work.astrolab\plan2\reports\WP-D1.md` («Для D2 и D3» — точки подключения на `main`).
**Из ревью D1** (раздел «Ревью Fable» отчёта D1): `StateTool` строится с маской `implementingS0` без `state.note`, и
отказ стоит до проверки маски — передать эффективную маску роли, порядок «маска, затем note»; решить по строке V4,
снимает ли loop-ворота отклонённая заметка; плоская форма `state(op=note, kind=…)` сейчас даёт schema error
(`Args.kt:132`); ветку `note` защищать протоколом, а не только именем операции.
**План:** `C:\work.astrolab\ASTROLABE-2-PLAN.md` §4.3 (абзацы «Журнал harness» и «Заметки»), §6 строка D2.

## Что сделать (ровно то, что спецификация помечает D2)
1. **Якорь direct в `[A]`** вместо блока STATE: дайджест ≤ 150 · строка KNOWN · Touched 3 · Checks · Runs (последняя
   квитанция на каждую различную команду + живые handle) · Notes ≤ 200 · подсказки ≤ 4; цель ≤ 800 токенов. В S0
   строка `enabled this turn: all role tools except task.propose`. Якорь структурного протокола не меняется ни в байте.
2. **Операция `state(note)`** — исполнение: `kind: hypothesis | decision | deadend | open | amend`, `text`,
   `evidence?`, `closes` / `refutes`; запись в существующий `Register` через тот же `Validator` с выключенными
   правилами plan / Next / cursor. `closes` и `refutes` **не** принимаются безусловно при полном регистре: предел
   проверяется после применения заметки и архивации, опровержение может быть отклонено (правка после ревью Codex).
3. Устаревание фактов отмечает harness, как сейчас; события прогресса из заметок работают.
4. Остальные места строк D2: подсказки `look` / `run` и ворота, которые в direct ссылаются на `note` вместо `patch`.

## Границы
`K/cell/Anchor.kt`, `K/cell/Layout.kt` (только рендер `[A]` direct), `K/tool/state/`, `K/register/Validator.kt`
(правила заметок), точечные места в `K/cell/Cell.kt`, `K/cell/Gates.kt`, `K/tool/look/Look.kt`, `K/tool/run/Run.kt`
из строк D2. Не трогать: `task(finish)`, счётчик финализаций, handoff, `CellContext.kt`, `CellExit.kt`,
`campaign/` (линия D3 идёт параллельно и владеет `Cell.kt` в части завершения и `Controller.kt`). Правки `Cell.kt` —
минимальные и только в местах D2.

## Тесты (L1 один раз в конце; назвать в отчёте до запуска)
Новые: якорь direct содержит блоки в заданном порядке и укладывается в пределы (Notes ≤ 200, подсказки ≤ 4, цель
≤ 800 токенов на типичном состоянии); якорь структурной роли байт-в-байт прежний; `note` каждого вида записывается и
виден в якоре; `amend` идёт в поправки контракта; `closes` / `refutes` при полном регистре — принят, когда после
архивации есть место, и отклонён, когда нет; правила plan / Next / cursor для direct выключены; Runs показывает
последнюю квитанцию на команду и живой handle. Существующие: `io.astrolabe.cell.AnchorTest`, `LayoutTest`,
`GatesTest`, `CellTest`, `io.astrolabe.tool.state.StateToolTest`, `io.astrolabe.register.ValidatorTest`,
`RegisterTest`, `ValidatorFieldsTest`.
L2 в конце один раз: `./gradlew assemble testClasses checkKotlinAbi -q --console=plain
-Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm`; публичный API менялся → `:core:updateKotlinAbi`.

## Готово, когда
Новые тесты, L1 и L2 зелёные; байты структурного якоря не изменились; ветка `v2/D2` запушена; отчёт написан.

## Отчёт `C:\work.astrolab\plan2\reports\WP-D2.md` (формат COMMON.md). Ответ оркестратору — до 40 строк.
