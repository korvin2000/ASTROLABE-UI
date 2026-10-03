# WP-C11s — Studio: только пользователь одобряет изменение тестов под `human` (шаг Studio задачи P8.C.11, отчёт линии)

Ветка `v2/C11s` корневого репозитория (`C:\work.astrolab`), база `main` `87ca268` (в истории C4 `cee4fdf`). Ядро
(`ASTROLABE`, `main` `878d5fe`, слияние C11 `8a3b5e1`) только читалось. Коммиты: `a2de077` (backend), `cd2ea75` (frontend).

## Исходное состояние (выяснено по коду до правок)
- **`config.integrityApproval` в Studio по умолчанию — `Autonomous`.** Studio его не задаёт: действует умолчание
  библиотеки (`core/.../Defaults.kt:104` `IntegrityApproval.Autonomous`, `Config.kt:46`). `Human` включается только
  явно: настройкой `config.integrityApproval` (S/P-слой, `SettingsSchema.java:48`) или пресетом «Cautious»
  (`SettingsService.presets()`; «Balanced» и «Autonomous» — `Autonomous`). В настройках Studio 2 (frontend,
  19 пунктов) этого поля нет; описание видно только в схеме настроек (API `/settings`).
- **Как `Authority.review` / `Authority.decide` доходят до Studio.** Задачи стартуют с `StartSpec.hostAuthority = true`
  (`TaskService.spec`) → `StudioHost.start` выбирает `PortAuthority` (`StudioHost.kt:296`) → JSON уходит в
  `DecisionService` (реализует `AuthorityPort`).
  - `review`: у задачи есть `HostPolicy` (`TaskService.policyOf`, по `campaign_index.task_mode` `ask|auto`) → **всегда**
    `ReviewPass` (модель, `"reviewer":"model"` после C4), в обоих режимах; без задачи (старое API кампаний) —
    `raise("review")`, но `cardOf` показывал его как «suggestion» без ответа-вердикта.
  - `decide`: сохранённое решение пользователя → его; иначе в `auto` всё, кроме `Failed`, принималось политикой
    (`Decider.Policy`, `studio:policy(auto)`); в `ask` и для `Failed` — открытая карточка решения.
  - Кампании не-задачи в ядерном `Mode.Autonomous` идут через `RecordingAutonomousAuthority` → ядерный
    `AutonomousAuthority`: `review`/`decide` = `null` (ответа нет; ядро само останавливается).
- **Где задача получает «ждёт вас» (`needs_you`).** `TaskService.stateOf`: живой запуск с ожидающими карточками
  (`decisions.pendingCount > 0`), либо остановленный `waiting_for_input` со `stop_code` `acceptance_decision` /
  `review_rejected`. Код `integrity_review` попадал в ветку «paused / needs_answer» (выглядел как вопрос/пауза с
  «Продолжить»). `stop_code` сохраняется `CampaignService.onRunEnded` / `upsert` через `StopCodes.wire` (C4) — wire
  `integrity_review` из `StopCode.IntegrityReview` получается автоматически.

## Сделано
1. **`humanOnly`-ревью — карточка пользователя, не `ReviewPass`** (`DecisionService.review`). Запрос с
   `humanOnly = true` в `ask` и `auto` поднимается карточкой `raise("review")` (запуск ждёт ответа). Если у запуска есть
   политика задачи, сначала (один раз) выполняется `ReviewPass` — только как сведение: его вердикт прикладывается к
   карточке (`request.modelVerdict`) и **никогда не отправляется ядру ответом**; сбой прохода — карточка без вердикта.
   Ответ пользователя: `POST /tasks/{id}/cards/{cardId}` `{decision: approve|reject, answer?}` →
   `DecisionService.personVerdict` → `reply` → `buildReply("review")` (C4 ставит `"reviewer":"human"`,
   `signedBy = user:local`, привязку к запросу/ревизии/кандидату). `approve` = `Approve`; `reject` = `Reject` с одной
   существенной находкой (`Major`, `TestIntegrity`, место = путь теста, текст = слова пользователя или текст по
   умолчанию) — ядро ведёт это как отклонение (rework, затем `review_rejected`). `accept`/`decline` (suggestion) для
   review-карточки запрещены (400). Ревью без `humanOnly` — как раньше (`ReviewPass` отвечает).
2. **`auto` не принимает политикой `humanOnly`** (`DecisionService.decide`): пункт с `humanOnly = true` или запрос с
   `code = integrity_review` → открытая карточка решения (как для `Failed`), вариант `integrity`; к ней прикладывается
   вердикт `ReviewPass` с того же кандидата (из последней review-карточки запуска). «Одобрить изменение теста» на ней
   = решение пользователя `accept` (`Decider.User`, ядро покрывает), «Отклонить» = `rework` (текст по умолчанию: «the
   user did not approve the change to the tests; keep the required checks as they were»).
