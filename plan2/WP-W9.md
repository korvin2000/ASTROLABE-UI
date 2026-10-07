# WP-W9 — перенос контекста через границы, переоткрытие и follow-up (P8.W.9, сессия 4B)

Читать вместе с `plan2/COMMON.md` (обязательно). Исполнитель — t4. Ядро: ветка `v2/W9` от `main` ядра (ваш worktree).
Studio (только мост `StudioHost.kt` и пересказ follow-up): свой worktree корневого репозитория
`git -C C:/work.astrolab worktree add C:/work.astrolab/.claude/worktrees/W9 -b v2/W9 main`, сборка против вашего worktree
ядра `-Pstudio.astrolabeBuild=<worktree ядра> -Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm`.

**Параллельно идёт W7** (владелец `campaign/Controller.kt`, `TaskService.java`, контракт `parentWork`). Порядок:
1. Сейчас — всё, что не трогает `campaign/Controller.kt` и `TaskService.java`: `context/`, `cell/` (вы владелец
   `cell/Cell.kt`), `cell/Checkpoints.kt`, `store/`, `Defaults.kt`, сценарии.
2. Правки `Controller.kt` и всё, что зависит от `parentWork`, — только после сообщения оркестратора «W7 слита»:
   тогда `git merge main` в `v2/W9` (конфликт ABI-дампа — регенерировать, не править руками) и продолжить.
   Если работа части 1 закончена раньше — закоммитить, записать в отчёт «жду W7» и остановиться.

## Спецификация (обязательна)
`ASTROLABE/docs/runtime/task-workflow.md` §0, §4 целиком (§4.1–§4.8), §6; решения D-432…D-435. Не перепроектировать;
невыводимое — черновое решение в отчёте с безопасным умолчанием.

## Цель (WD-27, WD-28, WD-29; приложение 3 диагностики)
- WD-27: сводка прошлой ячейки берётся из хранилища одним атомарным `settle` (checkpoint + export + packet), а не из
  памяти процесса (`context/Rebuild.kt:47`, `context/SeedSelector.kt:93-100`, `Defaults.kt:54`,
  `campaign/Controller.kt:848`, `:1046`, `:1582`); семена с запасным правилом; перенос между инкрементами.
- WD-28: закреплённые строки и дельты контракта дописываются после транскрипта, префикс `[S][R][K]` фиксирован на
  построение (`cell/Cell.kt:882-888`, `cell/Anchor.kt:151-207`) — WF-15, включая ответ с `changesRequirements=true`.
- WD-29 (минимум, №33): перенос регистра и STATUS родительской работы в follow-up под `parentCarryMaxTokens`
  (`Config.kt:248`, `Controller.kt:464`, `:1623`, `:1524-1531`, `context/Rebuild.kt:31`); настройки переноса C18 п. 3.
- Перенесённое — данные, не инструкции; без wall-clock и переупорядочивания в кэшируемых регионах.

## Хвосты, которые линия закрывает (каждый — тестом; реестр `plan2/reports/TAILS-4B.md`)
- T-03, T-25: открытие и финал вживую читают каждый неотслеживаемый файл ≈ 2 раза (разбор атласа, два свежих штампа);
  атлас читает весь `devtools/`. T-04: переоткрытие перечитывает дерево. Сокращать повторные чтения **только там, где
  перенос делает их лишними**, никогда не доверяя метаданным на границе приёмки (D-374, D-427). Счётчики `filesRead`
  до/после — в отчёт и в страж WF-14.
- T-10: пересказ follow-up несёт всю историю без бюджета контекста → бюджет (spec §4.5; сообщения пользователя не
  режутся — WF-11 держится).
- T-21: изменённый отслеживаемый CRLF/фильтруемый файл читается дважды (`workspace/DirtyState.kt:375-378`).
- T-22: чтения recovery-блобов `hash-object` не считаются (`workspace/ShadowRef.kt:446`).
- T-13: счётчики фаз — дельты на общих экземплярах (параллельный `git.status()` хоста попадает в фазу) → счётчик на
  фазу/вызов.

## Набор WF (≤ 180 с на Windows)
W7 режет `DirtyRepoScenarioTest` — его не трогать. Если после ваших трёх сценариев набор > 180 с — сократить время
своих сценариев или `ReviewScenarioTest`/`FinalizationScenarioTest`, не ослабляя стражей; время до/после — в отчёт.

## Тесты
- Красные сценарии первыми (spec §4.7): `BoundaryCarryScenarioTest`, `AppendOnlyPrefixScenarioTest`, follow-up с
  родителем; подтвердить красный на `main`, затем зелёный.
- L1 (один раз): новые классы + тесты изменённых классов (`io.astrolabe.context.*`, `cell.CellTest`/`LayoutTest`/
  `AnchorTest`/`ResidencyTest`, `store.*` для схемы, `workspace.ShadowRefTest`/`DirtyStateTest`).
- L2 (один раз, после слияния `main` с W7): `:core:test --tests 'io.astrolabe.campaign.*' --tests 'io.astrolabe.cell.*'
  --tests 'io.astrolabe.context.*' --tests 'io.astrolabe.store.*' --tests 'io.astrolabe.workspace.*'
  --tests 'io.astrolabe.workflow.*'`, `./gradlew assemble testClasses checkKotlinAbi -Pastrolabe.aiGateBuild=…`;
  Studio `--tests '*WorkflowScenario*'` + затронутые тесты моста.
- Не больше трёх циклов «правка → тест».

## Готово / отказ
Готово: WF-14 и WF-15 зелёные, T-03/T-04/T-25 (в пределах правила выше), T-10, T-21, T-22, T-13 закрыты тестами,
схема хранилища с версией и миграцией, L2 зелёный, ABI регенерирован. Строки реестра WF-14/WF-15 — текст для
оркестратора в отчёте. Отказ: требуется ослабить страж или доверять метаданным на границе приёмки → `БЛОКЕР`.

## Отчёт
`C:\work.astrolab\plan2\reports\WP-W9.md` (≤ 40 строк, формат `COMMON.md`). Push только
`git -c credential.helper= push -u origin v2/W9` (оба репозитория); git credential manager не вызывать.
