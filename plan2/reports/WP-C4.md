# WP-C4 — отчёт линии (этап 2: Studio — лимиты на запуск, подход, живой счётчик, ярлыки исхода)

Ветка `v2/C4` корневого репозитория (`C:\work.astrolab`), база `main` de0939d. Ядро (`ASTROLABE`, `main` 24bf9c4)
только читалось. Объём: 46 файлов, ≈ +1,55 тыс. / −0,16 тыс. строк, из них ≈ 0,6 тыс. — тесты.

## Сделано
1. **Лимиты и подход уходят в ядро** (aafbef3).
   - Bridge: `StartSpec` получил новые параметры в конце (`limits: TaskLimits(moneyUsd, minutes, requests)`, `preset`).
     Позиционные Java-вызовы не менялись. `maxCells` по умолчанию теперь 48.
   - Точка адаптации — `StudioHost.corePolicy(spec)`. Она строит `CampaignPolicy(…, limits = TaskLimits(Money USD, minutes,
     requests), balance = BalanceProfile)`. Лимиты передаются всегда, при отсутствии — как `NONE`, поэтому строка запуска
     в Studio — источник истины и при reopen.
   - Типизированный `BudgetStop.wire` (`task_limit_*`, `cell_cap`, `contract_budget`) приходит в `RunListener.stopCode`
     при `budget_exhausted`.
   - Server:
     - `tasks/Limits` (record: проверка, `raises`, `toBridge`);
     - `Preferences`: `LIMIT` заменён на `TASK_LIMITS` (умолчание $50.00 / 480 / 3000) и `DEFAULT_PRESET`;
     - миграция №4: колонки `campaign_index.limits_json` и `preset`; денежный `limit` переносится как есть, `auto`/`tokens`
       получают умолчания, строка `limit` удаляется;
     - `CampaignService.setBudget`; `studio.opened` несёт `limits` и `preset`; `stop_code` сохраняется и для `budget_exhausted`;
     - `upsert` сводит имя константы из сохранённого состояния к wire-слову;
     - `TaskService`: `start`/`message`/`followUp` принимают `preset` и `limits` (по наследованию: параметр → прошлый запуск →
       настройки); `spec()`: `tokens = окно × max(12, requests ?? 10000)`, `maxCells` из runtime (умолчание 48);
     - REST: поля `preset` и `limits` в `POST /tasks`, `/messages`, `/continue`.
2. **Признак рецензента** (55ba42a). `DecisionService.buildReply("review")` ставит `"reviewer":"human"`, `ReviewPass.verdict` —
   `"reviewer":"model"`.
3. **Исход** (864bb86).
   - `tasks/Provenance`: класс берётся из `receipt.provenanceClass` без пересчёта.
   - Пометка `judge` ставится, если `verifiedBy` ∉ {`runtime`, `human`}, либо есть подпись `studio:review-pass(`, либо
     непуст `acceptanceSurfaceModelApproved`.
   - Понижение «только судья» срабатывает лишь для квитанций без поля `acceptanceSurfaceModelApproved` (до C1b).
   - Для лучшего результата по `limit.bestCandidate` и `workingTree` выбирается `current`, `earlier` или `none`.
   - `stateOf`: стоп `task_limit_*` даёт `paused` с кодом `limit_money|limit_minutes|limit_requests` и `params.limit`;
     `cell_cap` и `contract_budget` дают встроенный `limit_reached`.
   - `cell_cap` продолжается на месте (`resumable`).
   - `resume(…, limits)`: если стоп по лимиту пользователя, а новый лимит этого вида поднят или снят, пишется `limits_json`,
     отправляется `studio.notice limit_raised`, затем `continueRun` (та же работа, reopen). Если лимит не поднят — 400
     `limit.raise_needed`. Без `limits` получается follow-up с нуля.
   - В задачу добавлены поля `preset`, `limits`, `provenance {class, judge}` и `limit {kind, best}`.
   - Текст recap: «finished and independently verified» / «finished; verified only by the agent's own test».
