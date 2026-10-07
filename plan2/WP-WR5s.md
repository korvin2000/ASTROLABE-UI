# WP-WR5s — исправления по сквозному ревью сессии 5, Studio и eval-live (P1 №3; P2 №1, №4)

Читать вместе с `plan2/COMMON.md`. Исполнитель — t3. Два worktree:
- Ядро (только `eval-live/`): `C:\work.astrolab\ASTROLABE\.claude\worktrees\WR5s`, ветка `v2/WR5s` от `main` ядра.
- Studio (корень): `C:\work.astrolab\.claude\worktrees\WR5s`, ветка `v2/WR5s` корня; Gradle-корень `ASTROUI/`, сборка против
  `-Pstudio.astrolabeBuild=C:/work.astrolab/ASTROLABE/.claude/worktrees/studio-core -Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm`
  (studio-core = текущий `main` ядра; не линковать `node_modules`).
Источник: `plan2/reports/INTEGRATION-REVIEW-5.md`.

## Цель
1. **P1 №3 — руководство хоста по протоколу попытки.** `StudioHost.kt:370` безусловно добавляет руководство для structured
   (`Guidance.kt:14`, `:21`: `state.patch`, завершение без tool call); direct-ячейка (`Role.kt:243`: `state.note`/`task.finish`, без patch)
   отвергает patch (`Cell.kt:1108`). То же в eval-live `StudioAttempt.kt:497`. Правка: вариант руководства выбирается по фактическому
   протоколу главной роли **замороженной попытки** (`opened.attempt.config` → `Roles.mainLine(protocol, shape).protocol` или
   `Config.protocol`); structured-байты **не меняются** (golden/WF-15); для direct — короткий вариант на языке direct (`state(note)`,
   `task(finish)` / `finish(after_checks)`, без «завершить без вызова»), один общий источник текста для Studio и eval-live, если он уже
   общий (`StudioPolicy`), иначе два одинаковых по смыслу. Тесты: Studio bridge — запуск с `protocol = direct` даёт direct-руководство
   в `hostNotes`, structured — прежние байты (`StudioWorkflowScenarioTest`/новый тест в bridge); eval-live — то же в `:eval-live:test`.
2. **P2 №1 — eval-live ask/reopen не делает второй open.** `StudioAttempt.kt:162` (expected по origin) против `:226` (actual по sniff):
   для goal run без sniffed suite получаются `declared` и `saved` → второй open (`:514`). Правка: actual через `StudioPolicy.of(opened.contract)`.
   Тест `OpenCountTest`: `opens` = 1 на старт в режиме ask и при reopen (`real-dirty-reopen`-подобный сценарий на поддельном адаптере).
3. **P2 №4 — `cells` в eval-live не завышается при продолжении того же work.** Сегмент отдаёт накопленное `state.cells.size`
   (`StudioAttempt.kt:540`), Bench суммирует (`Bench.kt:267`). Правка: считать новые `CellId` сегмента (или последнюю величину work).
   Тест в `ScenarioTest`/`PairTest`: ask-ожидание + reopen без новой ячейки → `cells` = 1.

## Границы и проверки
- Ваши файлы: Studio `bridge/StudioHost.kt`, `bridge/Guidance.kt` (или где текст), `bridge/StudioPolicy.kt`; eval-live `StudioAttempt.kt`,
  `Bench.kt`, `Results.kt`; тесты bridge и `:eval-live:test`. Ядро вне `eval-live/` не трогать. Не трогать `TaskService.java`,
  `docs/reference/workflow-invariants.md`, `TODO.md`, `CONTINUE-TASK.md`, `actual_state.md`, `audit/`.
- Инварианты: WF-1 (один open), WF-15 (structured-байты руководства неизменны), WF-11/13 (Studio сценарии зелёные).
- L1/L2 eval-live: `./gradlew :eval-live:test -q --console=plain -Pastrolabe.aiGateBuild=…` (из worktree ядра); Studio:
  `./gradlew :backend:bridge:test --tests '*WorkflowScenario*' --tests '*Guidance*' :backend:server:test --tests '*WorkflowScenario*' -Pstudio.astrolabeBuild=… -Pastrolabe.aiGateBuild=… -q --console=plain` (из `ASTROUI/` worktree корня).
- Не больше трёх циклов «правка → тест» на часть.

## Готово, когда
- Direct-попытка получает direct-руководство в Studio и eval-live, structured-байты прежние (тест на равенство); `opens` = 1 в ask/reopen;
  `cells` без завышения; Studio `*WorkflowScenario*` 25/0, `:eval-live:test` зелёный.

## Отчёт
`C:\work.astrolab\plan2\reports\WP-WR5s.md` по COMMON.md · `Статус: …` и последние коммиты (ядро и корень). Оценка расхода: ≤ 250 тыс. токенов.
