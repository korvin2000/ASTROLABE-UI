# WP-C10 — отчёт линии (ветка `v2/C10`)

Строгий регрессионный гейт (P8.C.10) и живой фоновый запуск при stop-верификации (P8.C.12). Ветка от `main`
(`611dbad`); первая сдача `0cbbd17`; ревью круг 1 (Codex 6 P1 + 3 P2, Fable 3 P1 + 5 P2) — `faa183d`, `2077aac`,
`81303fe`, `b1863ec` (слияние C11), `3b69d6b` (ABI); ревью круг 2 (Codex 6 P1 + 4 P2 + 1 P3) — `51d8ea0` (код и
тесты), `1cd4adb` (docs), `a413b14` (слияние main); круг 3 (Codex 6 P1 + 2 P2, решение оркестратора — упростить правило)
— `ed3ace6` (код и тесты), `77db412` (docs), `5a58e19` (слияние C14), `f7cf280` (ABI); круг 4 (контрольная
проверка) — см. «Ревью, круг 4». K = core/src/main/kotlin/io/astrolabe.

## Итоговое правило (после круга 4, одним абзацем)
Красное `CHK-tests-blast` / `CHK-types-touched` не оставляет следа только одним способом: идентичность теста сообщена ровно
один раз как passed eligible-прогоном на текущем дереве, завершившимся с полной записью (для types-touched, у которой нет
поштучных падений, — её собственный eligible `Passed` на этом дереве при том же определении). Каждая квитанция этих проверок
(в т. ч. из общего `run` с полным набором) хранит свою запись по тестам: ключ — дайджест идентичности (с файлом раннера) и
нормализованного каталога запуска, плюс редактированные имя и первая строка; текст падений не сравнивается; неполный захват
или отчёт сохраняет исход процесса и помечает запись неполной. Каждое сообщённое падение держится до такого снятия;
неидентифицированные и обрезанные — всю попытку. Stop перезапускает последнюю красную команду каждой проверки, не
подтверждённую eligible-прогоном или маркером на этом дереве (её замыкание, маркер под её определением, без flaky-повтора,
прямой `pytest` с `-rA`), и один baseline на проверку и попытку. **New** (жёсткий отказ) — eligible-прогон этого дерева
однозначно сообщает падение, а завершённый baseline сообщил идентичность на s0 ровно один раз как passed. **Было красным до
изменений** — baseline сообщил её как failed: без `Open`, раскрытие. **Неизвестно** — остальное: D-400 + раскрытие с
причиной. Любое удержание ограничивает класс до `unverified`.

# Часть 1 — P8.C.10

## Сделано (после ревью)
- `K/verify/Baseline.kt` — `RedClass {New, Inherited, Unclassified}`, `RegressionHold` (бывш. `HeldRed`), `Regressions`:
  `outcomes` (ключ — дайджест канонической идентичности; отпечаток — дайджест **нередактированного** текста падения с
  нормализацией только полей раннера: корни прогона, `file:line`, `line N`, длительности, адреса, время, temp-пути; имя
  и первая строка — редактированные, только для показа; неоднозначность — по всем сообщённым случаям), `fingerprint`,
  `hold`, `unconfirmed`, `baselineDue`; `Baseline.begin` (маркер «baseline начат»); baseline-квитанции несут `tests`.
- `K/evidence/Receipt.kt` — `FailedTest(key, name, fingerprint, signature)`, `TestOutcomes(failed, passed, ambiguous,
  truncated)`, `Receipt.tests` (вместо `failures`; только для двух проверок; предел 200 падений / 2000 прошедших).
  `K/evidence/Receipts.kt` — `forCheck` по `rowid` (I-05).
- `K/verify/Scheduler.kt` — `Currency.hold`; история: работа + попытка + **свой workspace** (по алиасу), без baseline;
  `unconfirmed`, `baselineDue`; `unquiet` читается из `Workspace`.