4. **Frontend** (f948134).
   - Composer: пилюля «Подход · лимиты». Меню: три подхода с подсказкой, три поля («без лимита»), «Без лимитов», строка
     «со следующего запуска» в задаче. В режиме подъёма — подсказка и кнопка «Поднять лимит и продолжить», выключенная,
     пока лимит не поднят.
   - `new-task`, `task-actions` и `task-view` пробрасывают `preset` и `limits`.
   - `ErrorCard`: заголовок «Остановлено по лимиту», строка лучшего результата, действие `raise_limit`. Оно удваивает
     достигнутый лимит в composer, после подтверждения — `POST /continue {limits}`.
   - `ResultCard`: ярлык класса; ✓ только для `independent`; деталь; «· одобрено судьёй-моделью».
   - Заголовок и боковая панель: `stateKey` и `doneUnverified` учитывают класс и код лимита.
   - Живой счётчик `timeline/meter.ts` строится по `budget.spent` (строка над composer и панель Progress вместо «% лимита»;
     ≥ 80 % — `--warn`).
   - Настройка №13: три поля.
   - Каталоги EN и RU; в `vocabulary.spec.ts` добавлены семейства `preset`, `limit`, `meter`, `provenance`.
5. **Карточка «Сделать проверкой проекта»** (338710b).
   - `Provenance.checkOffer` выбирает проверку `CHK-model-*`/`checkOrigin.type = model` вида tests, со статусом passed,
     `cwd` ∈ {null, "", "."}, при условии `checks.test.source == none` и `outcome == completed`.
   - Задача получает `checkOffer {command}` (только full).
   - `POST /tasks/{id}/project-check` принимает только предложенную команду и вызывает
     `ProjectSettings.saveCheck(…, "test", …)` (остальные сохранённые проверки остаются), затем отправляет
     `studio.notice project_check_saved`.
   - «Не сейчас» запоминается в `localStorage` на задачу.

## Решения
- **Тип стоп-кода → `RunListener.stopCode`.** Для `budget_exhausted` передаётся wire `BudgetStop`, а не новое поле.
  Почему: коды двух исходов не пересекаются, интерфейс не меняется. Безопасная альтернатива — отдельный параметр слушателя.
- **Лимиты в `CampaignPolicy`** (после ревью): `StartSpec.limits` может быть `null`, тогда ядро оставляет сохранённые лимиты
  (`campaign.resume`, запуски до миграции). Пустые поля превращаются в `NONE` только при явном снятии лимитов.
  Запуск задачи передаёт лимиты из своей строки, включая поднятые.
- **`CellCap` → «продолжить на месте»** (по уточнению оркестратора, D-401). `ContractBudget` остаётся прежним follow-up.
- **Поднять лимит — только через `/continue` с `limits`.** Сообщение на остановленном по лимиту запуске — follow-up с нуля
  (R2). Почему: так нельзя потратить деньги без показанного числа (R11).
- **Счётчик только по `budget.spent`** (ядро шлёт его всегда). Время между отчётами дорисовывается, пока задача в
  состоянии `working`. Запасного пути по `cell.model_responded` нет (см. «Отклонения»).
- **Понижение по подписи `studio:review-pass(`** — только для квитанций без `acceptanceSurfaceModelApproved`.
- **Effort** не менялся: явный выбор пользователя по-прежнему уходит в `CellModel`. Шаг effort подхода ядро считает само.

## Тесты
- После шага 1, `./gradlew :backend:server:test --tests '*.TaskLimitsTest' --tests '*.TaskAcceptanceTest' -Pstudio.astrolabeBuild=C:/work.astrolab/ASTROLABE`:
  7/0 и 8/0.
- После шага 1, `:backend:bridge:test --tests '*.TaskLimitsTest'`: 1/0. Fixture-кампания с `requests = 1` даёт
  `budget_exhausted` и `task_limit_requests`; resume с `requests = 500` больше не `budget_exhausted` и снова вызывает модель.
- После шага 2: `AcceptanceDecisionsTest` 7/0, `ReviewPassTest` 8/0.
- После шага 3: `ProvenanceTest` 6/0, `TaskLimitsTest` 12/0, `TaskAcceptanceTest` 9/0.
- После шага 5: `ProvenanceTest` 7/0, `TaskLimitsTest` 13/0.
- Frontend, `npx vitest run src/app/features/task/task.spec.ts src/app/timeline src/app/vocabulary.spec.ts src/app/features/panel/flow/flow.spec.ts`:
  5 файлов, 131 тест, 0 падений. `npx ng build --configuration development` проходит без ошибок (проверка шаблонов).
