# WP-C3 — отчёт линии (лимиты на задачу и статические профили)

Ветка `v2/C3` (worktree ядра `agent-a5a111e87f0a41ae4`), база `main` 6daabfc; слиты `main` e28133a (Dp1), da09603
(Dp2) и 13cea02 (C1b). Первый вариант (0e82e39) прошёл ревью Codex и Fable с вердиктом «сначала исправить»; ниже описано состояние после исправлений.

## Сделано
1. **Лимиты на задачу.** Тип `TaskLimits(maxCost: Money?, maxMinutes: Int?, maxRequests: Int?)`; `null` означает «без лимита», и по умолчанию лимитов нет.
   Лимиты задаются в `CampaignPolicy.limits: TaskLimits?` и хранятся вместе с кампанией (запись журнала `limits: set by the host` с payload):
   `null` оставляет сохранённые лимиты, `TaskLimits.NONE` снимает все, любое другое значение заменяет. Расход считается только из сохранённых записей:
   - строки `usage` — сначала billed (D-378), затем оценка по прайсу, затем hold; если ничего неизвестно — unknown, но никогда не 0; `CostBasis`;
   - минуты — сессии запусков в журнале по инжектируемому `Clock`, с паузами на время ответов хоста;
   - запросы — число вызовов модели.
2. **Исполнение.** Одна цена следующего вызова `C` в трёх точках: на границе ячейки, в начале хода и при admission. Плюс резерв `R` (формула в «Решениях»).
   - Клетка спрашивает `LimitGate` в `CellBudget` перед каждым ходом и каждой admission (`Cell.kt` не тронут).
   - Та же проверка повторяется в одной транзакции с записью hold вызова (`Accounting`, внутренний конструктор с admission), поэтому параллельные ячейки и писатели S3 не проходят лимит вместе.
   - Фаза резерва защёлкивается до тех пор, пока хост не изменит лимит.
   - Отказ, который завершает ячейку, запоминается на кампании. На ближайшей границе `limitStop` делает снимок, re-accept по квитанциям и выбирает лучший кандидат; итог — `budget_exhausted` с типизированным `BudgetStop.TaskLimit*`.
   - Если первый вызов не помещается даже один, кампания детерминированно останавливается с пометкой лимита, без пустых ячеек.
   - Экстрактор при денежном лимите и без верхней оценки цены отклоняется (fail closed).
3. **Поднять лимит может только хост.** Reopen, на котором лимиты снова оставляют место, применяет `Transition.LimitRaised`: продолжается та же попытка, ledger сохраняется. Если какой-то лимит всё ещё исчерпан, пишется журнал `limits: still reached (<вид>)` и событие `budget.limit_reached(stopped)` с именем мешающего лимита.
   `BudgetStop.CellCap` (`maxCells` считается за один `run`) тоже продолжается на reopen. `ContractBudget` не возобновляется (это хвост).
4. **Профили** Economy / Balanced / Thorough выбираются при старте (`CampaignPolicy.balance` или `Config.balance`) и замораживаются на попытку.
   Окно Economy сужается не ниже порога, при котором оценка замедления остаётся ≤ 2: потолок владельца главнее правила «окно ниже ценового яруса».
   Останов `NEEDS_RESCOPING` называет границу профиля.
5. **События:**
   - `budget.spent` (`LimitStatus`, включая `nextCallCost`) — всегда, даже без лимитов: перед каждым новым вызовом и ещё раз в `finish`;
   - `budget.limit_reached` (`reserve` | `stopped`, `bestCandidate`, `action = raise_limit`);
   - `campaign.finished.budgetStop`;
   - `Budget.Exhausted` выпускается один раз на исчерпанный лимит в ячейке.
6. **D-392.** Расход берётся только из записей: reopen ничего не списывает дважды. Сессию, оборванную сбоем, `open()` закрывает временем её последнего события до того, как пишет свои строки.
7. **Хвост Dp1 (D-398):** `carryFrom` передаёт `seedRule.selector` и последние квитанции; есть тест.
8. **Слияние с C1b.** В `FinishReceipt` оставлены оба набора полей, `limit` последним; ABI-дамп регенерирован.
   - Ярлыки `LimitStop` берутся из расчёта самой квитанции: `labelledBy(receipt)` переносит требования, принятые решением, в `accepted` и добавляет `provenance` — класс происхождения каждого требования, как его считает `FinishReceipt` (с учётом вида рецензента).
   - Хвост C1b: явный флаг `CellContext.rework` выставляет контроллер (S0 и S1) при продолжении по решению `rework`. `GateState.reworked = ctx.rework ||` прежнее распознавание по закреплённой строке (оставлено для совместимости).

