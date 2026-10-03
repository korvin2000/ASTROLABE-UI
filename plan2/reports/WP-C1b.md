# WP-C1b — отчёт линии (ветка `v2/C1b`)

## Сделано
- **П. 1 (красная необязательная проверка; граница уточнена ревью, см. «Ревью»).** `Obligations.mandatory(check)`:
  необязательны только (i) проверки `Origin.Model` (`CHK-model-*`), (ii) объявленные хостом/пользователем
  (`Origin.User`/`Origin.Amended`), которых не требует ни один пункт приёмки, вида не Full/Quality, (iii) lint; все
  остальные — прежнее правило `main`. `Currency.mandatory` (умолчание `true`) заполняет `Scheduler.currency`.
  `Resolver.increment`: красная необязательная — не пробел, а запись runtime `Resolved.knownRed`:
  «`<check> known red since receipt #N (recorded by the runtime)`» (`Obligations.knownRed(checkId, currency)`).
  `Currency.knownRed` выводит `Scheduler` из истории квитанций проверки этой попытки: первая красная после последней
  квитанции `passed` (любой штамп; timeout/inconclusive/нет квитанции не снимают), по алиасу.
  Обязательная красная вне пунктов инкремента — по-прежнему `red:` без Open-заметки → rework; красный пункт
  инкремента — его провал, как было.

  | Проверка (seed и встроенные) | Вид · происхождение | Класс C1b |
  |---|---|---|
  | `CHK-accept-<AC>` | Acceptance · origin пункта | прежнее правило (пункт приёмки) |
  | `CHK-full` | Full · Harness | прежнее правило |
  | `CHK-quality-gate[-n]` | Quality · Harness | прежнее правило (по виду, любой триггер) |
  | `CHK-tests-blast` | Unit · `null` (Blast, StepBoundary) | прежнее правило |
  | `CHK-types-touched` | Type · Harness (EndOfTurn) | прежнее правило |
  | `CHK-l4-measurement*`, прочие встроенные/без origin | — | прежнее правило |
  | `CHK-lint` | Lint · Harness | known red (runtime) |
  | `CHK-model-<hash8>` | Unit/Type · `Origin.Model` | known red (runtime) |
  | проверка хоста/пользователя без пункта | не Full/Quality · User/Amended | known red (runtime) |
  Валидатор регистра (`[>]`): `Cell.redChecks` отдаёт только обязательные красные (C1a исключал лишь `CHK-model-*`).
  Итоговая квитанция: строки known red добавляются в `openItems` (где раньше стояла бы Open-заметка модели).
  KDoc «The one acceptance rule» обновлён.
- **П. 3 + п. 7 (решение владельца; дополнение оркестратора).** `Verdict.reviewer: ReviewerKind` (`model` | `human`,
  wire `"model"`/`"human"`, умолчание `Model`; явный v1.0-конструктор из 10 параметров для Java; JSON без поля
  читается как `model`). `FinishReceipt.build`: пункт `check:`/`review:`, одобренный вердиктом не-`human` (судья
  review-ячейки или модель хоста), — свидетельство агента (`Author.Model` → класс ≤ `agent_test`); изменение
  acceptance surface, снятое только одобрением модели, по-прежнему разрешает завершение (`acceptanceSurfaceUnreviewed`
  не меняет смысла), но затронутые `run:` пункты остаются свидетельством агента; новое поле
  `acceptanceSurfaceModelApproved` перечисляет такие пути. `verifiedBy`: `human` (вердикт с `reviewer = human`),
  `host_model` (ответ хоста без признака человека), иначе тир судьи. Решение о приёмке не менялось.
- **П. 2 (подсказка достаточности).** Гейт `Gates.SUFFICIENCY` (`"sufficiency"`, после Exit в `Gates.s0()`), канал —
  обычная подсказка `[A]`, байты `[S]` не меняются. Срабатывает **один раз за ячейку** (`GateKey("sufficiency",
  "ready")` в `fired` ячейки), только у реализующей ячейки (`GateState.implementing`, ставит `Cell` для роли с пакетом
  `Result`), не в ход предложения завершения, когда все `run:` пункты инкремента `Passed` на текущем дереве и резолвер
  D-337 не оставляет агенту ничего (`Failed`/`Other` пробелов нет; `Unverified` допустимы только для слова
  рецензента, которое получит само предложение). Текст: «evidence suffices: AC-1 green on this tree and nothing left
  to close — finish now; further checks are optional» либо «…; the review of AC-2 follows the proposal».