- `K/verify/Resolution.kt` — правило выше; `Resolved.acknowledged`; `Resolver.increment(…, acknowledged)`;
  `Obligations.hold/disclosure`. `K/verify/ExitGate.kt` — `Verifier.accept(…, acknowledged)`, `Accepted.acknowledged`;
  `K/graph/{Planning,RequirementGraph}.kt` — `IncrementEvidence.acknowledged` (персистится).
- `K/campaign/Controller.kt` — `acknowledged(c)` в `verify`, `reaccept` и `CellContext`; resume не берёт baseline как
  `last`; при открытии попытки `CHK-tests-blast` восстанавливается из последней не-baseline квитанции
  (`Blast.restored`). `K/cell/{CellContext,Cell}.kt` — `acknowledged` в резолвер ячейки; заметки stop пинуются;
  штамп пересчитывается, если stop что-то уладил.
- `K/campaign/FinishReceipt.kt` — раскрытие по классам; `notVerified`: «red on the final tree» только при текущем
  красном, иначе «failures of #n not shown fixed on the final tree».
- `K/tool/verify/Verify.kt` — `executedOf` пишет `tests` только для двух проверок; `onStop` (порядок части 2,
  `refreshRegressions`, `baselineOf`).

## Решения (черновые, без номеров)
1. **Классификация** — собственная по ключам и отпечаткам (та же семантика, что у `PreexistingLedger.classify`:
   идентичность, окружение, сигнатура), т. к. сравнение теперь идёт по дайджестам нередактированного текста.
   Альтернатива — ledger по редактированным сигнатурам — давала ложный Inherited при смене секрета или числа.
2. **Пригодность baseline**: eligible, `Passed`/`Failed`, полный список тестов, все посчитанные падения
   идентифицированы, что-то выполнено (идентичности или `parsed.executed > 0`). Иначе Unclassified.
3. **Признание `Open`-заметкой** — по id красной квитанции текущего дерева, не по идентичности: на другом дереве stop
   перезапускает, и новая красная требует новой заметки (правило D-400 в этой ячейке).
4. **types-touched**: typecheck не даёт идентичностей → его падения всегда Unclassified (D-400 + `unverified`); жёсткий
   отказ — только для тестов с идентичностями.

## Тесты
- После раунда: `c10-l1.sh` (ExitGate, Scheduler, Baseline, Provenance, AcceptanceDecision + RunTest, ResumeTest) →
  exit 0; XML: ExitGateTest 22/0, SchedulerTest 21/0 (1 skipped, прежний), BaselineTest 9/0, ProvenanceTest 28/0,
  AcceptanceDecisionTest 10/0, RunTest 73/0, ResumeTest 8/0.
- Случаи по списку ревью: чинит → `done` без перезапуска → `Completed` (ProvenanceTest, S1); Failed@A → Passed@B →
  снова красная@C → stop → отказ (ProvenanceTest); новая регрессия с `Open` → не `Completed`, причина «fix and rerun»;
  унаследованная → `Completed` + раскрытие, **reopen** даёт те же строки и класс; `-x` с двумя Failed,
  удалённый/пропущенный тест, flaky, неидентифицированные, «прошёл на другом дереве», один перезапуск на определение и
  штамп (BaselineTest); смена числа/секрета → не Inherited, сдвиг номера строки и корня → тот же отпечаток, дубликат по
  всем случаям (BaselineTest); порядок квитанций при откате часов, история только своего workspace, `unquiet` виден
  свежему Scheduler (SchedulerTest); правила резолвера, признание и финальный `reaccept` через
  `Verifier.accept(acknowledged)` с `Register.empty` (ExitGateTest); baseline при `timeLeft = 0` не запускается,
  исключение материализации s0 дважды → один маркер (RunTest); e2e с сервером в фоне, заметка модели, нет ложного
  «pin lost», `unquiet` и восстановление (RunTest). «Два инкремента S1» и «ячейка-продолжение» покрыты на уровне
  правила: не текущее Unclassified не требует `Open`; stop перезапускает команду самой красной, а не выбор blast
  ячейки (тест «чинит → done» проходит через новую выборку дерева).
- Изменённые существующие тесты: только мои тесты первой сдачи (переписаны под правило) и ResumeTest (утверждение
  добавлено ещё в первой сдаче). Тест D-400 в ExitGateTest для blast/types-touched не менялся.