Файлы:
- Новые: `core/src/main/kotlin/io/astrolabe/{Balance.kt, budget/Limits.kt, campaign/Limits.kt}`.
- Изменены: `budget/CellBudget.kt`, `campaign/{Controller.kt, Lifecycle.kt, FinishReceipt.kt (+1 поле)}`, `telemetry/Accounting.kt` (внутренний конструктор), `event/AgentEvent.kt`, `Config.kt`.
- Тесты: `budget/LimitsTest.kt`, `campaign/TaskLimitsTest.kt` (12), `BalanceProfilesTest.kt`, `campaign/LifecycleTest.kt`, `java/JavaConsumptionSmokeTest.java`.
- Docs: `architecture/lifecycle.md`, `reference/defaults.md`. ABI: `core/api/core.api`.

## Решения
- **Цена следующего вызова и резерв (для Codex).**
  - Цена `C`:
    - запросы — `1`;
    - деньги — `C = max(E, u)`. `E` — консервативная оценка запроса: весь вход по самой дорогой входной ставке плюс весь output headroom. На границе ячейки и в начале хода берётся оценка последнего допущенного запроса; при admission — оценка самого запроса. `u` — самый дорогой учтённый вызов;
    - минуты — среднее активное время на вызов.
  - Резерв: `R = max(0, min(3·C, L − C))`, для запросов `R = max(0, min(3, L − 1))`. Резерв вмещает три вызова по цене следующего (verify, просмотр результата, отчёт); `L − C` оставляет один рабочий вызов. Доли от `L` нет: 3000 запросов → 3; $50 при $0,10 → $0,30; $10 при $1,50 → $4,50.
  - Решение `LimitRule.decide`:
    - `Exhausted`, если `S + C > L` (запросы: `S ≥ L`; минуты: `S ≥ L` или `S > L − C`);
    - иначе `Reserve`, если `S + C + R > L` (запросы: `S ≥ L − R`);
    - иначе `Within`.
    Генерации нужен `Within`; verify/report разрешён при всём, кроме `Exhausted`. В сравнениях к счётчику ничего не прибавляется, поэтому переполнения нет. Деньги отказывают безопасно: unknown-расход, следующий вызов без цены или другая валюта дают `Exhausted`.
- **Гарантии.**
  - Запросы — жёсткий предел: проверка и hold в одной транзакции.
  - Деньги ограничивают **учтённый** расход при консервативном допуске. Если провайдер выставит счёт выше hold, лимит может быть превышен на (billed − hold); перерасход записан. `CostBasis` — это происхождение суммы, а не верхняя граница.
  - Минуты — порог допуска: новый вызов не начинается, когда средний вызов уже не помещается в рабочую часть. Идущий вызов, команда или проверка может перерасходовать время на свою длительность. Срок `run` по умолчанию и тайм-боксы проверок урезаются до остатка времени; явный timeout у `run` и сам вызов модели не урезаются (граница).
- **Лучший кандидат.** Берётся самый поздний штамп приёмки на основной линии (основная линия движется только вперёд). Три списка:
  - `verified` — проверено на этом штампе;
  - `verifiedEarlier` — проверено на более раннем штампе и здесь не перепроверялось;
  - `accepted` — принято решением без проверки (I7), никогда не называется «verified».
  Дерево пользователя не подменяется; `workingTree` / `workingStamp` показывают, совпадает ли кандидат с деревом.
- **Останов по лимиту не подменяет настоящую причину (H).** Отказ плана, Pressure, CompletionStalled и `ContractBudget` сохраняют свою причину. Лимит назначается причиной, только если ячейка закончилась из-за отказа лимита. Рецензент S2, которому не хватило лимита, возвращает `review unavailable: task limit (…)`.
- **Таблица профилей** (оценка модели при λ = 1,5 и κ = 0,3, не гарантия):

  | | Economy | Balanced | Thorough |
  |---|---|---|---|
  | effort: шаг (дешёвая / дорогая; дорогая — output ≥ 5 USD/M) | −1 / −1 | 0 / 0 | 0 / +1 |
  | полный прогон | только в конце | каждые 5 | каждые 3 |
  | `look`/`run` budget | 3000 | 4000 | 8000 |
  | окно | 0,75 и ниже первого ценового яруса, но не меньше `W·ρ_rest/2` | всё | всё |
  | стоп-лосс k (тень E4) | 2 | 3 | 4 |
  | замедление: запросы / время | ≤ 2 / ≤ 2 (по применённому окну) | 1 / 1 | 1 / 1,80 |

  Формулы: `ρ_N = max(1, 1/f_results) · W / W_applied`; `ρ_T = ρ_N · λ^шаги_вверх · ((1 − κ) + κ·c)`.
  Тест проверяет все профили на фикстурах без ярусов и с ярусами (64k, 128k, 160k) для обоих классов моделей. Числа F для Economy дают 3,2, тест-негатив это ловит.
