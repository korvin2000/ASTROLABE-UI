# WP-WR2 / WR2s — линия исправлений сквозного ревью 4B (ядро и Studio)

Читать вместе с `plan2/COMMON.md` (обязательно) и `plan2/reports/INTEGRATION-REVIEW-4B.md` (находки, места, исправления).
Спецификация: `ASTROLABE/docs/runtime/task-workflow.md` (D-432…D-435); решения D-436…D-438 в `ASTROLABE/TODO.md`.
Повторного ревью нет: проверка — тестами. Каждый P1 сначала воспроизводится падающим тестом (сценарий WF там, где он
касается инварианта), затем исправляется.

Две половины параллельно, файлы не пересекаются:

## WR2 — ядро (t4), ветка `v2/WR2` от `main` ядра `55644f3` или новее
P1 #1, #2, #3, #4, #5, #6, #7, #11 (см. ревью). Плюс, каждый тестом:
- **T-03 (живой, переоткрыт):** вживую открытие всё ещё читает каждый неотслеживаемый файл ≈ 2 раза (`real-dirty-repo`,
  1500 файлов: 3014 чтений на открытие, финал 3008; на фикстуре W9 эффект не виден). Сначала сценарий/страж, который
  это ловит (счётчик `filesRead` на открытие ≤ числа файлов + константа на фикстуре с текстовыми файлами, как вживую),
  затем найти второе чтение (два свежих штампа? атлас? канонизация?) и убрать его, не доверяя метаданным на границе
  приёмки (D-374, D-427). Если второе чтение обязательно по D-427 — `БЛОКЕР`-описание с обеими сторонами, без правки.
- T-37: дайджест D-17 (`register/ContractDigest.kt`) показывает все запросы — показывать цель (запрос + поправки).
- T-41: сценарий для заметки ревью посреди ячейки (путь дописывания, WF-15).
- T-42: ответ человека на `task.ask` — вердикт по флагу целостности (spec §3.7, ч. 2).
- T-44: `Answers` — прогон, сдвинувший кандидата и затем возвращённый, не даёт `answered` (совпадает с P1 #11).
- T-45 **первым делом**: набор WF 172–177 с из 180 — сократить время до добавления сценариев, не ослабляя стражей.
- P2 ядра — исправить, если правка ≤ ~20 строк, иначе перечислить в «Хвостах»: WF-11 фактические ответы мимо истории
  (`TaskTool.kt:212`), цель/статус в срезах (`ContractSlice.kt:85`), затенение команд цели (`Verify.kt:642`), предел
  переноса родителя (`CarryForward.kt:146`).
L2 (один раз): `:core:test --tests 'io.astrolabe.campaign.*' --tests 'io.astrolabe.contract.*' --tests 'io.astrolabe.verify.*'
--tests 'io.astrolabe.tool.*' --tests 'io.astrolabe.cell.*' --tests 'io.astrolabe.context.*' --tests 'io.astrolabe.register.*'
--tests 'io.astrolabe.workspace.*' --tests 'io.astrolabe.workflow.*'`, `./gradlew assemble testClasses checkKotlinAbi
-Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm`, `updateKotlinAbi` если менялся API. Набор WF ≤ 180 с.
Не трогать Studio.

## WR2s — Studio (t3), worktree корня `C:\work.astrolab\.claude\worktrees\WR2s`, ветка `v2/WR2s` (создан оркестратором)
P1 #8 (`cell_failure` сохраняется в обратных вызовах и обновлении: `CampaignService.java:463`, `TaskService.java:928`),
#9 (каждая отправка с карточки доставляется или ставится в очередь с собственной сохранённой идентичностью доставки:
`TaskService.java:1358`; ядро дедуплицирует по `hostRef` — `Contracts.kt:173`, ядро не менять), #10 (очередь хранит
текст, вид и идентичность вместе: `TaskService.java:856`, `:700`). Плюс: T-33 (`rework(text)` в области кампании —
поправка той же работы, c16 не начинает follow-up: `TaskService.java:1415`), T-46 (объявленный вывод в активном
расходном списке), P2 Studio, если ≤ ~20 строк: дубли заметок пересказа (`TaskService.java:1132`), preflight WF-1
(`StudioHost.kt:295`). Сборка против checkout ядра `C:\work.astrolab\ASTROLABE\.claude\worktrees\studio-core`
(`main` ядра; создан оркестратором): `-Pstudio.astrolabeBuild=<он> -Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm`.
L2 (один раз): `*WorkflowScenario*` + затронутые тесты server/bridge/frontend (frontend — `npm ci` внутри worktree,
`node_modules` основного checkout не связывать). Не трогать ядро.

## Общее
Не больше трёх циклов «правка → тест» на половину. Ни один страж не ослабляется; замечание, которое нельзя исправить
без нарушения инварианта, — `БЛОКЕР` с обеими сторонами. Тест, утверждавший дефект, можно изменить — сказать какой и
почему. Отчёты: `plan2/reports/WP-WR2.md`, `plan2/reports/WP-WR2s.md` (≤ 40 строк, формат `COMMON.md`). Push только
`git -c credential.helper= push -u origin <ветка>`; git credential manager не вызывать; `git -C` на основной checkout
корня не запускать.