- «Сначала красный»: новые тесты используют новый API (`RegressionHold`, `TestOutcomes`, `StopSettle`) и на `0cbbd17`
  не компилируются; поведенческие расхождения со старым кодом прослежены по коду (старый `open()` снимал красную
  покрывающим `Passed` по команде, `forCheck` сортировал по времени, stop отменял фон до приёмки и т. д.); отдельного
  прогона на старом коде не было.

## Отклонения от карточки
- Блок `[>]` при регрессии по-прежнему снимается `Open`-заметкой (правило в `register/`, трогать нельзя); строгость —
  в приёмке (exit-гейт, верификатор, финальная приёмка, resume).
- «Один раз на попытку» → baseline один на определение на попытку, не более одного на проверку за stop.
- Файлы вне списка границ: `evidence/Receipt.kt`, `evidence/Receipts.kt`, `workspace/Workspace.kt` (`unquiet`),
  `graph/{Planning,RequirementGraph}.kt`, `verify/{ExitGate,Blast}.kt`, `cell/{Cell,CellContext}.kt` (3 строки),
  `campaign/Controller.kt` (проводка baseline, `acknowledged`, resume, восстановление обеих регрессионных проверок).
- Проводка baseline — только для автоматического baseline на stop (`Verify.regressionBaseline`); операция модели
  `verify(baseline)` осталась как в main («no baseline is configured», круг 5).

## Хвосты и риски
- Раннеры, не называющие прошедшие тесты (pytest `-q` без `-rA`, без JUnit XML): исправленная идентичность не может
  быть «показана прошедшей» → после зелёного перезапуска она Unclassified и не текущая: завершение без разрыва, но класс
  `unverified`.
- Baseline непригоден, где зависимости лежат в игнорируемых каталогах (`node_modules`) или набор включает созданные
  моделью файлы → Unclassified (D-400).
- types-touched — всегда Unclassified (нет идентичностей диагностик).
- C11 уже слита: фильтр baseline стоит в её `heldReceipts`.
- S3: история писателей разделена по workspace; интеграционная перепроверка признания писателя не получает.

# Часть 2 — P8.C.12

## Сделано (после ревью)
- **Порядок на stop (I):** слой приёмки при живом фоне → `settleForStop` (пауза 2 с, отмена, **подтверждение до 5 с**
  повторным `reattach`) → свежий штамп → повторный слой (перезапускает только ставшее устаревшим или неeligible) →
  `refreshRegressions`. Сервер в `run(bg)` доживает до e2e-приёмки.
- **Модель узнаёт (J):** `LayerRun.notes` → закреплённая строка «stop cancelled background run #h (handle …, argv)
  before certifying the tree: restart it if you still need it»; последующий poll говорит «cancelled by the stop's
  verification» или «ended … while the stop settled it; its end was recorded then» вместо ложного «pin lost».
- **Неподтверждённая отмена (K):** `Workspace.unquiet` — общий для всех Scheduler этого workspace (в т. ч. новых
  экземпляров контроллера): квитанции `unknown` + `concurrent`, валюта неeligible до тихого stop.

## Решения (черновые, без номеров)
- Вариант (а) сохранён, но после приёмки: ходов модели 0, приёмка, которой нужен сервер, проходит; handle переживают
  ячейку, поэтому модель получает строку об отмене.
- Неподтверждённая отмена → unverified (решение decider), не rework: harness уже пытался.

## Тесты
- RunTest `the stop verifies while background runs live, then settles them, tells the model, and certifies only a quiet
  tree` (e2e: приёмка проходит только пока жив `ping`/`sleep`); SchedulerTest `unquiet` у свежего Scheduler; ResumeTest
  8/0 без изменения сценария.

## Отклонения от карточки
- Нет по существу.

## Хвосты и риски
- Сервер, пишущий в дерево (логи вне scratch): повторный слой на тихом дереве упадёт без сервера — честный, но
  неприятный исход; лечится выводом логов в scratch.
- Пауза и подтверждение — константы (`stopGraceMillis` для тестов), не `Config`.

