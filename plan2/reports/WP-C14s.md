# WP-C14s — Studio: шаг после C14 (бюджет при возобновлении, явный effort, держащий лимит, wire-слова)

Ветка `v2/C14s` корневого репозитория (`C:\work.astrolab`), база `main` `3070e49` (в истории C4 и C11s). Ядро
(`ASTROLABE`, `main` `e9cbb0b`, слияние C14 `693dfb2`) только читалось, Gradle в нём не запускался.
Коммиты: `8829633` (backend), `46c8cde` (frontend).

## Сделано
1. **Возобновление без заглушки бюджета** (`CampaignService.resume`). Старое API кампаний шлёт бюджет запуска:
   токены последнего `studio.opened` этой работы (заглушка `1` от возобновлений до C14 пропускается), иначе — то, что
   посчитал бы старт (`options.tokens` → `runtime.defaultTokens` → контекст main × `campaignCells`; вынесено в
   `startTokens`, старт использует его же). Попутно: возобновление брало effort из настроек, теряя effort из опций
   старта, — теперь берёт его из `options_json`; `opened()` падал NPE на спецификации без лимитов (старое API, с C4) —
   теперь «лимиты не названы».
2. **Токенный предохранитель задачи** (`TaskService.spec`). Неверный комментарий заменён (ядро на reopen поднимает
   токены контракта до большей политики и никогда не снижает). Окно модели `0` → `AutoProfiles.ESTIMATED_CONTEXT`
   (вместо `Math.max(tokens, 1)` = бюджет в 1 токен). Запуск, остановленный `contract_budget` с причиной `tokens`,
   получает предохранитель **сверх** токенов при останове (`contractStop.tokens + window × 10000`) — reopen продолжает его.
3. **Явный effort** (D-405 `CellModel.effortExplicit`). `StartSpec.effortExplicit` (bridge) → `StudioHost.cellModel`
   → `CellModel(…, effortExplicit)`. Выбор пользователя = effort, названный в запросе (`POST /tasks`, сообщение,
   продолжение); умолчание (предпочтение `defaultEffort`, «medium» из коробки) — не выбор. Хранится в
   `campaign_index.effort_explicit` (миграция 5) и в `TaskRun.effortExplicit`; продолжение и follow-up без нового выбора
   наследуют флаг прошлого запуска. Старое API кампаний: явный — только `options.effort`, `runtime.effort` — умолчание.
   Frontend: новая задача шлёт `effort` только если его выбрали в composer (`new-task.ts`), иначе сервер берёт умолчание.
4. **Держащий лимит из ответа ядра.** `CampaignRef.limitHold` — JSON ядерного `LimitHold` (wire-слова) вместо
   `budgetStop`; сохраняется на каждом open задачи (`campaign_index.limit_hold_json`, `null` — open продолжил запуск).
   Поиск по `event_log` (`budget.limit_reached`) из `limitKind` убран; `reopened` читает `limitHold` и называет
   держащий лимит в уведомлении (`params.limit`).
5. **Wire-слова.** Ветка `BudgetStop` из `StopCodes.wire` убрана (только `StopCode`, ядро всё ещё пишет имена его
   констант). Для сохранённых состояний — `StopCodes.budgetStop(word)`: читает ядерным сериализатором (`@JsonNames`),
   так что и `task_limit_money`, и `TaskLimitMoney` (состояние до C14) → `task_limit_money`. Используется в
   `CampaignService.stopCodeOf` (upsert из тела состояния). Frontend `meter.ts` уже сравнивал `costBasis` без регистра.
6. **`contract_budget` по причине.** Upsert сохраняет `state.contractStop` (`contract_stop_json`); причина = причина
   `LimitHold` последнего open, иначе останова. `tokens`, `turns` → `limit_reached` и продолжение на месте (`resumable`);
   `cost` → `contract_budget_cost`, `unknown_usage` → `contract_budget_unknown_usage`, останов до C14 без причины →
   `contract_budget`: честный текст «продолжить его нельзя; отправьте сообщение — новый запуск», действия только
   `copy_details` (кнопки «Продолжить» нет). API `/continue` для них делает follow-up (как для лимита без подъёма).
7. **Один open на действие.** `StudioHost.launch`: второй open (для заметок хоста) не делается, если первый вернул
   `limitHold` — кампания стоит и ничего не запускает; «limits: still reached» и событие `budget.limit_reached` — по
   одному на reopen.
8. **Фикстуры на wire-слова:** `meter.spec.ts` (`billed`/`estimated`, плюс тест старой формы `Billed`/`Estimated` и
   `mixed`/`none`), bridge `TaskLimitsTest` (`StopCodes.budgetStop` обе формы, `StopCodes.wire` только `StopCode`).

Файлы: bridge `HostApi.kt`, `StudioHost.kt`, тест `TaskLimitsTest.kt`; server `campaigns/CampaignService.java`,
`db/StudioDb.java` (миграция 5: `effort_explicit`, `limit_hold_json`, `contract_stop_json`), `support/StudioError.java`,
`tasks/TaskService.java`, тесты `tasks/TaskLimitsTest.java`, `campaigns/CampaignResumeTest.java` (новый); frontend
`features/task/{error-actions,new-task}.ts`, `features/task/task.spec.ts`, `i18n/catalog.{en,ru}.ts`, `timeline/meter.spec.ts`.

## Решения
- **Что считать выбором effort.** Выбор = effort, названный в запросе; предпочтение `defaultEffort` — умолчание, даже
  если пользователь сам его поставил (оно же пишется при каждом старте с моделью, `remember`, — признак «трогал ли
  пользователь» из него не извлечь). Безопасная альтернатива — считать сохранённое предпочтение выбором (тогда подход
  перестанет двигать effort у всех, кто хоть раз стартовал). Старые строки — `effort_explicit = 0` (поведение как до C14).
