# WP-D2 — якорь direct в `[A]` и исполнение `state(note)` (P8.D.2)

Ветка `v2/D2` от `main` `b5e2d26` (HEAD worktree был старше — `b0901dc`, без D1; ветка создана прямо от `main`); запушена.
Коммиты: `fef2be1` (код), `e99f4b1` (тесты), `2bcae82` (дамп ABI).

## Сделано
- **Якорь direct (A1, A2; §5.10-D).** `Anchor.renderDirect` (`cell/Anchor.kt`): блоки по порядку — дайджест, Workset
  (60 т.), Touched (последние 3), Checks, Runs, Notes, enabled, gauge, подсказки (≤ 4), строки диагноза; пустой блок
  опускается; нет STATE, focus zoom, focus notes, trips. Цель `directAnchorTargetTokens` = 800: шаг 1 — Runs только живые
  handle и красные квитанции, шаг 2 — Notes до половины предела; каждый шаг и «over the 800-token target: N tokens»
  названы в `reductions`; `overBudget` — по `anchorMaxTokens`, как прежде. `Anchor.render` (структурный) не тронут.
- **Runs.** `RunLine`, `RunReceipt`, `RunsRender` (`Anchor.kt`): живые handle в порядке handle (`… → running · ready (…)`),
  затем последняя квитанция каждой зарегистрированной проверки с командой — красные первыми, внутри группы старший alias
  первым; команда ≤ 60 символов с `…`; `(stale)`, `· known red, not required`; предел 5 строк, остаток — `+N more`.
  Источник в ячейке — `Cell.runLines` (`Run.liveHandles()` + `ws.checks`/currencies).
- **Notes.** `register/NotesRender.kt`: id A-D.4 (`h/v/x<n>`, `d<n>`, `dead<n>`, `o<n>`, `a<n>` по позиции); порядок `[A]` —
  open, dead ends, decisions, pending amendments, stale v, h, v, внутри вида новые первыми; блок `── Notes (STATE vN)` целыми
  строками в пределах `directNotesMaxTokens` = 200, невлезшие — одной строкой `… +N not shown: ids — look(recall, id=notes)`
  (≤ 30 id, затем `…`).
- **`state(note)` (A-D.4, T5).** `StateTool.note` (`tool/state/StateTool.kt`): виды hypothesis (`v` при evidence, якорь —
  наблюдение ровно одного файла через новый `ValidationContext.observedFile`), decision (`because = ""`), deadend
  (`scope task`, `reopen new evidence`), deadend+refutes (`fact.refute` + `deadend.add` одним патчем; факт и evidence
  проверяются до построения патча), open, open+closes (`open.close`), amend. Поля: `closes`/`refutes` не своего вида —
  отказ `schema`; лишние ключи, `text` при `closes`, `evidence` у decision/amend/open без closes — игнор с названием.
  `closes`/`refutes` принимают `3`, `"3"`, `"o3"`. Результаты в форме A-D.4 (`STATE vN · note <id> recorded · register t/c
  tokens` / `STATE vN unchanged · rejected: <rule> — <detail> · register t/c tokens`). Плоская форма
  `state(op=note, kind=…, text=…)` поднимается в объект `note` (`Args.kt`, `noteLifted`; `note` добавлен в `STATE_NESTED`).
- **Маска, затем note (ревью D1).** Отказ `unsupported` до маски удалён: `StateTool.direct(roleMask, contracts)` вызывается
  ячейкой direct-роли (`Cell.kt:273-279`); исполнитель проверяет маску роли, ветка `note` защищена протоколом — структурный
  `StateTool` отвечает `masked`.
- **Amend.** После правил валидатора: pending-поправка через `Contracts.propose(…, weakening = true)` (та же обрезанная
  формулировка — переиспользуется), затем строка регистра с id (`AmendmentLine.id`). Контракт не меняет версию.