# Общее

## Ревью (находка → что сделано)
- A (свежая проверка на stop) → `refreshRegressions`: перезапуск команды красной на текущем дереве, один раз на
  определение и штамп, срок урезан; baseline — только для красной этого дерева.
- B (учёт по идентичностям) → `Regressions.hold`: падения копятся по ключу через все красные; снимаются только
  выполнением и прохождением на текущем дереве; совпадение команды или замыкания ничего не доказывает.
- C (три класса) → New / Inherited / Unclassified, как в правиле.
- D (отпечаток отдельно от показа) → `fingerprint` по нередактированному тексту; имя и сигнатура редактированы; ключ —
  дайджест; неоднозначность по всем случаям.
- E (порядок) → `forCheck` по `rowid`.
- F (один ответ) → (а) не текущее Unclassified не требует `Open`; (б) признание `acknowledged` в доказательствах
  инкремента и во всех вызовах `Verifier.accept` и ячейки; (в) история только своего workspace; (г) resume без baseline
  как `last`, `CHK-tests-blast` восстанавливается при открытии.
- G (baseline ограничен) → маркер `begin` до запуска, исключения не повторяются; срок урезан; один на проверку за stop.
- H (`Receipt.failures`) → `tests` только для двух проверок, с пределами; старые квитанции читаются (поле с
  умолчанием); отказ начинается с инструкции и команды; `notVerified` без «red» для устаревшей.
- I (порядок stop) → приёмка до улаживания фона, повтор на тихом дереве.
- J (модель узнаёт) → закреплённая строка; poll без «pin lost».
- K (подтверждение отмены; `unquiet` для свежих Scheduler) → `confirmEnd` до 5 с; `Workspace.unquiet`.
- Переименование `held`/`HeldRed` → `hold`/`RegressionHold` (пересечение с `heldReceipts` C11).

## Ревью, круг 2 (находка → что сделано)
1. Timeout теряет новое падение → падения берутся из любого прогона, сообщившего их (`reported`: Failed или с падающими
   тестами); снимает только завершённый (`finished`: Passed/Failed, eligible, необрезанный) — зависший ничего не снимает.
2. Неоднозначный Passed снимал → снимает только ключ из `passed` прогона, которого нет в его `ambiguous`; skipped не
   прохождение (неоднозначность считается по всем случаям).
3. Общий Passed вместо доказательства → неидентифицированные и обрезанные падения (`unidentified`: посчитано > сообщено,
   обрезанный список, Failed без идентичностей) держатся всю попытку как Unclassified; совпадение команды ничего не снимает.
4. Старой команде — новое замыкание → перезапуск восстанавливает `red.command` вместе с `red.inputClosure`; рескан видит
   переписанный teardown'ом файл → квитанция неeligible.
5. Нормализация стирала литералы → отпечаток больше не трогает числа, длительности, адреса, время, `file:line`; нейтральны
   только корни прогона (и их `/`-вариант); сдвиг строки → другой отпечаток → Unclassified (не New).
6. Отпечаток по потерянному тексту → `TestResult.detail` (новое поле, вторичный конструктор): JUnit-шейпер хранит
   type/message и тело; отпечаток по `detail ?: message`, предел длины — только для показа.
7. Fail-fast baseline доказывал New → New только если на s0 идентичность однозначно прошла, либо baseline выполнил все
   обнаруженные тесты (`passed+failed+errors+skipped ≥ discovered > 0`); иначе Unclassified «stopped before showing it».
8. Baseline на определение → на (attempt, checkId): любой baseline (и маркер) проверки в попытке закрывает `baselineDue`.
9. Stop-rerun не однократен → `runOne` без `runTriaged`; `Scheduler.beginRerun` пишет маркер `rerun_started` на
   (workspace, attempt, definition, stamp) до запуска; `unconfirmed` его учитывает (переживает reopen).
10. Срок baseline устаревал → `Baseline.timeLeft` перечитывается после материализации, прямо перед стартом: исчерпан —
    квитанция `unavailable` (`NO_ACTIVE_TIME`), процесс не стартует; иначе срок урезан.
