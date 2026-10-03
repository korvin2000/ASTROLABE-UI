# WP-C4 — дизайн: Studio — лимиты на запуск задачи, подход (профиль), живой счётчик, ярлыки исхода

> **Поправка владельца 2026-10-03 (главнее текста ниже).** Пределы по умолчанию не должны быть жёсткими: сложные
> задачи идут несколько часов, стоят больше $5 и делают тысячи запросов. Умолчания настройки лимитов —
> **$50.00 / 480 мин (8 ч) / 3000 запросов**, каждое поле можно очистить («без лимита»). Скрытые технические
> предохранители не должны срабатывать раньше лимитов пользователя: `tokens = окно × max(12, requests ?? 10000)`,
> `maxCells` **48** вместо 12 (уточнит D3 — отдельный предел handoff). Миграция старого `Preferences.LIMIT`: денежное
> значение переносится как есть, но не ниже нового умолчания только если пользователь его не задавал (`auto`/`tokens` →
> умолчания). Время в интерфейсе показывать в часах, когда лимит ≥ 120 мин. Если где-то ниже остались числа
> `$5 / 60 / 300`, `×1000` или `maxCells = 12` — действуют числа этой поправки.
>
> **Решения оркестратора по открытым вопросам §«Открытые вопросы»:** (1) effort — «по подходу», явный выбор хоста
> сильнее; (2) лимиты действуют на запуск, подпись в UI — «на запуск»; (4) слово «Подход»/"Approach"; (5) признак
> рецензента делает ядро (C1b: поле в `Verdict`, по умолчанию «не человек») — `ReviewPass` проставляет «модель»,
> понижение по подписи `studio:review-pass(` в Studio остаётся только запасным путём для старых квитанций.

Этап 1 (t5, 2026-10-03). Задание исполнителю этапа 2 (t3, ветка `v2/C4` корневого репозитория `C:\work.astrolab`,
Studio = `ASTROUI/`). Ядро не трогать. Всё, что ниже названо «допущение A-n / B-n», сверяется оркестратором с
`plan2/reports/WP-C3.md` и `WP-C1b.md` **до** старта этапа 2 (на момент дизайна отчётов нет, ветки `v2/C3`, `v2/C1b`
без коммитов); расхождение правится только в точках адаптации из §8 и записывается в «Отклонения» отчёта.

Сокращения путей: **B** = `ASTROUI/backend/bridge/src/main/kotlin/io/astrolabe/studio/bridge`,
**S** = `ASTROUI/backend/server/src/main/java/io/astrolabe/studio`, **F** = `ASTROUI/frontend/src/app`,
**K** = `ASTROLABE/core/src/main/kotlin/io/astrolabe`.

## 0. Итог

1. Лимиты деньги / минуты / запросы и подход задаются на каждый запуск в composer, едут `POST /tasks` → `TaskService`
   → `StartSpec.limits/preset` → `StudioHost.launch` → API ядра C3. Глобальный токенный `Preferences.LIMIT` удалён;
   токены и `maxCells` остаются невидимыми техническими предохранителями.
2. Живой счётчик — чистый редьюсер во фронтенде над уже идущим потоком событий `campaign:<work>` (серверного кода
   для счётчика нет): деньги, время, запросы, контекст против лимитов.
3. Ярлык исхода считает сервер из `finish-receipt.json` (`provenanceClass` + поправка «только судья»), фронтенд только
   показывает: «Проверено независимо» / «Проверено тестом агента» / «Не проверено» + пометка «одобрено судьёй-моделью».
4. Остановка по лимиту — состояние `paused` с кодом `limit_money|limit_minutes|limit_requests`, заголовок «Остановлено
   по лимиту», строка о лучшем проверенном результате, действие «Поднять лимит и продолжить» (resume той же попытки).
5. Карточка «Сделать проверкой проекта» — блок в карточке результата; объявление сохраняется существующим механизмом
   Studio: настройки проекта `checks.test` (`ProjectSettings`), откуда `SavedChecks` → `Verification.apply` делает
   `Acceptance.Run` с происхождением хоста.

## 1. Что есть сейчас (проверено по коду)