- **Ёмкость (V4).** `Validator` (direct): при превышении предела — архив по порядку (закрытые open, опровергнутые факты,
  решённые поправки), по одному до влезания; иначе `register cap — t/c tokens of active notes after archiving; retire notes
  first: …`. `closes`/`refutes` судятся тем же правилом после применения. Номера не переиспользуются (архив считается в
  `numbers`). Архив — `Register.archive: RegisterArchive` (`@EncodeDefault(NEVER)`, структурные байты прежние).
  Выход ячейки: если loop-ворота требуют заметку (`StateTool.noteRequired`, ставится в `Cell.kt:938`) и она отклонена по
  ёмкости — `pendingBlock` с причиной `register capacity: …; the note the loop gate requires cannot be recorded`; путь
  `state(blocked)`; позднее применённая заметка того же хода его снимает.
- **T7.** `Cell.kt:696-698`, `:724`: `note` наравне с `patch` снимает сигнатуры loop и питает G6; сравнение через
  `Register.restored()` — архивация не считается изменением.
- **G6.** `Gates.kt` `RegisterInvariants`: в direct «note rejected — <rule>».
- **A3, A4.** `Rebuild.kt`: `[A]` перестроенной проекции direct — `NotesRender.text`; `Carry.render(protocol)`
  (`CarryForward.kt`) — для direct весь активный регистр с id; вызовы: `Compiler.kt:168`, `Precompile.kt:125`, `Cell.kt:1220`.
- **A5.** `Look.recall` с `id: "notes"` (хук `Look.notes`, ставит ячейка direct): активные заметки в порядке `[A]`, затем
  решённые поправки и неархивированные `x`; `range: "archive"` — архив; `range: "a-b"` — продолжение; без alias и без
  coverage.
- **T8.** `Handle.ready` (`@EncodeDefault(NEVER)`) и `ToolOutcome.ready` — выставляются `Run.wait` при Ready (совпавшая
  строка или `port N`); для обоих протоколов; текст результата не изменён.
- **Defaults.** `directRunsMaxLines` = 5, `directNotesMaxTokens` = 200, `directAnchorTargetTokens` = 800
  (`@EncodeDefault(NEVER)` — снимок конфигурации прежний).
- Java-совместимость: явные прежние конструкторы `Register`, `AmendmentLine`, `ToolOutcome`, `Handle`; `@JvmOverloads` у
  нового `Validator.check(…, decided)`. Дамп `core/api/core.api` перегенерирован (удалены только synthetic/`copy`).

## Решения
(вопрос → выбор → почему → безопасная альтернатива)
1. Как StateTool узнаёт протокол и маску, не трогая `Controller.kt` (владеет D3) → `StateTool.direct(mask, contracts)` из
   ячейки, по образцу `Edit.protocol` (`Cell.kt:272`) → без конфликта с D3. Альтернатива: параметр конструктора в
   `Controller.kt:2268`.
2. Где архив → поле `Register.archive` (не кодируется по умолчанию) → архив долговечен вместе с версией регистра и
   читается тем же `RegisterVersions`. Альтернатива: отдельная таблица.
3. Позиции `a<n>` при архивации → `ArchivedAmendment(position, line)`; активные позиции — свободные номера по порядку →
   id не сдвигаются. Альтернатива: поле номера в `AmendmentLine`.
4. «Решённая» поправка → `status != pending` или id строки больше не pending в контракте (`StateTool.decided`). Строки без
   id — только по статусу.
5. Порядок amend → валидатор целиком (вкл. предел), затем `propose`, затем запись → поправка не создаётся для заметки,
   отклонённой по ёмкости (строже A-D.4 «после правил 1–3»).
6. Отклонённая заметка и loop-ворота (вопрос ревью D1, V4) → не снимает: сигнатуры снимает только применённая заметка,
   меняющая регистр (T7); отклонение по ёмкости при требовании ворот завершает ячейку `blocked`.
7. `+N more` → блок Runs ≤ 5 строк всего: 4 строки + `+N more`.
8. Строка `x<n>` и решённые поправки в `[A]` не показываются (их нет в перечне §5.10-D), но есть в recall и carry-forward
   («весь активный регистр»).
9. Чек-квитанции Runs: все проверки с `command` и `last` (не только acceptance и `CHK-model-*`).
10. Отказы `note` до валидатора (`schema`, `unknown fact`, `refute needs …`) тоже пишутся в `lastRejection` → G6 их видит.
11. Тестовый fixture `CellTesting` строит для direct-роли `Validator(protocol = Direct)`, как `Controller.kt:2268`; иначе
    правило Next (D1) отклоняло любую заметку в тестах ячейки.

