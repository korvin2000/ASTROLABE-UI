# WP-C11 — `IntegrityApproval.Human` требует вердикт человека (отчёт линии)

Ветка `v2/C11` от `main` (`611dbad`, слияние C3 `c871b18` в истории); в конце слит `main` (`9a656c5`, только TODO.md).
K = `core/src/main/kotlin/io/astrolabe`.

## Сделано
**Правило (под `IntegrityApproval.Human`).** Блокирующее integrity-обязательство (`integrity:<path>`) проходит только при
применимом одобряющем вердикте с `reviewer == Human`, пришедшем путём ревью хоста (последний шаг `path` = `human`).
Вердикт без признака или `model`: одобрение не снимает флаг — обязательство `Unverified`, `humanOnly = true`, причина
«integrity change needs a human review; approve by <signer> (model) attached»; отклонение модели с существенными
находками — как раньше `Failed` (rework, затем решение пользователя). Политика (`Decider.Policy`) такое обязательство не
покрывает; решение пользователя (`Decider.User`) покрывает (риск пользователя, класс — свидетельство агента).
Ядро правила:
- `K/verify/TestIntegrity.kt:45` `TestIntegrityFlag.humanOnly`; `:51` `blocksCompletion` (одобрение модели не снимает
  флаг с `humanOnly`); `:57` `needsPerson`; строка флага: «(model; a person must review)»; `:259` `reviewRequest` ставит
  `humanOnly`.
- `K/verify/Resolution.kt:429` `Obligations.flag` — результат `humanOnly`, понижение одобрения модели до `Unverified`;
  `:476` `Resolver.covered` — `Unverified && !humanOnly` для политики, пользователь — всегда (как для отклонений, D-338);
  `:47` `ObligationResult.humanOnly`, `:91` `DecisionItem.humanOnly`, `:420` `Obligations.HUMAN_REVIEW`.
- `K/verify/Review.kt:38` `ReviewRequest.humanOnly` — хост видит, что нужен человек.

**Три пути.**
1. *Живое разрешение:* `K/campaign/Controller.kt:2223` (лямбда `completionEvidence` ячейки) и `:2346`
   (`incrementReview`) помечают флаги `humanOnly` (`personal`, `:2370`); `:2428–2432` `completionEvidence` прикладывает к
   флагу вердикт только пути хоста и ставит `humanOnly`. Шлюз ячейки (`cell/Gates.kt`, не тронут) получает правило через
   флаги → `Obligations.flag`.
2. *Повторное использование ревью:* `K/delegate/ReviewCell.kt:165–171` — для пакета с `needsPerson` переиспользуется только
   запись с вердиктом человека на пути хоста (`ReviewRecord.byPerson`, `:100`); иначе хост спрашивается снова, запрос
   с `humanOnly` (`:184`).
3. *Resume pending:* `K/campaign/Controller.kt:1798` `personReviewed` — под `Human` результаты integrity отложенного
   завершения выводятся заново из записей ревью (хост спрашивается снова, если вердикта человека нет; флаг без
   сохранённого `kept` → `Unverified humanOnly`), так что ни одобрение модели, ни запись до C11 не завершают на resume;
   `:1685` `decide` — сохранённое решение политики не переиспользуется, пока есть `humanOnly`-пункты (хост спрашивается
   снова, чтобы мог ответить пользователь); `:1702` пункты запроса несут `humanOnly`; `:1779` `heldReceipts` перед
   решением (см. «Отклонения»).
- `K/campaign/ReturnedCompletions.kt` `KeptFlag.humanOnly` (сохранение признака в kept-записи).
- `K/Mode.kt` KDoc `IntegrityApproval` (Autonomous — для хоста, которому нужно одобрение моделью); docs
  `verification/acceptance-review.md` §8.6, `runtime/gates-termination.md` (провенанс-абзац).
- `Autonomous` не меняется: `humanOnly` не ставится, кэш/фильтр/покрытие — как раньше.