11. Разделители путей → после замены корней разделители в пути под `<root>` приводятся к `/`.
- Сверено инвариантом каждое ветвление `hold`/`classify`: снятие, Inherited и New — только на положительном, однозначном,
  полном свидетельстве; падение в неeligible-прогоне, flaky, «не выполнялась», «не перезапущена», «не завершилась»,
  неоднозначность, непригодный baseline, другое окружение — Unclassified.
- Тесты: по каждой находке (BaselineTest: 1, 2, 3, 5, 6, 7, 8, 9, 10, 11; RunTest: 4, 9 — одна команда с замыканием красной,
  маркер, без повтора); ProvenanceTest: два инкремента S1 в двух ячейках — признание I1 переносится в I2 (`Completed`,
  `unverified`), а новая ячейка без touched показывает исправление перезапуском stop (`Completed`, `independent`).
- L1 после круга 2: ExitGateTest 22/0, SchedulerTest 21/0 (1 skipped), BaselineTest 10/0, ProvenanceTest 37/0,
  AcceptanceDecisionTest 10/0, RunTest 74/0, ResumeTest 8/0.
- Несогласий нет. Следствие, о котором стоит знать: раннеры без поштучных PASS (pytest `-q` без `-rA`/JUnit XML) и
  typecheck никогда не снимают удержание — завершение остаётся возможным (Unclassified не текущее), но класс `unverified`.

## Ревью, круг 3 (находка → что сделано)
- **Решение оркестратора — упростить правило:** удалены `Regressions.fingerprint` и вся нормализация, `FailedTest.fingerprint`,
  `TestResult.detail` и захват тела в JUnit-шейпере (откат к main), альтернатива New «baseline выполнил все обнаруженные
  тесты». Классы: New / FailedBefore / Unknown; `RegressionHold(regressions, failedBefore, unknown)`. Этим закрыты находки
  «поздний отпечаток стирает ранний», «текст падения с потерями» и «обрезанный список неоднозначностей даёт ложное
  Inherited»: сравнения текста нет, а FailedBefore больше не снимает предел класса. Проверено по коду: решение читает только
  ключи, статус, полноту записи, eligible и окружение.
- **A** (неполный отчёт снимал падение) → `Shaped.evidenceIncomplete` (новое поле, вторичный конструктор) из JUnit/Jest/
  Pytest-шейперов; `TestOutcomes.incomplete` = незавершённый захват, обрезанный лог или частично прочитанный отчёт;
  такой прогон ничего не снимает, как baseline ничего не доказывает (ни New, ни FailedBefore).
- **B** (сбой осиротит записанное падение) → квитанция без alias (сбой между записью и alias) считается в истории
  workspace: она может только удерживать больше. Выбор: восстановление без alias вместо нового поля в квитанции.
- **C** (reopen терял types) → при открытии попытки обе проверки получают `last` из последней не-baseline, не-маркерной
  квитанции (blast регистрируется, если не сеян) — до resume, `reaccept` и finish.
- **D** (pending терял признание) → `PendingCompletion.acknowledged` (сериализуется, вторичный конструктор);
  `resolve()` переносит его в `Resolved`, а commit — в доказательства инкремента.
- Существующие тесты на Inherited переведены в «было красным до изменений»: завершение без `Open`, строка раскрытия, класс
  теперь `unverified` (раньше без предела) — это требование нового правила, а не ослабление.
- Тесты: fail-fast baseline → не New (Unknown «not reported on s0»); на s0 failed → `Completed` без `Open`, `unverified`,
  строка раскрытия (ProvenanceTest, S1); passed на s0 и держится → отказ; два падения одной идентичности → New, не
  «было красным»; A — `JUnitXmlShaperTest` (отчёт, оборванный внутри падающего `t`) и `BaselineTest`; B — `SchedulerTest`;
  C — `ProvenanceTest` (mypy-проект, reopen); D — `AcceptanceDecisionTest` (через хранилище и `resolve`).