- **Подъём для `contract_budget/tokens`** — «ещё один предохранитель сверх токенов при останове», а не умножение:
  предсказуемо, без переполнения. Альтернатива — не поднимать (тогда `tokens` держал бы вечно).
- **Бюджет запуска старого API** — из `studio.opened` (его пишет каждый open), а не новой колонкой: работает и для
  записей до этой ветки. Альтернатива — пересчитывать по текущим настройкам (тогда «сохранённый» бюджет мог бы сдвинуться).
- **`limitHold` через JSON ядерного типа**, как остальное в `HostApi` («ASTROLABE owns → JSON его `@Serializable`»).
  `CampaignRef.budgetStop` убран: его заменяет `limitHold` (держит ли и что именно).
- **Один open — только для удержанного reopen.** Для reopen, который продолжает, второй open по-прежнему нужен (заметки
  хоста зависят от открытого контракта); «still reached» там не дублируется — первый open уже снял стоп.

## Тесты
- Bridge, после цикла: `./gradlew :backend:bridge:test --tests '*.TaskLimitsTest' -Pstudio.astrolabeBuild=C:/work.astrolab/ASTROLABE
  -Pstudio.skipFrontend=true` → 4/0. Первый прогон: 1 падение моего теста (подписка на шину получила буфер событий
  первого запуска) — фильтр `seq > busLastSeq()`. Красная проверка п. 7: с возвращённым двойным open тест падает
  `one 'still reached' line per reopen ==> expected: <1> but was: <2>`; после возврата правки — зелёный.
- Server: `./gradlew :backend:server:test --tests '*.tasks.TaskLimitsTest' --tests '*.CampaignResumeTest' …` →
  TaskLimitsTest 22/0 (+7 новых: окно 0, `tokens` на месте и поднятый бюджет, `turns` на месте, причина из hold,
  `cost`/`unknown_usage`/без причины — свой код и follow-up, явный effort против умолчания, флаг при продолжении;
  2 переписаны на `limitHold`), CampaignResumeTest 3/0 (новый: бюджет запуска вместо заглушки, effort из опций, обе
  формы стопа).
- Frontend: `npx vitest run src/app/timeline/meter.spec.ts src/app/features/task/task.spec.ts src/app/vocabulary.spec.ts`
  → 3 файла, 58 тестов, 0 падений (новые: meter «cost basis wire word и старая форма», task.spec «contract budget без
  Continue»). `npx ng build --configuration development` → OK.
- В конце один раз модули целиком: `./gradlew :backend:bridge:test :backend:server:test --continue -Pstudio.astrolabeBuild=C:/work.astrolab/ASTROLABE
  -Pstudio.skipFrontend=true` → exit 0; по XML: bridge 7 классов / 18 тестов, server 7 классов / 69 тестов, 0 падений, 0 пропусков.
- e2e и полный набор не запускались.

## Отклонения от карточки
- Строки карточки подтвердились: `CampaignService.java:290, 477-478`, `TaskService.java:194-199, 214-228, 603-608,
  650-665, 781`, `StudioHost.kt:262, 288, 295, 313`, `HostApi.kt:72-73, 77-86`, `meter.spec.ts:7, 34`,
  bridge `TaskLimitsTest.kt:102`.
- П. 2: `Bound.contextTokens() == 0` на практике не бывает (`ModelService.bind` подставляет `ESTIMATED_CONTEXT`);
  запасное значение всё равно добавлено.
- П. 5: терпимость к старой форме `BudgetStop` нужна там, где читается сохранённое тело состояния (upsert): вынесена в
  `StopCodes.budgetStop` (ядерный сериализатор), а не убрана совсем.
- П. 1 вне карточки: исправлены NPE `opened()` при спецификации без лимитов и потеря `options.effort` при возобновлении
  (иначе возобновление старого API не работало бы или теряло явный effort).
- П. 7: «один open на действие» — для удержанного reopen; reopen, который продолжает, по-прежнему открывает дважды (см.
  «Требуется от ядра»).

## Требуется от ядра
Блокирующего нет. Желательно:
- **заметки хоста без второго open**: способ передать `hostNotes`, вычисленные по открытому контракту (например,
  поставщик заметок в `Controller.open` или чтение контракта/`sniffed` без open). Сейчас reopen, который продолжает,
  делает два open: повторяются строки сверки (unknown intents, опрос handle, external) и `host: policy set` (пусто →
  заметки) — до этой ветки так же;
- (как в C4/C11s) wire-имена `StopCode` в JSON состояния — Studio сводит имя константы через `StopCodes.wire`;
- событие для `contract_budget` (сейчас `budget.limit_reached` не выпускается; Studio берёт причину из состояния и `LimitHold`).

## Хвосты и риски
- Запуски, удержанные после подъёма лимита **до** этой ветки, не имеют `limit_hold_json`: до следующего open они
  показывают лимит исходного стопа, а не тот, что держит (раньше его находил поиск по `event_log`).
- `limit_hold_json` пишется только на open задач и старта/возобновления старого API; `contract_stop_json` — на каждом
  upsert. Если хост откроет кампанию мимо Studio, hold устареет до следующего open через Studio.
- Подъём `contract_budget/tokens` на один предохранитель за продолжение: каждое «Продолжить» добавляет ещё один.
- Явный effort, выбранный в composer старой версии фронтенда (который всегда слал effort), будет считаться явным:
  фронтенд и сервер нужно выкатывать вместе.
- Компонент `new-task` покрыт сборкой, не тестом (тестов компонентов в проекте нет).

Статус: ГОТОВО К СЛИЯНИЮ · 46c8cde (запушен в `origin/v2/C14s`)