- **Публичные имена API (для C4).**
  - `io.astrolabe.budget`: `TaskLimits` (`NONE`, `any`, `maxMillis`), `LimitKind` (`Cost`=`money`, `Minutes`, `Requests`), `CostBasis`, `LimitSpend`,
    `LimitStatus(…, nextCallCost)`, `LimitDecision`, `LimitRule` (`decide`, `status`, `nextCost`, `reserveRequests(L)`, `reserveAmount(L, C)`,
    `meanCallMillis`, `RESERVE_CALLS`), `LimitGate`.
  - `io.astrolabe.campaign`:
    - `CampaignPolicy(…, limits: TaskLimits? = null, balance: BalanceProfile? = null)`;
    - `OpenedCampaign.limits` (лимиты, действующие сейчас);
    - `LimitStop(limit, reason, status, bestCandidate, verified, workingTree, workingStamp, verifiedEarlier, accepted)`;
    - `S0Run.limit`, `S0Run.budgetStop`, `FinishReceipt.limit`;
    - `BudgetStop` (`TaskLimitMoney|Minutes|Requests`, `CellCap`, `ContractBudget`; `taskLimit`, `resumable`, `wire`), `CampaignState.budgetStop`, `Transition.Stopped(…, budget)`, `Transition.LimitRaised`.
  - События: `budget.spent` (`status`), `budget.limit_reached` (`limit`, `stage`, `reason`, `status`, `bestCandidate`, `action`), `campaign.finished.budgetStop`.
  - `io.astrolabe`: `BalanceProfile`, `VerificationDepth`, `ModelClass`, `BalanceVector`, `Slowdown`, `BalanceProfiles` (`slowdown(vector, profile)`, `contextLimitTokens`, `bounded`, …), `Config.balance`/`withBalance`.
  - Как хосту продолжить работу: `Controller.open(repo|project, тот же CampaignRequest, CampaignPolicy(…, limits = поднятые))`, затем `run`.

## Ревью (находка → что сделано)
- **A. Одна цена во всех трёх точках, защищённый резерв.** Принято правило `C = max(E, u)` во всех трёх точках. Генерация допускается только при `S + C + R ≤ L`, admission больше не превращает `Reserve` в `Within`. Отказ запоминается (`LimitBlock` с ценой) и останавливает на границе; `LimitStop.status.nextCallCost` — требуемая сумма. При лимите меньше E кампания останавливается с пометкой лимита и возобновляется после его поднятия. Резерв `R` вмещает 3·C. Тесты: headroom по умолчанию, лимит $0,20 < E, затем $5 и resume; maxRequests = 1, 2, 3 без пустых ячеек.
- **B.** Фаза резерва защёлкивается (`latch`) до изменения лимитов.
- **C.** Проверка выполняется внутри транзакции hold (`BEGIN IMMEDIATE` и монитор `Db`) — для запросов и денег, для детей и писателей S3.
- **D.** Экстрактор без `maxCost` считается unknown и отклоняется под денежным лимитом.
- **E.**
  - (1) Висящая сессия закрывается в `open()` временем последнего события до записей reopen. Тест: сбой и 4 часа простоя дают 0 минут.
  - (2) Обёртка `pausing` вокруг `Authority` (ask/approve/resolve/review/decide) пишет журнал paused/resumed. Тест: 30 минут ожидания не считаются.
  - (3) Сессии пишутся всегда.
  - (4) Сравнения вида `S ≥ L − R`, тест на `Int.MAX`.
  - (5) Формулировки как в «Гарантиях»; урезание срока `run` и тайм-боксов проверок — `TaskLimitControl.bounded`.
- **F.** Тексты KDoc `TaskLimits`, `lifecycle.md`, `defaults.md` и этого отчёта согласованы.
- **G.** Кандидат — последний штамп приёмки, три списка; ничего, принятое без проверки, не называется verified. Тест: кандидат ≠ дерево, дерево не подменено, после поднятия лимита partial-ячейка продолжается.
- **H.** `onLimit` срабатывает только при запомненном отказе; у рецензента — «review unavailable: task limit».
- **I.** Добавлен журнал `limits: still reached (minutes)` и событие. Тест: «один из двух лимитов».
- **J.** Типизированный `BudgetStop` в состоянии, `S0Run` и `campaign.finished`; `open()` решает по коду. `CellCap` возобновляется на reopen. Отклонение: собственный enum вместо `verify.StopCode` — последний лежит в `Resolution.kt` (C1b) и в `CampaignState` ограничен `waiting_for_input`. Вместо «TokenBudget» назван `ContractBudget` (токены, ходы и деньги контракта).
- **K.** Лимиты хранятся с кампанией; `null` оставляет сохранённые, `NONE` снимает. Тесты: reopen с политикой по умолчанию сохраняет 7 минут; S0 после `NONE` продолжает работу.
- **L.** Окно с нижним порогом от потолка владельца, `slowdown(vector, profile)` по применённым отношениям, текст `NEEDS_RESCOPING` называет границу профиля, в docs — «оценка модели».
- **M.** `budget.spent` выпускается всегда и в `finish`; `Exhausted` не дублируется. Строки `usage` кэшируются по ключу (count, суммарная длина body) из одного лёгкого запроса.
- **N.** `carryFrom` передаёт селектор и квитанции; тест: V2 даёт `SEED src/a.py` на границе ячейки, V1 — нет.

