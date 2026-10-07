# WP-WR5 — исправления по сквозному ревью сессии 5, ядро (P1 №1, №2; P2 №2, №3)

Ветка `v2/WR5` от `main` `047579b` (= `62afbee` + Log в TODO), worktree `ASTROLABE/.claude/worktrees/WR5`. Исполнитель — t4.

## Сделано

### П. 1 — P1 №1: обязательства переживают сбой между `Cell.Ended` и записью `returned_handoff` (`a4d225a`)
- `cell/Checkpoints.kt` (+74/−4): `CellPacket.handoff: PacketHandoff?` (последнее поле, `@EncodeDefault(NEVER)` — строка
  `cell_packet` любого другого конца сохраняет байты; старые строки читаются как `null`). Новые публичные записи
  `PacketHandoff(cause: HandoffCause, hint, turns, flags: List<PacketFlag>, impact: List<PacketImpact>)`, `PacketFlag`
  (форма `TestIntegrityFlag`), `PacketImpact` (форма `ImpactNudge`); `CellPacket.of(packet, checkpoint, handoff)` с
  `@JvmOverloads`.
- `cell/Cell.kt` (+13/−6): `Exit.handoff` задаётся только в `handoff(cause)`; `finish` передаёт его в `settle`, а `settle`
  дополняет его `turns = budget.turnsTaken`, флагами целостности пакета без вердикта и `impact.unresolvedPublic` — и
  отдаёт в `persist` → `Checkpoints.settle` (та же одна транзакция с терминальным чекпойнтом и экспортом, WF-14 не тронут).
- `campaign/Handoffs.kt` (+15): `ReturnedHandoff.recovered(id, seq, packet, checkpoint, grant, function)` — те же поля,
  что `of` берёт из выхода; tier/profile в пакете нет — `null` (эпоха маршрутизируется только по `function`).
- `campaign/Controller.kt` (+20/−3), open: в блоке D7 (сразу после `priorVersion`, до `Resumed`/`LimitRaised`/`Unblocked`
  и до ветки `Lost`) — если записи с `seq == stored.seq + 1` нет, у бегущей ячейки терминальный чекпойнт `Partial`, её
  пакет несёт `handoff` и записи для этой ячейки нет вовсе, запись `returned_handoff` пишется из пакета с
  `seq = stored.seq + 1` (контроллер — её единственный писатель, L9), одна строка журнала Reconcile, затем тот же путь D7:
  `Transition.Returned(kept.exit(...))`. Дальше всё штатно: `pendingEpoch` находит запись, `successor` платит эпоху из
  гранта, `runCell(continues = kept)` переносит флаг и public-impact в ячейку эпохи.
- `docs/reference/kernel-contract.md` A-D.6 п. 1 — одна фраза о терминальном пакете и порядке при reopen.
- Тест `campaign.HandoffTest` «a handoff whose process died before its return was kept is recovered from the terminal
  packet, and its epoch owes the review and the refs»: direct S1; эпоха A читает и ослабляет `tests/test_a.py`, меняет
  сигнатуру `a` (её вызывает `src/b.py`), handoff по давлению; SQLite-триггер `BEFORE INSERT ON packets WHEN NEW.kind =
  'returned_handoff'` убивает процесс между `Cell.Ended` и записью. Reopen: ячейка `Partial` (не `Lost`), запись
  восстановлена (cause `Pressure`, function `Implementing`, флаг `tests/test_a.py`, impact `a`); эпоха B оплачена из гранта
  (`from` = ячейка A), её `task(finish)` без правок отказан — ревью, которое требует перенесённый флаг, видит изменение
  эпохи A и отклоняет, в gaps — `unresolved impact nudge` по `src/a.py`; запись handoff эпохи B несёт оба обязательства,
  `continuations = 0`, инкремент не `Verified`. **До правки падал** (контроллерный хунк временно снят): «the return is
  recovered from the packet, not a lost cell ==> expected: <Partial> but was: <Failed>».
- `Lost` без handoff cause не изменился: ветка не тронута, восстановление срабатывает только при `packet.handoff != null`;
  `ResumeTest` 8/8 (в т.ч. «a death between the kept return and its campaign row leaves the cell lost…»).