- В конце один раз `./gradlew :backend:bridge:test :backend:server:test --continue -Pstudio.astrolabeBuild=C:/work.astrolab/ASTROLABE`
  (модули целиком): exit 0. По XML: bridge — 6 классов, 13 тестов, 0 падений; server — 5 классов, 44 теста, 0 падений.
- После ревью — только затронутые классы: server `TaskLimitsTest` 15/0, `ProvenanceTest` 8/0, `TaskAcceptanceTest` 9/0;
  bridge `TaskLimitsTest` 3/0. Frontend: те же 5 spec, 133 теста, 0 падений; `ng build` без ошибок.
- После ревью один раз модули целиком (`:backend:bridge:test :backend:server:test --continue`): exit 0; bridge — 15 тестов,
  server — 47, 0 падений.
- e2e не запускались.

## Ревью (338710b, «сначала исправить») → что сделано
Исправления — `cda4258` (backend) и `bddb108` (frontend).
1. **P1 Токенный предохранитель замерзает.** Подтверждено: `Controller.kt:543–546` берёт `policy.tokens` только для
   нового контракта. Теперь `tokens = окно × 10000` всегда (`TaskService.TOKEN_GUARD_WINDOWS`), от лимита запросов не
   зависит. Тест `clearedLimitsAreNamed…` (окно × 10000 при `requests = 100`). Поправка бюджета при resume — в
   «Требуется от ядра».
2. **P1 «Лучший проверенный» без проверки.** Подтверждено: `Controller.kt:1103` задаёт `bestCandidate` и при одном
   `accepted`. `Provenance.best` при пустых `verified` и `verifiedEarlier` даёт `accepted`, текст `limit.best.accepted`
   («принято без проверки», RU/EN). Тест в `ProvenanceTest`.
3. **P2 Studio и ядро по-разному решают, поднят ли лимит.** Подтверждено (`Controller.kt:585–600`, решение `Within`).
   - Вид лимита теперь берётся из последнего `budget.limit_reached` со `stage = stopped` в `event_log` (`TaskService.limitKind`).
     Это типизированное событие ядра; состояние ядра хранит код первого останова.
   - `CampaignRef.budgetStop` говорит, что reopen оставил кампанию в `budget_exhausted`.
   - `limit_raised` уходит только после выхода из останова, иначе `limit_still_reached`.
   - `limits_json` совпадает с тем, что ядро сохранило на reopen (`TaskLimitControl.atOpen` пишет лимиты хоста в любом случае).
   - Тесты: server `aLimitThatStillHoldsAfterARaise…`, `theTaskContinuesOnlyWhenTheCoreLeft…`; bridge — reopen без
     подъёма даёт `budgetStop = task_limit_requests` и снова `budget_exhausted`, с подъёмом — `null`.
4. **P2 `campaign.resume` снимает лимиты.** Подтверждено. `StartSpec.limits: TaskLimits? = null` даёт
   `CampaignPolicy.limits = null`; `NONE` передаётся только при всех пустых полях. Запуски без `limits_json` передают
   `null`, поле `limits` задачи у них отсутствует. Тесты: bridge `a spec without limits keeps the stored ones…`,
   server (`limits_json = NULL` даёт `getLimits() == null`).
5. **P2 Дорогой осмотр на каждом GET.** Сначала `Provenance.checkCandidate(receipt)`, `ProjectSettings.get` вызывается
   только при найденном кандидате.
6. **P2 Скачок времени в счётчике.** `studio.opened` с `resumed` ставит `reportedAt = at`; `studio.user_message` с ролью
   `request` или `follow_up` останавливает счётчик прошлого запуска. Тесты в `meter.spec.ts`.
7. **P2 Сообщение молча начинает с нуля.** На карточке лимита появилась строка `limit.new_run_note`. Удвоенные лимиты
   сбрасываются при подтверждении и при закрытии меню (`Composer.limitsClosed` → `TaskView.leaveRaise`).
8. **P3 Wire-коды.** Добавлен `StopCodes.wire` в bridge (по `BudgetStop.entries` / `StopCode.entries`: имя или wire);
   регэксп удалён. Тест в bridge.
