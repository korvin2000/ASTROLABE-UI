# WP-W4 — ревьюер, способный блокировать, может читать

Ветка `v2/W4` (от `main` `e75d38d`, в неё слит `main` `7a09bf2` — сокращение времени WF от W3). Исполнитель: суб-агент t3 (Opus).
Свои изменения: 9 файлов, +255/−18 (из них тесты +182, ABI +3/−1).

## Сделано
- **Сначала красный сценарий** `io.astrolabe.workflow.ReviewScenarioTest` (`9f3420e`): на `main` оба теста падали.
  Ревью: `partial: TokenBudget: reserve reached: 67513 tokens of generation exceed the 24000 working tokens left`, то есть
  3 513 входа + 64 000 выхода против 24 000. 0 запросов к модели, 0 `look`. Неудачное открытие: 0 событий `phase.counted`.
- **WD-16, п. 1.** `CellContext.boundedOutput` (новый параметр, по умолчанию `false`). `Controller.runCell` ставит его
  каждой дочерней ячейке (`child != null`). В `Cell.turn` у такой ячейки выход запроса =
  `min(максимум модели, доступно для траты хода − оценка входа)`. Запрос уходит с этим `maxOutputTokens`, допуск,
  резерв учёта, запасное списание выхода и запас окна считают по `request.maxOutputTokens`. Для основной линии это
  то же число, что и раньше, поведение не меняется. Новый метод `CellBudget.available(spend)` (internal): те же разделы,
  что у `admit`, порядок вынесен в `order(spend)`.
- **П. 3.** Если после оценки входа остаётся меньше `min(2048, максимум модели)`, ход заканчивается до вызова модели
  (`partial`, `TokenBudget`/`Reserve`) с текстом `turn N not admitted before its model call: usable budget U tokens,
  input estimate E, needed output 2048 (model maximum M)`. Ревью получает `ReviewOutcome.Unavailable`: вердикта нет,
  резервный путь — человек (D-23). Это не «отклонено» (не `ReviewRejected`) и не одобрение. Запись сохраняется, и по I3
  повторно к ней не обращаются, поэтому круга c14 нет.
- **П. 2.** `Controller.reviewBudget(c)` собирает `ReviewBudget` из `defaults.reviewLookMax`, `reviewIncrementTokens`,
  `reviewCampaignTokens` замороженной попытки. Значение передаётся в `CellReviewJudge` (ревью инкремента и кампании) и в
  `CellChildRunner` делегатора. Раньше эти три настройки нигде не читались.
- **П. 4 (WD-18).** Каждый отказ `verify(review)` в `Verify.kt` дописывает `this cell accepts scope=…`, а если путей
  нет — `this cell accepts no review scope`.
- **Хвост W0.** Закрытый `Controller.open` теперь начинает подсчёт и вызывает `opening(...)` (тело перенесено без
  изменений). Исключение по ходу открытия выпускает `phase.counted` (`open`) и пробрасывается дальше.
- **П. 5.** Реестр `docs/reference/workflow-invariants.md`: строка WF-9 (ядро) — страж `ReviewScenarioTest`, файлы.
  Часть Studio остаётся за P8.W.5.
- ABI: `:core:updateKotlinAbi` один раз (после слияния `main`), дамп +3/−1 (только конструктор и геттер `CellContext`).

## Числа допуска до/после (сценарий, бюджет ревью по умолчанию 30 000 → рабочих 24 000, модель 200K/64K)
- До: ход 1 ревью = 3 513 + 64 000 = 67 513 > 24 000. Отказ, 0 запросов, ревью `unavailable`, кампания `WaitingForInput`.
- После: 2 запроса ячейки ревью (оценки входа 3 022 и 3 124), выход запросов 20 487 и 16 499 (вместо 64 000), 1 `look`.
  Вердикт `approve` → ревью одобрено, кампания `Completed`. Запросы основной линии остались на 64 000.