## Решения (черновые, без номеров)
- **Решение пользователя покрывает integrity под `Human`, политика — нет.** Вопрос: снимает ли `accept` пользователя
  обязательство, раз «только вердикт человека»? Выбор: покрывает как «принято без проверки» (I7), класс остаётся
  `agent_test` (поверхность не одобрена человеком) — симметрично D-338 «принять поверх отклонения — слово пользователя».
  Почему: пользователь — человек; иначе карточка решения с integrity-пунктом была бы тупиком. Безопасная альтернатива:
  только вердикт с `reviewer == human` (решение пользователя не покрывает) — тогда хосту остаётся лишь ревью-карточка.
- **Одобрение модели прикладывается к флагу как сведение**, а не отбрасывается: `flag.verdict` = вердикт пути хоста,
  `humanOnly` не даёт ему снять флаг. Так сохраняется существующая семантика отклонений (п. 5) и хост видит, чьё
  сведение приложено (`DecisionItem.by`, `findings`, причина). Вердикт судьи review-cell под `Human` по-прежнему не
  прикладывается (фильтр пути, D-320).
- **Где живёт признак — в данных, не в режиме резолвера.** `Resolver` чистый, `cell/Gates.kt` не трогается: режим
  переносится флагом (`TestIntegrityFlag.humanOnly`) → результатом (`ObligationResult.humanOnly`, сериализуется в
  `PendingCompletion`) → пунктом решения (`DecisionItem.humanOnly`) → запросом ревью (`ReviewRequest.humanOnly`).
- **Кэш ревью под `Human`: переиспользуется только вердикт человека** (и одобрение, и отклонение человека); запись модели
  или «нет вердикта» — не ответ, хост спрашивается снова (на следующем предложении или на resume). Альтернатива (оставить
  I3 и обходить кэш только на resume) потребовала бы параметра `obtain`; не выбрана — карточка требует правило в кэше.
- **Что видит хост, когда ждётся человек (данные для Studio):**
  - `Authority.review(ReviewRequest)`: `humanOnly = true` (ответить человеком, вердикт `reviewer: "human"`),
    `originalObligations` (`<path>: <исходник>`), `packetRef`/`diffRef`.
  - Остановка: событие `campaign.finished` — `outcome = waiting_for_input`, `stopCode = integrity_review` (после ревью-раунда; или
    `review_rejected` после круга rework по отклонению модели); `CampaignState.reason` — «acceptance needs a decision:
    integrity:<path>: … — integrity change needs a human review; approve by <signer> (model) attached».
  - `Authority.decide(AcceptanceDecisionRequest)`: пункт `obligation = "integrity:<path>"` (путь), `kind = Integrity`,
    `status = Unverified` (или `Failed`), `humanOnly = true`, `by` = подписант вердикта модели, `findings`, `reason`.
    Java: `getHumanOnly()` у `DecisionItem`, `ReviewRequest`, `ObligationResult`, `TestIntegrityFlag`.
  - В хранилище: `PendingCompletion.results[*].humanOnly`, `PendingCompletion.flags` — строки с «(model; a person must
    review)».
- **Что должна сделать Studio (отдельный шаг после C4):** (1) `DecisionService.review`: запрос с `humanOnly = true` не
  отдавать `ReviewPass` (модели), а поднимать ревью-карточку пользователю (`raise("review", …)`, ответ уже помечается
  `reviewer: "human"`); (2) `decide` в режиме `auto`: пункты с `humanOnly = true` не принимать политикой — поднимать
  карточку решения (как для `Failed`); ответ пользователя «принять как есть» = `Decider.User`; (3) показывать причину,
  путь и приложенный вердикт модели (`by`, findings) рядом с пунктом; (4) хост, которому достаточно одобрения моделью,
  ставит `Config.integrityApproval = Autonomous` (сейчас Studio его не задаёт — по умолчанию `Autonomous`); (5) после
  ответа человеком — resume: ядро само спросит ревью снова.

## Тесты
- Красное состояние (тесты до правки поведения, поля API добавлены без логики), L1 + `ReviewCellTest` +
  `AcceptanceEvidenceTest`: 72 теста, 5 падений — ровно новые/изменённые (`ProvenanceTest` ×3: ожидалось
  `WaitingForInput`, было `Completed`; `ReviewCellTest` ×1: запрос без `humanOnly`; `TestIntegrityTest` ×1).