## Тесты
Классы L1 (названы до запуска): `cell.AnchorTest`, `cell.DirectAnchorTest` (новый), `cell.LayoutTest`, `cell.GatesTest`,
`cell.CellTest`, `tool.state.StateToolTest`, `tool.state.NoteTest` (новый), `register.ValidatorTest`, `register.RegisterTest`,
`register.ValidatorFieldsTest`, `DefaultsTest` (изменён), `tool.ToolContractsTest` (изменён `Args`).
- Цикл 1: `./gradlew :core:test --tests <12 классов> -q --console=plain` — 304 теста, 4 упали: `CellTest` ×2 (fixture
  строил структурный валидатор для direct-роли → правило Next), `DirectAnchorTest` ×1 (моё ожидание обрезки команды),
  `NoteTest` ×1 (опечатка в raw-строке теста).
- Цикл 2: `CellTest`, `DirectAnchorTest`, `NoteTest` — 1 упал (`CellTest`: отступ строк результата в моём ожидании).
- Цикл 3: `CellTest` — 55/55. Итого 304/304, **3 цикла**.
- `:core:updateKotlinAbi` — дамп закоммичен. L2: `./gradlew assemble testClasses checkKotlinAbi -q --console=plain
  -Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm` — зелёный.
- Новые проверки: порядок блоков direct (golden), Touched 3, подсказки ≤ 4, типичный S0 ≤ 800 т.; Notes ≤ 200 т. и строка
  невлезших id (≤ 30); редукции по шагам и «over the target»; Runs — живой handle с ready, красные первыми, старший alias,
  обрезка 60, stale, known red, `+N more`; id и порядок заметок; структурный `Anchor.render` — прежние байты (плюс
  существующий golden `AnchorTest`); каждый вид note записан и виден в якоре (`v` с якорем файла); amend → одна pending-
  поправка, строка с id; поля не своего вида; refutes проверяет факт и evidence до записи; плоская форма; структурный
  StateTool отвечает `masked`; отказ по ёмкости завершает ячейку только при требовании loop-ворот; архив по порядку,
  номера не переиспользуются, `restored()` = без архивации; `closes`/`refutes` при полном регистре — принят/отклонён;
  правило Next выключено (тест D1); G6 «note rejected»; ячейка direct: журнал вместо STATE и `look(recall, id=notes)`.
- Изменённые существующие тесты: `CellTest` (D1-ожидание `unsupported` для `note` → «note h1 recorded»: D2 исполняет
  note), `DefaultsTest` (три новых поля в строке `[A] max` — см. «Отклонения»), `CellTesting` (валидатор по протоколу).
- Расход токенов исполнителю не виден.

## Отклонения от карточки и спецификации
- **Границы карточки.** Кроме перечисленных файлов тронуты места строк D2 из A-D.7: `Rebuild.kt` (A3), `CarryForward.kt` +
  `Compiler.kt:168`, `Precompile.kt:125` (A4), `Dispatcher.kt`, `Handles.kt` (T8), `Register.kt` (архив, id поправки),
  `Args.kt` (T5), `Defaults.kt` (три числа §5.10-D). `Controller.kt`, `CellContext.kt`, `CellExit.kt`, `TaskTool.kt`,
  `campaign/` не тронуты; `Layout.kt` правок не потребовал (строка enabled сделана в D1).
- **`docs/`:** после ревью (п. 6 ниже) `defaults.md` получил строку трёх новых чисел — единственная разрешённая правка docs.
- **«poll the handle» → «wait on the handle» (`Run.kt:772`, абзац «Not switched» A-D.7) не сделано:** меняет байты
  результата структурного протокола, а условие приёмки — ни одного байта структурного поведения. Решение — за оркестратором.
- `Validator.check` в direct отклоняет по ёмкости до создания pending-поправки (решение 5) — строже текста A-D.4.
- `[A]` не показывает `x<n>` и решённые поправки (их нет в списке §5.10-D) — решение 8.