### П. 2 — P1 №2: протокол удержания по разрешённой runtime-роли (`b6ec84b`)
- `context/FactRetention.kt` (+8/−4): `protocolOf` разрешает роль из пакета так же, как исполнение —
  `RoleTexts.worded(Roles.defaults[name], roles[name]).protocol` (та же функция, что в `runCell`/`Repair`/ревью); имя вне
  объявленных ролей или ячейка без пакета — `fallback`.
- Тест `context.FactCoherenceTest` «a host override of the direct role's wording without a protocol retains as the cell
  ran, so its verified note survives two boundaries»: override `direct` через v1.0-конструктор (протокол по умолчанию
  Structured, как JSON без `protocol`), `fallback = Structured`; обе границы — Direct, устаревший verified-факт
  сохранён, `staleCells = 2` (A-D.4).

### П. 3 — P2 №2: shim `rg.cmd`/`rg.bat` (`61e2ab4`)
- `atlas/Host.kt` (+15/−6): `HostProbe.launchable(program)` (по умолчанию = `onPath`); `PathProbe.launchable` — на Windows
  только `<program>.exe` (CreateProcess без оболочки дописывает только `.exe`), на POSIX — исполняемый `<program>`.
  `onPath` (блок host в prime) прежний: shim по-прежнему «on PATH».
- `os/search/RipgrepSearch.kt` (+31/−3): необязательный `fallback: Search`; если первый запуск `rg` падает до любого
  успешного — этот поиск и все следующие уходят в fallback, одна SLF4J-строка (`warn`, через `compareAndSet` — ровно одна);
  `backend` после этого — `Jvm`. Без fallback или после успешного запуска — прежний `Failed`.
- `campaign/Controller.kt` (+5/−2): `search(c)` — `RipgrepSearch("rg", Searches.jvm())` при `host.launchable("rg")`, иначе
  JVM. Публичный `Searches.auto` не менялся. Выбор — без процессов (WF-2).
- Тесты `campaign.SearchBackendChoiceTest`: shim `rg.cmd`+`rg.bat` при `PATHEXT` с `.CMD;.BAT` — `onPath` да, `launchable`
  нет, open выбирает JVM; незапускаемый `rg` с fallback — первый поиск `Found` с бэкендом `Jvm`, `backend` остаётся `Jvm`;
  без fallback — `Failed`.

### П. 4 — P2 №3: cap переноса родителя по протоколу (`f22ded7`)
- `context/CarryForward.kt` (+11/−7): `Carry.capped(maxTokens, estimate, protocol = Structured)` (`@JvmOverloads`) меряет
  `render(protocol)`; `CarryForward.parent(..., protocol = Structured)` передаёт его.
- `campaign/Controller.kt` (+1/−1): `parentCarry` передаёт `role.protocol` — тот же, которым `Compiler` рендерит блок.
- Тест `context.CarryForwardTest` «a direct parent carry with note ids holds parentCarryMaxTokens as the direct block
  renders it»: 24 решения и 12 open-пунктов — direct-блок (`d24 …`, `o12 …`) больше структурного; при cap = размер
  структурного блока структурный не режется, direct режется и укладывается по direct-рендеру.

### ABI (`031e90f`)
- `core/api/core.api` +144/−5: новые `PacketHandoff`, `PacketFlag`, `PacketImpact`, `CellPacket.handoff`,
  `CellPacket.of(…, PacketHandoff)`, `HostProbe.launchable`, перегрузки `capped`/`parent` с протоколом. Удалены только
  полный конструктор/`copy` data-класса `CellPacket` (тип 2.0, W9) и синтетический `parent$default`.

## Решения
- Где держать обязательства до записи контроллера → поле `handoff` в строке `cell_packet` (та же транзакция `settle`),
  а не новая таблица/колонка. Почему: пакет уже атомарен с терминальным чекпойнтом; формат — JSON-тело, поле аддитивное,
  схема store не менялась (миграции нет, v8 не нужна). Безопасная альтернатива — отдельная строка `packets` того же
  `settle`.
