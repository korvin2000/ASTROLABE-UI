# WP-WR5 — исправления по сквозному ревью сессии 5, ядро (P1 №1, №2; P2 №2, №3)

Читать вместе с `plan2/COMMON.md`. Исполнитель — t4. Ядро: ветка `v2/WR5` от `main` `62afbee`, worktree
`C:\work.astrolab\ASTROLABE\.claude\worktrees\WR5`. Источник: `plan2/reports/INTEGRATION-REVIEW-5.md` (пункты с `path:line`;
строки даны по срезу `e778c9a` — после C17 могли сдвинуться, ищите по символам). Спецификация: `kernel-contract.md` A-D.4, A-D.6;
`docs/runtime/task-workflow.md` §4 (перенос через границы). Вы — владелец `campaign/Controller.kt`, `cell/Cell.kt`, `cell/Checkpoints.kt`
на эту линию (параллельно W11 правит `workspace/*`, `atlas/Atlas.kt`, `os/Git.kt`, `store/BlobStore.kt` — не трогать их; `atlas/Host.kt`
и `os/search/RipgrepSearch.kt` ваши).

## Цель
1. **P1 №1 — обязательства переживают сбой между `Cell.Ended` и записью `returned_handoff`.** Terminal packet/checkpoint пишутся
   атомарно (`cell/Checkpoints.kt:171`, `settle`), но `CellPacket.of` (`Checkpoints.kt:96`) не несёт handoff cause, флаги целостности
   тестов и нерешённый public-impact; они становятся долговечными только в `Handoffs.kt:117` из `Controller.kt:2340`. Правка: положить
   типизированный `HandoffCause`, integrity flags и unresolved public impact в terminal packet (тот же `settle`, одна транзакция; формат
   пакета — аддитивно, старые пакеты читаются как прежде); при open, **до** ветки `Lost` (`Controller.kt:~818`) и до переходов,
   сдвигающих `seq` (порядок D7), если у бегущей ячейки есть terminal packet с handoff cause, но нет записи `returned_handoff` —
   восстановить возврат и обязательства из пакета (эквивалент `ReturnedHandoff.exit`), эпоха оплачивается из гранта как при D7.
   Fixture (`campaign.HandoffTest`): direct S1, ослабление теста + public-impact, handoff; сбой между `Cell.Ended` и записью (триггер
   SQLite на `returned_handoff` или остановка контроллера после `settle`); reopen → эпоха несёт оба обязательства, `task(finish)` без
   правок отказан до integrity review / refs; без handoff cause поведение `Lost` прежнее (`ResumeTest`).
2. **P1 №2 — протокол удержания фактов по разрешённой runtime-роли.** `FactRetention.protocolOf` (`context/FactRetention.kt:~25`)
   читает сырой `Role.protocol` конфигурации; host override роли без поля `protocol` (старый конструктор `Role.kt:84`, JSON без
   `protocol`) даёт Structured, хотя исполнение берёт из override только текст (`cell/RoleTexts.kt:105`) и идёт как Direct. Правка:
   разрешать протокол retention тем же способом, что и runtime-роль (та же функция разрешения, что у исполнения — переиспользовать,
   не копировать). Тест в `context.FactCoherenceTest`/`campaign.RoleWiringTest`: override текста роли `direct` без `protocol` →
   retention Direct, verified note переживает две границы (A-D.4).
3. **P2 №2 — shim `rg.cmd`/`rg.bat` на Windows.** `atlas/Host.kt:68` допускает `.cmd/.bat`, `RipgrepSearch.kt:83` запускает `rg` через
   `ProcessBuilder` без fallback. Правка минимальная: probe принимает только исполняемый `rg`/`rg.exe` (или backend запускает найденный
   полный путь shim через `cmd /c`), а при отказе запуска ripgrep на первом вызове открытия — fallback на JVM с одной SLF4J-строкой.
   Тест: `SearchBackendChoiceTest` — shim не выбирается / падение запуска даёт JVM.
4. **P2 №3 — cap переноса родителя по протоколу.** `CarryForward.kt:128` оценивает вариант без protocol (`:65`, всегда Structured),
   `Compiler.kt:168` выводит `role.protocol`. Правка: cap считать по выводимому протоколу. Тест в `context.CarryForwardTest`:
   direct-перенос с note ids укладывается в `parentCarryMaxTokens` по direct-рендеру.

## Границы и проверки
- Ваши файлы: `campaign/Controller.kt` (open-восстановление, точки settle), `campaign/Handoffs.kt`, `cell/Checkpoints.kt`, `cell/Cell.kt`
  (только передача cause/flags в `settle`), `context/FactRetention.kt`, `cell/Role.kt`/`RoleTexts.kt` (разрешение роли), `atlas/Host.kt`,
  `os/search/RipgrepSearch.kt`, `context/CarryForward.kt`; тесты `HandoffTest`, `ResumeTest`, `FactCoherenceTest`, `RoleWiringTest`,
  `SearchBackendChoiceTest`, `CarryForwardTest`. Не трогать: `workspace/*`, `atlas/Atlas.kt`, `os/Git.kt`, `store/BlobStore.kt` (W11),
  `docs/reference/workflow-invariants.md`, `TODO.md`, `CONTINUE-TASK.md`, `actual_state.md`, `audit/`. `kernel-contract.md` A-D.6 —
  одна фраза о terminal packet, если делаете п. 1.
- Инварианты: WF-14 (перенос; `Checkpoints.settle` атомарен — остаётся), WF-15 (байты префикса не меняются при значениях по умолчанию),
  WF-2 (выбор backend без git-процессов), WF-7. Стражи зелёные и неизменные.
- L1 (один раз): `./gradlew :core:test --tests 'io.astrolabe.campaign.HandoffTest' --tests 'io.astrolabe.campaign.ResumeTest' --tests 'io.astrolabe.context.*' --tests 'io.astrolabe.campaign.SearchBackendChoiceTest' --tests 'io.astrolabe.campaign.RoleWiringTest' -q --console=plain`.
- L2 (один раз): `--tests 'io.astrolabe.campaign.*' --tests 'io.astrolabe.cell.*' --tests 'io.astrolabe.context.*' --tests 'io.astrolabe.workflow.*' --tests 'io.astrolabe.os.*'` и
  `./gradlew assemble testClasses checkKotlinAbi -Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm -q --console=plain`; ABI при смене API.
- Не больше трёх циклов «правка → тест».

## Готово, когда
- Fixture п. 1 падает до правки и зелёная после, `Lost` без cause не изменился; п. 2 тест; п. 3, 4 тесты; L1/L2 зелёные; WF 43/43.
- Отказ: п. 1 требует миграции схемы store → допустима только аддитивная (новая колонка/таблица, версия **v8**), иначе `БЛОКЕР`.

## Отчёт
`C:\work.astrolab\plan2\reports\WP-WR5.md` по COMMON.md · `Статус: …` и последний коммит. Оценка расхода: ≤ 450 тыс. токенов.
