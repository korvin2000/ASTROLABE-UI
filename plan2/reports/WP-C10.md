# WP-C10 — отчёт линии (ветка `v2/C10`)

Строгий регрессионный гейт (P8.C.10) и живой фоновый запуск при stop-верификации (P8.C.12). Ветка от `main`
(`611dbad`); первая сдача `0cbbd17`; раунд ревью (Codex 6 P1 + 3 P2, Fable 3 P1 + 5 P2) — коммиты `faa183d` (слияние
main с C3r `47c1149`), `2077aac` (код и тесты), `81303fe` (docs). K = core/src/main/kotlin/io/astrolabe.

## Итоговое правило (одним абзацем)
Для `CHK-tests-blast` и `CHK-types-touched` прогон записывает тесты поштучно и с пределом (`TestOutcomes`: падения с
непрозрачным ключом идентичности и отпечатком падения, ключи прошедших, неоднозначные ключи); квитанции читаются в
порядке записи и только своего workspace. Падение **удерживается** по идентичности через все красные прогоны попытки,
пока само не выполнится и не пройдёт в eligible-прогоне на текущем дереве (и нигде на нём не упадёт). Verify-on-stop
до решения перезапускает на текущем дереве команду каждой красной, стоящей за удержанием и не подтверждённой на этом
дереве (один раз на определение и штамп, срок урезан остатком времени; времени нет — не запускается), затем один
baseline на проверку на s0 для красной этого дерева (записан как начатый до запуска — сбой не повторяется). Класс на
идентичность: **New** — падает на этом дереве, baseline того же определения исполнил набор на s0 (eligible, прошёл или
упал со всеми падениями идентифицированными, то же окружение), идентичность однозначна и на s0 не падала → жёсткий
отказ, `Open` не снимает, текст начинается с «fix and rerun `<команда>`»; **Inherited** — та же идентичность упала на
s0 с тем же отпечатком → не разрыв, строка «pre-existing failure …»; **Unclassified** — всё остальное (другой
отпечаток, неоднозначность, нет/непригоден baseline, другое окружение, flaky, не выполнялась или не перезапущена на
этом дереве, неидентифицированные падения) → правило D-400, пока красный прогон текущий (`Open`; принятие инкремента
записывает признанные красные квитанции, и exit-гейт, верификатор, финальный `reaccept` и resume отвечают одинаково),
строка «failure not classified (…)», класс `unverified`.

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
  `campaign/Controller.kt` (проводка baseline, `acknowledged`, resume, восстановление blast).
- Проводка baseline включает операцию модели `verify(baseline)` в main-line ячейках.

## Хвосты и риски
- Раннеры, не называющие прошедшие тесты (pytest `-q` без `-rA`, без JUnit XML): исправленная идентичность не может
  быть «показана прошедшей» → после зелёного перезапуска она Unclassified и не текущая: завершение без разрыва, но класс
  `unverified`.
- Baseline непригоден, где зависимости лежат в игнорируемых каталогах (`node_modules`) или набор включает созданные
  моделью файлы → Unclassified (D-400).
- types-touched — всегда Unclassified (нет идентичностей диагностик).
- C11 перенесёт блок resume (`Controller.kt` ≈ 1866) в `heldReceipts` — фильтр baseline должен переехать с ним.
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

## Тесты (L2 и ABI)
L2_PENDING

Статус: В РАБОТЕ — последний коммит `81303fe`
