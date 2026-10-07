# WP-W9 — перенос контекста через границы, переоткрытие и follow-up (P8.W.9)

## Сделано (ядро `v2/W9` 1a1ded3, после слияния main c5346bc; Studio `v2/W9` 96831c5)
- §4.1: строка `packets` (`cell_packet`) в транзакции терминальной точки и экспорта (`Checkpoints.settle`), `Cell.Ended` после
  коммита; схема v6 + миграция. `carryFrom` читает пакет по id ячейки из хранилища; нет строки → перенос из точки и
  экспорта, `packetMissing` в манифесте. §4.2: запасное правило v1→v2 (`Defaults.seedFallback`).
- §4.3: первая ячейка нового / ответного инкремента получает перенос последней ячейки закрытого инкремента (данные,
  `source`, STATUS; STATE не наследуется); заметка «carried from inc-1 · cell-N». §4.5: follow-up — `CarryForward.parent`
  в пределах `parentCarryMaxTokens = 4000`. §4.4/WF-15: граница проекции в `Cell.kt`, `[pinned …]` и `[contract vN delta]`.
- Хвосты: T-13 (`os.PhaseTally`: фаза считает свои вызовы), T-03/T-25 (`AtlasTap`: outline из чтения захвата), T-21, T-36
  (`requestsSeen` → `messagesSeen`), T-10 (Studio: пересказ > 32 000 симв. → `new_task_suggested`, не режется, WF-11).
- Не закрыты: T-04 (общий кэш содержимого прячет удерживаемый файл при переоткрытии — ломает страж T-24/WF-4 W7; чтение при
  переоткрытии по правилу карточки не лишнее), T-22 (счёт чтений `hash-object` показывает двойное чтение 20 МБ файла при
  первом открытии — страж WF-2 падает; закрыть можно, записывая объект git из чтения захвата — изменение пути W2),
  T-37 (`register/ContractDigest.kt`, не `context/`). Оба отката проверены WF-набором.

## Решения (черновые)
- Перенос инкремента: без наследования STATE, из последней ячейки последнего закрытого; запасное правило и в перестройке
  давления (D-398); отменённая ячейка пишет строку пакета без журнального события; T-21: ≤1 МиБ/файл, ≤32 МиБ/захват.

## Тесты
- L2 ядра (campaign, cell, context, store, workspace, workflow, atlas, PhaseTally): 791, упало 5 → исправлены гонка в
  `ResultPacketTest` и ожидание правила семян `TaskLimitsTest`; 3 `PrecompileCampaignTest` — решение владельца (вариант 2):
  FX-44 ×2 ждут discard вместо hit (hit невозможен при переносе), инвариант — hits = 0 при равных манифестах; hit без
  переноса — `context.PrecompileTest`. Узкий цикл: 4/4 и WF 31/31. `assemble testClasses checkKotlinAbi` — ок, ABI
  перегенерирован. Studio: server `*WorkflowScenario*` 18/18, bridge 3/3.
- Новые: `BoundaryCarryScenarioTest` (в процессе = переоткрытие, без строки пакета, follow-up), `AppendOnlyPrefixScenarioTest`,
  `PhaseTallyTest`; дополнены CellTest, LayoutTest, CarryForwardTest, MigrationsTest, DirtyStateTest, MessageKindScenarioTest.
- Набор WF: 150,6 с (до слияния FollowUp в BoundaryCarry — 179 с, машина нагружена).
- filesRead: WF-14 — чтений до первого запроса ≤ семян; DirtyRepo до/после не сняты (`.txt` фикстуры уже берут хеш из
  захвата, W3). Циклов «правка → тест»: 5 (4-й — узкий перезапуск L2; 5-й разрешён оркестратором).

## Отклонения от карточки
- FollowUpCarryScenarioTest влит в BoundaryCarryScenarioTest (время набора); ревью-заметка в середине ячейки сценарием не
  проверена (тот же путь `[pinned review]`).

## Хвосты и риски
- P3: предкомпиляция (вариант 2) в кампании без попаданий; P2: T-22/WF-2 (выше); P3: строки после результатов в `[T]` —
  проверить адаптеры вживую.
Статус: ГОТОВО К СЛИЯНИЮ · ядро 1a1ded3 · Studio 96831c5
