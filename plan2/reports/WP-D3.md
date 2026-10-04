# WP-D3 — `task(finish)` / `finish(after_checks)`, счётчик финализаций, `PartialReason.Handoff`, предел handoff (P8.D.3)

Ветка `v2/D3` от `main` `b5e2d26`; перед L1 слит `main` `386d05c` (только TODO.md); после L1 в `main` появилась D2
(`741c370`) — слита в ветку, конфликты решены с сохранением обеих правок, ABI перегенерирован. Коммиты: `3c3aa08` (код),
`21df033` (тесты), `f7d1cbb` (merge main), `99ea395` (правка двух тестов), `96fffe2` (ABI), `1c6243e` (merge main с D2),
`66e2758` (ABI после D2). Ветка запушена.

## Сделано
- **`task(finish)` (A-D.5, T6, C4).** `TaskTool`: порядок «маска, затем операция» (прежний отказ `unsupported` до маски
  удалён); `finish` отвечает `finish requested: the harness decides after this turn`, второй в ходе — `duplicate finish
  ignored`; `after_checks` не читается. `TaskTool.protocol` (internal, выставляет ячейка, как `Edit.protocol`): в direct
  опущен совет «end the turn … with no tool call» у `propose(plan)`, отказ `answer` советует «finish the work, then call
  task(finish)». Внутренние `takeFinish(turn)`, `askedAndAnswered(turn)`, `answerPending` для ячейки
  (`tool/task/TaskTool.kt`).
- **Классификация хода (A-D.5 шаг 1–2, C1).** `Cell.claim()` после диспетчеризации: строки 1–8 таблицы; условие
  условной заявки `Cell.unmet()` — каждый испущенный `edit`/`run`/`verify` (по имени, до разбора; срезанные `CallBound`
  тоже) разобран, допущен, исполнен; edit `applied`, run/verify `green`. Непринятая заявка → строка `[A]`
  `finish not attempted: <причина>`; первый ход без вызова → `no tool call: to finish call task(finish); otherwise
  continue with a tool call`, второй подряд — обычная заявка с текстом хода. Структурная ячейка: `claim == null`, путь
  прежний (`cell/Cell.kt`).
- **Счётчик (C2).** Считается только отказ обычной заявки; сброс `refusals = 0` при смене кандидата или новой квитанции
  (множество последних id квитанций) с последнего засчитанного отказа, сравнение до verify-on-stop заявки.
  `RoleOutput.conditional` (+ явный v1.0-конструктор): `RoleCompletion.exitGate` не даёт условной заявке
  `CannotProgress` и последнего раунда D-341; ячейка дополнительно переводит `CannotProgress` условной заявки в
  `Continue`. `task.finish` не входит в сигнатуры loop-ворот (правило 1). Структурный счётчик прежний.
- **Handoff в ячейке (E1).** `PartialReason.Handoff` (+ `wire` у всех причин), `HandoffCause { Pressure, TurnBudget }`
  (`pressure`, `turn_budget`), `CellExit.Partial.handoffCause` (+ v1.0-конструктор, `require` «причина ⇔ Handoff»).
  Давление после одной перестройки (4 места: валидация, admission `OverWindow`, отказ провайдера, ворота давления) —
  `Handoff(Pressure)` для direct, `Pressure` для структурной; прочие условия ёмкости — `Pressure` как прежде. Бюджет
  ходов — `Handoff(TurnBudget)` только при `CellContext.turnBudgetHandoff` (ставит `runS0`) и рабочем событии D-366 в
  эпохе. Тексты подсказок — дословно A-D.6.
- **Событие (E4).** `AgentEvent.Cell.Ended.partialReason` (не кодируется при `null`, + v1.0-конструктор); ячейка
  заполняет его из типизированной причины выхода.
- **Учёт (E2).** `Lifecycle.disposition`: `Handoff` → `Continue(fallback = BudgetExhausted)`. `Transition.Dispatched.epoch`
  (+ v1.0-конструктор) → `RequirementGraph.continueIncrement(…, epoch)` → `Sizing.handoffs` (не кодируется при 0)
  вместо `continuations`; `+1` к `rebuilds` по-прежнему только у `Pressure`. `BoundaryReason.Epoch`. `CarryForward.carry
  (…, handoff)`: строка пакета `continued (handoff)`. `CampaignMetrics`: `continuationsPerIncrement` и
  `firstAttemptPassRate` без клеток, закончившихся handoff (по `Cell.Ended.partialReason`); `Economics`:
  `continuationsPerIncrement` минус `sizing.handoffs`. `Escalations` — без правки: `verifiedFailure` называет только
  `CompletionStalled`.