## Тесты
- L1 после исправлений: `budget.*`, `campaign.ControllerTest`, `campaign.LifecycleTest`, `campaign.TaskLimitsTest`, `BalanceProfilesTest`, `java.JavaConsumptionSmokeTest` — 72 теста, 0 падений; затем `TaskLimitsTest` с тестом N — 12/12.
- L2 до слияния с C1b (пакеты `budget`, `campaign`, `cell`, `context`, `java`, `event` + `BalanceProfilesTest`): 67 классов, 445 тестов, 0 падений.
- **L2 на слитом состоянии** (`main` 13cea02 с C1b; те же пакеты + `io.astrolabe.verify.*`): 82 класса, 558 тестов, 0 падений, 1 skipped (пропуск существовал до C3). Результаты взяты из XML своего checkout; известные flaky не проявились.
- `:eval:compileTestKotlin` и `:provider-ai-gate:compileTestKotlin -Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm` — зелёные (модуль собран, а не пропущен).
- ABI: `:core:updateKotlinAbi` на слитом состоянии. Относительно `main` удалены только synthetic-, `copy`- и `component`-сигнатуры.
- Полный `./gradlew build` не запускался.
- Прежние прогоны (до ревью): L1 64, L2 254 — зелёные.

## Отклонения от карточки
- Исполнение — через `CellBudget.LimitGate` и admission в `Accounting` (внутренний конструктор в telemetry/), `Cell.kt` не тронут.
- `FinishReceipt.kt` (C1b): одно поле `limit` в конце. При слиянии с C1b оставить оба набора полей, `limit` — последним.
- Коды останова — свой `BudgetStop` (Lifecycle.kt), не `verify.StopCode` (см. J).
- Профили: числа F пересчитаны в множители относительно Balanced. У Thorough — всё окно. Effort — шаг от настроенного. Класс модели — по цене output.
- `Defaults.kt` и `AttemptConfig.kt` не менялись.

## Хвосты и риски
- Распространение срока на вызовы модели, явный timeout `run` и фоновые процессы — это граница минутного лимита (вынесено в хвосты).
- Через фасад `Astrolabe`/`AstrolabeJava` нельзя «поднять и продолжить»: он всегда создаёт новый `WorkId`.
- Не сделана поправка токенного бюджета контракта при resume: `ContractBudget` не возобновляется, токены `Astrolabe.campaign` по умолчанию = окно × `campaignCells`.
- Деньги: вызов, выставленный выше hold, может превысить L (записывается). `lastEstimate` общий на кампанию: у новой ячейки на другой модели граница и начало хода используют оценку предыдущей модели, а admission ставит точную.
- Кэш `usage` держится на ключе (count, суммарная длина body); совпадение длины после обновления маловероятно, но формально возможно.
- `review unavailable: task limit` меняет только возвращённый объект: запись рецензента в `packets` сохраняет исходную причину.
- Не покрыто тестом: рецензент S2 при резерве лимита, писатели S3 под лимитом, повторный `Budget.Exhausted`.
- Текст причины в `CampaignState.reason` пишется в момент останова собственными ярлыками. Поля `LimitStop` в квитанции и в `S0Run` переразмечаются расчётом квитанции, поэтому для требования, принятого решением, текст и поля могут разойтись (поля главнее).
- `labelledBy` не трогает запись `limits: reached` в журнале: её payload хранит неразмеченный `LimitStop`, и `finish` размечает его заново.
- Модель замедления (λ, κ, порог 5 USD/M) не измерена. При tiered-маршрутизации шаг effort берётся по классу поданной модели. `precompile` не пересжимается под окно Economy.
- Ревью: Codex — правило резерва и цена `C`, потолок замедления по применённому окну; Fable — `limitStop`/`onLimit`, `open()` (K, J, I, E1), транзакционная admission.

Статус: ГОТОВО К СЛИЯНИЮ — последний коммит ветки `v2/C3`: 42e9d7e
