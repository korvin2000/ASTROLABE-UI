# WP-D7 — direct: окно сбоя handoff при open и удержание фактов по протоколу ячейки (P8.D.7, сессия 5)

Ветка `v2/D7` от `main` ядра `e1f5460`, worktree `ASTROLABE/.claude/worktrees/D7`. Четыре коммита, по одному на шаг.

## Сделано

### T-56 (первый коммит `923b027`) — слияние классов набора WF
- `workflow/AnswerScenarioTest.kt` → `workflow/GoalEvidenceScenarioTest.kt`: оба теста, их тела (`scratchOnly`,
  `changedThenRestored`), команды `change`/`restore`, `QUESTION` перенесены дословно; две игры добавлены в общую карту
  `plays` (`Scenario.concurrently`), каталоги состояния `stateRoot/scratch`, `stateRoot/restored` — как были.
  KDoc бывшего класса стал KDoc функции `scratchOnly`.
- `workflow/UnreadableFileScenarioTest.kt` → `workflow/MessageKindScenarioTest.kt`: тело теста дословно в
  `lockedFileStopsResumably()` (своя фикстура: 10 файлов, большой файл и ожидание осадки — как было), игра `UNREADABLE`
  в карте `plays`; единственное отличие — каталог состояния `stateRoot.resolve("unreadable")` вместо `stateRoot`
  (иначе две игры класса делили бы один каталог). Одна фраза в KDoc класса о своей фикстуре WF-4.
- Оба удалённых файла удалены; стражи, проверки, счётчики и пороги не менялись; набор WF — 43 теста.
- Перенесённые имена (для реестра `workflow-invariants.md`, WF-4 и WF-12):
  - WF-4: `MessageKindScenarioTest` «WF-4 a locked file stops the run resumably and names the path»
    (было `UnreadableFileScenarioTest`).
  - WF-12: `GoalEvidenceScenarioTest` «WF-12 a question answered after running the suite ends answered with the
    candidate at s0 and the run still W-class» и «T-44 a run that moved the candidate is a durable effect though a
    later run restored it, so the task cannot end answered» (было `AnswerScenarioTest`).

### Цель 1 (`143cb93`) — осиротевшая запись handoff до переходов, сдвигающих `seq`
- `campaign/Controller.kt:686-698` (open): сверка записи `returned_handoff` бегущей ячейки и применение
  `Transition.Returned(kept.exit(...))` перенесены на первое место — сразу после чтения `priorVersion`, до `Resumed`
  (Finishing/Ended), `LimitRaised` и `Unblocked` после поправки хоста. Условие сверки прежнее (`cell` + чекпойнт +
  `kept.seq == stored.seq + 1`); ветка `Lost` (`:803-808`) осталась на месте и без записи handoff работает как раньше.
- `docs/reference/kernel-contract.md` A-D.6, п. 1 «What survives a handoff» — одна фраза о порядке при reopen.
- Тест `campaign.HandoffTest` «a handoff kept before its row is applied ahead of the reopen's unblock after a host
  fix, so its epoch inherits the flag and the public impact»: direct S1, граф из двух независимых инкрементов (I1
  заблокирован на хосте, I2 бежит); эпоха A в I2 читает и ослабляет `tests/test_a.py`, меняет сигнатуру `a` в
  `src/a.py` (её вызывает `src/b.py`) и уходит в handoff по давлению; SQLite-триггер на `campaigns` убивает процесс
  между записью и строкой. Хост правит контракт (`amendByHost`), reopen: ячейка `Partial` (не `Lost`), I1
  разблокирован в том же open; эпоха оплачена из гранта (`from` = ячейка эпохи A), и её собственная запись handoff
  несёт **оба** обязательства — флаг целостности теста и неразрешённый public-impact `a`; `continuations = 0`.

### Цель 2 (`8d838ed`) — удержание фактов по протоколу роли ячейки
- `context/FactRetention.kt:24-25` — `protocolOf(store, clock, cell, roles, fallback)`: протокол роли, названной
  в конечном пакете ячейки (строка `packets` вида `cell_packet`, `CellPacket.role`), из ролей попытки
  (`ConfigSnapshot.roles` — умолчания плюс переопределения хоста); ячейка без пакета (потерянная, старый store) —
  `fallback`.
- `campaign/Controller.kt:1704-1705` (`retainedFacts`) — передаёт `protocolOf(..., c.attempt.config.roles,
  mainLine(c).protocol)` вместо `c.attempt.config.protocol`.
- Тест `context.FactCoherenceTest` «a structured cell of a direct attempt ages its stale verified facts as a
  structured one, and a direct cell keeps them»: ячейка роли `review` в direct-попытке архивирует устаревший
  verified-факт на второй границе, ячейка `direct` хранит его (`staleCells = 2`), ячейка без пакета — по запасному
  протоколу.

### Цель 3 (`760ca3a`) — ревью отклоняет перенесённый флаг
- Тест `campaign.HandoffTest` «a test weakened before a handoff refuses the epoch's completion when the review it owes
  rejects it» (рядом с «a test weakened before a handoff binds…»): эпоха A ослабляет тест, handoff; эпоха B делает
  `task(finish)`, ревью, запрошенное её завершением, видит изменение эпохи A и отклоняет (`reject`, находка
  test-integrity); флаг в пакете эпохи B продолжает блокировать (`blocksCompletion`), кампания не `completed`,
  инкремент не `verified`.