- Недопустимый вариант (`reviewIncrementTokens = 3000`): `usable budget 2400 tokens, input estimate 3513, needed
  output 2048`. 0 запросов ревью, ревью `unavailable`, кампания `WaitingForInput` (ждёт решения, не отклонение).

## Решения
- Ограничивать выход только у дочерних ячеек (флаг) или у всех → у дочерних. У основной линии бюджет — остаток
  кампании, а отказ допуска там запускает резервный ход C3r/§5.9. Безопасная альтернатива — ограничивать у всех ячеек,
  но тогда нужно перепроверить C3r.
- Порог выхода → 2 048 токенов (константа `Cell.MIN_OUTPUT_TOKENS`, private). Хватает на вердикт или вызов инструмента.
  Альтернатива — настройка в `Defaults` (сейчас лишняя).
- Флаг ставится всем дочерним ячейкам, писателям S3 тоже. У писателя с большим бюджетом выход не меняется.
- Недопустимое ревью по-прежнему спрашивает хоста (D-23: нет вердикта → человек). `AutonomousAuthority` отвечает
  `null`, итог `unavailable`.

## Тесты
- Красный: `:core:test --tests 'io.astrolabe.workflow.ReviewScenarioTest'` — 2/2 упали (числа выше).
- L1 (один раз): `ReviewScenarioTest`, `cell.CellTest`, `cell.TerminalAccountingTest`, `budget.CellBudgetTest`,
  `delegate.ReviewCellTest`, `delegate.InjectedDefectTest`, `tool.verify.VerifyTest`, `campaign.S2CampaignTest`,
  `AcceptanceEvidenceTest`, `ProvenanceTest`, `RefactorCampaignTest`, `ShapeSelectorTest`: 168 тестов, 0 упало.
- L2 (один раз, после `git merge main` до `7a09bf2`): `:core:test --tests 'io.astrolabe.workflow.*' --tests
  'io.astrolabe.cell.*' --tests 'io.astrolabe.delegate.*' --tests 'io.astrolabe.campaign.*' --tests
  'io.astrolabe.tool.verify.*'`: 64 класса, 490 тестов, 0 упало, 0 пропущено. Затем `./gradlew assemble testClasses
  checkKotlinAbi -Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm` — успешно.
- Набор WF в L2 (Windows): DirtyRepoScenarioTest 83,0 + DirtyRepoTest 1,7 + Finalization 20,6 + Review 19,1 +
  UnreadableFile 8,8 = **133 с** тестов (≤ 180).
- `VerifyTest`: в существующий тест отказов добавлено утверждение: `scope=diff` → `denied`, называются принятые области.
  Старые утверждения не менялись.
- Циклов «правка → тест»: 1 (красный прогон + L1 + L2). Расход токенов: не виден.

## Отклонения от карточки
- Сценарий не использует общий `Scenario`: нужны риск `Hard` при посеве (S2 с обязательным ревью), модель 64K и
  `FaultPoints` в контроллере, а `Scenario` этого не даёт. Чужие файлы `workflow/` не менялись. Репозиторий — 2 файла,
  без `DirtyRepo`.
- Сбой открытия получен через `FaultPoints` (крах блоб-хранилища при захвате), а не через `LockedFile`: W3 может
  изменить поведение захвата при нечитаемом файле.
- После L2 `main` ушёл дальше (изменения `eval-live`, ветку не затрагивают). В ветку слит `main` на `7a09bf2`.

## Хвосты и риски
- Порог 2 048 не настраивается. Если запрос дочерней ячейки с большим входом проходит по окну, но не по бюджету,
  теперь будет честный `partial` с числами, а не «reserve reached».
- Отказ допуска дочернего хода срабатывает до проверки лимитов задачи в `budget.admit`. Ветвь C3r «перерисовать как
  резервный ход» для дочерних ячеек в этом случае не запускается: дочерние ячейки её и раньше не достигали при
  исчерпании рабочих токенов. На тестах не проявилось.