- **Грант и расход (E2, E3).** Новый `campaign/Handoffs.kt`: `Handoffs` (записи журнала `Boundary`: `handoff-grant`
  {grant, limit}, `handoff` {grant, n, from, to, increment, cause}, `campaign-resumed`); `ReturnedHandoff` (строка
  `packets` вида `returned_handoff`: ячейка, инкремент, роль, seq строки, ходы, версия регистра, версия контракта,
  финальный stamp и env, изменения пакета, пробелы, квитанции, touched, причина пакета, подсказка, причина handoff,
  грант, функция маршрутизации, tier, профиль) и `ReturnedHandoffs`. Контроллер:
  `run(…, maxCells, maxHandoffs = DEFAULT_MAX_HANDOFFS)` и `runS0(…, maxHandoffs)` (`DEFAULT_MAX_HANDOFFS = 8`,
  `>= 0`, Java-перегрузки `@JvmOverloads`) журналят грант при старте direct-кампании, если его нет или явный resume
  новее; явный resume (`Transition.Resumed` закончившейся кампании) журналится на open (только direct). Запись
  handoff сохраняется до строки `Returned`. Продолжение: эпоха ищется по записи (последняя клетка инкремента — та же,
  статус `Partial`, нет запроса split); id преемника выделяется до записи расхода; расход, уже назвавший преемника,
  переигрывается этим id без списания и без проверки остатка; без остатка — стоп `budget_exhausted` «the campaign's
  <n> handoffs are spent with <k> requirements unverified». S1: эпоха вне `maxCells`, идёт раньше прочих готовых
  инкрементов, `BoundaryReason.Epoch`, функция маршрутизации из записи, пакет предшественника из памяти или записи.
  S0: `runS0` повторно входит в себя после handoff (и только после него), передаёт ячейке `turnBudgetHandoff`,
  пакет предшественника — в `carryFrom`; `finish` получает пакеты всех эпох, после reopen — из записей.
  Калибровка не пишется ни на одном из трёх путей возврата.

## Решения
(вопрос → выбор → почему → безопасная альтернатива)
1. Миграция store для записи расхода → **не нужна**. Грант, расход и явный resume — события журнала `Boundary` с
   JSON-payload (как `substantive-attempt`), запись handoff — строка существующей таблицы `packets` с новым `kind`
   (как `returned_completion`). Альтернатива (таблица) не требуется.
2. Когда журналить грант → при старте `run`/`runS0`, только если протокол попытки `Direct`; явный resume — тоже только
   для `Direct`. Почему: структурная ячейка не делает handoff, и её журнал остаётся байт-в-байт прежним. Плюс
   ленивый грант при первом расходе (если стартового нет). Альтернатива — журналить для обоих протоколов.
3. Кто «direct main line» в ячейке → `ctx.role.protocol == Direct` (сегодня это только `Roles.direct`). H8 решит, как
   writer обрабатывает свой handoff (до H8 любой partial writer-а — провал, как прежде).
4. Пакет после reopen → восстанавливается из `ReturnedHandoff` (не сериализуемый `ResultPacket` не хранится): регистр —
   последняя версия клетки, `cost`, `readVersions`, `coverage`, `flags` пусты. Достаточно для carry-forward и отчёта.
5. Условие условной заявки → «passing» = `ToolOutcome.green` или `ToolOutcome.ready != null` (D2 сделала `ready`
   строкой-условием, не `Boolean`, как в A-D.5; читаю «не null»). Обычный `run` с exit 0 по D-50 — `completed`, не green,
   поэтому `finish` рядом с ним не будет условной заявкой («op N (run) is not passing: neither green nor ready») —
   буквально по спецификации.
6. Стоп при исчерпанном гранте → `Transition.Stopped(BudgetExhausted, …)` без `BudgetStop` (спецификация код не
   называет). Следствие: такую кампанию не открыть заново (см. «Хвосты»).