- L1 после круга 3: ExitGate 22/0, Scheduler 22/0 (1 skip), Baseline 10/0, Provenance 38/0, AcceptanceDecision 11/0,
  RunTest 74/0, Resume 8/0, JUnitXmlShaperTest 11/0 (1 skip, прежний).
- Возражений нет.

## Ревью, круг 4 (контрольная проверка; находка → что сделано)
1. Общий `run` (полный набор + blast одной командой) писал blast-квитанцию без записи → `Executed.testsByCheck`:
   `executedOf` строит запись для КАЖДОЙ регрессионной проверки из `sharing` (распознанные checks, pin.checks фона),
   идентичность перепривязана к её check id; `recordRun` берёт запись своей проверки.
2. Неeligible-прогон маскировал New и перезапуск → New, если любой eligible-прогон этого дерева однозначно сообщил падение
   (`failingEligible`); `unconfirmed` считает подтверждением только eligible-квитанцию или маркер.
3. Ключ без каталога → ключ = дайджест (canonical идентичности + нормализованный cwd квитанции); снятие и оба сравнения с s0
   идут по такой паре (baseline запускается с cwd красной).
4. (а) types-touched снимается своим eligible `Passed` на этом дереве при том же определении; (б) собственные запуски blast
   harness'ом: прямой `pytest`/`python -m pytest` без своего `-r…` получает `-rA` только в запускаемом argv (в квитанции —
   объявленная команда, определение не меняется); для jest/vitest/mocha безопасного способа в коде нет — команда не трогается;
   (в) причины раскрытия: «the runner lists no passed tests», «passed more tests than the record keeps (2000)».
5. Перезапуск types на stop: маркер несёт `checkDefinitionVersion` красной; если красная определена зарегистрированной
   проверкой (end-of-turn checker с файлами), перезапускается сама зарегистрированная проверка — квитанция с тем же
   определением; второй stop на том же дереве не перезапускает. Не больше одного перезапуска на проверку за stop
   (последнее определение; более старые красные остаются Unknown).
6. Лишнее `baseline != null` убрано (`usable`); KDoc `Resolver` переписан.
7. Ошибка сбора отчётов → исход процесса (exit, статус лога) и падения из лога сохраняются, запись неполная, Passed → Inconclusive;
   красная без идентичностей держится как Unknown. Так же для фона (`settleRecognized`).
8. JUnit: атрибут `file` testcase входит в идентичность (`file`, а classname — в suite); два `t` из разных файлов — разные
   идентичности; неоднозначная идентичность не снимает и New не доказывает (New требует однозначности и сейчас).
9. Baseline: живая редакция (`applyLive`, как в Verify) — незакрытый блок ключа скрыт; `Verify.timeLeft` при установке
   передаётся в `Baseline.timeLeft` — все пути baseline, включая `verify(baseline)`, читают актуальный остаток.
- Тесты: RunTest — общий `run` (1), сбор отчётов > 16 МиБ (7), перезапуск types под определением красной (5), остаток
  времени у baseline (9); BaselineTest — неeligible не маскирует New (2), ключ с каталогом (3), types-след, «runner lists no
  passed tests», «>2000» (4), `listingPasses` (4б), неоднозначность сейчас → не New (8), редакция ключа в логе baseline (9);
  JUnitXmlShaperTest — `file` в идентичности (8); ProvenanceTest — сквозной pytest red → fix → green без перечня passed
  (`Completed`, `unverified`, причина) и с перечнем (существующий тест «a fix proposed without a rerun…», без следа).
- Изменённый тест: «две ошибки одной идентичности» — теперь Unknown, а не New (п. 8: неоднозначность ничего не доказывает).
- Не делалось (хвосты): атомарные claim и `Receipt.workspaceId` из ветки Codex; `ignoreUnknownKeys` при чтении квитанций
  (`K/evidence/Receipts.kt`); предел числа перезапусков исторических красных за stop — сделан минимально: одна (последняя)
  команда на проверку за stop.

## Ревью, круг 5 (финальная проверка Codex; находка → что сделано)
1. P1 `Controller.kt:575` — при reopen обе регрессионные проверки восстанавливаются из истории квитанций, даже если
   discovery их больше не регистрирует (`Regressions.restored(receipt)`: blast — как прежде `Blast.restored`, types —
   проверка по определению своей последней квитанции, `last` = эта квитанция). Hold и cap класса считаются из истории.