- **П. 4 (хвост C2 F5).** Сужено: `Verify.recognize` больше не подставляет «все требования контракта» при пустых
  `requirementIds`; без требований инкремента команда модели остаётся обычным `run` (как при `modelChecks = false`).
  В ячейке `requirementIds` всегда непусты (`Increment` требует непустой список, `Cell` выставляет его), так что
  поведение кампаний не меняется; запасной путь достигался только `Verify` вне ячейки (тесты, прямые хосты).
- **П. 5 (живой фоновый handle при stop-верификации)** — исследован, не исправлен (см. «Хвосты»): локальная правка
  меняет решение о приёмке, а не только запись.
- **П. 6.** `CheckRun.command: Command?` (argv + workspace-relative cwd из определения проверки) — вместе с
  `checkOrigin`, `evidenceKind`, `outcome` хост читает проверки `Origin.Model` из итоговой квитанции (Java: геттеры
  `JavaCampaignHandle.finish()`).

## Решения (черновые, без номеров)
- **Что «обязательная»** → решение оркестратора по ревью (вариант «b»): см. таблицу в «Сделано». Первый вариант
  ветки (`required || trigger == CampaignEnd`) отпускал blast и types-touched — ослабление относительно `main`.
- **Запись known red выводится из записей, а не пишется в регистр.** Квитанции долговечны; запись = функция истории
  квитанций проверки (Scheduler → `Currency.knownRed`; Resolver — для выхода, FinishReceipt — для итога). В регистр
  (Dp1) harness не пишет: в direct-профиле STATE необязателен.
- **Признак рецензента** → `Verdict.reviewer: ReviewerKind { Model, Human }`, умолчание `Model` (класс не
  завышается; хост с живым человеком ставит `human` явно; Studio — `model` для review pass). Человеческий путь
  `ReviewRecord.path = [..., "human"]` больше не означает «человек»: значит только «ответил хост».
- **Подсказка достаточности — один раз за ячейку**, а не за штамп: повтор после правки дерева был бы шумом; новая
  ячейка (продолжение) может получить её снова. Условие — то же правило D-337 («вызвано, не пересказано»), без
  отдельной формулы; для ролей не-`Result` (probe, review) не срабатывает. Безопасная альтернатива — только при
  `Resolution.Complete` (тогда инкременты с `check:`/`review:` подсказку не получали бы никогда: вердикт приходит
  лишь с предложением).
- **П. 4: сузить, а не оставить.** Безопасный вариант не завышает класс: несвязанная проверка модели не должна
  поднимать требование до `agent_test`. Вариант «не усиливать требования с собственными объявленными проверками»
  отвергнут: он меняет правило свёртки C2 и для проверок с корректными `requirementIds` (ломает случай №3 плана
  «объявленная принята без проверки + зелёный тест агента → `agent_test`»).
- **Пункт `check:`/`review:` с одобрением модели** → свидетельство агента (как испорченный `run:` пункт C2), а не
  `unverified`: класс отвечает «кем проверено» (C2); требование остаётся `independent`, если все его объявленные
  исполнимые проверки прошли (правило свёртки C2 не менялось).

## Тесты
- L1 (после цикла 1): `./gradlew :core:test --tests 'io.astrolabe.cell.GatesTest' --tests 'io.astrolabe.verify.ExitGateTest' --tests 'io.astrolabe.campaign.ProvenanceTest' --tests 'io.astrolabe.campaign.AcceptanceDecisionTest' -q --console=plain`
  → XML: GatesTest 19/0, ExitGateTest 19/0, ProvenanceTest 22/0, AcceptanceDecisionTest 10/0 (tests/failures).
- L1 (после цикла 2, подсказка): те же классы → GatesTest 21/0, ExitGateTest 19/0, ProvenanceTest 22/0,
  AcceptanceDecisionTest 10/0.