- L1 после правки: `./gradlew :core:test --tests 'io.astrolabe.campaign.ProvenanceTest' --tests 'io.astrolabe.campaign.AcceptanceDecisionTest' --tests 'io.astrolabe.verify.TestIntegrityTest' --tests 'io.astrolabe.campaign.ResumeTest' --tests 'io.astrolabe.delegate.ReviewCellTest' --tests 'io.astrolabe.campaign.AcceptanceEvidenceTest' -q --console=plain`
  → XML: ProvenanceTest 25/0, AcceptanceDecisionTest 10/0, TestIntegrityTest 12/0, ResumeTest 8/0, ReviewCellTest 7/0,
  AcceptanceEvidenceTest 10/0 (tests/failures) — 72/0.
- Новые тесты: `ProvenanceTest` «under human integrity approval a host's model approving a test edit leaves the campaign
  waiting for a person, whose verdict completes it independent» (живой путь + resume + кэш, класс `independent`);
  «a pending completion whose integrity result a model's approval passed does not complete on resume under human
  approval» (resume записи до C11); `TestIntegrityTest` «under human integrity approval only a person's approval passes a
  flag, a model's stays attached and only a user's decision accepts it» (правило, покрытие политикой, отклонение модели,
  `Autonomous` без изменений); `ReviewCellTest` «under human integrity approval a stored model review is asked again for
  a person, and only a person's is reused».
- L2 (после `git merge main` → `a936e6b`, один раз): `./gradlew :core:test --tests 'io.astrolabe.verify.*' --tests 'io.astrolabe.campaign.*' --tests 'io.astrolabe.delegate.*' --tests 'io.astrolabe.java.*' -q --console=plain`
  → XML своего checkout: 56 классов (campaign 31, verify 15, delegate 8, java 2), **352 теста, 0 падений, 0 ошибок,
  1 пропуск** (`SchedulerTest`, существующее `assumeTrue(posix)` — на Windows не применимо); известные нестабильные не падали, повторов не было.
  `./gradlew :eval:compileTestKotlin` → OK. `./gradlew :core:checkKotlinAbi` → «ABI has changed» (ожидаемо: новые
  свойства/константа, `@JvmOverloads`-конструкторы; удалены только сигнатуры `copy` у четырёх data-классов и
  синтетические конструкторы по умолчанию) → `:core:updateKotlinAbi`, повторный `checkKotlinAbi` → OK, дамп
  `core/api/core.api` закоммичен (+37/−12). `provider-api`/`eval` API не менялись.

## Отклонения от карточки
- **Существующие тесты изменены осознанно:**
  - `ProvenanceTest` «a test edit a host's model approved completes as before…» (≈392, `testEditReviewedBy(null)` под
    `Human`) заменён новым тестом выше: теперь кампания ждёт человека, затем его вердикт завершает с `independent`.
  - `ProvenanceTest` «a test edit accepted without an approving review…»: под `Human` политика больше не покрывает
    integrity — первый прогон ждёт; второй прогон — `accept` пользователя, прежние проверки класса (`agent_test`) те же.
  - `ProvenanceTest` «a test file back at its s0 text…»: ячейка ставит флаг на переписанные байты (CRLF); под `Human` его
    снимает человек — решающий заменён с политики на пользователя; предмет теста (сравнение текста в итоговой квитанции)
    не изменился.
- **П. 5 (отклонение модели):** по коду сегодня отклонение хоста под `Human` (любой `reviewer`) — отклонение ревьюера:
  rework-раунд, затем `review_rejected` → решение пользователя (политика его не покрывает, D-338). Сохранено как есть;
  одобрение модели — только сведение.
- **Resume pending восстанавливал не все квитанции (найдено, исправлено, т. к. путь C11 от этого зависит):** после
  `accept` на resume (`resumePending` → commit → `stopOrFinish`) финальная приёмка читает свежий реестр проверок, и
  зелёный `run:`-пункт выглядел «no receipt» → лишний запрос решения и `accepted` вместо `tested`. `resumeReturned` уже
  восстанавливал последние квитанции; цикл вынесен в `heldReceipts` (`K/campaign/Controller.kt:1784`) и вызывается и в
  `resumePending` (`:1779`). Меняет и `Autonomous`-resume (в лучшую сторону: зелёные квитанции видны); L2 — см. «Тесты».