9. **P3 argv.** `Provenance.line` не предлагает команду с кавычками, пустыми аргументами, управляющими и bidi-символами
   (типы `CONTROL` / `FORMAT` / разделители). Строка обязана читаться обратно через `Verification.argv` в тот же argv.
   Команда показывается моноширинным `<code>`. Тест `anOfferedCommandReadsBack…`.
10. **P3 Limits.**
    - Проверка `> 0` делается после округления: `0.00001` отклоняется.
    - Отсутствующее поле частичного объекта берёт значение из прежних лимитов, явный `null` снимает лимит.
    - Миграция №4: деньги > 10000 становятся `10000.00`, а не умолчанием. Тесты в `TaskLimitsTest`.
11. **P3 Тексты.** `error.limit_hours` для лимита ≥ 120 мин; в меню composer в задаче — `limit.next_run`.

## Отклонения от дизайна
- Счётчик: нет запасного пути по `cell.model_responded` и нет «≈ task.usage.cost». Время берётся из `elapsedMillis` ядра
  (с дорисовкой), а не из отрезков opened → run_ended. Причина — `budget.spent` идёт всегда (уточнение 3). У старых
  запусков счётчика нет.
- `limit.bestClass` не выводится: показывается только `best` (current/earlier/none). Ядро даёт классы по требованиям
  (`LimitStop.provenance`), а не класс кандидата.
- Правило R9 не применяется к новым квитанциям: класс берётся из ядра (D-397/D-400).
- Стоп-код ядра в сохранённом состоянии записан именем константы (`TaskLimitMoney`, а также `AcceptanceDecision`):
  Studio сводит его к wire-слову через `StopCodes.wire` в `CampaignService.upsert`. Это заодно чинит возможное прежнее
  расхождение для `stopCode`.
- Вид лимита, который держит запуск после неудачного подъёма, читается из `event_log` (событие ядра
  `budget.limit_reached`), а не из ответа `open`: публичного типизированного поля для этого у ядра нет.
- Bridge-тест проверяет «продолжение вызывает модель», а не `completed`: сценарий fixture-модели не переигрывает
  остановленную ячейку (второй прогон заканчивается `failed: CompletionStalled`).
- Строки D2-n в `ASTROUI/docs/decisions.md` не добавлены (урезано).
- В composer нет отдельного «режима подтверждения»: подъём лимита — то же меню с подсказкой и кнопкой.

## Требуется от ядра
Блокирующего нет. Желательно:
- **поправка токенного бюджета контракта при resume** (ревью P1): сейчас `contract.budget.tokens` фиксируется при первом
  open. Studio обходит это предохранителем окно × 10000; `ContractBudget` по-прежнему не возобновляется;
- публичное типизированное поле «какой лимит всё ещё держит» в `OpenedCampaign` (сейчас только событие и журнал);
- wire-имена (`@SerialName`) для `CostBasis`, `BudgetStop`, `StopCode`, `LimitKind` в JSON состояния и событий
  (сейчас там имена констант; Studio сводит их сама);
- явно описать приоритет `CellModel.effort` хоста над шагом effort подхода (A11).

## Хвосты и риски
- Сообщение (а не «Поднять лимит») на запуске, остановленном по лимиту, запускает follow-up с нуля — так задумано (R2),
  но пользователь может ожидать продолжения.
- Запуски без `limits_json` (до миграции) при продолжении передают ядру `null` и в задаче не показывают лимиты.
  Composer для них показывает умолчания настроек: они применятся к следующему запуску.
- Вид лимита из `event_log` зависит от доставки событий шины. Если событие ещё не записано, на миг показывается вид
  первого останова; при следующем чтении задачи он исправится.
- Компоненты Angular покрыты только сборкой и тестами чистых функций; e2e не запускались.
- Карточка проверки: только проверки tests, только корень проекта, только проекты без команды тестов (R12).
  Осмотр проекта (`ProjectSettings.get`) идёт только при найденном кандидате.
- `maxCells` 48 действует только там, где проект не сохранил своё значение runtime.
- Старое API кампаний (не задачи) передаёт `limits = null` (сохранённые остаются) и прежние токены (окно × `campaignCells`).

Статус: ГОТОВО К СЛИЯНИЮ — последний коммит ветки `v2/C4`: bddb108
