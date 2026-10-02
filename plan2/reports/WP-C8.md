# WP-C8 — идемпотентность pending-save после падения (P8.C.8, хвост A6 / D-383)

Ветка `v2/C8` (от `main` = `97ce447`), worktree ядра.

## Сделано
- **Сохранение до `Returned`.** `campaign/ReturnedCompletions.kt` (новый, `internal`): запись `ReturnedCompletion` —
  предложение (инкремент, заявленный статус, версия контракта, base/resulting stamp, env, reason), регистр (`Register`
  уже `@Serializable`), флаги целостности тестов (зеркало `KeptFlag`, т. к. `TestIntegrityFlag` в `verify/` не
  сериализуем, а `verify/` трогать нельзя), текст модели, признак `deferred` (`exit.pending != null`), `answer`,
  touched/changed пути, tier и строки pre-existing ledger (входы обзора инкремента S2+), и `seq` строки кампании,
  которую пишет `Returned`. Хранится строкой `packets` вида `returned_completion` (существующая таблица; схема не менялась).
- **Порядок «артефакт до строки».** `OpenedCampaign.advance(transition, before)` (новая `internal` перегрузка):
  вычисляет следующее состояние, вызывает `before(next)` (сохранение записи с `next.seq`), затем сохраняет строку
  кампании. `Controller.returned(...)` использует её в `runS0` и `runS1` вместо прямого `advance(Returned)`.
- **Один путь проверки.** `verify`, `settle`, `incrementReview` теперь принимают `ReturnedCompletion` вместо
  `CellExit.Completed` (живой возврат и возобновление проверяются одним кодом); `refreshPrescan` — touched + turns;
  `evidence(...)` — строки pre-existing ledger (`preexistingLines`). `Lifecycle.completed(completion)` (`internal`) —
  выделенная ветка `disposition` для завершённой ячейки, общая с возобновлением.
- **Возобновление.** `Controller.resumeReturned` вызывается в `runS0`/`runS1` сразу после `resumePending`
  (`resumePending(...) ?: resumeReturned(...)`). Условие «исход возврата не применён»: последняя запись попытки имеет
  `seq == state.seq` (после `Returned` не было ни одного перехода), ни один `PendingCompletion` не называет её ячейку,
  и ячейка записи — `Completed` и последняя ячейка инкремента в `InProgress` (ревью Fable, п. 1).
  Затем: контракт/дерево/env сдвинулись → запись в журнал и обычный путь (ячейка-продолжение, как раньше); иначе —
  восстановление последних квитанций реестра проверок из store, `refreshPrescan`, `answer` → `Answered`, `verify`
  (S2+: обзор инкремента через тот же `incrementReview`; текущий записанный обзор переиспользуется) и исход живого
  пути: `Accepted` → commit; `Pending` → `settle` (сохранение pending, решение) → общий `resumed(...)`, вынесенный из
  `resumePending`; `Refused` → S1: тот же учёт проверенной неудачи, что у живого возврата (общая функция
  `verifiedFailure`: guards, repair, лестница попыток, альтернатива), затем ячейка-продолжение; S0: стоп с fallback
  (D-64); прочий `Stop` → стоп.
  Журнал (`Reconcile`): `open: cell X returned but its outcome was never applied · verified again at @… with no model call`.
- Тесты инъекции сбоя в `ResumeTest` (5 новых): SQLite-триггер `RAISE(ABORT)` на `INSERT INTO pending_completions`
  (S0 и S1), на `INSERT INTO increments … status='Verified'` (commit), на `INSERT INTO campaigns` после записи
  (окно A) и отказ при перепроверке (S1).

## Решения
1. **Где хранить `Completed`?** → строка `packets` вида `returned_completion` (как `increment_split`, `integration`,
   записи обзора) → таблица-хранилище типизированных записей уже есть, миграция не нужна, старые базы совместимы →
   альтернатива: новая таблица `returned_completions` (схема v6) — не понадобилась.