| Факт | Где |
|---|---|
| `StartSpec(requestText, tokens, costCurrency, costAmount, resumeExpected, maxCells = 12, leaseMinutes, effort, maxOutputTokens, verificationSetup, savedChecks, hostAuthority, protectedPaths)`, `@JvmOverloads`; Java-вызовы позиционные | `B/HostApi.kt:20-37`; вызовы: `S/tasks/TaskService.java` ≈563, `S/campaigns/CampaignService.java` ≈283, ≈465 |
| Studio ведёт ядро через `Controller` напрямую (не через `io.astrolabe.java`): `CampaignPolicy(Tokens, cost, resumeExpected)` → `controller.open(project, request, policy)` → `controller.run(opened, model, authority, maxCells)`; resume = тот же `launch` с теми же id | `B/StudioHost.kt:239-352` (policy — 261, run — 321) |
| Лимит: `Preferences.LIMIT` `{kind: auto|tokens|money, value}`; `auto` = окно × 12; роли `helper`/`escalation` обнуляются; `maxCells` из `runtime` (12) | `S/tasks/TaskService.java` ≈537-566; `S/settings/Preferences.java:28,55,105-115` |
| Исход `budget_exhausted` → состояние `paused`, причина `limit_reached`; «Продолжить» для него = **новый follow-up-запуск** (`resumable()` его не включает) | `TaskService.java` ≈150-153, ≈668-673, ≈800-817; `F/features/task/error-actions.ts:22` |
| `stop_code` сохраняется только для `waiting_for_input` | `CampaignService.java` ≈433 |
| Итог задачи: `verifiedLabel(Run)` читает `exports/<work>/finish-receipt.json` → `tests|review|user|unverified|none`; фронтенд: `verifiedOf`, `stateKey`, `doneUnverified`, `ResultCard.verified` | `TaskService.java` ≈258-283; `StudioHost.finishReceipt` 568; `F/features/task/acceptance.ts`, `cards.ts` |
| Все события шины ядра (кроме `cell.model_progress`) пишутся в `event_log` и публикуются в тему `campaign:<work>` как `StudioItem {kind, at, data}`; фронтенд применяет их в `TaskStore.apply` → `Timeline`/`FlowModel` | `S/live/EventPipeline.java:86-117`; `F/state/task.store.ts`; `F/timeline/timeline.ts` |
| `cell.model_responded.data.usage` несёт `quantities`, `billed {currency, amount}` (D-378), `facts.latencyMillis`; `cell.model_requested.data.estimatedTokens` | `K/event/AgentEvent.kt:101-119`; `provider-api Usage.kt:105-115` |
| `studio.opened` несёт `tokens` (лимит) → `Timeline.limitTokens` → полоска «% лимита» в панели Progress | `CampaignService.java` ≈402-418; `timeline.ts:74,185`; `F/features/panel/progress.ts:103-109` |
| Проверка без тестов: `check:`-элемент оценивает review pass Studio (модель) через `Authority.review`; вердикт подписан `studio:review-pass(<model>)`; ядро пишет путь `human` → в квитанции `verifiedBy = "human"`, `acceptedBy = "studio:review-pass(…)"`; человек подписывает `user:<actor>` | `S/tasks/ReviewPass.java` ≈129,167; `S/decisions/DecisionService.java:446`; `K/campaign/FinishReceipt.kt` (строки `check`/`review`) |
| Объявленные проверки проекта: `runtime.project.checks.{test,build,lint}` (`PUT /projects/{id}/settings`); только `test` становится `Acceptance.Run` и только когда ядро само ничего исполнимого не вывело (`opened.state == null`) | `S/tasks/ProjectSettings.java:115-131,163-166`; `B/Verification.kt:58-67`; `StudioHost.kt:269-277` |
| Локализация: каталоги `F/i18n/catalog.en.ts` / `catalog.ru.ts`, ключи `семейство.имя`, pipe `t`; язык — `Preferences.language` (`en`/`ru`). Тест `F/vocabulary.spec.ts` запрещает в каталогах и шаблонах слова `profile/профил`, `candidate/кандидат`, `receipt`, `attempt`, `evidence`, `gate`, `tier`, `turn`, `ceiling`, `stamp` … и текст вне каталога | `F/vocabulary.ts`, `F/vocabulary.spec.ts` |
| Настроек ровно 19 («бюджет сложности»), №13 — `limit` | `F/features/settings/setting-list.ts` |

## 2. Решения дизайна

| # | Решение | Почему | Отвергнуто |
|---|---|---|---|
| R1 | Слово интерфейса для профиля — **«Подход» / "Approach"** (Экономный / Сбалансированный / Тщательный — Economy / Balanced / Thorough). В коде и wire — `preset` (`economy|balanced|thorough`) | «профиль/profile» запрещены словарём Studio (UX-1) и в коде Studio уже значат профиль модели | «Режим» — занято (Спрашивать/Авто); правка списка запрещённых слов |
| R2 | Лимиты действуют **на запуск** (одна кампания ядра): follow-up-запуск той же задачи считает с нуля теми же лимитами; «поднять лимит и продолжить» продолжает тот же запуск с прежним расходом | Лимиты C3 — на попытку кампании; так же вёл себя старый лимит | Сумма по всем запускам задачи — потребовала бы учёта в Studio поверх ядра (открытый вопрос №2) |
| R3 | Значения по умолчанию: **$50.00 / 480 мин (8 ч) / 3000 запросов**; каждое поле может быть пустым = «без лимита». Хранение — `Preferences.TASK_LIMITS`, настройка №13 (число настроек не растёт) | Стартовые, не измеренные: $5 — прежний запас Studio для денежного лимита (`settings.ts:298`), 300 запросов ≈ 4,5× длинного живого прогона (67 вызовов), 60 мин — с запасом к нему | Отдельные настройки для каждого лимита (+2 к 19) |
| R4 | Подход по умолчанию — «Сбалансированный»; выбранный при старте запоминается (`Preferences.DEFAULT_PRESET`, без строки в настройках — как `lastProject`). Переопределения лимитов на задачу **не** запоминаются | Разовое поднятие лимита не должно менять умолчание | Строка настроек |
| R5 | Токенный бюджет ядра и `maxCells` остаются техническими предохранителями: `tokens = окно × max(12, requests ?? 10000)`, `maxCells` — как сейчас из `runtime`. Остановка по ним — прежний код `limit_reached` и прежний путь «Продолжить с запасом» (follow-up) | `CampaignPolicy.tokens` обязателен; при `окно × 12` скрытый предел сработал бы раньше 300 запросов и пользователь увидел бы «лимит», которого не задавал | Оставить `окно × 12`; убрать `maxCells` (не в границах C4) |
| R6 | Роли `helper`/`escalation` по-прежнему `null` (`TaskService.config`) | План §12: советник/эскалация в 2.0 не делаются; одна модель на все функции (Studio §6.5) | — |
| R7 | Effort остаётся явным выбором пользователя в выборе модели и передаётся как сейчас; подход управляет остальным вектором | Минимальный объём; два источника effort без нового UI не развести (открытый вопрос №1) | Значение «по подходу» в выборе effort (+≈40 строк) |
| R8 | Счётчик — редьюсер фронтенда `Meter` над потоком событий; источник истины — событие расхода ядра (A5), запасной — сумма по `cell.model_responded` | Поток уже доходит до фронтенда и воспроизводится из `event_log`; счётчик обязан совпадать с тем, что исполняет ядро | Серверный расчёт через `StatsService` на каждое событие (другая цена, O(n) на вызов) |
| R9 | Ярлык происхождения считает сервер (`tasks/Provenance.java`), чистая функция от JSON квитанции. Класс `independent` понижается, если требование закрыто **только** одобрением модели-судьи: судья = `provenance == "reviewed"` и (`verifiedBy` ∉ {`runtime`, `human`} **или** `acceptedBy` начинается с `studio:review-pass(`) | Решение владельца D-397. Ядро принимает review pass Studio за путь `human` и само его не понизит | Правка ядра; ярлык на фронтенде (дублирование правила) |
| R10 | Состояний задачи по-прежнему шесть. Лимит = `paused` + коды причины `limit_money|limit_minutes|limit_requests`; заголовок и карточка читают «Остановлено по лимиту» | Существующий механизм «код → предложение + ≤ 2 действия» (`error-actions.ts`, `sentence()`) без изменений | Новое состояние `limit` |
| R11 | «Поднять лимит и продолжить» — два шага: кнопка открывает меню лимитов composer с удвоенным достигнутым лимитом, пользователь подтверждает | Нельзя тратить деньги по одному клику без показанного числа | Автоудвоение одним кликом |
| R12 | Карточка проверки проекта предлагается только когда: запуск `completed`; в `checksRun` есть прошедшая проверка `CHK-model-*` вида `tests` с командой в корне проекта; у проекта **нет** команды тестов (`checks.test.source == "none"`). Сохранение — `checks.test` | В этом случае существующий путь (`opened.state == null` → `Verification.choose`) гарантированно применит команду в следующей задаче; без правок `StudioHost.launch` | Проекты с обнаруженной командой, подкаталоги (`cwd`), build/typecheck — в хвосты |
| R13 | «Лучший проверенный результат» — только сообщение (три варианта текста); восстановления файлов нет | C3: рабочее дерево не подменяется; восстановление потребовало бы API ядра | Кнопка «вернуть проверенное состояние» |