2. P1 `Verify.kt:517` — ошибка сбора отчётов: квитанция и view каждой проверки как в main (`Inconclusive`, без exit,
   view — текст ошибки); только `CHK-tests-blast`/`CHK-types-touched` (из `sharing`/`pin.checks`) получают исход процесса
   (`Executed.outcomeByCheck`; `Passed` → `Inconclusive`) и падения из лога как неполную запись. Так же в `settleRecognized`.
3. P2 `JUnitXmlShaper.kt:165` — идентичность, display и ключи других проверок как в main; `file` хранится рядом
   (`TestResult.runnerFile`, `@Transient`) и входит только в ключ регрессионной записи (`Regressions.key(…, runnerFile)`).
4. P2 `Controller.kt:2231` — автоматический baseline отделён: `Verify(baseline = null)` как в main, а stop берёт
   `Verify.regressionBaseline` (тот же объект, тот же остаток времени). `verify(baseline)` модели — «no baseline is configured».
- Тесты: ProvenanceTest — reopen после удаления `mypy.ini`: types-touched восстановлен с `last`, hold Unknown (1);
  RunTest — отчёт > 16 МиБ: blast `Failed` + неполная запись, FULL-квитанция `Inconclusive`, без exit и записи, как в main (2);
  JUnitXmlShaperTest — идентичность и display как в main, `runnerFile` разводит ключи (3); VerifyTest — при заданном
  `regressionBaseline` `verify(baseline)` отвечает «unavailable … no baseline is configured», квитанций нет (4).
  Тесты main не менялись (тест круга 4 о `file` в идентичности переписан под п. 3).
- Часть 2: без живого фонового handle `settleRuns` ничего не ждёт и не отменяет — второго слоя, заметок и иного вывода
  poll на stop нет, поведение stop совпадает с main (кроме перезапуска/baseline удерживаемых регрессионных красных — часть 1).

## Пределы применимости
- Поштучный результат (снятие и New возможны): pytest с перечнем прошедших (`-rA`; harness добавляет его к своим прямым
  вызовам `pytest`/`python -m pytest`), JUnit XML отчёты Gradle и Maven (каждый `testcase`), Jest при наличии JSON-отчёта.
- Без перечня прошедших (pytest `-q` без `-rA` через обёртки/скрипты, Jest/vitest/mocha в терминальном выводе, go, cargo,
  unittest — только падения): падение не может быть показано исправленным; после зелёного прогона оно Unknown не текущее,
  раскрытие «the runner lists no passed tests», завершение возможно, класс `unverified`. New тоже невозможен (на s0 нет
  поштучного passed) — регрессия остаётся под правилом D-400.
- Больше 2000 прошедших или 200 падений в одном прогоне — запись обрезана: то же, причина «more tests than the record keeps».
- types-touched (mypy, pyright, tsc): поштучных падений нет; красная снимается только собственным eligible `Passed` на
  текущем дереве при том же определении (harness-проверка без объявленного kind обычно даёт `Inconclusive` на exit 0 —
  тогда снятия нет и класс `unverified`); New для types невозможен.
- Baseline на s0 непригоден, где зависимости в игнорируемых каталогах (`node_modules`) или набор включает новые файлы.

## Тесты (L2 и ABI)
- Первая сдача: L2 (карточка) 76 классов, 624 теста, 2 skipped, 0/0; ABI `0cbbd17`.
- Раунд ревью: `git merge main` дважды — `faa183d` (C3r `47c1149`) и `b1863ec` (C11 `878d5fe`: конфликт
  `Controller.kt` — восстановление `last` при resume теперь в `heldReceipts` C11, фильтр baseline перенесён туда;
  конфликт `docs/runtime/gates-termination.md` — взяты обе правки; `Resolution.kt` `Obligations` просмотрен).
