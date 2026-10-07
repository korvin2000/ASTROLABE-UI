# WP-W7 — модель задачи и типы сообщений (P8.W.7, сессия 4B)

Читать вместе с `plan2/COMMON.md` (обязательно). Исполнитель — t4. Два репозитория:
- ядро: ветка `v2/W7` от `main` ядра (ваш worktree);
- Studio (корневой репозиторий `C:\work.astrolab`, каталог `ASTROUI`): свой worktree
  `git -C C:/work.astrolab worktree add C:/work.astrolab/.claude/worktrees/W7 -b v2/W7 main`; Studio собирается против
  вашего worktree ядра: `-Pstudio.astrolabeBuild=<путь к worktree ядра> -Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm`.

## Спецификация (обязательна, не перепроектировать)
`ASTROLABE/docs/runtime/task-workflow.md` (D-432…D-435): §0, §1 целиком, §2 целиком, §5.1 только поле контракта
`outputs` (поведение объявления — W8), §6. Решения владельца: D-433 (типы сообщений, формулировка WF-13 — §2.5 дословно).
Всё, что из спецификации не выводится, — черновое решение в отчёте с безопасным умолчанием.

## Цель (WD-13, WD-24)
1. Цель работы = исходный запрос + поправки, не последний текст (`contract/Contract.kt:281`, WD-24); упорядоченная
   история с идентичностью сообщений и `kind` (spec §1.1–§1.2); `parentWork` в ядре (§1.4).
2. Типы сообщений (§2): нетипизированный текст = `steering`; поправка — только явное действие; подтверждение ничего не
   меняет; сообщение работе с закрытыми инкрементами открывает инкремент-ответ и доходит до модели (WD-13:
   `campaign/Controller.kt:647-653`, `:999-1000`, `:1677`); `cancel`/`replace`; вытеснение решений старой ревизии.
3. Studio `TaskService.java`: вид сообщения при отправке, действие «изменить задачу», у карточки приёмки «Отправить
   агенту» (заметка на карточке остаётся заметкой, D-430/WF-8).

## Хвосты, которые линия закрывает (реестр `plan2/reports/TAILS-4B.md`; каждый — тестом)
- T-17 **первым делом**: набор WF 171 с из 180 — сократить время до добавления сценария, не ослабляя ни одного стража
  (крупнейшие: `DirtyRepoScenarioTest` 84 с, `ReviewScenarioTest` 27 с, `FinalizationScenarioTest` 24 с,
  `OutputPolicyScenarioTest` 23 с). Время до/после — в отчёт.
- T-02 (WF-10): исключение внутри ячейки завершает прогон финальным `failed` → возобновляемая остановка той же работы
  (spec §1.3; `Controller.kt`, `Lifecycle.kt`); Studio-страж WF-10 должен покрыть и этот случай.
- T-01 (WF-1): проект без объявленных проверок открывается дважды → крюк `CampaignPolicy` ядра (spec §3.6 называет
  `CampaignPolicy.declaredChecks`; W7 делает крюк и одно открытие, смысл сохранённой команды — W8).
- T-24: нечитаемый вход при захвате на `open` доходит до хоста исключением `UnreadableInput` → типизированная
  возобновляемая остановка с путём (как WF-4).
- T-11: решение в Studio не привязано к `obligationSet` — запрос (`AcceptanceDecisionRequest`) должен его нести, Studio
  хранит и сверяет.
- T-28: ядро не отдаёт мосту `Snapshot.scratchCount` — отдать.
- T-06/T-07 (часть W7): поле контракта `outputs` (§5.1) с совместимым умолчанием; поведение объявления — W8.

## Границы
Ядро: файлы из spec §1.6, §2.6 (`contract/Contract.kt`, `contract/Contracts.kt`, `campaign/Controller.kt`,
`campaign/Lifecycle.kt`, `campaign/Acceptances.kt`, `campaign/PlanNeed.kt`, `Astrolabe.kt`, `event/AgentEvent.kt`,
`io.astrolabe.java` формы), тесты `io.astrolabe.workflow`. Studio: `TaskService.java`, мост `StudioHost.kt` (только
нужное), frontend `features/task` (кнопки). Не трогать: `cell/Cell.kt` (владелец W9), `verify/`, `cell/Gates.kt` (W8),
`context/` (W9). Нужна правка чужого файла → минимальный дифф в отчёт, не править.
Публичный API: совместимые умолчания, сериализация по умолчанию, Java-формы (D-07), `updateKotlinAbi` один раз в конце.

## Тесты
- Красный сценарий первым: `io.astrolabe.workflow.MessageKindScenarioTest` по spec §2.5 (WF-13) и §1.5 (цель =
  запрос + поправки; WF-10 после исключения в ячейке; одно открытие без объявленных проверок); подтвердить красный на
  `main` до правки, затем зелёный. Studio: дополнить `TaskWorkflowScenarioTest`/`StudioWorkflowScenarioTest`
  (отправка вида, «Отправить агенту», WF-10 после исключения, WF-1 без проверок).
- L1 (один раз, когда правка закончена): новые/изменённые тест-классы + `io.astrolabe.contract.*`.
- L2 (один раз): `:core:test --tests 'io.astrolabe.campaign.*' --tests 'io.astrolabe.contract.*'
  --tests 'io.astrolabe.workflow.*'` (+ `io.astrolabe.java.*`, если менялись Java-формы),
  `./gradlew assemble testClasses checkKotlinAbi -Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm`;
  Studio: `--tests '*WorkflowScenario*'` и затронутые тест-классы server/bridge/frontend.
- Не больше трёх циклов «правка → тест». Набор WF после линии ≤ 180 с на Windows.

## Готово / отказ
Готово: WF-13 зелёный (ядро и Studio), T-17, T-02, T-01, T-24, T-11, T-28 закрыты тестами, поле `outputs` есть,
L2 зелёный, ABI регенерирован, отчёт. Строка реестра WF-13 — текст для оркестратора в отчёте (реестр пишет он).
Отказ: исправление требует ослабить страж WF или нарушить D-374/D-427/D-428/D-429/WF-6 → `БЛОКЕР` с обеими сторонами.

## Отчёт
`C:\work.astrolab\plan2\reports\WP-W7.md` (≤ 40 строк, формат `COMMON.md`), последние коммиты обеих веток.
Push только `git -c credential.helper= push -u origin v2/W7` (в обоих репозиториях); git credential manager не вызывать.
