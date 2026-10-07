# WP-W8 — цель отдельно от тестов; объявленный вывод и маркеры v3 (P8.W.8, сессия 4B)

Читать вместе с `plan2/COMMON.md` (обязательно). Исполнитель — t4. Ядро: ветка `v2/W8` от `main` ядра **после
слияния W7** (ваш worktree). Studio (мост `StudioHost.kt`, `Verification.kt`; `TaskService.java:980` только читает
класс): worktree корневого репозитория уже создан оркестратором — `C:\work.astrolab\.claude\worktrees\W8`, ветка
`v2/W8` (с правками Studio от W7); `git -C` на основной checkout корня не запускать; `node_modules` основного checkout
не связывать с worktree (при правке frontend — `npm ci` внутри worktree). Сборка против worktree ядра
`-Pstudio.astrolabeBuild=<worktree ядра> -Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm`.

**Параллельно идёт W9** — владелец `campaign/Controller.kt` и `cell/Cell.kt` после W7. Правило одного писателя:
- всё, кроме `Controller.kt`, — сразу;
- правки `Controller.kt` (`answerable`, `CampaignPolicy.declaredChecks` — крюк уже сделан W7, эффективная политика при
  открытии попытки) держать **последним отдельным коммитом**; если W9 к тому времени ещё не слита — написать в отчёт
  «жду W9», показать минимальный дифф `Controller.kt` и остановиться. После сообщения оркестратора «W9 слита»:
  `git merge main` (ABI-дамп при конфликте — регенерировать), применить свой дифф, L2.
- `cell/Cell.kt` не трогать (W9).

## Спецификация (обязательна)
`ASTROLABE/docs/runtime/task-workflow.md` §0, §3 целиком, §5 целиком, §6; решения D-434 (цель и регрессия), D-435
(объявленный вывод, маркеры v3). Невыводимое — черновое решение в отчёте с безопасным умолчанием.

## Цель (WD-19…WD-23, P8.C.17 п. 3)
Места из диагностики (не перерасследовать): WD-19 `verify/TestIntegrity.kt:114`, `:165`, `:246`, `:306`,
`verify/Resolution.kt:479-488`; WD-20 `contract/Contracts.kt:225-234`, `contract/Contract.kt:287`, `cell/Gates.kt:339-353`,
`:414-426`, `campaign/PlanNeed.kt:17-34`, `verify/Resolution.kt:205`, `:255-256`, Studio `TaskService.java:980`;
WD-21 `tool/verify/Verify.kt:476-487`, `:655-657`, `tool/task/TaskTool.kt:215`, Studio `DecisionService.java:162`;
WD-22 `campaign/Controller.kt:1203-1210`, `tool/task/TaskTool.kt:169-176`; WD-23 мост `StudioHost.kt:263-271`,
`verify/Scheduler.kt:336-338` (`node --test` без счётчиков = `Inconclusive`).
Файлы — spec §3.9 и §5.3 (вариант «в W8», без отдельной W3b): `contract/Contract.kt` (`purpose`, `checks`),
`cell/Gates.kt`, `campaign/PlanNeed.kt`, `verify/Resolution.kt`, `campaign/FinishReceipt.kt` (`:50`, `:315`, `:328`),
`tool/verify/Verify.kt` (только привязка распознавания; D-262 без изменений), `tool/task/TaskTool.kt`, `tool/run/`
(репортёры Node), `verify/TestIntegrity.kt`, `contract/Contracts.kt` (`deriveS0`), `AttemptConfig.kt`,
`workspace/Stamper.kt`, `workspace/DirtyState.kt`, `verify/Scheduler.kt` (`ScratchPolicy` v3, эффективный id),
`campaign/Controller.kt` (по правилу выше).

## Хвосты (реестр `plan2/reports/TAILS-4B.md`; каждый — тестом)
- T-06, T-07: объявленный вывод задачи и вложенные генерируемые каталоги — spec §5 (D-435).
- T-09: нет сквозного сценария недоступного ревью кампании — добавить в набор WF.
- T-08: компиляция и маршрутизация резервируют полный выход модели для ячейки ревью (`Controller.kt` компиляция ревью,
  `context/Compiler.kt:112`) — **только если ваша правка идёт тем же путём**; иначе в отчёте «не тот путь» и
  минимальная правка — оркестратор решит.

- T-34 (от W7, P3): итоговая квитанция не перечисляет `follows` и в какой инкремент ушло каждое уточнение
  (`campaign/FinishReceipt.kt` — ваш файл).
- T-38 (от W7, P3): подсказка карточки приёмки в Studio не упоминает «Отправить агенту».
- От W7 уже есть: `Contract.outputs`, `declareOutput`, крюк `CampaignPolicy.declaredChecks`, `obligationSet` в запросе
  решения, `MessageKind`. Набор WF после W7 — 126 с.

## Набор WF (≤ 180 с на Windows)
Новые сценарии (`GoalEvidenceScenarioTest`, `AnswerScenarioTest`, расширение `OutputPolicyScenarioTest`, сценарий T-09)
держать в бюджете: после слияния W7/W9 измерить, при превышении сократить время своих сценариев (без ослабления).

## Тесты
- Красные сценарии первыми (spec §3.8, §5.3), включая отрицательный: «посторонние наборы зелёные, запрошенного
  поведения нет» — не закрывается как проверенное (WF-12). Studio: `SavedCommandScenarioTest` (`*WorkflowScenario*`).
- L1 (один раз): новые классы + тесты изменённых (`io.astrolabe.verify.*`, `cell.GatesTest`, `campaign.PlanNeedTest`,
  `tool.verify.*`, `tool.task.*`, `tool.run.*`, `workspace.StamperTest`/`ScratchPolicyTest`).
- L2 (один раз, после слияния `main` с W9): `:core:test --tests 'io.astrolabe.campaign.*' --tests 'io.astrolabe.verify.*'
  --tests 'io.astrolabe.cell.*' --tests 'io.astrolabe.contract.*' --tests 'io.astrolabe.tool.*'
  --tests 'io.astrolabe.workspace.*' --tests 'io.astrolabe.workflow.*'`,
  `./gradlew assemble testClasses checkKotlinAbi -Pastrolabe.aiGateBuild=…`; Studio `--tests '*WorkflowScenario*'` +
  затронутые тесты моста и server.
- Не больше трёх циклов «правка → тест». Публичные поля — совместимые умолчания, сериализация, `updateKotlinAbi` в конце.

## Готово / отказ
Готово: WF-12 зелёный и отрицательный сценарий, сценарии §3.8/§5.3, T-06/T-07/T-09 закрыты, решение по T-08, L2
зелёный, ABI регенерирован, строка реестра WF-12 — текст для оркестратора в отчёте. Отказ: требуется ослабить страж,
изменить D-262 или идентичность сверх D-435 → `БЛОКЕР` с обеими сторонами.

## Отчёт
`C:\work.astrolab\plan2\reports\WP-W8.md` (≤ 40 строк, формат `COMMON.md`). Push только
`git -c credential.helper= push -u origin v2/W8` (оба репозитория); git credential manager не вызывать.