## 3. Контракты

### 3.1 Bridge (`B/HostApi.kt`)

```kotlin
/** The user's hard limits of one run (ASTROLABE 2.0 C3/C4); null = no limit. */
public data class TaskLimits @JvmOverloads constructor(
    val moneyUsd: String? = null,   // decimal, US dollars
    val minutes: Int? = null,
    val requests: Int? = null,      // model calls
)
```

`StartSpec` — два новых параметра **в конце** (позиционные Java-вызовы не меняются):
`val limits: TaskLimits = TaskLimits()`, `val preset: String = "balanced"`.
`costCurrency`/`costAmount` остаются для старого API кампаний; `TaskService` их больше не заполняет.

### 3.2 REST (`S/api/SimpleApi.java`)

| Запрос | Добавляется |
|---|---|
| `POST /tasks` | `preset?: "economy"|"balanced"|"thorough"`, `limits?: {moneyUsd: string|null, minutes: number|null, requests: number|null}` (фронтенд шлёт объект целиком; `null` = без лимита; отсутствие `limits` = умолчания) |
| `POST /tasks/{id}/messages`, `POST /tasks/{id}/continue` | те же `preset`, `limits` |
| `POST /tasks/{id}/project-check` (новый) | тело `{command: string}` → объект задачи |

Проверка лимитов (`400 invalid`): `moneyUsd` — десятичное > 0 и ≤ 10000; `minutes` — целое 1…10080; `requests` — целое 1…100000.

### 3.3 Объект задачи (`TaskService.task`) — новые поля

```jsonc
"preset": "balanced",
"limits": { "moneyUsd": "50.00", "minutes": 480, "requests": 3000 },   // последнего запуска; null-поля = без лимита
"provenance": { "class": "independent" | "agent_test" | "unverified", "judge": false },
                 // только при outcome == completed и квитанции с полем provenanceClass; иначе поля нет
"limit": { "kind": "money" | "minutes" | "requests", "best": "current" | "earlier" | "none",
           "bestClass": "independent" | "agent_test" | "unverified" | null },   // только при остановке по лимиту пользователя
"checkOffer": { "command": "pytest -q" }                                         // только full, по правилу R12
```

Причина остановки: `reason = {code: "limit_money"|"limit_minutes"|"limit_requests", params: {limit: "50.00" | 480 | 3000}}`;
технический предел — прежний `limit_reached` без параметров. Поле `verified` остаётся как есть.

### 3.4 Поток событий

`studio.opened.data` получает `limits` (как в 3.3) и `preset`; `tokens` остаётся (технический). Новое уведомление
`studio.notice {code: "project_check_saved", command}`. Остальное — события ядра без изменений (см. §8).

### 3.5 Хранение (`S/db/StudioDb.java`, миграция №4)

```sql
ALTER TABLE campaign_index ADD COLUMN limits_json TEXT;
ALTER TABLE campaign_index ADD COLUMN preset TEXT;
INSERT OR IGNORE INTO preference (key, json, updated_at)
  SELECT 'taskLimits', json_object('moneyUsd', json_extract(json, '$.value'), 'minutes', 480, 'requests', 3000), updated_at
  FROM preference WHERE key = 'limit' AND json_extract(json, '$.kind') = 'money';
DELETE FROM preference WHERE key = 'limit';
```

`Preferences`: удалить `LIMIT`; добавить `TASK_LIMITS = "taskLimits"` (умолчание `{moneyUsd:"50.00", minutes:480, requests:3000}`)
и `DEFAULT_PRESET = "defaultPreset"` (`"balanced"`); оба в `KEYS`, `defaults()`, `validate()`. Запуск со старой строкой
без `limits_json` (NULL) наследует умолчания из настроек.

## 4. Поток данных

**Старт.** composer (пилюля «Подход и лимиты») → `NewTask.start` → `POST /tasks {…, preset, limits}` →
`TaskService.start` (нормализует, `campaigns.register(run)`, затем `campaigns.setBudget(workId, limitsJson, preset)`;
явный `preset` запоминает в `DEFAULT_PRESET`) → `launch` → `spec()` читает строку запуска → `StartSpec(…, limits, preset)`
→ `CampaignService.open` → `StudioHost.start/launch` → **точка адаптации** `corePolicy(spec)` → `controller.open`.
`studio.opened {limits, preset}` уходит в поток.

**Счётчик.** `TaskStore.apply(item)` → `Timeline.apply` → `timeline.meter.apply(item)`:

