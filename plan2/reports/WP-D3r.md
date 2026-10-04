# WP-D3r — исправления по сквозному ревью Codex протокола direct

Ветка `v2/D3r` от `main` `99aa001` (код — слияние D3 `ea75931`). Все шесть замечаний сверены с кодом до правки; все шесть
подтвердились. Пути — под `core/src/main/kotlin/io/astrolabe/`, строки — на последнем коммите ветки.

## Сделано

### 1. P1. Handoff стирал обязательства завершения — подтверждено, исправлено
Чем подтверждено: ячейка начинала с пустых `flags` и нового `ImpactNudges()` (`cell/Cell.kt:237`, `:213` на `ea75931`);
`ReturnedHandoff` не хранил флагов, его `packet()` отдавал `PacketFlags(emptyList(), emptyList())`; `acceptanceFlags`
(`campaign/Controller.kt`) при `IntegrityApproval.Autonomous` (по умолчанию) берёт только флаги, поднятые самой ячейкой, —
дерево перепроверяется лишь при `Human` (C11). Эпоха B не видела ни ослабления теста эпохи A, ни неразрешённых
public-impact, и её завершение проходило без обязательного ревью.
Исправлено:
- `campaign/Handoffs.kt:85-86` — `ReturnedHandoff.flags: List<KeptFlag>` и `impact: List<KeptImpact>` (по умолчанию пусты,
  прежние записи читаются); `of(...)` (`:111`) кладёт флаги пакета без вердикта и неразрешённые public-нуджи; `packet()`
  отдаёт флаги и после reopen (`testIntegrity()`, `:97`); `KeptImpact` (`:125`).
- `cell/CellContext.kt:183`, `:188` — `carriedFlags` и `impact` (реестр нуджей ячейки; контроллер читает его при handoff).
- `cell/Cell.kt:214`, `:239` — только начальные значения: `impact = ctx.impact ?: ImpactNudges()`, `flags` из
  `ctx.carriedFlags`. Других правок в `Cell.kt` нет.
- `cell/ImpactNudges.kt:72` — `internal fun carry`.
- `campaign/Controller.kt:1100` (S1) и `:1718` (S0) — `runCell(continues = epoch?.kept)`; `runCell` строит реестр нуджей
  с перенесёнными и отдаёт его в `CellRun.impact`; `returned(..., impact)` сохраняет `impact.unresolvedPublic` (`:2060`).
  Эпоха читает запись из store в обоих путях — в одном прогоне и после reopen.

Тесты (`campaign.HandoffTest`): «a test weakened before a handoff binds the completion of the epoch that continues it» и
«… binds the epoch's completion after a reopen too» — эпоха A читает `tests/test_a.py`, ослабляет `assert 1 == 1` →
`assert 1`, уходит в handoff по давлению; эпоха B делает `task(finish)`; проверяется, что запись handoff хранит флаг, флаг
есть в пакете эпохи B с непустыми required checks, вердикт на нём — только одобрение ревью, запрошенного завершением эпохи B,
и ревьюер видел изменение эпохи A (как при одной ячейке, где ослабление требует того же ревью). Без исправления флага в
эпохе B нет и ревью не запрашивается. «an unresolved public impact nudge is kept with the handoff and stays pending in the
epoch's ledger» — `KeptImpact` и `carry`: шлюз выхода эпохи перечисляет нудж, `look(refs)` его снимает.

### 2. P1. Заметки direct исчезали, номера переиспользовались — подтверждено, исправлено
Чем подтверждено: `FactCoherence.retain` выбрасывал устаревший две границы непривязанный `v` из `facts`, не кладя его в
`Register.archive`; номер нового факта — максимум по `facts + archive.facts` (`register/Validator.kt:331`), значит
единственная `v1` исчезала и следующая гипотеза становилась `h1`. Так же бесследно уходил `x` сверх предела.
Исправлено: `context/FactCoherence.kt:56`, `:71`, `:88` — параметр `protocol`; в direct проверенные заметки остаются
(счётчик устаревания идёт и рендерится), опровергнутая сверх предела уходит в `Register.archive` (A-D.4: архивируются
только закрытые open, опровергнутые факты и решённые поправки, «verified notes stay»). `context/FactRetention.kt` передаёт
протокол; `campaign/Controller.kt:1558` — `retainedFacts` передаёт `c.attempt.config.protocol`. Структурный регистр — как
прежде (значение по умолчанию `Structured`).
Тест: `context.FactCoherenceTest` «a direct register keeps its stale verified notes and archives a refuted one, so no note
number is reused» — три границы, `v1` жива со `staleCells = 3`; затем `fact.add` в direct даёт `h2`; `x` сверх предела
уходит в архив регистра со своим номером.

