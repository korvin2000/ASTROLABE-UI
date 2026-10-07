# WP-WR5s — отчёт (Studio + eval-live; ревью 5: P1 №3, P2 №1, P2 №4)

## Сделано
- **P1 №3 — руководство по протоколу замороженной попытки.**
  - Studio `bridge/Guidance.kt` (+28): `DIRECT_NOTES` (начинается с `Working notes:`, тот же `MARK`; `state` op `note`
    `{note:{kind,text,evidence}}`, завершение `task` op `finish` `{text}` — «harness runs the declared checks and decides»;
    без `patch` и без «reply … no tool call»; хвост — те же фразы про run/AGENTS.md/язык сообщений) и `notes(protocol)`:
    Structured → `NOTES` (литерал не тронут), Direct → `DIRECT_NOTES`.
  - Studio `bridge/StudioHost.kt` (+25/−5): `hostNotes(spec, verification, protocol)`; до open — `expectedProtocol`:
    протокол сохранённой попытки (`Attempts.load(work, a1)`) или `run.config.protocol`, форма сохранённого контракта или S0,
    через `Roles.mainLine(...).protocol`; после open — `protocolOf(opened) = Roles.mainLine(opened.attempt.config.protocol,
    opened.contract.shape).protocol`. Совпадение ожидания и факта сохраняет один open (WF-1).
  - eval-live `StudioAttempt.kt`: `StudioPolicy.DIRECT_WORKING_NOTES` (дословная копия `Guidance.DIRECT_NOTES`),
    `workingNotes(protocol)`, `protocolOf(opened)`, `expectedProtocol(attempt, config, stored)` — та же логика, что в Studio.
  - Источник текста: общего модуля нет (`StudioPolicy` — internal в eval-live), поэтому две дословные копии; равенство копий
    закреплено одинаковыми SHA-256 в тестах обоих репозиториев.
- **P2 №1 — ask/reopen без второго open.** `StudioPolicy.verificationOf(opened) = of(opened.contract)` (по origin, как
  preflight), сопоставление со sniff удалено.
- **P2 №4 — `cells` без завышения.** Сегмент считает `CellId`, которых не было в `opened.state.cells` на его open;
  Bench по-прежнему суммирует сегменты (теперь это сумма собственных ячеек). KDoc у `AttemptOutcome.cells` и
  `RunResult.cells` (`Results.kt`, +1).

## Решения
- Протокол до open при новой работе → форма S0 (так выводится новый контракт); если ядро сразу выберет S2, direct уйдёт в
  `implementing` и будет второй open с предупреждением `preflight-diverged` (существующий механизм, не молча). Безопасная
  альтернатива — повторить выбор формы ядра в хосте; отвергнута как дублирование `ShapeSelector`.
- Протокол берётся из `Roles.mainLine`, а не из сырого `Config.protocol`: direct в S2/S3 работает ролью `implementing`
  (structured), ему нужно structured-руководство.
- Тест равенства structured-байтов — SHA-256 + длина 1771 литерала до правки (вычислены по `1f5c1ba`), а не сравнение
  константы с самой собой.

## Тесты
- Studio (из `ASTROUI/`, против `studio-core`): `:backend:bridge:test --tests '*WorkflowScenario*' --tests '*Guidance*'
  :backend:server:test --tests '*WorkflowScenario*'` — `HostGuidanceTest` 3/0 (новый: байты, structured-старт видит
  `NOTES` и 1 open, direct-старт видит `DIRECT_NOTES` и 1 open), `StudioWorkflowScenarioTest` 4/0,
  `CampaignWorkflowScenarioTest` 1/0, `TaskWorkflowScenarioTest` 20/0 — WorkflowScenario 25/0. Цикл 1.
- eval-live (из worktree ядра): `:eval-live:test -Pastrolabe.aiGateBuild=…` — 50 тестов, 0 падений, 1 skipped
  (`LoopToolsTest`, прежний). Новое: `StudioGuidanceTest` 3/0 (байты обеих копий, direct-арм видит direct-заметки, default —
  structured, по 1 open), `OpenCountTest` +1 (reopen после добавленной моделью goal-проверки `Origin.Model`, без sniffed
  suite: verification `tests/declared`, 1 open, нет `preflight-diverged`), `AskModeTest`: `opens` = 2 (старт + reopen,
  было `>= 2`), `cells` по сегментам `[1, 0]`, итого 1. Циклы: 2 (первый — ошибки компиляции теста: литерал и сравнение
  `evallive.Protocol` с `cell.Protocol`).
- Падение «до правки» для P2 №1 отдельно не воспроизводилось (лишний цикл); тест проверяет путь, при котором старый
  `verificationOf` давал `saved` против ожидаемого `declared`.
- Расход токенов: ~200 тыс. (оценка).

## Отклонения от карточки
- Тест `cells` — в `AskModeTest` (ask-ожидание + reopen без новой ячейки), а не в `ScenarioTest`/`PairTest`: это ровно
  сценарий карточки.
- Studio-тест — новый класс `HostGuidanceTest` (попадает в `*Guidance*`), чтобы счёт `*WorkflowScenario*` остался 25.
- `AskModeTest` ужесточён (`opens >= 2` → `== 2`) — усиление, не ослабление.

## Хвосты и риски
- `Verification.text` для проекта без test command («write a short summary … and stop») не зависит от протокола; для direct
  первый финал без вызова получает nudge ядра. Вне файлов карточки (Studio `Verification.kt`, копия в eval-live).
- Руководство фиксируется на open: эскалация формы direct S1 → S2 внутри запуска меняет роль, но не заметки.
- Ядро вне `eval-live/` не тронуто; ABI не менялся (eval-live — internal).

Статус: ГОТОВО К СЛИЯНИЮ
Последние коммиты: ядро `v2/WR5s` 8acbab2; корень (Studio) `v2/WR5s` 4ebb226.