| Событие | Действие `Meter` |
|---|---|
| `studio.opened` | `limits`, `preset` из данных; без `resumed` — обнулить расход (новый запуск); открыть отрезок времени с `item.at` |
| `cell.model_requested` | `contextTokens = estimatedTokens` |
| `cell.model_responded` | `requests += 1`; `usage.billed.amount` (USD) прибавить к деньгам; нет `usage` или `billed` → `moneyExact = false` |
| событие расхода ядра (A5) | перезаписать `requests`, деньги (+ признак «оплачено/оценка»), `activeMs` значениями ядра |
| `studio.run_ended`, `studio.task_state` ≠ `working` | закрыть отрезок: `activeMs += at − runningSince` |

`meter.view(now)` → `{money: {spent, limit, exact} | null, time: {ms, limitMin}, requests: {n, limit}, context: {used, limit}}`
и `near` (любая доля ≥ 0,8). Время между событиями дорисовывают существующие секундные часы `TaskStore.now`. Окно
контекста — `UsableModel.context` модели задачи (`TaskStore.showModel` передаёт в `meter.contextLimit`). Деньги, когда
`moneyExact == false` и ядро суммы не дало: показать `task.usage.cost` (серверная оценка, после обновления задачи) с
«≈», иначе «стоимость неизвестна» — никогда `$0.00`. Воспроизведение истории идёт по `item.at`, без `Date.now()`.

**Исход.** `studio.run_ended` → `TaskStore.refreshTask()` (уже есть) → `task.provenance` / `task.limit` /
`task.checkOffer` → `ResultCard` / `ErrorCard` / заголовок.

**Поднять лимит.** `ErrorCard` действие `raise_limit` → `actions.show({dialog: 'limits'})` → `TaskView`: кладёт в
`actions.next` лимиты с удвоенным достигнутым (`raised()`), открывает меню лимитов composer в режиме подтверждения →
кнопка «Поднять лимит и продолжить» → `actions.resume()` → `POST /tasks/{id}/continue {limits}` → `TaskService.resume`:
запуск остановлен по лимиту пользователя **и** новый лимит этого вида `null` или больше прежнего → записать
`limits_json`, `continueRun(last, null, …)` (resume той же попытки, A4). Лимит не поднят → `400 invalid`
(`limit.raise_needed`). Обычное сообщение или «Продолжить» без поднятых лимитов на таком запуске — прежний follow-up
(новый запуск с нуля теми же лимитами). `preset` при продолжении на месте игнорируется (заморожен на попытку).

**Карточка проверки.** `ResultCard` показывает блок при `task.checkOffer` → «Сделать проверкой проекта» →
`POST /tasks/{id}/project-check {command}` → сервер пересчитывает предложение по квитанции последнего запуска, команда
должна совпасть (иначе `400`) → `ProjectSettings.saveCheck(projectId, "test", command, "local")` →
`studio.notice project_check_saved` → задача без `checkOffer`. «Не сейчас» — `localStorage['studio.checkOffer.' + taskId]`.

## 5. Правила сервера (чистые функции — под тесты)

### 5.1 `S/tasks/Provenance.java` (новый, без Spring)

`static Label of(JsonNode receipt)` → `record Label(String cls, boolean judge)` или `null`, если в квитанции нет
`provenanceClass`.

1. `judged(line)`: `provenance == "reviewed"` и (`acceptedBy` начинается с `studio:review-pass(` или `verifiedBy`
   не `null`, не `"runtime"`, не `"human"`).
2. `judge` = есть хотя бы одна `judged`-строка в `acceptance`.
3. Класс: если `receipt.provenanceClass != "independent"` → он же. Иначе по каждому требованию из `requirements` с
   классом `independent`: `lines` = строки `acceptance` с `id` из `requirement.acceptance`; если среди них нет строки
   с `provenanceClass == "independent"` и не `judged`, но есть `judged` → требование «только судья»: его класс
   `agent_test`, если у какого-либо id из `requirement.agentChecks` есть запись в `checksRun` с `outcome == "passed"`,
   иначе `unverified`. Итог — худший класс по требованиям (`unverified` < `agent_test` < `independent`).

`static String checkOffer(JsonNode receipt, String testSource)` → команда или `null`: `receipt.outcome == "completed"`,
`testSource == "none"`, последняя запись `checksRun` с `checkId` на `CHK-model-`, `evidenceKind` = `tests` (без учёта
регистра), `outcome == "passed"`, непустой командой (B1) и `cwd` ∈ {`null`, `""`, `"."`}.

`static Best best(JsonNode receipt)` → `current|earlier|none` + класс (A7): нет поля лучшего результата → `none`;
его кандидат равен `receipt.stamp` → `current`; иначе `earlier`.

### 5.2 `S/tasks/Limits.java` (новый record)

`record Limits(String moneyUsd, Integer minutes, Integer requests)`: `parse(JsonNode, Limits fallback)` (проверка 3.2,
`ApiException.invalid`), `json()`, `toBridge()` → `TaskLimits`, `raised(String kind, Limits old)` (новое значение вида
`kind` — `null` или строго больше), `value(String kind)`. `Preferences.validate(TASK_LIMITS)` вызывает `Limits.parse`.

### 5.3 `TaskService`

- `stateOf`: `budget_exhausted` → `limitCode(r.stopCode())`: `limit_money|limit_minutes|limit_requests` → этот же код
  Studio с `params.limit`; иначе `limit_reached`. `limitCode` — единственное место, знающее wire-коды ядра (A3).
- `spec()`: `tokens = bound.contextTokens() × max(12, limits.requests ?? 10000)`; `costCurrency/costAmount = null`;
  `limits`, `preset` из строки запуска.
- `verifiedLabel(Run)` → один разбор квитанции `receiptOf(Run)`, из него `verified` (как сейчас), `provenance`, `limit`,
  `checkOffer`.
- `completedOutcome` (recap follow-up): `independent` → "finished and independently verified"; `agent_test` →
  "finished; verified only by the agent's own test"; иначе прежние формулировки.