## Хвосты и риски
- Живой прогон direct не проверен (только `FakeAdapter`); `Config.protocol = Direct` до D3 всё ещё без `task(finish)`.
- Поправка, решённая хостом, остаётся в строке регистра со `status = "pending"` (никто не пишет статус в регистр); `[A]`
  показывает её `(pending)`, пока ёмкость не заставит архивировать. Источник истины — контракт.
- `Handle.ready` выставляется только `run(op=wait)` / launch с `until_*`; `poll` его не ставит.
- (Исправлено после ревью, п. 1 ниже.) Применённая заметка теперь снимает `noteRequired`.
- Archive-строки `range: "archive"` без постраничного продолжения (маркер продолжения указывает активный диапазон).
- Возможный конфликт слияния с D3 в `CellTest` (тест `a direct cell sends its own S…`, строка c1) и в `CellTesting`.

## Ревью Fable и исправления
Вердикт: «можно сливать, P1 нет»; два P2 на direct-пути исправлены до слияния. **Четвёртый цикл «правка → тест» — по
решению оркестратора.** Коммит `128d7ef`. Все шесть замечаний сверены с кодом и подтвердились.
1. (P2) Применённая заметка не снимала `noteRequired`. Исправлено: `noteRequired = false` рядом с `lastRejection = null`
   (`tool/state/StateTool.kt:235`). Тест `NoteTest` «a required note recorded first keeps a later capacity refusal of the turn
   from ending the cell».
2. (P2) `deadend` + `refutes` с текстом против правила строки применял `fact.refute` без тупика (`Validator` пропускал op,
   `Applied` с частью ops). Исправлено: `appliedOps.size < op.size` ⇒ заметка отклоняется целиком с правилом пропущенного op,
   ничего не записано (`StateTool.kt:216-220`). Тест «a refutation whose dead end breaks a line rule records nothing».
3. (P3) `blocked()` не сбрасывал `capacityBlock`. Исправлено (`StateTool.kt:352`). Тест «the model's own block survives a
   note applied after a capacity refusal».
4. (P3) `{patch, note}` без `op` стал неоднозначным. Исправлено: `note` выводится только один (`tool/Args.kt:243-245`). Тест
   в `InputToleranceTest`: прежний вывод `patch` и вывод `note` в одиночку.
5. (P3) Прежний полный конструктор `Defaults` пропал из ABI. Возвращён явной перегрузкой (`Defaults.kt:130-158`); дамп
   перегенерирован, прежняя сигнатура снова в `core.api`.
6. `docs/reference/defaults.md`: строка «Direct `[A]` journal: Runs / Notes / target» (одна строка с тремя числами, как
   прочие сгруппированные строки таблицы); `DefaultsTest`: своя строка, 26 строк, проверка значений 5/200/800.

Проверки (один прогон, все зелёные): `NoteTest`, `DirectAnchorTest`, `ValidatorTest`, `CellTest`, `DefaultsTest`,
`InputToleranceTest`, `io.astrolabe.tool.run.*`, `io.astrolabe.tool.look.*`, `io.astrolabe.context.*`, `AttemptConfigTest` —
334 теста, 0 упало, 1 skipped (cell 61, context 52, tool.run 160, tool.look 19, tool.state 9, register 14, tool 8,
io.astrolabe 11). `:core:updateKotlinAbi` — дамп в коммите. L2 `assemble testClasses checkKotlinAbi` с aiGateBuild — зелёный.

Хвосты (не чинились, по указанию оркестратора):
- `Run.kt:772` «poll the handle»: A-D.7 «Not switched» предписывает «wait on the handle» для обоих протоколов; это меняет
  байты структурного результата — решит D4 вместе с golden.
- `NotesRender.kt:34`: решённая хостом поправка показывается `(pending)` до архивации.
- `AgentEvent.Blocked` при отказе по ёмкости уходит хосту, даже если блок затем снят применённой заметкой.
- Нет тестов на T8 (`Handle.ready`, `ToolOutcome.ready`), A3, A5 (`range`, `archive`) и T7 на уровне ячейки.
- Вопрос к D3: если эпоха после handoff стартует с `Register.empty`, id заметок из carry-forward не адресуются через
  `closes`/`refutes`, и нумерация столкнётся.

Статус: ГОТОВО К СЛИЯНИЮ — последний коммит `128d7ef` (ветка `v2/D2` запушена)