- `verify(review)` в S1 по-прежнему недоступен для инкремента (п. 4 только называет области). Включение — вне карточки.
- Studio WD-17 и сторона WF-9 в Studio — за W5.

Статус: ГОТОВО К СЛИЯНИЮ — последний коммит ветки `c000b78` (ветка запушена).

## Ревью Codex (gpt-6.1-sol, xhigh, по диффу `7a09bf2..c000b78`, после слияния `408ac40`) — запись оркестратора
- P1 бинарная совместимость: параметр `boundedOutput` со значением по умолчанию в `CellContext` (`CellContext.kt:195`, `core.api:5802`) заменяет синтетический конструктор с умолчаниями → `NoSuchMethodError` у ранее скомпилированных Kotlin-потребителей. → раунд исправлений.
- P2 денежный шлюз задачи оценивает неурезанный выход (`Cell.kt:454`, `Limits.kt:414`) → раунд.
- P2 порог 2048 обходит повтор с резервом C3r, в т. ч. для писателей S3 (`Cell.kt:421`, `Controller.kt:2535`) → раунд.
- P2 компиляция и маршрутизация резервируют полный выход модели (`Controller.kt:2610`, `Compiler.kt:112`) → хвост (больше карточки).
- P2 недоступное ревью на уровне кампании теряет числа (`Controller.kt:2736`, `ReviewCell.kt:70`, `CampaignReview.kt:132`) → раунд (критерий карточки п. 3).
- P2 раннее неудачное открытие (блокировка проекта в `Store.open`, `Controller.kt:541`, `Store.kt:102`) без `phase.counted` → раунд (хвост W0 карточки).
- P2 страж WF-9 частично пустой (`ReviewScenarioTest.kt:136`, `:108`): отказанный `look` считается, негатив не проверяет исход → раунд.
Раунд исправлений — после слияния W3 (`Controller.kt` у W3).

## Раунд исправлений
Ветка `v2/W4`: в неё слит `main` `37a649d` (W4 + W3), слияние прошло без конфликтов. Коммит раунда `6bdbf0f`, ветка запушена.
Свои изменения: 13 файлов. Циклов «правка → тест»: 1 (L1 зелёный с первого прогона), затем L2.
- **P1 ABI — исправлено.** `CellContext.boundedOutput` убран из конструктора и стал свойством тела
  (`public var`, `internal set`; контроллер ставит его через `.also`). Дамп `core.api` относительно `e75d38d` только
  добавляет `getBoundedOutput()`, оба дескриптора конструктора остались прежними (`updateKotlinAbi` один раз, `checkKotlinAbi`
  зелёный).
- **P2 цена в денежном гейте — исправлено.** Новый `internal interface PricedLimitGate : LimitGate` с
  `check(spend, estimate, outputTokens)`. Новый `internal CellBudget.admit(spend, estimate, outputTokens)`, публичный
  `admit` его вызывает. `Cell` передаёт `request.maxOutputTokens`. `CellLimits.gate` считает вход как `estimate − output`
  и выход как запрошенный, а не максимальный выход модели. Публичный API не менялся. Тест:
  `TaskLimitsTest` «a bounded request is priced at the output it asks for…» — 3 513 + 20 487 при лимите $0.50 проходит,
  та же сумма по старой цене (64K выхода) — `Exhausted`.
- **P2 порог 2 048 и C3r — исправлено.** Нехватка выхода больше не завершает ход до допуска. Ход идёт в `budget.admit`
  с наименьшим выходом. Если резерв лимита задачи (`Reserve`) отклоняет генерацию, ход перерисовывается как резервный
  (verify-and-report). Иначе `partial` называет числа нехватки; у исчерпанного лимита остаётся его собственная причина.
  Тест: `TaskLimitTurnTest` «a bounded child whose working tokens cannot hold the least output still takes the reserve
  turn…» — 1 000 рабочих + 30 000 резерва проверки: генерация отклонена, ход как `Check` допущен, модель вызвана, правки
  замаскированы.