3. **Карточка и состояние.**
   - `cardOf`: новый вид `review` (`variant` `integrity` | `review`; `items[{path, checks[], reason?}]`, `model{outcome,
     summary?, findings[]}`); у `acceptance` вариант `integrity`, у `humanOnly`-пунктов `path` (из `integrity:<path>`),
     `checks` (из «touches A, B — »), `humanOnly`, `by`.
   - `TaskService.stateOf`: `integrity_review` → `needs_you` с причиной `integrity_review` (`StudioError.INTEGRITY_REVIEW`),
     не ошибка и без «Продолжить».
   - Frontend (`cards.ts`): review-карточка и integrity-вариант карточки решения показывают путь теста, «Касается
     проверок: …», «Причина: …» (обоснование агента — только на review-карточке), вердикт модели («Модель одобряет
     изменение.» / «Модель просит исправить.» / «Модель не смогла оценить.» + находки) или «Приложен отзыв модели» при
     `by` из ядра, строку «Это изменение одобряете только вы; задача ждёт вас.»; кнопки «Одобрить изменение теста» /
     «Отклонить» (клавиши 1–2); свёрнутый вид «вы одобрили / отклонили изменение». `timeline.ts`: ответ на review →
     `approved|rejected`; строка политики `ReviewPass` для `humanOnly`-запроса уходит в технические (не «Проверка
     пройдена»). `error-actions`: `integrity_review: ['copy_details']`. Каталоги EN/RU.
4. **Настройка** (`SettingsSchema.java:48`): значения (`Autonomous`, `Human`) и умолчание не тронуты; описание: «Who
   approves a change the agent makes to the tests a required check runs. Human: every such change needs your approval —
   the task waits for you, in auto mode too. Autonomous: a model approves the change, and the result is marked "approved
   by the model judge". Never disables the integrity guard.»
5. **Ядро не тронуто.** Bridge: только KDoc (`HostApi.kt` `CampaignRef.stopCode`, `RunListener`) и тест.

Файлы (backend): `server/.../decisions/DecisionService.java` (review, decide, cardOf, `personVerdict`, `integrityItems`),
`server/.../tasks/TaskService.java` (stateOf, card, decideAcceptance), `server/.../support/StudioError.java`,
`server/.../settings/SettingsSchema.java`, `server/.../campaigns/CampaignService.java` (KDoc), `bridge/.../HostApi.kt`
(KDoc). Frontend: `core/model.ts`, `features/task/{acceptance,cards,error-actions,task-actions}.ts`,
`timeline/timeline.ts`, `i18n/catalog.{en,ru}.ts`.

## Решения
- **Ответ на `humanOnly`-ревью — блокирующая карточка (`raise`), а не `null`.** Почему: так пользователь может дать
  вердикт человека, и класс станет `independent` (D-404); `null` сразу вёл бы к остановке и решению `accept` (класс
  `agent_test`). Безопасность: без ответа запуск ждёт; при перезапуске backend карточка истекает (§13.9), ядро на
  reopen спросит снова (один раз за открытие). Альтернатива — отвечать `null` и сразу ждать карточку решения.
- **`ReviewPass` для сведения запускается и в `ask`** (стоимость — один вызов модели на вопрос). Почему: иначе под
  Studio вердикта модели на карточке не было бы никогда (ядро под `Human` не прикладывает вердикт судьи review-cell).
  Безопасная альтернатива — не звать модель вовсе (карточка без вердикта).
- **«Отклонить» на review-карточке = `Reject` с находкой `Major` на пути теста**, а не «нет ответа». Почему: отказ
  человека — содержательное отклонение (rework), а не молчание; «нет ответа» оставило бы задачу в ожидании без причины.
- **Признак ожидания человека в `decide`: `humanOnly` любого пункта ИЛИ `code == integrity_review`** — шире, чем нужно
  ядру, значит безопаснее.
- **Пути/проверки для review-карточки разбираются из строк запроса** (флаговые строки `criteria`, иначе
  `originalObligations`), для карточки решения — из `integrity:<path>` и «touches …». Нужны структурные поля (см.
  «Требуется от ядра»).

## Тесты
- Server, после backend-цикла: `./gradlew :backend:server:test --tests '*.IntegrityReviewTest' --tests
  '*.AcceptanceDecisionsTest' --tests '*.TaskAcceptanceTest' -Pstudio.astrolabeBuild=C:/work.astrolab/ASTROLABE
  -Pstudio.skipFrontend=true` → IntegrityReviewTest 10/0 (новый), AcceptanceDecisionsTest 7/0, TaskAcceptanceTest 11/0
  (+2). Первый прогон: 1 падение в моём новом тесте (заглушка `contractRevision` с `anyString()` не совпадала с
  `projectId = null`) — исправлен тест.