### 3. P1. Изменилась проверка аргументов структурного протокола — подтверждено, исправлено
Чем подтверждено: до D1 (`b5e2d26^1`) у `TaskArgs`/`StateArgs` не было `after_checks`/`note`, строгий `Json` отказывал
неизвестным ключом; после D1 поля есть, и `task(ask, question, after_checks=true)` и `state(blocked, note=…)` исполнялись
(так же `{patch, note}` без `op`: вывод `patch`, `note` молча игнорировался).
Исправлено: `tool/ToolCall.kt:105`, `:122` `refuseForeignDirectField` — после нормализации, до декодирования: `note` допустим
только при `op=note`, `after_checks` — только при `op=finish`; иначе первый ключ (в порядке вызова), которого форма op не
знает, отклоняется ошибкой самого декодера kotlinx (декодирование этого ключа в класс без полей), поэтому текст отказа тот
же, что до D1. Принятые исключения не тронуты: `state(op=note)` и `task(op=finish)` разбираются и в структурной ячейке
получают отказ маски.
Тесты: `tool.ToolContractsTest` «a direct-only field on any other op is refused before dispatch as the unknown key it was
before the direct protocol» (текст отказа равен отказу для произвольного неизвестного ключа с заменой имени; первый
неизвестный ключ называется как раньше; исключения разбираются); `tool.InputToleranceTest` — одна проверка изменена (см.
«Отклонения»).

### 4. P2. Осиротевшая запись handoff теряла учёт эпохи — подтверждено, исправлено
Чем подтверждено: `OpenedCampaign.advance` сохраняет запись в `before(next)` и строку `campaigns.save(next)` в разных
транзакциях (`Db.tx` не вложенный); при сбое между ними open помечал ячейку `Lost` → `Failed`, а `pendingEpoch` требует
`Partial` — преемник шёл обычным продолжением (`continuations`, не из гранта).
Исправлено: `campaign/Controller.kt:697-708` (open, до общей обработки `Lost`) — если для бегущей ячейки есть запись handoff с
`seq == state.seq + 1` и чекпойнт, применяется `Transition.Returned` из записи (`ReturnedHandoff.exit`,
`campaign/Handoffs.kt:105`) с событием `Reconcile`; дальше — обычная эпоха с оплатой из гранта. Атомарную запись не
выбрал: она требует вложенных транзакций, которых `Db` не поддерживает.
Тест: `campaign.HandoffTest` «a handoff kept before its row was written is applied at the reopen, so its increment
continues as a paid epoch» — сбой воспроизведён SQLite-триггером на `campaigns`, срабатывающим после первой записи
`returned_handoff`; после reopen ячейка `Partial`, одна оплата из гранта от неё, `handoffs = 1`, `continuations = 0`.

### 5. P2. Находки ревью сталкивались с архивными id — подтверждено, исправлено
Чем подтверждено: `withReviewOpenItems` нумеровал после `register.open.maxOfOrNull`, архив не учитывал.
Исправлено: `campaign/Controller.kt:3033` `Controller.withOpenItems` (companion, `internal`; `withReviewOpenItems` его
вызывает) — номер после максимума по активным и архивным; дедупликация по тексту тоже видит архив.
Тест: `campaign.HandoffTest` «a review finding carried into an epoch is numbered after the archived open items and never
revives a closed one».

### 6. P2. Пагинация архива переключала коллекцию — подтверждено, исправлено
Чем подтверждено: продолжение печаталось как `… recall notes range a-b`, а `range` вида `a-b` читает активные заметки.
Исправлено: `tool/look/Look.kt:432-444` — `range="archive a-b"` листает архив, продолжение архива печатается с селектором.
Тест: `tool.look.LookTest` «a truncated archive recall continues over the archive, never over the active notes».

## Решения
(вопрос → выбор → почему → безопасная альтернатива)
1. Как вывести нуджи из ячейки, не трогая `Cell.kt` вне начальных значений → реестр `ImpactNudges` создаёт контроллер,
   передаёт в `CellContext.impact` и после выхода читает `unresolvedPublic` → правка `Cell.kt` — две строки инициализации
   (там параллельно C15b). Альтернатива: поле в `CellExit.Partial` и правка места выхода в `Cell.kt`.
2. Какие нуджи переносить → только неразрешённые public (обязательства шлюза выхода); прочие — подсказки, их и раньше не
   переносили между ячейками.