7. Порядок в S1 → эпоха имеет приоритет над `CellOrder.next` (A-D.6 «the same increment continues»); лимиты
   пользователя (`limitStop`) и `attempts.exhausted` проверяются до неё как для любой клетки.
8. Тест «сбой после списания» → состояние после такого сбоя воспроизводится: прогон останавливается до эпохи
   (истёк lease во время последнего вызова), затем в журнал добавляется расход, как его оставил бы умерший процесс;
   точки отказа между записью расхода и строкой `Dispatched` в коде нет, вводить её ради теста не стал.

## Тесты
Классы L1 (названы до запуска): `io.astrolabe.cell.CellTest`, `cell.ResultPacketTest`, `cell.TerminalAccountingTest`,
`tool.task.TaskToolTest`, `campaign.LifecycleTest`, `ControllerTest`, `CampaignLoopTest`, `ResumeTest`,
`EscalationCampaignTest`, `TaskLimitsTest` и новый `campaign.HandoffTest`.
- Цикл 1 (L1, `./gradlew :core:test --tests <11 классов> -q --console=plain`): 171 тест, 2 упали — оба мои новые в
  `CellTest` (правка без предварительного чтения файла не применяется: `Edit` требует показанный диапазон). Причина в
  тесте, код не менялся. Фоновая оболочка упёрлась в свой лимит 10 мин, сам прогон Gradle дошёл до конца; итог — по XML.
- Цикл 2: `CellTest` — 60/60.
- `:core:updateKotlinAbi` — дамп закоммичен (удалены только synthetic/`copy`). L2 (`./gradlew assemble testClasses
  checkKotlinAbi -q --console=plain -Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm`) — зелёный.
- Цикл 3 (после слияния D2 и чтения `ready`): `cell.CellTest`, `cell.DirectAnchorTest`, `tool.state.NoteTest`,
  `tool.task.TaskToolTest`, `campaign.HandoffTest` — 91/91; ABI перегенерирован; L2 повторно — зелёный.
- Итого **3 цикла**. Расход токенов исполнителю не виден.
- Новые проверки: `CellTest` — finish без вызовов считается, сброс по прогрессу, вторая заявка без прогресса →
  `CompletionStalled` (третья по счёту); условная заявка не считается, неисполненное условие → `finish not attempted`;
  ход без вызова — подсказка, второй подряд — заявка; `exitGate` не даёт условной заявке последний раунд; handoff по
  давлению (структурная — `Pressure`); handoff по бюджету ходов только с флагом и работой; `partialReason` события.
  `TaskToolTest` — ответ `finish`, дубль, маска, совет C4. `LifecycleTest` — `Handoff` → `Continue(BudgetExhausted)`,
  `Sizing.handoffs`. `HandoffTest` — S1: 9 клеток при `maxCells = 1`, девятый handoff отклонён пределом 8, расходы с
  причиной и преемником, без калибровки и попыток, `Epoch` в манифестах; S0: handoff по бюджету ходов, строка пакета
  `continued (handoff)`; reopen после сбоя восстанавливает грант и расход; оплаченное недиспетчеризованное продолжение
  переигрывается под своим id без списания при нулевом остатке; юнит-тест журнала гранта.
- Изменённые существующие тесты: `LifecycleTest` (таблица причин + `Handoff`; хелпер `partial` даёт причину handoff —
  новый `require`), D1-тест direct-ячейки в `CellTest` (вызов `finish` убран: операция больше не `unsupported`; при
  слиянии взята проверка D2 для `note`, тест переименован), фикстура `CellTesting` (у direct-роли `TaskTool` с маской
  `Roles.direct`, флаг `turnBudgetHandoff`).

## Отклонения от карточки и спецификации
- **`ToolOutcome.ready`** в D2 — `String?`, не `Boolean` (A-D.5); читаю как «не null».
- **Явный resume и грант журналятся только для протокола `Direct`** (структурный журнал без изменений); спецификация
  протокол не оговаривает.
- ~~Стоп по исчерпанному гранту — без `BudgetStop`~~ — исправлено после ревью (см. «Ревью Fable и исправления»).
- **Writer**: ячейка решает handoff по `role.protocol == Direct`; сегодня direct-роль одна. H8 должен учесть writer.
- **Тест «сбой после списания»** воспроизводит состояние после сбоя (решение 8), а не сам сбой.
- Строки A-D.7 сверены по коду; `Economics.kt:143` на `b0901dc` = `continuationsPerIncrement` (как в A-D.6).

