# WP-W5 — отчёт линии (Studio)

## Сделано (ветка `v2/W5`, коммиты 5c7630e, 11d77c4, 7e73696, 9a025db; ядро studio-core 1a707fe)
- п.1 WD-04, WF-1: `B/StudioHost.kt` `launch` — заметки хоста вычисляются до открытия (`expectedVerification`: хранимый
  контракт; для нового — `Sniff.commands` по одному `git ls-files -z --cached --others --exclude-standard`), одно
  `controller.open`; второе — только если контракту нужна приёмка (`state == null`) или заметки разошлись с ожидаемыми.
  Защищённые пути — поправкой после открытия (защита записи читает текущий контракт).
- п.2 WD-11, WF-8: `S/tasks/TaskService.java` `message` — текст при открытой карточке приёмки прикрепляется
  (`DecisionService.attachNote`, колонка `decision.note`, эффект `attached`); Rework без своих слов несёт заметку;
  заметка переносится на переизданную карточку. Frontend: `Card.note`, `acceptanceHint`, подсказка на карточке.
- п.3 D-428, WF-6: мост добавляет `key` в JSON запроса (`decisionRequestJson`); `acceptance_decision.decision_key`;
  `storedDecision` ищет по ключу (старые строки — по id). Миграция — седьмой элемент `StudioDb.MIGRATIONS` (schema v7; в первой версии отчёта ошибочно «v8»).
- п.4 WD-26, WF-10: `resume` — сбойный прогон, который ядро может переоткрыть, продолжается на месте (`continueRun`);
  неоткрывшийся — `retryStart` под своим id; follow-up — только для финального исхода, с текстом «Continue the task…».
- п.5 WD-25, WF-11: `recap` — все сообщения пользователя дословно и по порядку (запросы контракта ядра без пересказа,
  слова ответа приёмки, заметки карточки, ответы на вопросы), строка на прогон, без общего предела 1500; рамка
  «still stands», если последний прогон не завершён; сбой назван сбоем, не «paused».
- п.6 WD-17, WF-9: `ReviewPass.forCore` — «cannot tell» ревьюера без инструментов = нет вердикта (ревью недоступно),
  кроме карточки человека (C11).
- п.7 WD-30: `readReceipt` — нечитаемая квитанция → `verified: unavailable`, в пересказе «evidence could not be read
  now»; frontend `verified.unavailable`, не «не проверено».
- п.8 (W3): `StudioHost.scratchPolicy` (политика из `Contract.scratch`, `null` для NONE); задача показывает
  `scratch: {id, roots}`; `changeSummary` не считает неотслеживаемые файлы под корнями политики (`scratchOutput`, один
  `git ls-files` только по кандидатам), считает их отдельно (`changes.scratch`). Frontend: строка «Не учтено» на карточке
  результата (`scratchRoots`, `result.scratch_files`). Тест `TaskScratchTest`.
- п.0: `StudioWorkflowScenarioTest` (мост, реальное ядро): WF-1 старт, WF-10+WF-1 продолжение;
  `TaskWorkflowScenarioTest` (сервер): WF-6 (реальное ядро + по ключу), WF-9 (реальное ядро + отображение), WF-8,
  WF-10 (маршрутизация), WF-11.

## Решения
- Предсказание заметок дешёвое и неточное намеренно: ошибка стоит второго открытия, никогда неверной заметки.
- Accept с прикреплённой заметкой: причина решения — кнопочная; заметка остаётся в пересказах (WF-11).

## Тесты
- L1 (studio-core 1a707fe): vitest `features/task` 49/49; bridge `StudioWorkflowScenarioTest`, `VerificationSetupTest`;
  server `TaskWorkflowScenarioTest` 7, `TaskAcceptanceTest` 13, `TaskScratchTest` 2, `AcceptanceDecisionsTest` 7,
  `ReviewPassTest` 8 — одно падение: сценарий WF-10 моста (см. «Отклонения»), исправлен, класс 2/2 (цикл 2).
- L2: `:backend:bridge:test :backend:server:test --continue` — bridge 23/23 (10 классов), server 83/84: упал
  `TaskLimitsTest.aContractBudgetNoReopen…` — его косвенный признак «нет продолжения на месте» (`projects.open` никогда)
  ломается, потому что пересказ follow-up открывает проект, чтобы прочитать запросы ядра (WF-11). Признак заменён на
  статус остановленного прогона (не `opening`); класс 22/22 (цикл 3). `*WorkflowScenario*` — в составе L2, зелёные.
- Циклов «правка → тест»: 3 из 3.
- `TaskAcceptanceTest`: `aMessageOnTheCardIsReworkWithItsText` → `…IsAttachedAndReworkCarriesIt` (тест закреплял
  дефект WD-11); `recapOfCompleted` открывает проект и не проверяет ≤1500 (WD-25/WD-30); новый
  `unreadableEvidenceIsNotMissingEvidence`.

## Отклонения от карточки
- WF-10 на реальном ядре: исключение внутри ячейки ядро заканчивает исходом `failed` (`Cell.kt` catch →
  `CellExit.Failed` → `CampaignOutcome.Failed`, не возобновляемый). Такой прогон Studio не может продолжить на месте и
  делает follow-up (ядро отказывает в переоткрытии). На месте продолжаются прогоны без исхода (работа умерла вне ячейки)
  и возобновляемые остановки — это и стерегут `continueAfterAFailureContinuesTheSameWork` (маршрут) и сценарий моста
  `Continue reopens the same work once…` (реальное ядро, остановка в ожидании решения).