- Как восстанавливать → писать запись `returned_handoff` из пакета и применять её путём D7, а не строить выход «на
  лету». Почему: эпоха, грант (`successor`), carry (`keptPacket`) и финальный отчёт читают именно записи; одна логика
  для обоих окон. Условие строгое: только бегущая ячейка, терминальный чекпойнт `Partial`, пакет с handoff и ни одной
  записи для этой ячейки — чужая/старая запись не дублируется.
- Routing function восстановленной записи → по правилу диспетчеризации: эпоха наследует функцию записи
  предшественника (если `spendOf(prev).to` — эта ячейка), иначе `Implementing` для первой ячейки инкремента, иначе
  `Continuation`. tier/profile — `null` (в записи handoff нигде не читаются).
- Флаги в пакете — без вердикта, как в `ReturnedHandoff.of` (эпоха получает свой вердикт).
- Shim → вариант «probe принимает только `rg.exe`» (без запуска через `cmd /c`): `cmd /c` добавил бы квотирование
  аргументов-шаблонов. Fallback подключён в `Controller.search`, публичный `Searches.auto` не тронут.
- Разрешение протокола роли → через `RoleTexts.worded` над объявленной ролью (переиспользование, не копия); для имени
  вне `Roles.defaults` — `fallback` вместо сырого протокола конфигурации (такую роль исполнение не запускает).

## Тесты
- До правки (п. 1, контроллерный хунк снят): `:core:test --tests 'io.astrolabe.campaign.HandoffTest.a handoff whose process
  died*'` — 1/1 упал: «expected: <Partial> but was: <Failed>» (ячейка ушла в `Lost`).
- L1 (один раз): `./gradlew :core:test --tests 'io.astrolabe.campaign.HandoffTest' --tests 'io.astrolabe.campaign.ResumeTest'
  --tests 'io.astrolabe.context.*' --tests 'io.astrolabe.campaign.SearchBackendChoiceTest' --tests
  'io.astrolabe.campaign.RoleWiringTest' -q --console=plain` — **88/88**: HandoffTest 14/14, ResumeTest 8/8, RoleWiringTest
  2/2, SearchBackendChoiceTest 3/3, context.* 61/61 (FactCoherenceTest 7/7, CarryForwardTest 6/6).
- ABI: `./gradlew :core:updateKotlinAbi` — дамп закоммичен (`031e90f`).
- L2 (один раз): `:core:test --tests 'io.astrolabe.campaign.*' --tests 'io.astrolabe.cell.*' --tests 'io.astrolabe.context.*'
  --tests 'io.astrolabe.workflow.*' --tests 'io.astrolabe.os.*'` — 91 класс, **959 тестов, 0 падений** (7 skipped в os.* —
  платформенные): campaign 347, cell 171, context 61, os 337, **workflow 43/43, 160,5 с** (сумма классов; машина
  нагружена параллельными линиями). `./gradlew assemble testClasses checkKotlinAbi
  -Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm -q --console=plain` — зелёный.
- Циклов «правка → тест»: **1** (плюс обязательный прогон fixture п. 1 до правки). Стражи WF не менялись.
- Расход токенов: точный счётчик не виден; оценка ≈ 300 тыс. (в пределах ≤ 450 тыс.).

## Отклонения от карточки
- Нет по существу. Публичный `Searches.auto` оставлен прежним (fallback только у выбора кампании) — `Search.kt` вне
  списка файлов карточки.

## Хвосты и риски
- Восстановленная запись не знает tier/profile маршрутизации (`null`); на маршрутизацию эпохи не влияет (берётся
  `function`), но в записи они пустые.
- `snapshot(c)` после выхода ячейки в окне сбоя не выполнен — следующий open увидит изменения ячейки как внешние (как
  у `Lost`); на обязательства не влияет.
- Пользовательские `HostProbe` без `launchable` отвечают `onPath` (как раньше) — shim у них не отсекается, но падение
  запуска уходит в JVM-fallback.
- P2 №5/№6 (продление гранта, STATUS по пакету) — вне карточки (P8.D.8).

Статус: ГОТОВО К СЛИЯНИЮ — последний коммит ветки `v2/WR5`: `031e90f` (запушен).