## Решения
- Цель 1: перенос сверки вперёд или сверка по идентичности ячейки → перенос вперёд (вариант 1 карточки). Почему:
  запись хранит `seq` строки, которую не дописали; применённая первой, строка встаёт ровно на этот `seq`, запись
  остаётся правдой, а проверка `seq + 1` — защитой от чужой записи. Поведение без записи не меняется: ветка `Lost`
  не тронута, переставлен только блок, который срабатывает при найденной записи. Место — после `priorVersion`: иначе
  `Returned` поднял бы `contractVersion` состояния до текущего контракта и разблокировка после поправки хоста не
  случилась бы. Безопасная альтернатива — сверка по `cell` + чекпойнт без `seq` (строка тогда легла бы на другой
  `seq`, чем записан в записи).
- Цель 2: где взять роль ячейки → роль уже хранится: `CellPacket.role` в строке `cell_packet`, которую ячейка пишет
  в одной транзакции с последним чекпойнтом. Store и схема не менялись (миграция не нужна, v7 остаётся E1). Роль
  разрешается в ролях попытки, так что переопределение хоста учитывается. Запасной протокол для ячейки без пакета —
  протокол главной линии попытки (`Roles.mainLine(protocol, shape).protocol`): в S0/S1 direct это direct (как
  раньше), в S2/S3 direct до H1 — structured (главная линия там `implementing`). Безопасная альтернатива —
  запасной протокол попытки (`Config.protocol`, прежнее поведение).
- Цель 2: следствие — главная линия direct-попытки в S2/S3 (роль `implementing` до H1) теперь удерживает факты
  как structured, а не как direct (решение D3r п. 4 «протокол попытки» этим заменено по карточке).
- Тесты цели 1: граф с заблокированным I1 записан фикстурой до первого open (как его оставила бы ячейка с
  `state(blocked)`), иначе S1 счёл бы граф заготовкой и заменил его `G_single` до первой ячейки.

## Тесты
Окружение: Git Bash, `JAVA_HOME=.../eclipse_adoptium-26-amd64-windows.2`; итоги — только из XML worktree D7
(`core/build/test-results/test`); время набора WF — сумма `time` классов `io.astrolabe.workflow.*` в XML.
- Компиляция после T-56: `./gradlew :core:compileTestKotlin` — зелёная (перед первым коммитом).
- Цикл 1 = L1: `./gradlew :core:test --tests 'io.astrolabe.campaign.HandoffTest' --tests
  'io.astrolabe.context.FactCoherenceTest' --tests 'io.astrolabe.workflow.*' -q --console=plain` — 62 теста, 1 упал:
  новый тест цели 1 (`NoSuchElementException` — нет I1). Причина в фикстуре: граф без ячеек и с одними `Pending`
  S1 считает заготовкой и заменяет `G_single` до первой ячейки. Исправлено фикстурой: I1 записан заблокированным
  (первый прогон с `state(blocked)` стал не нужен). Код не менялся. Набор WF в этом прогоне: 43/43 зелёные, 236,0 с —
  машина была нагружена параллельными линиями (их Gradle).
- Цикл 2: только упавший класс `campaign.HandoffTest` — 13/13 зелёные (94,9 с).
- L2: `./gradlew :core:test --tests 'io.astrolabe.campaign.*' --tests 'io.astrolabe.context.*' --tests
  'io.astrolabe.workflow.*' -q --console=plain` — 52 класса, 363 теста, 0 падений, 0 пропусков (в т. ч. `HandoffTest`
  13/13, `FactCoherenceTest` 6/6, `ResumeTest` 8/8 — «a death between the kept return and its campaign row leaves the
  cell lost…»: `Lost` без записи handoff как прежде). Набор WF: 43/43, **170,3 с** (было 179,5 с):
  AppendOnlyPrefix 2/7,6 · BoundaryCarry 4/15,1 · DirtyRepoScenario 4/46,7 · DirtyRepo 3/1,7 · Finalization 4/17,9 ·
  GoalEvidence 6/12,2 · MessageKind 7/27,4 · OutputPolicy 8/28,4 · Review 5/13,4 (тестов/секунд).
- L2: `./gradlew assemble testClasses checkKotlinAbi -Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm
  -q --console=plain` — зелёный; публичный API не менялся (`FactRetention` — `internal`), дамп ABI не обновлялся.
- Циклов «правка → тест»: 2 из 3. Расход токенов: около 270 тыс. (по счётчику сессии; оценка карточки ≤ 400 тыс.).

## Отклонения от карточки
- Строки кода сдвинулись относительно карточки (open-сверка была `:793-806`, `retainedFacts` — `:1694-1703`).
- `context/FactCoherence.kt` и `cell/Checkpoints.kt` не менялись: роль уже хранится в `CellPacket`.
- Спецификация A-D.6 молчала о порядке сверки (не противоречила) — добавлена одна фраза в п. 1, как разрешено
  карточкой.

## Хвосты и риски
- Реестр `docs/reference/workflow-invariants.md` (WF-4, WF-12) и `docs/runtime/task-workflow.md:135` (упоминает
  `AnswerScenarioTest`) не правились — по границам карточки; имена выше.
- Запасной протокол удержания фактов для ячейки без пакета — оценка по главной линии; ячейка вне главной линии без
  пакета (потерянная структурная ячейка) получит протокол главной линии.
- Сценарий цели 1 воспроизводит сбой триггером SQLite (как D3r); иные переходы open, сдвигающие `seq` при бегущей
  ячейке, кроме `Unblocked`, сейчас не существуют — перенос защищает и от будущих.

- Время набора WF зависит от нагрузки машины (236,0 с в L1 при параллельных линиях, 170,3 с в L2); самый долгий класс —
  `DirtyRepoScenarioTest` (46,7 с), вне границ линии.

Статус: ГОТОВО К СЛИЯНИЮ — последний коммит ветки `v2/D7`: `760ca3a` (запушен).