- Bridge: `:backend:bridge:test --tests '*.PersonReviewTest' --tests '*.TaskLimitsTest'` → 2/0 (новый), 3/0.
- Frontend: `npx vitest run src/app/features/task/task.spec.ts src/app/timeline src/app/vocabulary.spec.ts
  src/app/features/panel/flow/flow.spec.ts` → 5 файлов, 142 теста, 0 падений (новые: task.spec «a test change only
  the user approves (C11)» ×5, timeline.spec ×4). `npx ng build --configuration development` → OK (первый раз —
  TS2349: ссылка шаблона `#tests` перекрывала сигнал `tests`; переименована).
- В конце один раз модули целиком: `./gradlew :backend:bridge:test :backend:server:test --continue …` → exit 0;
  bridge 7 классов / 17 тестов, server 6 классов / 59 тестов, 0 падений, 0 пропусков.
- Что покрывают новые тесты: `humanOnly`-ревью в `auto` и `ask` → карточка, ответ ядру не отдан до пользователя,
  `ReviewPass` вызван один раз и только как сведение; одобрение пользователя декодируется ядерным `Verdict`
  (kotlinx, строгий JSON) как `Approve`/`ReviewerKind.Human`/`user:local`; отклонение — `Reject` с `Major`
  `TestIntegrity` на пути; сбой прохода — карточка без вердикта; ревью без `humanOnly` по-прежнему отвечает
  `ReviewPass`; `auto` не принимает `humanOnly`-пункт и код `integrity_review`; вердикт модели приложен к карточке
  решения того же кандидата; ответ пользователя → `Decider.User`; `auto` без `humanOnly` принимает политикой как
  раньше; задача `integrity_review` → `needs_you`, «done» = одобрение с текстом; `approve` на review-карточке →
  вердикт человека, `accept` → 400; bridge: `PortAuthority` передаёт `humanOnly`, вердикт с `"reviewer":"human"`
  декодируется как `Human`, `StopCodes.wire("IntegrityReview")`.
- e2e и полный набор не запускались.

## Отклонения от карточки
- П. 3 «обязательные проверки, которых он касается» на **живой** review-карточке видны только когда ядро строит запрос
  через `TestIntegrity.reviewRequest` (флаговые строки в `criteria`). Запрос из `ReviewCell` (`EvidencePacket.request()`)
  несёт лишь `originalObligations` `<path>: <текст>` при наличии исходника — тогда карточка покажет путь без проверок,
  а без исходника — без пути (вердикт модели и кнопки есть). На карточке решения (после остановки) путь и проверки
  есть всегда. См. «Требуется от ядра».
- `by` (подписант вердикта модели из ядра) не выводится текстом — это внутренний id; вместо него строка «Приложен
  отзыв модели». Под Studio ядро вердикт модели и не получает (Studio его не отправляет), так что строка появится
  только для запросов, решённых до этой ветки.

## Требуется от ядра
Блокирующего нет (поведение безопасное: под `human` задача без действия пользователя не завершается). Желательно:
- **структурные integrity-флаги в `ReviewRequest`** (`path`, `surface`, `requiredChecks`, `reason`/обоснование агента)
  для `humanOnly`-запросов, в том числе из `EvidencePacket.request()` — сейчас Studio разбирает строки
  `TestIntegrityFlag.line`, а путь ревью-ячейки их не передаёт;
- **структурные `path`/`requiredChecks` у `DecisionItem`** для `integrity:`-пунктов (сейчас разбирается текст «touches
  A, B — »);
- (как в C4) wire-имена в JSON состояния для `StopCode` — сейчас Studio сводит имя константы через `StopCodes.wire`.

## Хвосты и риски
- Пока review-карточка открыта, запуск ждёт (лиз запуска продолжает тикать); в `auto` пользователь может долго не
  заметить — уведомление «task.needs_you» уходит только при остановке, для живой карточки — как для любого вопроса.
- Лишний вызов модели (`ReviewPass`) на каждый `humanOnly`-вопрос; ядро спрашивает один раз за открытие на (инкремент,
  кандидат, ревизия), а в S1 для следующего инкремента — снова (риск ядра C11).
- Сообщение в composer при открытой **review**-карточке не превращается в «Отклонить с текстом» (как для карточки
  решения) — отклонение с текстом доступно API (`answer`), в UI — кнопка без текста.
- Кампании не-задачи в ядерном `Mode.Autonomous` (`RecordingAutonomousAuthority`) под `Human` останавливаются
  `integrity_review` без карточки (старое API кампаний карточку решения не показывает) — безопасно, но тупик для
  этого API; Studio 2 (задачи) этим путём не ходит.
- Recap для follow-up может упоминать строку политики `ReviewPass` по `humanOnly`-запросу как обычный проход ревью.
- Компоненты Angular покрыты сборкой и тестами чистых функций; e2e не запускались.

Статус: ГОТОВО К СЛИЯНИЮ · cd2ea75