- `ReviewRecord.HUMAN` (константа `"human"`) и `ReviewRecord.byPerson` добавлены в публичный API (используются
  Controller'ом и ReviewCell); строка `"human"` в `FinishReceipt` не трогалась.

## Хвосты и риски
- **Повторный вопрос хосту в S1+:** под `Human` при хосте-модели инкрементное ревью сразу после ячейки спрашивает хоста
  ещё раз (запись модели не переиспользуется). Для хоста-человека — переиспользуется ответ человека. Стоимость — лишний
  вызов модели хоста, если хост (неправильно) отвечает моделью под `Human`.
- Сохранённое решение политики не переиспользуется, пока есть `humanOnly`-пункты: каждый resume заново спрашивает
  `decide` (хост может ответить политикой снова — кампания просто ждёт).
- S3 writers (`S3Run`, за флагом) integrity-обязательства не разрешает вовсе (флаги в `Verifier().accept` не передаются) —
  как и до C11.
- `FinishReceipt.covers` под `Human` по-прежнему засчитывает запись пути хоста с вердиктом модели как «одобрено моделью»
  (`acceptance_surface_model_approved`) — для класса верно (`agent_test`), завершить по ней теперь нельзя.
- ABI: публичные конструкторы `TestIntegrityFlag`, `DecisionItem`, `ReviewRequest` получили `@JvmOverloads` (прежние
  сигнатуры конструкторов сохранены); бинарно несовместимы только `copy(...)` этих классов и `ObligationResult` (как у
  любой добавки поля data-класса); Java-кода, вызывающего их `copy`, в ядре и Studio нет.
- Studio пока отвечает на `review` моделью (`ReviewPass`) и в `auto` принимает решения политикой: под `Human` её задачи
  будут ждать человека, пока не сделан шаг Studio (см. «Решения»). Studio по умолчанию работает в `Autonomous` — для неё
  поведение не меняется.
- Окружение: scratchpad общий для параллельных линий — чужой `l2.sh` перезаписал мой во время прогона (мой `sh` остановлен
  до чтения чужих строк; прогон тестов завершён самим Gradle-клиентом, XML своего checkout). Скрипты линии теперь `c11-*`.

## Ревью (Fable по `63ad913`, «сначала исправить») — находка → что сделано
Перед правками слит `main` (C3r `47c1149`, без конфликтов) → `cdecb3d`. Правки — `f53384a` и следующие.
- **P1. Флаг жил только в ячейке, сделавшей правку** (rework / void pending / partial → следующая ячейка `done` без
  флага). → Под `Human` флаги приёмки = флаги ячейки + **все изменения поверхности приёмки с s0 на текущем дереве**
  (`Controller.acceptanceFlags`; `FinishReceipts.surfaceChanges` — вынесено из итоговой квитанции, правило D-396 «текст
  равен с точностью до окончаний строк, хвостовых пробелов и пустых строк»). Сменой ячейки не обойти; CRLF-перезапись
  флагом дерева не становится. Флаг с дерева берёт обоснование, записанное прежней ячейкой для этого пути
  (`ReturnedCompletions.all`), иначе агент должен обосновать (как раньше). Применено в живом пути, `verify`, `settle`,
  `incrementReview`, resume. `Autonomous` не меняется. Тесты (красные без правки, проверено пробой): rework → `done`
  ждёт человека в S0 и S1, затем вердикт человека → `independent`; void pending сдвигом дерева → новая ячейка `done`
  ждёт (`integrity_review`). Partial/лимит идёт тем же путём (новая ячейка → флаги с дерева), отдельным тестом не
  покрыт; S2 отдельным тестом не покрыт (маршрутизация S2 под `Human` — `AcceptanceEvidenceTest`).
- **P2.1. Непригодный вердикт человека кэшировался навсегда.** → `ReviewRecord.byPerson` требует `unavailable == null`;
  вопрос для человека (тот же `packetRef` = дифф s0→кандидат, кандидат, ревизия, критерии, integrity) **сохраняет id
  первого запроса**, и поздний ответ человека на любой прежний запрос этого вопроса засчитывается (KDoc
  `ReviewRequest`). Тест `ReviewCellTest`: null → вердикт по чужому кандидату (непригоден, спрашивается снова под тем же
  id) → вердикт со старым id (засчитан, далее переиспользуется) → на другом вопросе вердикт с новым id засчитан.
- **P2.2. Resume пересчитывал только integrity.** → `personReviewed` под `Human` пересобирает из одной свежей записи
  integrity, `check:`/`review:`-пункты и `review:<inc>`; добавляет integrity-результаты флагов с дерева.
- **P2.3. S3 writers под `Human`.** → Сочетание `IntegrityApproval.Human` + `Flags.s3Writers` — ошибка конфигурации
  (`Config.init`, `IllegalArgumentException`), записано в KDoc `IntegrityApproval` и docs §8.6. Тест в ProvenanceTest.
- **P2.4. Повторные вопросы и машинный признак.** → Хост спрашивается о человеке **один раз за открытие** на
  (инкремент, кандидат, ревизия) (`OpenedCampaign.personAsked`, `Controller.personReview`; повтор читает сохранённую
  запись); reopen спрашивает снова под тем же id. **Машинный признак для Studio: `StopCode.IntegrityReview`, wire
  `"integrity_review"`** — в `CampaignState.stopCode`, событии `campaign.finished.stopCode` и
  `AcceptanceDecisionRequest.code`, когда ждёт хотя бы один `humanOnly`-результат без вердикта (отклонение модели после
  круга rework остаётся `review_rejected`). Пункты по-прежнему несут `humanOnly`.
- **P3.** `Decider.User` закрывает integrity без вердикта — оставлено, записано в KDoc `Resolver` и в «Решения»
  (пользователь — человек; пункт «принят», не «проверен», класс — свидетельство агента). Тесты `AcceptanceEvidenceTest`
  переименованы/уточнены (ответ модели прикладывается, флаг ждёт человека). `incrementReview`: ревью для человека идёт
  мимо пометки «task limit» (вызова модели нет). Добавлены тесты: отклонение модели → rework → `review_rejected` →
  одобрение человека → `independent`; resume с сохранённым решением User (без повторного `decide`, класс `agent_test`);
  `heldReceipts` в `Autonomous` (в ProvenanceTest — там фикстура с зелёной командой; красный без `heldReceipts`).
- Красная проба: с отключёнными флагами дерева и `heldReceipts` ProvenanceTest 31 → 8 падений (все новые P1/resume);
  с правкой — 31/0.
- Studio (дополнение к «Решениям»): ветвиться по `stopCode == "integrity_review"`; дедуплицировать карточку ревью по id
  запроса (он стабилен для того же вопроса); можно отвечать поздно на старый id.
- Риск: под `Human` изменение теста, одобренное человеком в инкременте I1, в S1 снова спрашивается для I2 (флаг с дерева,
  запись ревью привязана к инкременту) — безопасно, но лишняя карточка.
- Проверки раунда ревью: L1 (6 классов) после правки — ProvenanceTest 31/0 (после переноса обоснований; до него 2
  падения: флаг с дерева без обоснования давал gap «without a recorded justification»), AcceptanceDecisionTest 10/0,
  AcceptanceEvidenceTest 10/0, ResumeTest 8/0, ReviewCellTest 8/0, TestIntegrityTest 12/0.
  L2 после `git merge main` (`cdecb3d`): `--tests 'io.astrolabe.verify.*' --tests 'io.astrolabe.campaign.*' --tests
  'io.astrolabe.cell.*' --tests 'io.astrolabe.delegate.*' --tests 'io.astrolabe.java.*'` → 71 класс (campaign 31, cell 15,
  verify 15, delegate 8, java 2), **504 теста, 0 падений, 1 пропуск** (`SchedulerTest`, `assumeTrue(posix)`);
  `:eval:compileTestKotlin` OK; `:core:checkKotlinAbi` → изменён (+`StopCode.IntegrityReview`) → `updateKotlinAbi`,
  повторная проверка OK, дамп закоммичен (`80e0cd9`).

Статус: ГОТОВО К СЛИЯНИЮ · 80e0cd9