- Новые случаи: ExitGateTest — какие проверки обязательны; красная необязательная → запись runtime без Open-заметки
  → зелёная → запись снята (устаревшая красная остаётся; обязательная — по-прежнему `red:`; exit-гейт не
  отказывает). GatesTest — подсказка ровно один раз за ячейку и её условия; вариант с `review:`. ProvenanceTest —
  красный тест модели завершает кампанию без Open-заметки, known red в `openItems`, `CheckRun.command`; known red
  снят после зелёного прогона; `check:` пользователя, одобренный моделью хоста → `agent_test`, `host_model`, а
  человеком → `independent`; правка теста под `IntegrityApproval.Human`, одобренная вердиктом без признака →
  завершение как раньше, `acceptanceSurfaceModelApproved`, класс `agent_test`; одобренная человеком →
  `independent`; JSON вердикта без поля → `model`. RunTest — без `requirementIds` проверка модели не создаётся.
- L2 (один раз, после `git merge main` = `33f6add`): `:core:test --tests 'io.astrolabe.verify.*' --tests 'io.astrolabe.cell.*' --tests 'io.astrolabe.campaign.*' --tests 'io.astrolabe.tool.run.*' --tests 'io.astrolabe.tool.verify.*' --tests 'io.astrolabe.java.*' --continue`
  → exit 0; XML своего checkout: 75 классов, 597 тестов, 2 skipped, 0 failures, 0 errors (flaky не срабатывали).
- `./gradlew :core:updateKotlinAbi` → дамп обновлён (`c9f5579`); `:eval:compileTestKotlin :core:checkKotlinAbi` →
  exit 0.
- **После ревью** (`94abd4d`): L1 + SchedulerTest → ExitGateTest 20/0, GatesTest 22/0, ProvenanceTest 24/0,
  AcceptanceDecisionTest 10/0, SchedulerTest 18/0 (1 skipped, прежний). `git merge main` (`a0a77b3`: Dp1 + Dp2;
  дамп ABI слился автоматически, затем регенерирован). L1 на слитом состоянии — те же числа.
- **Поправка п. 4** (`d806a35`), только L1: SchedulerTest 18/0 (1 skipped, прежний), ExitGateTest 20/0,
  ProvenanceTest 24/0, GatesTest 22/0; L2 не повторялся (по указанию).
- **L2 после ревью и слияния:** `:core:test --tests 'io.astrolabe.verify.*' --tests 'io.astrolabe.cell.*' --tests 'io.astrolabe.campaign.*' --tests 'io.astrolabe.context.*' --tests 'io.astrolabe.tool.run.*' --tests 'io.astrolabe.tool.verify.*' --tests 'io.astrolabe.java.*' --continue`
  → exit 0; XML (каталог результатов очищен перед прогоном): 86 классов, 654 теста, 2 skipped, 0 failures, 0 errors.
  `:core:updateKotlinAbi` → `5c8ab09`; `:eval:compileTestKotlin :core:checkKotlinAbi` → exit 0. Относительно `main`
  в ABI нет удалённых не-synthetic сигнатур (12-аргументный конструктор `Resolved` возвращён вторичным; `Verdict`
  v1.0-конструктор сохранён; `CheckRun`/`GateState`/`FinishReceipt` — `@JvmOverloads`).

## Ревью (Fable «сначала исправить» + консультация Codex; решения оркестратора) — исправлено в `94abd4d`
1. **P1 граница** → `Obligations.mandatory` по варианту «b» (таблица выше): blast, types-touched, Full/Quality и
   всё встроенное/без origin — прежнее правило `main` (Resolver: красная текущая+eligible → rework без Open; валидатор
   `[>]`: последняя `failed` → нужна Open-заметка). Тест ExitGateTest: сценарий S0 (AC-1 зелёный, blast красный) →
   rework «CHK-tests-blast is red without an Open item naming it»; то же для types-touched; с Open-заметкой — Complete.
2. **Членство в гейте кампании по виду** → `kind in (Full, Quality)` обязательны при любом триггере (тест:
   Quality/OnDemand, Full от пользователя — обязательны).
3. **Префикс `CHK-model-*`** больше ничего не освобождает сам: только `Currency.mandatory == false` (тест: ручная
   валюта модели с `mandatory = true` → прежнее `red:`).