- `runEnded`: для `budget_exhausted` — `studio.error` с тем же кодом и параметрами, что `stateOf`.
- `CampaignService.onRunEnded`: сохранять `stop_code` также при `budget_exhausted`.

## 6. Экраны и тексты

**Composer** (`F/features/task/composer.html`): четвёртая пилюля после «Режим»: `{подход} · {лимиты}`, например
«Сбалансированный · $50 · 8 ч · запросов: 3000» или «… · Без лимитов». Меню (`as-limits-menu`): три радио подхода
с однострочной подсказкой; три числовых поля с плейсхолдером «без лимита»; ссылка «Без лимитов» (очищает все три);
в задаче — строка «Смена подхода действует со следующего запуска задачи»; в режиме подтверждения — подсказка и кнопка
«Поднять лимит и продолжить» (выключена, пока достигнутый лимит не поднят).

**Счётчик** (`as-meter`): в строке статуса над composer (пока задача работает) и в панели Progress вместо полоски
«% лимита»: `$0.42 / $50.00 · 12:40 / 8 ч · 37 / 3000 запросов · контекст 41K / 200K`; без лимита — только расход;
доля ≥ 80 % — цвет `var(--warn)`; `role="status"`, `aria-label` = `meter.label`.

**Карточка результата** (`ResultCard`), строка «Проверено»: `[✓ только для independent] {ярлык класса}` + ` · ` +
деталь (`tests` → «Тесты пройдены (N)»; `user` → «Принято вами…»; `unverified` → «…принято автоматически»; для `review`
и `none` детали нет) + ` · одобрено судьёй-моделью` при `judge`. Без `task.provenance` (старые запуски, ответ) —
прежнее поведение. Блок предложения проверки — в стиле блока `.skipped`.

**Заголовок задачи и боковая панель**: `stateKey` → `done` + `independent` → «Готово»; `agent_test` → «Готово ·
проверено тестом агента»; `unverified` → «Готово · не проверено»; `paused` + код `limit_*` → «Остановлено по лимиту».
Знак ✓ зелёный только для `independent` (`StateMark.unverified = class != independent`).

**Карточка паузы по лимиту** (`ErrorCard`): заголовок «Остановлено по лимиту»; предложение по коду; строка лучшего
результата (`limit.best.*`) и под ней ярлык его класса; действия `['raise_limit', 'stop']`.

**Настройки №13**: вместо переключателя auto/tokens/money — три поля (деньги, минуты, запросы) с «без лимита» и одной
кнопкой «Сохранить».

### Каталог (`catalog.en.ts` / `catalog.ru.ts`; тексты проверены на запрещённые слова)

| Ключ | English | Русский |
|---|---|---|
| `composer.limits` | Approach and limits | Подход и лимиты |
| `preset.title` | Approach | Подход |
| `preset.economy` / `.balanced` / `.thorough` | Economy / Balanced / Thorough | Экономный / Сбалансированный / Тщательный |
| `preset.economy_help` | Spends less: fewer extra checks, shorter outputs. | Тратит меньше: меньше дополнительных проверок, короче выводы. |
| `preset.balanced_help` | The usual balance of cost, time and care. | Обычный баланс цены, времени и тщательности. |
| `preset.thorough_help` | Checks more and reads more. Costs more and takes longer. | Больше проверяет и читает. Дороже и дольше. |
| `preset.next_run` | A change of approach applies from the next run of the task. | Смена подхода действует со следующего запуска задачи. |
| `limit.title` | Limits | Лимиты |
| `limit.help` | Hard limits. The task stops before it would exceed one. Each new run of the task counts from zero. | Жёсткие лимиты. Задача остановится до превышения любого из них. Каждый новый запуск задачи считает с нуля. |
| `limit.money` / `.minutes` / `.requests` | Money, $ / Time, min / Requests | Деньги, $ / Время, мин / Запросы |
| `limit.none` | no limit | без лимита |
| `limit.no_limits` | No limits | Без лимитов |
| `limit.short_minutes` | {n} min | {n} мин |
| `limit.short_requests` | requests: {n} | запросов: {n} |
| `limit.invalid` | Enter a positive number or leave the field empty. | Введите положительное число или оставьте поле пустым. |
| `limit.raise_hint` | The limit that was reached is doubled. Change it if you want, then continue. | Достигнутый лимит удвоен. При необходимости измените его и продолжайте. |
| `limit.raise_needed` | Raise the limit that was reached, or clear it. | Поднимите достигнутый лимит или уберите его. |
| `limit.best.current` | The project files are the best verified result. | Файлы проекта — лучший проверенный результат. |
| `limit.best.earlier` | The best verified result is an earlier state. The files also hold later changes that were not verified. | Лучший проверенный результат — более раннее состояние. В файлах есть и более поздние правки, они не проверены. |
| `limit.best.none` | Nothing was verified yet: the changes in the files are not verified. | Проверенного результата пока нет: правки в файлах не проверены. |
| `action.raise_limit` | Raise the limit and continue | Поднять лимит и продолжить |
| `action.make_project_check` | Make it the project's check | Сделать проверкой проекта |
| `action.not_now` | Not now | Не сейчас |
| `meter.label` | Spent against the limits | Расход против лимитов |
| `meter.time` / `meter.time_free` | {clock} / {limit} min · {clock} | {clock} / {limit} мин · {clock} |
| `meter.requests` / `meter.requests_free` | {n} / {limit} requests · requests: {n} | {n} / {limit} запросов · запросов: {n} |
| `meter.context` / `meter.context_free` | context {used} / {limit} · context {used} | контекст {used} / {limit} · контекст {used} |
| `meter.money_unknown` | cost unknown | стоимость неизвестна |
| `provenance.independent` | Independently verified | Проверено независимо |
| `provenance.agent_test` | Verified by the agent's own test | Проверено тестом агента |
| `provenance.unverified` | Not verified | Не проверено |
| `provenance.judge` | approved by the model judge | одобрено судьёй-моделью |
| `state.done_agent_test` | Done · verified by the agent's own test | Готово · проверено тестом агента |
| `state.paused_limit` | Stopped at the limit | Остановлено по лимиту |
| `error.limit_money` | Stopped at the money limit (${limit}). | Остановлено по лимиту денег (${limit}). |
| `error.limit_minutes` | Stopped at the time limit ({limit} min). | Остановлено по лимиту времени ({limit} мин). |
| `error.limit_requests` | Stopped at the request limit ({limit}). | Остановлено по лимиту запросов ({limit}). |
| `error.limit_reached` (изменён) | Stopped at the built-in work limit. | Остановлено по встроенному пределу объёма работы. |
| `result.check_offer` | The agent checked the result with {command}. Make it the project's check? Later tasks will then count as independently verified when it passes. | Агент проверил результат командой {command}. Сделать её проверкой проекта? Тогда следующие задачи при её прохождении будут считаться проверенными независимо. |
| `notice.project_check_saved` | {command} is now the project's check. Change it in the project settings. | {command} теперь проверка проекта. Изменить её можно в настройках проекта. |
| `settings.limit` (изменён) | Limits per task | Лимиты на задачу |
| `settings.limit.help` (изменён) | Defaults for a new task: money, time and requests to the model. An empty field means no limit. | Значения по умолчанию для новой задачи: деньги, время и запросы к модели. Пустое поле — без лимита. |