- Финальный L2 после слияния C11 (`c10-l2.sh`): `--tests 'io.astrolabe.verify.*' --tests 'io.astrolabe.cell.*'
  --tests 'io.astrolabe.campaign.*' --tests 'io.astrolabe.tool.run.*' --tests 'io.astrolabe.tool.verify.*'
  --tests 'io.astrolabe.java.*' --tests 'io.astrolabe.evidence.*' --tests 'io.astrolabe.context.*' --continue` →
  exit 0; XML своего checkout (каталог очищен): 90 классов, 717 тестов, 2 skipped, 0 failures, 0 errors (известные
  flaky не срабатывали, повторов не было). До слияния C11 тот же набор: 90 / 709 / 2 / 0 / 0.
- `:core:updateKotlinAbi` → `3b69d6b`; относительно `main` удалений не-synthetic сигнатур нет (прежние полные
  конструкторы `Receipt`, `Executed`, `Resolved`, `Accepted`, `IncrementEvidence` сохранены вторичными; `LayerRun`,
  `Currency` — `@JvmOverloads`). `:eval:compileTestKotlin :core:checkKotlinAbi` → exit 0.
- Полный `./gradlew build` не запускался. Ветка запушена.

- Круг 2: `git merge main` → `a413b14` (main `98772fb`, только TODO.md, без конфликтов). L2 тем же набором пакетов (`c10-l2.sh`) → exit 0; XML своего checkout: 90 классов, 721 тест, 2 skipped, 0 failures, 0 errors. `:core:updateKotlinAbi` → `83517b6` (TestResult.detail + вторичный конструктор, Regressions.RERUN/isMarker; удалений не-synthetic сигнатур относительно main нет); `:eval:compileTestKotlin :core:checkKotlinAbi` → exit 0. Ветка запушена.

- Круг 3: `git merge main` → `5a58e19` (C14 `e9cbb0b`: авто-слияние `Controller.kt`, `CellContext.kt`, дампа; без конфликтов). L2 тем же набором (`c10-l2.sh`) → exit 0; XML своего checkout: 90 классов, 733 теста, 2 skipped, 0 failures, 0 errors (до слияния C14: 90 / 725 / 2 / 0 / 0). `:core:updateKotlinAbi` → `f7cf280`, удалений не-synthetic сигнатур относительно main нет; `:eval:compileTestKotlin :core:checkKotlinAbi` → exit 0. Ветка запушена.

- Круг 4: `git merge main` — уже актуально (`e9cbb0b`). L1: ExitGate 22/0, Scheduler 22/0 (1 skip), Baseline 12/0, Provenance 39/0, AcceptanceDecision 11/0, Run 77/0, Resume 8/0, JUnitXmlShaper 12/0 (1 skip). L2 (`c10-l2.sh`) → exit 0; XML своего checkout: 90 классов, 740 тестов, 2 skipped, 0 failures, 0 errors. `:core:updateKotlinAbi` → `568da66`, удалений не-synthetic сигнатур относительно main нет; `:eval:compileTestKotlin :core:checkKotlinAbi` → exit 0. Коммиты круга 4: `3fb46e4` (код и тесты), `0ab8c09` (docs), `568da66` (ABI). Ветка запушена.

- Круг 5: `git merge main` — уже актуально (`e9cbb0b`). L1: ExitGate 22/0, Scheduler 22/0 (1 skip), Baseline 12/0, Provenance 40/0, AcceptanceDecision 11/0, Run 77/0, Resume 8/0, JUnitXmlShaper 12/0 (1 skip), Verify 16/0. L2 (`c10-l2.sh`) → exit 0; XML своего checkout: 90 классов, 742 теста, 2 skipped, 0 failures, 0 errors. `:core:updateKotlinAbi` → `ae5610f`: относительно main удалены только `copy`/synthetic data-классов (`TestResult` получил `runnerFile`, 4-аргументный конструктор сохранён); `:eval:compileTestKotlin :core:checkKotlinAbi` → exit 0. Коммиты круга 5: `0500e3a` (код и тесты), `ae5610f` (ABI). Ветка запушена.

Статус: ГОТОВО К СЛИЯНИЮ — последний коммит `ae5610f`