4. **Снятие записи** → только более поздняя квитанция `passed` той же проверки в этой попытке, на любом дереве
   (поправка оркестратора, `d806a35`: зелёная, после которой дерево сдвинулось, — устаревшая, а не красная); ссылка на
   первую красную после последней `passed`, по алиасу `#N` (`Scheduler.knownRedSince`). Тест SchedulerTest: red →
   timeout → запись остаётся → ещё red → ссылка на первую → passed → снята → правка дерева → записи нет → новая red →
   новая запись; обязательная (`CHK-full`) записи не получает.
5. **Класс** → обязательная проверка вне пунктов приёмки и гейта кампании (blast, types-touched, прочие встроенные),
   красная и текущая на финальном дереве, ограничивает класс кампании `unverified` и попадает в `notVerified`
   («`<id>: red on the final tree`»); классы требований не меняются; known red класс не ограничивает (тест
   ProvenanceTest). Eligibility не требуется: квитанции types-touched (чекер) никогда не eligible.
6. **Подсказка достаточности** → не срабатывает после отказа exit в ячейке (ключ `exit` в `fired`), в ячейке-
   продолжении решения `rework` (`GateState.reworked`; Cell узнаёт по закреплённой строке «rework requested by …» из
   `Controller.reworkNotes`), при красной текущей обязательной проверке независимо от Open-заметки (строже ревью:
   без требования eligible); называет known red; ранний выход по ключу в `fired`. Тесты GatesTest: после отказа exit,
   при `rework`, с Open-заметкой на `CHK-full`.
7. **Мелочи** → docs `acceptance-review.md` §8.7 и `gates-termination.md` под новое правило; `Resolved` — прежний
   12-аргументный конструктор вторичным; тест «судья review-ячейки (scripted judge, Autonomous) одобрил правку теста →
   завершение как раньше, `acceptanceSurfaceModelApproved`, класс `agent_test`».

## Отклонения от карточки
- `cell/Cell.kt` (вне перечисленных границ, не в чужих): строка `redChecks` — Open-заметку модели требует ещё и
  валидатор `[>]`, не только Resolver; и `implementing = implementingCompletion` в `GateState` (п. 2).
- `tool/verify/Verify.kt` (вне границ, не в чужих): одна строка `recognize` для п. 4 — там живёт подстановка «все
  требования»; фикстура `RunTest.Recognizing` теперь выставляет `requirementIds = ["R1"]`, как это делает ячейка.
- Ссылка плана `Resolution.kt:371-377` устарела: актуальное место — цикл «red outside the required set» в
  `Resolver.increment`.
- `verify/Review.kt` — по дополнению оркестратора (п. 7).
- Тест `ExitGateTest` «what the agent must close…»: красная `CHK-lint` заменена на `CHK-full` — lint теперь
  необязательная (её случай — новый тест); правило I2 проверяется на обязательной проверке. Тест ProvenanceTest
  «the model's own check item approved by a reviewer…»: хост теперь явно ставит `reviewer = human` — без признака
  вердикт хоста считается вердиктом модели (решение владельца), а смысл теста — одобрение человеком.

## Хвосты и риски
- **П. 5 — живой фоновый handle во время stop-верификации (не исправлено, предложение владельцу/C3).** Факты по
  коду: `Scheduler.exclusive` держит `workspace.mutation`, но процесс, запущенный `run bg=true`, замок не
  останавливает; рескан ловит изменения содержимого/метаданных проверенных входов (квитанция ineligible), не ловит
  восстановление тех же байтов и mtime, записи вне входов, общие порты/файлы вне дерева (нестабильный исход). Любое
  локальное исправление в `Scheduler`/`tool/run` меняет решение о приёмке, а не только запись: пометить квитанции
  «несертифицирующими» при живом handle — значит забытый dev-сервер превращает завершение в `Await` (решение
  человека); проверка: `campaign.ResumeTest` (`sleep 30` в фоне живёт во время `verify` и `done`) перестал бы
  завершаться `Completed`. Предложение (~60–80 строк + тесты): (1) `Run.live()` — handles кампании (`Handles.open()`
  с фильтром владения как `ownedHandle`, статус уточнить нулевым `os.poll`); `Scheduler` получает зонд
  `liveRuns: () -> List<String>` (ставит ячейка); (2) квитанция `exclusive` при живом handle получает
  `Limit("concurrent", "background run <alias> live during the check …")` — видимость без изменения допуска;
  (3) на выбор владельца: (а) Exit-гейт отказывает с пробелом «background run #h live: wait for it or cancel it
  before proposing completion» (Rework — модель может действовать), либо (б) такие квитанции `InputStability.Unknown`
  (никогда не сертифицируют). Рекомендую (2)+(а): модель сама закрывает handle, приёмка честная, dev-сервер не
  ведёт к `Await`; ResumeTest тогда должен `cancel` handle перед `done`.