В таблице пары ключей через «/» и «·» — отдельные ключи с текстами в том же порядке. Удалить:
`settings.limit.auto|tokens|money|unit_tokens|unit_money`, `progress.share`. Деньги форматирует `money()`
(`F/core/format.ts`), токены — `tokens()`, часы — `clockOf()`. Перед добавлением `action.not_now` проверить, нет ли уже
такого ключа. В `vocabulary.spec.ts` в `FAMILIES` добавить `preset`, `limit`, `meter`, `provenance` (тест расширяется,
не ослабляется).

## 7. Изменения по файлам (этап 2)

| Файл | Что | ≈ строк |
|---|---|---|
| `B/HostApi.kt` | `TaskLimits`; `StartSpec.limits`, `.preset` | 20 |
| `B/StudioHost.kt` | `corePolicy(spec)` / `corePreset(spec)` — единственная точка адаптации к API C3 (лимиты, пресет) в `launch` (≈260-262, 289, 321) | 30 |
| `S/tasks/Limits.java` (новый) | §5.2 | 60 |
| `S/tasks/Provenance.java` (новый) | §5.1 | 100 |
| `S/tasks/TaskService.java` | `Run` + `limits`, `preset`; `start/message/resume/followUp/continueRun` с `preset`, `limits` и наследованием (параметр → прошлый запуск → настройки); `spec()`; `stateOf`/`limitCode`; ветка «поднять лимит» в `resume` и `message`; `task()` поля 3.3; `adoptCheck`; `runEnded`; `completedOutcome` | 150 |
| `S/campaigns/CampaignService.java` | `setBudget(workId, limitsJson, preset)`; `opened()` + `limits`, `preset`; `stop_code` для `budget_exhausted` | 20 |
| `S/tasks/ProjectSettings.java` | `saveCheck(projectId, slot, command, actor)` — слияние с сохранёнными `checks` (текущий `put` заменяет объект целиком) | 15 |
| `S/settings/Preferences.java` | −`LIMIT`, +`TASK_LIMITS`, +`DEFAULT_PRESET` | 25 |
| `S/db/StudioDb.java` | миграция №4 (3.5) | 8 |
| `S/api/SimpleApi.java` | новые поля тел, `POST /tasks/{id}/project-check` | 12 |
| `S/support/StudioError.java` | константы `LIMIT_MONEY`, `LIMIT_MINUTES`, `LIMIT_REQUESTS` | 5 |
| `F/core/model.ts` | `Limits`, `Preset`, `Provenance`; поля `Task`; `Preferences.taskLimits`, `.defaultPreset` вместо `limit` | 20 |
| `F/timeline/meter.ts` (новый) | `Meter` (§4), чистый | 90 |
| `F/timeline/timeline.ts` | поле `meter`, вызов в `apply`; убрать `limitTokens` | 6 |
| `F/features/task/limits.ts` (новый) | `limitsText`, `parseLimit`, `raised(limits, kind)` (×2; деньги — до центов), `sameLimits` | 50 |
| `F/features/task/limits-menu.ts` (новый) | компонент `as-limits-menu`: входы `preset`, `limits`, `inTask`, `raise` (вид или `null`); выходы `presetChange`, `limitsChange`, `confirmed` | 100 |
| `F/features/task/meter-line.ts` (новый) | компонент `as-meter` (вход `view`, `compact`) | 55 |
| `F/features/task/composer.ts`, `.html` | пилюля и меню; `open` += `'limits'`; входы/выходы пробрасываются | 35 |
| `F/features/task/new-task.ts` | `chosenPreset`, `chosenLimits` (умолчания из `preferences`), тело `POST /tasks` | 15 |
| `F/features/task/task-actions.ts` | `next` += `preset`, `limits`; `message`/`resume` шлют их; `adoptCheck(command)`; `ViewRequest.dialog` += `'limits'` | 20 |
| `F/features/task/task-view.ts`, `.html` | проброс в composer; обработка `dialog: 'limits'`; `<as-meter>` в строке статуса; `stateKey` с `provenance` и `reason` | 30 |
| `F/features/task/cards.ts` | `ErrorCard`: заголовок, строка лучшего результата, `raise_limit`; `ResultCard`: ярлык, пометка судьи, блок предложения | 60 |
| `F/features/task/acceptance.ts` | `provenanceText(task)`, новый `stateKey(state, verified, provenance?, reason?)`, `doneUnverified` по классу | 30 |
| `F/features/task/error-actions.ts` | три кода `limit_*: ['raise_limit', 'stop']`; `ActionId` += `raise_limit` | 6 |
| `F/features/shell/sidebar.ts` | `unverified` по новому `doneUnverified` | 2 |
| `F/features/panel/progress.ts` | `<as-meter>` вместо `share` | 10 |
| `F/state/task.store.ts` | `showModel` → `timeline.meter.contextLimit`; сигнал `meter` (`computed` от `version`, `now`) | 10 |
| `F/features/settings/settings.ts`, `.html` | №13: три поля | 35 |
| `F/i18n/catalog.en.ts`, `catalog.ru.ts` | §6 | 90 |
| `ASTROUI/docs/decisions.md` | строки D2-n: R1, R2, R5, R9, R12 | 6 |
| Тесты (§9) | | ≈ 400 |