- WF-1 при старте в репозитории без объявленных проверок остаётся 2 открытия: ядро не создаёт состояние кампании до
  поправки хоста (см. «Требуется от ядра»). Страж WF-1 — на репозитории с объявленным набором и на продолжении.

## Требуется от ядра (в хвосты, не в этой сессии)
- Ошибка внутри ячейки (`CellExit.Failed`, не красный финальный набор c8) — возобновляемая остановка, чтобы «Продолжить»
  шёл в ту же работу (WF-10 полностью).
- Хук хоста в `CampaignPolicy` (пункты приёмки к выведенному контракту до проверки `G_single`) — тогда старт без
  объявленных проверок тоже одно открытие.

## Хвосты и риски
- WD-12: сообщение приостановленной работе вне карточки приёмки по-прежнему поправка контракта (W7).
- Пересказ открывает проект, если он закрыт (нужны запросы ядра); пути с не-ASCII в `git diff --name-status` не
  сопоставляются с расходной политикой (кавычки git).
- WF-1 со стартом без объявленных проверок — 2 открытия до хука ядра.

## Раунд исправлений (ревью Codex 9a025db; studio-core 1a707fe)
| № | Замечание | Итог | Тест |
|---|---|---|---|
| 1 | P1 решение пересекает работы | исправлено: поиск по ключу в пределах `work_id` и `attempt_id` (новая колонка); `obligationSet` запрос не несёт — хвост | `aStoredDecisionIsFoundByItsKey…` (W-9, a2) |
| 2 | P1 запасной поиск по id | исправлено: только строки без ключа, кандидат и ревизия сверяются, иначе вопрос заново | `aKeylessDecisionNeedsItsOwnCandidate` |
| 3 | P2 миграция не атомарна; P3 «v8» | исправлено: миграция и строка версии — одна транзакция на одном соединении; отчёт поправлен | `StudioDbTest` (апгрейд с v6, повтор; откат DDL в SQLite) |
| 4 | P2 `attached` при закрытой карточке | исправлено: `attached` только при успехе, иначе обычная маршрутизация (не решение) | `aMessageThatFindsTheCardClosedIsRoutedNotLost` |
| 5 | P2 заметка не видна | исправлено: таймлайн сводит `user_message`/`cardId` в `card.note`; подсказка следует `version` | `timeline.spec` «attaches a message…» |
| 6 | P2 дедупликация/порядок | исправлено: сообщения по записям (запросы ядра, `acceptance_note` со своим временем, слова ответа, ответы на вопросы), без текстовой дедупликации; слова Rework, равные заметкам карточки, — одно сообщение | WF-11 (green→blue→green, заметка до поздней реплики) |
| 7 | P2 разделители/инъекции | исправлено: свои слова прогона — `campaign_index.user_text`; маркер режется только у follow-up прошлых версий; сообщения, отчёт, пути — JSON-строки | WF-11 (`[End of context]` в сообщении), `theRecapQuotesWhatItDidNotWrite` |
| 8 | P2 рамка завышает завершённость | исправлено: статус по прогону («still stands», пока ни он, ни поздний не `completed`; `answered` закрывает только себя) | WF-11 (прогон 1 failed + прогон 2 answered) |
| 9 | P2 разная классификация | исправлено: `TaskService.recovery` — одно решение для сообщения и «Продолжить» | `aMessageAfterAFailureContinuesTheSameWorkToo` |
| 10 | P2 «cannot tell» стирает дефект | исправлено: найденный major/blocker с местом — `Revise` | `cannotTellIsNoVerdictExceptOnAPersonsCard` |
| 11 | P2 счёт расходного вывода | исправлено: фильтр и лишний git убраны, отслеживаемое не скрывается; список показывается; счёт исключённых — «Требуется от ядра» | `TaskScratchTest` (удалённый отслеживаемый `build/kept.txt` виден) |
| 12 | P2 слабые стражи | исправлено: сценарий моста назван честно («from a resumable stop»); WF-10 доводит запуск до `campaigns.open(W-1, resume=true)`; `TaskLimitsTest` — ни одного `open(W-1, true)` и `amend` | названные тесты |
| 13 | P2 c16 после campaign Rework | исправлено локально: «Продолжить» → follow-up; Rework на карточке кампании → follow-up с его словами; сообщение → поправка | `aCampaignScopeRework…` (2) |

Хвосты (не в этом раунде): бюджет контекста полной истории пересказа (`TaskService` recap); WF-1 без объявленных
проверок (хук `CampaignPolicy`); WF-10 после исключения в ячейке (ядро: `failed` финальный, `Lifecycle.kt:494`);
привязка сохранённого решения к `obligationSet` (запрос его не несёт).
Требуется от ядра: число исключённых расходных файлов последнего снимка (`Snapshot.scratchCount`) в читаемом виде.
Тесты раунда: цикл 1 — L1 (bridge сценарий 2/2; server TaskWorkflowScenario 13, TaskAcceptance 13, TaskScratch 1,
TaskLimits 22, AcceptanceDecisions 7, ReviewPass 8, StudioDb 2; vitest task+timeline 93/93; `tsc` app) — зелёный. L2 `:backend:bridge:test :backend:server:test` (вкл. `*WorkflowScenario*`): bridge 23/23, server 91/91. Циклов раунда: 1 из 3.

Статус: ГОТОВО К СЛИЯНИЮ · последний коммит 2b8ed80
