# WP-W8 — цель отдельно от тестов; объявленный вывод и маркеры v3 (P8.W.8, сессия 4B)

## Сделано
- Ядро `v2/W8` (c5346bc → слит main 379fc4f с W9): `EvidencePurpose goal|regression` (`purpose`, легаси harness → regression), `Contract.checks(id)`, `goalAcceptanceStated` по цели — входной гейт (ответный инкремент освобождён), подсказка достаточности (только зелёный `goal run:`), `PlanNeed` (+ строка журнала «regression only»), класс: independent только на объявленных целевых; `RequirementLine.goalEvidence/regression`; «R-n: regression only: no goal-level check of R-n» в notVerified (публикацию не держит — D-250 про непроверенное).
- WD-21: `task.propose(acceptance)` — добавление `model(strengthens R)`, goal, не ослабление; `Verify.recognize` связывает `run` с пунктом модели, `verify` отказывает (D-262 без изменений). §3.6: `Contracts.declared` (сохранённая команда — регрессия, заменяет набор своего пакета). Node spec/tap уже разбирал `GenericShaper` (P8.C.15).
- §3.7 эффективное определение `package.json`. §3.5 `Answers` (долговременный эффект), `Intent.stampObserved`, `answerEvidence`.
- §5: `ScratchPolicy` v3 (маркеры, outputs, id), эффективная политика при заморозке попытки, `DeclaredOutputs` (валидация, declare, applyNow), `task.propose(output)` + `CampaignPolicy.autoDeclareOutputs`.
- T-34 `follows`/`messages`; T-38 подсказка карточки; T-09 `ReviewScenarioTest`. Controller.kt — отдельный коммит dec2798 после W9.
- Studio `v2/W8`: `Verification.items/of`, `expectedVerification` предпочитает сохранённую, сценарий сохранённой команды; слит root main e37e1fb.

## Решения (черновые)
- `checks: [R-n]` — производная функция (обратна `Requirement.acceptance`). Альтернатива — хранимое поле с проверкой.
- «regression only» — раскрытие класса, не непроверенное обязательство: публикацию не держит (как agent_test). Безопасная альтернатива — держать (тогда любой проект только с найденным набором не публикуется выше patch).
- Durable effect: правка (preimage с postimage), D-класс, действие без `stampObserved`.

## Тесты
- L1 (до контроллера): 469/4 → исправлено, повтор 5/5. Цикл 3 (временный патч контроллера): Answer 1/1, MessageKind 6/6, PlanNeed 8/8, OutputPolicy T-06/07 0/1 (фикстура).
- L2 после слияния W9: `campaign.* verify.* cell.* contract.* tool.* workspace.* workflow.*` + AttemptConfigTest — 1084, 5 упали (ControllerTest S0: ожидал пустой notVerified; PublicationCampaignTest 2: раскрытие держало публикацию; LayoutTest: золото схем; OutputPolicy T-06/07: первая попытка останавливается на собственном входе). Исправлено, повтор только упавших: 17/17. `updateKotlinAbi`, `assemble testClasses checkKotlinAbi -Pastrolabe.aiGateBuild=…` — ок.
- WF (сумма XML, Windows): 176,7 с (≤ 180; было 150,6 с после W9).
- Studio: bridge 25/25 (вкл. `StudioWorkflowScenarioTest` 4/4), server `*WorkflowScenario*` 18/18, `ProvenanceTest` 8/8.
- Циклы: 3 до слияния + L2 и один повтор упавших. Расход токенов не виден.

## Отклонения от карточки
- T-09 в `ReviewScenarioTest` (обвязка S2). Изменены тесты: GatesTest/ControllerTest/RunTest (поведение по §3.1–3.3), CaptureBytesTest (v2 → `ScratchPolicy.V2`), LayoutTest (золото схем, как в A3), `Scenario.seed` (цель хоста, связь R1, конфиг сценария).
- T-42 и T-08 сняты с линии оркестратором (T-42 → линия исправлений, T-08 → P8.F.3).

## Хвосты и риски
- P3: запуск, сдвинувший кандидата и вернувший его другим запуском, `Answers` не видит (штампа на интент нет).
- P3: WF 176,7 с — следующая линия со сценарием сначала сокращает время.
- P3: Studio не показывает строку объявленного вывода в активном списке scratch (ядро готово: `DeclaredOutputs.declare`, журнал).

Статус: ГОТОВО К СЛИЯНИЮ · ядро `v2/W8` b449434 · корень `v2/W8` 138d04a
