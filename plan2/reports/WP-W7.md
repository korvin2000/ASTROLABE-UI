# WP-W7 — модель задачи и типы сообщений (P8.W.7, сессия 4B)

## Сделано
- Ядро (`v2/W7`): `MessageKind` и `UserRequest{kind, answers, hostRef}` (старый контракт: первый — request, далее amendment); `Contract.objective` = запрос + поправки с id (WD-24); `Contracts.message(kind…)` — идемпотентно по `hostRef`, steering/continuation без ревизии, amendment → `R-n` дословно (+ `Narrowing.Cancel/Replace`, `RequirementStatus.Cancelled`); `Contract.parentWork`, `Contract.outputs` + `declareOutput` (T-07, поведение — W8); `campaign/Messages.kt` (вид из состояния, заметка при открытой карточке отвергается, финальная работа → follow-up); `Controller.intake` — `inc-n` для поправки (`Transition.Amended`), ответный инкремент `inc-U-n` (`Transition.ResponseOpened`, `resolves(U-n)`), отмена инкрементов снятых требований; запрос старой ревизии `PendingStatus.Superseded`; события `Contract.MessageRecorded`, `Amended.requestId`, `Opened.parentWork`; фасад `campaign(…parentWork)`, `CampaignHandle.message(kind,text,hostRef)`, Java-формы.
- T-02/WF-10: `CellExit.Failed` → `failed` с `failedResumably`, переоткрытие продолжает ту же работу. T-01/WF-1: `CampaignPolicy.declaredChecks` — одно открытие без amendByHost. T-24: нечитаемый вход на reopen → `blocked_external` с путём, `OpenedCampaign.unreadable`. T-11: `AcceptanceDecisionRequest.obligationSet`. T-28: `OpenedCampaign.scratchCount()`. №31: follow-up открывается только после финального родителя.
- T-17: проход захвата канонизирует каталог один раз (`WorkspacePath.CapturePass`), git, завершившийся в первом ожидании, без снимка процессов (`Git.exec`). Набор WF (Windows, сумма XML): 163,1 с → 113,2 с до сценария → 126,1 с с `MessageKindScenarioTest` (21,3 с); `DirtyRepoScenarioTest` 82,6 → 45,4 с. Стражи не менялись.
- Studio (`v2/W7`): `StudioHost.message(kind)`, `amend` = amendment, код `cell_failure`, `scratchCount`, `declaredChecks` вместо второго открытия, `StartSpec.parentWork`; `TaskService`: вид при отправке, «Изменить задачу», карточка «Отправить агенту» (`decision: send`, steering, hostRef `card-<id>`), WF-10 `cell_failure` → IN_PLACE, `count` в scratch; `DecisionService`/`StudioDb`: `obligation_set`; фронтенд: кнопки и `messageBody`/`sendToAgentBody`.

## Решения (черновые)
- Невыведенный вид: ядро не выводит `answer` (нет id вопроса) → steering; безопасно: вопрос отвечается через SPI решений.
- Сообщение во время ячейки: если ячейка закрыла последний инкремент, ответный инкремент всё равно открывается (лишний запрос модели, но сообщение не теряется); альтернатива — отметка «увидено» из `Cell.kt` (W9).
- Поправка без `run:`-приёмки → остановка `waiting_for_input` с причиной (не план-ячейка); amendment с `changes` не порождает `R-n` из текста.
- Studio передаёт `parentWork` ядру только для финального родителя (иначе ядро отказало бы follow-up после исчерпанных попыток / c16).
- Дайджест D-17 (`register/ContractDigest.kt`) не менялся: он показывает все запросы (надмножество цели); перевод на «цель» — отдельно.

## Тесты
- Красный на `main`: `MessageKindScenarioTest` (WF-13 через `amendByUser`) — «no model request after the message».
- L1: `MessageKindScenarioTest` 6/6, `OutputPolicyScenarioTest` 4/4, `contract.*`+`graph.*` 43/44 → `ContractsTest` (устаревшие ожидания objective/событий — исправлены по WD-24) 19/19.
- L2 ядро: `:core:test` `campaign.*`+`contract.*`+`workflow.*`+`java.*` — 315/315 (43 класса); `assemble testClasses checkKotlinAbi -Pastrolabe.aiGateBuild=…` — ок; `updateKotlinAbi` закоммичен.
- Studio: `*WorkflowScenario*` — bridge 3/3, server 17/17 (цикл 2: исправлены ожидание ревизии в тесте и маршрут «Изменить задачу» при открытой карточке); L2 `:backend:bridge:test` 24/24, `:backend:server:test` 95/95; vitest task 50/50, `tsc`, `ng build` — ок.
- Циклы «правка → тест»: ядро 2 (T-17; основной + `ContractsTest`), Studio 2. Расход токенов не виден.

## Отклонения от карточки
- Правки вне списка файлов: `verify/Resolution.kt` (одно поле T-11, ключ v3 не тронут), `graph/RequirementGraph.kt` (снятые требования), `workspace/WorkspacePath.kt`, `Stamper.kt`, `DirtyState.kt`, `os/Git.kt` (T-17).
- `rework(text)` как поправка (§2.1) и c16 Studio не переделаны; finish receipt `follows`/`steering: U-n → inc` не добавлены.
- Ошибка среды: junction `node_modules` в worktree Studio был удалён npm вместе с содержимым основного `ASTROUI/frontend/node_modules`; восстановлено `npm ci` (176 пакетов).

## Хвосты и риски
- P2: rework(text) кампании → amendment той же работы (c16 Studio ведёт в follow-up). P3: finish receipt `follows: W-n` и список steering. P3: первый open с нечитаемым входом всё ещё бросает `UnreadableInput` (нет s0). P3: лишний ответный инкремент на сообщение посреди ячейки (W9). P3: `card.note_attached` не упоминает «Отправить агенту».

Строка реестра WF-13 (для оркестратора): `| WF-13 | A user's message reaches the executor | core: MessageKindScenarioTest (P8.W.7); Studio *WorkflowScenario*: TaskWorkflowScenarioTest.sendToAgentSendsTheCardsNoteAsSteering, changeTheTaskSendsAnAmendmentEvenWithTheCardOpen, bridge "WF-13 the card's note sent to the agent reaches a model…" | K/campaign/Controller.kt (intake, open), K/campaign/Messages.kt, K/campaign/Lifecycle.kt, K/contract/; Studio: TaskService.java, StudioHost.kt (WD-13, WD-24) | after a message sent to the executor of a work whose increments are all closed — a continuation, a steering, an amendment, or the acceptance card's Send to agent — at least one model request follows in the same open; a note attached to the card and not sent is not a message to the executor (D-430) |`. WF-1 и WF-10: снять пометки «limit».

Статус: ГОТОВО К СЛИЯНИЮ · ядро `v2/W7` 6071e3c · корень `v2/W7` b317144