3. Вердикт перенесённого флага → сбрасывается: эпоха получает свой вердикт ревью на своём кандидате.
4. Протокол удержания фактов → протокол попытки (`Config.protocol`): при direct основная линия direct во всех формах.
5. Текст отказа п. 3 → его порождает сам декодер, а не копия строки библиотеки: совпадение с прежним не зависит от версии
   kotlinx.serialization.
6. П. 4 → сверка при open, а не атомарная запись: у `Db` нет вложенных транзакций.

## Тесты
Новые (по одному на замечание, для п. 1 — два сценария и юнит на нуджи): см. выше. Карточка их назвала до запуска.
- L1, один прогон после завершения правок: `./gradlew :core:test --tests io.astrolabe.campaign.HandoffTest --tests
  io.astrolabe.campaign.ResumeTest --tests io.astrolabe.campaign.LifecycleTest --tests io.astrolabe.cell.CellTest --tests
  io.astrolabe.tool.state.NoteTest --tests io.astrolabe.tool.InputToleranceTest --tests io.astrolabe.tool.ToolContractsTest
  --tests 'io.astrolabe.tool.look.*' --tests io.astrolabe.context.FactCoherenceTest --tests
  io.astrolabe.context.CarryForwardTest --tests 'io.astrolabe.register.*' -q` — 315 тестов, 1 упал: мой новый тест п. 5
  ждал `o2`, а получил `o3` (`Derived.openItems` нумерует находки до фильтра уже известных, поэтому отброшенный дубликат
  занял номер 2 — прежнее поведение, не часть замечания). Исправлен тест: новая находка идёт первой.
- Повтор только упавшего класса `HandoffTest` — 11/11.
- `:core:updateKotlinAbi` — дамп в коммите (добавлены перегрузки `CellContext` и `FactCoherence.retain`).
- L2: `./gradlew assemble testClasses checkKotlinAbi -q --console=plain
  -Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm` — зелёный.
- Перед L1 `git merge main` — «Already up to date» (C15b в `main` ещё нет).
- Циклов «правка → тест»: 2. Плюс две компиляции (`compileKotlin`, `compileTestKotlin`) до L1, одна ошибка smart cast исправлена.

## Отклонения от карточки
- `tool/InputToleranceTest.kt:34-36`: проверка `{"patch":[…],"note":{…}}` → `op = patch` (Valid) заменена на отказ
  «unknown key 'note'». Прежнее утверждение закрепляло ту самую регрессию п. 3: до D1 такой вызов отклонялся неизвестным
  ключом. Вывод `op=patch` сохранён — отказ идёт уже по форме `patch`.
- П. 5: кроме нумерации, дедупликация находок по тексту теперь учитывает архив регистра. Без этого закрытая (и потому
  архивированная) находка возвращалась бы новой open на каждой границе; в структурном регистре закрытый пункт остаётся в
  `open` и дубль уже отсекался.
- П. 1: `ReturnedHandoff.packet()` теперь несёт флаги — пакет эпохи после reopen совпадает с пакетом в одном прогоне (там
  `exit.packet` и так их имел); затрагивает отчёт о завершении только для direct.

## Хвосты и риски
- Тест «ослабление блокирует» проверяет путь с одобряющим ревью (флаг перенесён, ревью эпохи B запрошено и только оно
  снимает флаг). Ветка «ревью отклонило → завершение отказано» в эпохе отдельно не проверена: её поведение — общий код
  ячейки, не зависящий от handoff.
- `Derived.openItems` нумерует находки до отсечения известных: при дубликате в начале списка номер пропускается (не
  переиспользуется). Прежнее поведение, не правил.
- Реопен после сбоя (п. 4) полагается на чекпойнт ячейки; без него — прежний `Lost`.
- Нуджи без `public` в эпоху не переносятся (как и между обычными ячейками).

## Заключительный шаг (по указанию оркестратора): слияние `main` с C15b
- `git merge main` (`e6b2b37`, C15b) — без конфликтов, коммит слияния `0b54202`; `core/api/core.api` слит автоматически,
  `:core:updateKotlinAbi` с `aiGateBuild` дал тот же дамп (изменений нет).
- L1 (третий цикл): `CellTest` 62/62, `TurnOutputTest` 7/7, `HandoffTest` 11/11, `DefaultsTest` 3/3 — 83 теста, 0 упало.
- L2 `assemble testClasses checkKotlinAbi` с `aiGateBuild` — зелёный. Ветка запушена.

Статус: ГОТОВО К СЛИЯНИЮ — последний коммит `0b54202` (ветка `v2/D3r` запушена)