- **P2 числа недоступного ревью кампании — исправлено.** `ReviewCellAuthority` запоминает `ladder.reason` по id запроса
  (`internal unanswered(id)`). `CampaignReview.unanswered` (internal, ставит `Controller.campaignReview`) добавляет причину
  в запись: `no reviewer answered … (review cell: …)`. Вердикт не выдумывается. Тест: `ReviewCellTest` campaign scope —
  хост вернул `null`, `unanswered(id)` несёт текст ячейки. Сквозного сценария кампании нет (нужен S2 с ≥ 3 инкрементами
  или неподписанный пункт `Review`) → хвост.
- **P2 раннее неудачное открытие — исправлено.** Публичный `open(repo,…)` охватывает `Store.open` и `LocalOs`. При отказе
  выпускается `PhaseMark.beforeWorkspace` (только счётчики git, без нового `Workspace`, чтобы не вытеснить живое рабочее
  дерево) и исключение пробрасывается. Тест: `ReviewScenarioTest` «an open the project lock refuses…» — второе открытие
  получает `ProjectLockHeld`, событий открытия 2, у отказанного `gitProcesses > 0`.
- **P2 страж WF-9 — усилен (не ослаблен).** Позитивный случай: заголовок результата `look` ревьюера несёт
  `v={src/a.py: <версия после правки>}`; кампания `Completed`. Негативный случай (бюджет 3 000): числа, 0 запросов,
  `WaitingForInput` с `AcceptanceDecisionRequest` для `I1`. Неизменное продолжение — 0 вызовов модели, число записей
  ревью без `reused` не растёт. Явное `Accept` пользователя → `Completed` без вызова модели.
- **Хвост (не в этом раунде):** компиляция и маршрутизация по-прежнему резервируют полный выход модели
  (`Controller.kt:2610`, `context/Compiler.kt:112`); сквозной сценарий недоступного ревью кампании.

### Тесты раунда
- L1 (один раз): `ReviewScenarioTest` 4, `TaskLimitTurnTest` 2, `CellBudgetTest` 4, `TaskLimitsTest` 30,
  `ReviewCellTest` 8, `CellTest` 62, `S2CampaignTest` 5, `StageCCampaignTest` 2 — 117/0.
- L2 (один раз): `workflow.*`, `cell.*`, `delegate.*`, `campaign.*`, `tool.verify.*`, `budget.*` — 69 классов, 518 тестов,
  7 упали: `S3CampaignTest` 6 и `PrecompileCampaignTest` 1. **Регрессия уже на `main`, не от W4.** На `37a649d` без
  ветки — те же 6 + 1 падения. Бисекция: `03903d2` (W3 до W4) — S3 9/0; `7bfce10` (слияние W4 в W3 без подключения в
  контроллере) — S3 9/0; падает после `f40fa47` (W3: «the Controller wires the attempt's frozen output policy»: стампер
  открытия с `frozen.scratch`, атлас из захвата, `deriveS0(scratch=…)`). В этом раунде не чинил: вне замечаний, область
  W3. Нужна отдельная задача.
- Набор WF (повтор после L2, Windows): DirtyRepoScenario 83,9 + DirtyRepo 1,7 + Finalization 20,9 + OutputPolicyScenario
  12,5 + ReviewScenario 26,6 + UnreadableFile 8,9 = **154,6 с** (≤ 180), 18/0.
- `./gradlew assemble testClasses checkKotlinAbi -Pastrolabe.aiGateBuild=…` — успешно.
- После L2 `main` ушёл на `36b0f8c` (W5, корневой репозиторий / реестр). В ветку не сливал.

Статус: ГОТОВО К СЛИЯНИЮ (S3/Precompile красные на `main` с `f40fa47` — отдельно) — последний коммит ветки `6bdbf0f`.