2. **Как узнать, что исход возврата не применён?** → `seq` строки кампании после `Returned` + отсутствие pending для
   ячейки → каждый исход (commit, stop, answered, следующий dispatch) — это переход, а pending сохраняется явно; запись
   остаётся неизменяемой, без пометок «settled» и без записей в нормальном пути → альтернатива: явная пометка
   (UPDATE kind) в каждой точке исхода — больше правок горячего файла, легко пропустить ветку. Последствие: повторное
   открытие после обычной остановки (resumable) возврат не перепроверяет — продолжение идёт ячейкой, как и раньше.
3. **Квитанции при перепроверке.** → перед `verify` последний результат каждой проверки без `last` восстанавливается из
   последней квитанции этой work/attempt (`SqliteReceipts.forCheck`) и переоценивается `currency` против текущего
   stamp → свежий `Checks` после open не знает квитанций умершего процесса (без этого — «no receipt» и ложный pending;
   поймано тестом commit-пути) → квитанции — неизменяемые свидетельства харнесса, применимость решает `assess`, как
   `resumePending` доверяет сохранённым результатам (I3) → альтернатива: хранить `currencies` в записи (дубль
   свидетельств, без переоценки). Ограничение: квитанции S3-писателей с теми же id проверок в той же попытке могут
   оказаться «последними» (S3 по умолчанию выключен и этим путём не идёт).
4. **S2+ обзор инкремента на возобновлении.** → тот же `incrementReview` по сохранённым flags/changed/tier/pre-existing;
   текущий записанный обзор переиспользуется `ReviewCell` (0 вызовов), иначе запускается обзорная ячейка (это
   обязательный контроль §8.8, его сделал бы и живой путь) → без него S2 без `review:` пунктов принимался бы без обзора
   → альтернатива: аннулировать запись и пустить ячейку-продолжение (дороже: продолжение + обзор).
5. **`Refused` на возобновлении** (пересмотрено по ревью Fable, п. 2). → ветка `Disposition.Continue` живого `runS1`
   вынесена в `verifiedFailure(...)` и вызывается и живым путём, и возобновлением (S1) через тот же экземпляр
   `IncrementAttempts`/`CampaignRecovery` (их создание в `runS1` поднято до возобновления; оба восстанавливаются из
   журнала); D-367 (`refusedFailure`) соблюдается; запись хранит routed profile и квитанции пакета;
   `IncrementAttempts.refused` принимает tier/profile вместо `Routed.Selected` (один вызывающий, `internal`) → отказ
   считается попыткой, guards/лестница Ask/Blocked работают → S0: стоп с fallback, как живой S0 → альтернатива: запись
   проверенного отказа в журнал без лестницы (расходилось бы с живым путём).
6. **Строка «impact pre-scan refreshed» при возобновлении** (ревью Fable, п. 3). → `refreshPrescan(..., once = true)`
   не пишет строку, если для этой ячейки в журнале уже есть такая же → тривиально, один запрос журнала только на пути
   возобновления.

## Тесты
- L1: `./gradlew :core:test --tests 'io.astrolabe.campaign.ResumeTest' --tests 'io.astrolabe.campaign.ControllerTest' -q --console=plain`
  (+ `AcceptanceDecisionTest`): XML — ResumeTest 8/8, ControllerTest 22/22, AcceptanceDecisionTest 10/10.
- Новые (ResumeTest): `a death between an S0 cell's return and its pending save …`, `… an S1 cell's …` — падение на
  сохранении pending → открытие: 0 вызовов модели, `waiting_for_input`/`acceptance_decision`, причина из квитанции
  («cannot start»); второе открытие: один pending, число квитанций не изменилось, одна запись перепроверки; accept →
  `completed`, 0 вызовов. `a death between a return and its commit commits on reopen with no model call` — падение
  на commit → открытие: `completed`, 0 вызовов. S1-варианты открываются с `resumeExpected = true` и проверяют выбранную
  форму (маленький контракт иначе выбирается S0 — первая версия теста «S1» фактически шла через S0).