## Хвосты и риски
- Восстановленный из записи пакет эпохи не несёт `cost`, `readVersions`, `coverage`, флагов — в итоговом отчёте после
  reopen эти поля ранних эпох пусты (изменения и квитанции есть).
- `finish` рядом с обычной командой (exit 0, `completed`) не бывает условной заявкой — модель получит «finish not
  attempted»; живое поведение не проверено (UNMEASURED).
- Правило 2 счётчика: новая квитанция любой проверки (в т.ч. модельной `CHK-model-*`) — «прогресс»; повторный прогон
  теста моделью сбрасывает счётчик, как написано в A-D.5.
- `pendingEpoch` читает записи `returned_handoff` и запросы split на каждом шаге S1-цикла (дёшево; для структурного —
  пустой запрос).
- Studio: `partialReason` и `Sizing.handoffs` не показываются (P8.D.4).
- `RoleWiringTest` (direct S1) не в L1; его ход «done» без вызова теперь — подсказка, тест проверяет только `[S]`/схемы.
- Из ревью Fable (не чинилось): нет тестов reopen с kept-записью без расхода, переигрывания в S1 и reopen после сбоя
  без явного resume; нет тестов строк 1–2 таблицы A-D.5 (`blocked` / `ask` вместе с `finish`) и условной заявки по
  `ready`; `telemetry/Metrics.kt:127` и `campaign/Economics.kt` считают продолжения разными формулами (событие
  `partialReason` против `sizing.handoffs`); фасад `Astrolabe.kt:149` и `RunSpec` не передают `maxHandoffs`; handoff по
  давлению не требует работы в эпохе — детерминированное переполнение сжигает грант за 9 ячеек без полезного хода
  (риск спецификации; после исправления P1 не тупик); `cell.ended.partialReason` теперь заполнен и у структурного
  partial (требование E4). Нет теста «reopen после поднятого лимита задачи обновляет грант» (ветка покрыта кодом, тест
  не дешёвый: лимит запросов вмешивается в резерв ячейки).

## Ревью Fable и исправления
Вердикт: «сливать после исправления P1»; остальное подтверждено. Четвёртый цикл «правка → тест» — по решению
оркестратора.
- **P1 (принято, решение оркестратора).** Стоп по исчерпанному гранту был необратим: `budget_exhausted` без `budget` не
  `resumable` и не проходит `LimitRaised`; против `main` — регресс (direct S0 с исчерпанными ходами раньше
  продолжался как `contract_budget/turns`). Исправлено:
  - `campaign/Controller.kt:893` — стоп несёт `budget = BudgetStop.CellCap` (новый `BudgetStop` не вводился, ABI не
    менялся); текст стопа прежний и называет предел handoff.
  - `campaign/Controller.kt:600` — локальная `renewGrant(reason)` (только для `Direct`); вызывается при
    `Transition.Resumed` (`:606`) и во всех ветках `LimitRaised`: cell cap (`:620`), поднятый лимит задачи (`:633`),
    токены контракта (`:718`). Следующий `run` пишет новый грант.
  - `campaign/Lifecycle.kt` — KDoc `BudgetStop.CellCap` называет и исчерпанный грант.
  - `HandoffTest.kt:132` — проверка `CellCap` вместо `null`; новый тест `:225` «reopen после предела handoff обновляет
    грант, работа идёт дальше, каждая эпоха списана один раз».
  - `docs/reference/kernel-contract.md:310` (A-D.6, строка гранта) — reopen стопа по пределу, в том числе по пределу
    handoff (`cell_cap`), — тоже явный resume.
- Цикл 4: `campaign.HandoffTest` 6/6, `LifecycleTest` 12/12, `ResumeTest` 8/8, `TaskLimitsTest` 29/29; L2 (`assemble
  testClasses checkKotlinAbi` с `aiGateBuild`) — зелёный. Коммит `f7b4fe6`.

Статус: ГОТОВО К СЛИЯНИЮ — последний коммит `f7b4fe6` (ветка `v2/D3` запушена)