- **Предложение новой задачи (а) — строгий регрессионный гейт** (не делалось, по указанию): blast/types-touched
  блокируют без Open-лазейки, унаследованные падения исключаются через `PreexistingLedger.classify`
  (`core/src/main/kotlin/io/astrolabe/verify/Baseline.kt:82`, в приёмке сейчас не используется); правило «красная до
  `passed`» и для приёмки — сейчас `failure → timeout` снимает красное (`verify/Check.kt:278`,
  `verify/Scheduler.kt` `currency`: `red = outcome == Failed` последней квитанции).
- **Предложение новой задачи (б) — `IntegrityApproval.Human` требует `reviewer == human`** (не делалось; меняет
  решение о приёмке и поток Studio, нужно решение владельца): `delegate/ReviewCell.kt:171` всегда ставит путь
  `human` ответу хоста; `campaign/Controller.kt:2202` (`flagVerdict`) пропускает любой вердикт пути `human`; обычная
  политика не должна покрывать снятый вердикт (`verify/Resolution.kt` ≈ 424, `covered`); повторное использование
  ревью — `ReviewCell.kt:158`; resume — `Controller.kt:1519`. Сейчас C1b меняет только класс.
- **Связь «ячейка продолжает rework» — по тексту закреплённой строки** «rework requested by …»
  (`Controller.reworkNotes`); надёжнее — явный флаг `CellContext` от Controller (C3).
- **Known red промежуточных инкрементов**, позже позеленевших на финальном дереве, в итог не попадают (запись снята);
  в `IncrementEvidence` они не сохраняются (граф — C3/Controller). История квитанций читается на каждый расчёт
  валюты необязательной проверки (`forCheck`, обычно несколько строк).
- **Подсказка достаточности** занимает слот из 4 строк `[A]`; если ход отрезан лимитом подсказок, она уже в `fired`
  и не повторится (редкий край).
- **`verifiedBy = host_model`** для ответа хоста без признака человека — новая метка (раньше `human`); Studio (C4)
  должна проставлять `reviewer = "model"` для review pass (умолчание и так `model`) и `"human"` — только для
  ответа живого человека. Имя поля: `Verdict.reviewer`, тип `ReviewerKind`, значения JSON `"model"` | `"human"`
  (умолчание `model`; JSON без поля читается как `model`).
- `acceptanceSurfaceUnreviewed` сохраняет смысл «ни одно одобрение не покрыло»; пути, снятые только моделью, —
  в новом `acceptanceSurfaceModelApproved` (класс ≤ `agent_test` для затронутых `run:` пунктов).
- Публичный API: `Currency.mandatory`, `Resolved.knownRed`, `Obligations.mandatory/knownRed`, `GateState.implementing`,
  `Gates.SUFFICIENCY`, `ReviewerKind`, `Verdict.reviewer` (+ v1.0-конструктор), `CheckRun.command`,
  `FinishReceipt.acceptanceSurfaceModelApproved`; после ревью — `Currency.knownRed`, `GateState.reworked`,
  `Obligations.knownRed(checkId, currency)` — ABI обновлён (см. «Тесты»).

- Studio (C4): `DecisionService` (≈ строка 440) принимает вердикт человека из UI — ему нужно проставить
  `"reviewer": "human"`, иначе одобрение человека будет считаться модельным (`agent_test`, `host_model`).
- Docs: `runtime/gates-termination.md` (строка «Red not recorded», новая строка «Sufficiency», абзац итоговой
  квитанции) и `verification/acceptance-review.md` (§8.7) обновлены. D-397 (уже в `main`) описывает п. 3; п. 7 его
  уточняет: «человек» — это `Verdict.reviewer == human`, а не путь `human` и не режим `IntegrityApproval.Human`.

Статус: ГОТОВО К СЛИЯНИЮ — последний коммит `d806a35` (ветка `v2/C1b` запушена; ревью Fable — `94abd4d`, поправка п. 4 — `d806a35`)