Итого ≈ 1,1 тыс. кода + ≈ 0,4 тыс. тестов. Если объём выходит за рамки, резать в этом порядке: (1) счётчик только в
строке статуса, панель Progress — простой текст; (2) подсказки подходов в меню; (3) bridge-тест на fixture (оставить
серверные и фронтенд-тесты).

## 8. Допущения об API ядра (сверить с отчётами C3 / C1b)

| # | Чего ждём | От | Где используется | Если иначе |
|---|---|---|---|---|
| A1 | Лимиты задаются при открытии кампании и читаются при reopen: `CampaignPolicy` (или соседний публичный тип) с полями «деньги (`Money`, USD) / минуты (целое) / запросы (целое)», `null` = без лимита | C3 п.1, 3 | `StudioHost.corePolicy` | править только `corePolicy` |
| A2 | Пресет — `enum` из трёх значений (Economy/Balanced/Thorough), выбирается при старте (`CampaignPolicy` либо `Config`), по умолчанию Balanced = текущие `Defaults`, заморожен на попытку; reopen с другим пресетом его не меняет и не падает | C3 п.4 | `StudioHost.corePreset` (или `TaskService.config`, если поле в `Config`) | править точку адаптации; пресет при reopen всегда берётся из строки запуска |
| A3 | Остановка по лимиту: исход `budget_exhausted` (квитанция `status = "partial"`, файл `finish-receipt.json` пишется) и машинный код вида на `S0Run.state.stopCode` и `campaign.finished.stopCode`: `limit_money` / `limit_minutes` / `limit_requests` | C3 п.2 | `TaskService.limitCode` | править `limitCode`; если кода нет вовсе — разбирать `reason` там же и записать в «Требуется от ядра» |
| A4 | Reopen тех же `work`/`attempt` с поднятым лимитом продолжает попытку: расход не обнуляется и не списывается дважды (D-392); reopen без поднятия останавливается снова без вызова модели | C3 п.3, 6 | `TaskService.resume` → `continueRun` | если ядро не возобновляет `budget_exhausted` — действие «поднять лимит» запускает follow-up с новыми лимитами (расход с нуля), записать отклонение |
| A5 | Событие расхода на шине после каждого вызова модели (или на границе хода): израсходованные деньги + источник (оплачено / оценка), активное время в мс, число запросов. Имя неизвестно (рабочее: `budget.spent`) | C3 п.5 | `Meter.apply` (одна ветка `case`) | нет события — работает запасной путь (сумма по `cell.model_responded`); другое имя/поля — править ветку |
| A6 | «Лимит достигнут» — событие (существующее `budget.exhausted` со `scope` либо новое) | C3 п.5 | `FlowModel` уже показывает `budget.exhausted`; счётчику не нужно | ничего |
| A7 | Лучший проверенный кандидат назван в квитанции: поле с `CandidateId` и классом происхождения (рабочее: `bestVerified {candidate, provenanceClass}`); рабочее дерево не подменяется | C3 п.2 (поле в `FinishReceipt` — «минимально») | `Provenance.best` | править `best`; поля нет — всегда `none` и запись в «Требуется от ядра» |
| A8 | `CampaignPolicy.tokens` и `maxCells` остаются обязательными техническими пределами, независимыми от лимитов пользователя; остановка по ним не несёт кода `limit_*` | C3 | `TaskService.spec` (R5) | если C3 сам выводит токены из лимитов — передавать, что требует C3 |
| A9 | Минуты — активное время попытки по инжектируемому `Clock` (сумма по resume, простой между запусками не считается) | C3 п.1 | `Meter` (отрезки `opened → run_ended`), тексты | если считается и простой — счётчик берёт значение из A5; запасной путь пометить как приблизительный |
| A10 | Деньги: USD; расход = оплаченная сумма, при её отсутствии — оценка; что использовано — видно в событии | C3 п.1 | `Meter` (`moneyExact`, «≈») | — |
| A11 | Явный `CellModel.effort` хоста сильнее effort пресета | C3 п.4 | R7 | если пресет сильнее — сказать об этом в подсказке выбора effort (открытый вопрос №1) |
| B1 | `FinishReceipt.checksRun[i]` для проверок `CHK-model-*` несёт команду одной строкой (как `Command.text`) и `cwd`; `evidenceKind` (`Tests`), `outcome` (`passed`) — уже есть | C1b п.6 | `Provenance.checkOffer` | поле называется иначе / argv-списком — править `checkOffer` (склейка как `ProjectSettings.join`); данных нет — карточки нет, записать |
| B2 | `AcceptanceLine.verifiedBy` ∈ {`runtime`, ярус судьи, `human`}, `acceptedBy` = `signedBy` вердикта; `RequirementLine.acceptance`, `.agentChecks`, `.provenanceClass` сохраняются | C2 (слит), C1b п.3 | `Provenance.of` | править `judged` |
| B3 | После C1b одобрение только судьёй review-ячейки ядро само не поднимает выше `agent_test`; wire-значения `provenanceClass` прежние | C1b п.3 | правило R9 идемпотентно (срабатывает только при `independent`) | — |

## 9. Тесты этапа 2

Backend (JUnit, стиль `TaskAcceptanceTest`: scratch SQLite через `StudioDb.migrate`, mock `StudioHost`):