- Ревью: `a death between the kept return and its campaign row leaves the cell lost and a continuation runs` (триггер
  `BEFORE INSERT ON campaigns WHEN EXISTS (… kind='returned_completion')`): open помечает ячейку lost, ячейка-продолжение
  (2 вызова), без исключения и без перепроверки. `a refusal when a kept return is verified again counts as a failed
  attempt` (S1, падение на commit, последняя квитанция сделана красной в store): перепроверка → отказ → одна запись
  «substantive attempt», затем продолжение с правкой → `completed`.
- Негативные контроли: с отключённым `resumeReturned` три первых теста падают (`expected 0 but was 1`); без проверки
  «ячейка Completed и последняя» тест окна A падает с `IllegalStateException: only a completed latest cell's proposal
  commits; inc-1's latest is Failed` (ровно сценарий ревью); без учёта отказа — `expected 1 but was 0` попыток.
- L2: `./gradlew :core:test --tests "io.astrolabe.campaign.*" --tests "io.astrolabe.store.*" :core:checkKotlinAbi -q --console=plain`
  → exit 0; XML своего checkout: первый прогон (`e50cc4e`) 36 наборов / 217 тестов, после исправлений ревью (`4980d9d`)
  36 наборов / 219 тестов, 0 падений, 0 ошибок; `checkKotlinAbi` зелёный (публичный API не менялся: новые объявления
  `internal`, у `OpenedCampaign.advance(Transition)` изменилось только тело).

## Отклонения от карточки
- Карточка: «новая таблица/столбец — только если иначе нельзя» — не понадобилось (`packets`).
- Строки ~1060–1100 (`reaccept`) не менялись: там нет окна `Returned` (переприёмка по текущим квитанциям, без модели).
- Порядок — запись до строки `Returned` (а не после). **Исправлено по ревью Fable:** прежнее утверждение «падение между
  записью и строкой меняет `seq`, запись не используется» было неверным — `Transition.Lost` на open даёт ровно тот же
  `seq` (N+1), что записан в записи, и запись перепроверялась, а commit бросал исключение на каждом открытии. Теперь
  дополнительно требуется, чтобы ячейка записи была `Completed` и последней ячейкой инкремента в `InProgress`; тогда
  ячейка `Lost` → запись не используется, работа продолжается ячейкой (тест окна A).

## Ревью Fable
1. BUG (окно между записью и строкой `Returned`) — исправлено (`Controller.kt` `resumeReturned`, проверка статуса
   ячейки и инкремента), тест окна A + негативный контроль.
2. RISK (отказ при возобновлении в S1 обходил учёт попыток) — исправлено общей функцией `verifiedFailure`, тест
   «отказ считается попыткой» + негативный контроль.
3. Мелочь (повторная строка pre-scan) — `refreshPrescan(once = true)` на пути возобновления.

## Хвосты и риски
- Не повторяются на возобновлении: `router.record` (калибровочный лог в памяти умершего процесса), `cadence` после
  commit (полный набор всё равно идёт на финише), `boundary` S1 (STATUS-ревизия cell_end), извлечение заметок из
  пакета упавшей ячейки (`extract` по `packets`) — так же, как в `resumePending`.
- S3 (`S3Run.kt:470`) не охвачен: писатели возвращаются своим путём.
- В `runS1` создание `tiers`/`IncrementAttempts`/`CampaignRecovery` поднято перед возобновлением (до plan-ячейки);
  `CampaignRecovery` читает журнал при создании — plan-ячейка событий FAILURE/REPAIR не пишет, поведение то же.
- Повторный open при сдвинутом дереве/контракте/env пишет строку журнала «not verified» на каждом открытии до
  следующего перехода (безвредно).

Статус: ГОТОВО К СЛИЯНИЮ — последний коммит `4980d9d` (ветка `v2/C8`, запушена)