1. `S(test)/tasks/ProvenanceTest.java` — квитанции-JSON в тексте теста: объявленный `run` зелёный → `independent`, без
   пометки; только `CHK-model` → `agent_test`; `check`, одобренный `studio:review-pass(...)` (`verifiedBy = human`) →
   `unverified` + `judge`; то же при прошедшей проверке агента → `agent_test` + `judge`; `check`, одобренный
   `user:local` → `independent` без пометки; ярус судьи в `verifiedBy` → пометка; зелёный объявленный `run` + одобрение
   судьи → `independent` + `judge`; квитанция без `provenanceClass` → `null`; `checkOffer`: прошла/не прошла, не
   `tests`, `cwd` подкаталога, у проекта уже есть команда; `best`: `current` / `earlier` / `none`.
2. `S(test)/tasks/LimitsTest.java` — `parse` (границы, `null`, наследование), `raised`.
3. `S(test)/tasks/TaskLimitsTest.java` — `start` с `limits`/`preset` → `StartSpec` в `campaigns.open` (ArgumentCaptor)
   несёт их, `tokens = окно × 3000`; без `limits` — умолчания настроек; запуск `budget_exhausted` + `stop_code =
   limit_money` → `state = paused`, `reason.code = limit_money`, `params.limit`; `resume` с поднятым лимитом →
   `continueRun` (тот же `workId`, `resume = true`, новая строка `limits_json`); без поднятия → `invalid`; `message` без
   лимитов → follow-up; технический `budget_exhausted` без кода → `limit_reached` и follow-up; `adoptCheck` с чужой
   командой → `invalid`, с предложенной → `projectSettings.saveCheck`.
4. Миграция №4: `limit {kind: money, value: "7"}` → `taskLimits.moneyUsd = "7"`; `tokens`/`auto` → умолчания (можно
   в `TaskLimitsTest`).
5. Bridge `TaskLimitsTest.kt` (стиль `FixtureCampaignTest`): `StartSpec(limits = TaskLimits(requests = 1))` на fixture
   → исход `budget_exhausted` с кодом лимита запросов; `resume` с `requests = 50` завершает кампанию. Если
   fixture-модель не доводит до лимита — тест опустить и записать в отчёт.

Frontend (vitest):

6. `F/timeline/meter.spec.ts` — запросы и деньги по `cell.model_responded`; ответ без `billed` → `exact = false`;
   время по отрезкам `opened → run_ended → opened(resumed)`; сброс на `opened` без `resumed`; контекст; событие A5
   перекрывает суммы; `near` при 80 %; без лимитов.
7. `F/features/task/task.spec.ts` (дополнить) — `stateKey` для трёх классов и для `paused` + `limit_*`;
   `provenanceText` (класс, деталь, пометка судьи; без `provenance` — прежний текст); `actionsOf('limit_money')`;
   `raised` (удвоение, деньги до центов, `null` остаётся `null`); `limitsText`; `parseLimit`.
8. `F/timeline/timeline.spec.ts` — `studio.opened` с `limits` доходит до `timeline.meter`.
9. `F/vocabulary.spec.ts` — проходит целиком (новые семейства в `FAMILIES`).

Команды: `./gradlew :backend:bridge:test :backend:server:test -Pstudio.astrolabeBuild=C:/work.astrolab/ASTROLABE`
(worktree корня не содержит ядра — путь обязателен, план §8.2); `cd ASTROUI/frontend && npm test`. E2E не запускать.

## 10. Требуется от ядра сверх карточек C1b / C3

Блокирующего нет: A3, A5, A7 и B1 уже входят в карточки (C3 п.2, 5; C1b п.6) — оркестратору убедиться по отчётам, что
они сделаны. Не блокирует, но стоит решить позже:

- **K1.** Ядро не отличает модель-рецензента хоста от человека: ответ через `Authority.review` всегда путь `human`,
  поэтому одобрение review pass Studio даёт в квитанции `independent`, а при `IntegrityApproval.Human` ещё и снимает
  test-integrity-заражение как «человек». Studio исправляет первое правилом R9 по префиксу подписи; второе не
  исправляет (хвост). Правильное решение — признак «рецензент — модель» в `Verdict`.

## 11. Риски, хвосты, чего не делаем

- Лимиты на всю задачу (сумма по follow-up) — нет (R2). Восстановление лучшего проверенного состояния — нет (R13).
- Карточка проверки: только тесты, только корень проекта, только проекты без команды тестов (R12). Хвосты: проект с
  обнаруженной командой (нужно применять `saved.test` и при `opened.state != null` в `StudioHost.launch` ≈269-277),
  `cwd`, build/typecheck как приёмка (D-394 позволяет, `Verification.apply` — нет).
- `maxCells = 12` может сработать раньше лимитов пользователя (план §1 строка 20) — показывается честно как встроенный
  предел; менять значение — решение владельца (№4) / C3.
- Старые запуски: в `studio.opened` нет `limits` → счётчик показывает расход без лимитов; квитанции без
  `provenanceClass` → прежние тексты.
- Счётчик контекста берёт последний запрос любой ячейки (в т.ч. проверяющей) — это «контекст текущего запроса».
- Тексты подсказок подходов (`preset.*_help`) сверить с таблицей пресетов в отчёте C3.
- `StatsService`-оценка денег и учёт ядра могут расходиться; после остановки истина — сообщение ядра и квитанция.

## 12. Открытые вопросы (владелец / оркестратор)

1. Effort и подход: оставить явный выбор effort сильнее пресета (R7) или дать значение «по подходу»?
2. Лимиты на запуск (R2) или на задачу целиком?
3. Умолчания $5 / 60 мин / 300 запросов (R3) — подтвердить или дать свои.
4. Слово «Подход» / "Approach" для профиля (R1) — подтвердить.
5. Понижение класса для review pass Studio делает Studio (R9), ядро не меняется — достаточно, или делать K1?
6. Технические пределы (токены ×1000 окон без лимита запросов, `maxCells = 12`) — оставить как в R5?
