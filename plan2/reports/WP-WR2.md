# WP-WR2 — ядро (линия исправлений сквозного ревью 4B)

## Сделано (ветка `v2/WR2` от `238c6d7`, +800 −249, 30 файлов; каждый P1 сначала падал тестом — цикл 1)
- T-45: `ReviewScenarioTest` — три сценария параллельно, у каждого свой хост (29,8 → 13,5–14,8 с); стражи не тронуты.
- T-03 (живой): второе чтение — пред-скан открытия (`ImpactPrescan.inputs` → `ImportGraph.of` → `Atlas.outline`) читал каждый файл
  без парсера импортов, когда запрос называет путь/идентификатор (живые называют, фикстура — нет); найдено гистограммой мест
  чтения на офлайн-прогоне eval-live. Исправлено в `ImportGraph.of`. Страж WF-2: чтений открытия ≤ файлы + 20 (допуск строк атласа
  убран), запрос `DirtyRepoScenarioTest` называет путь. До: 616 чтений на 306 файлов. Повтор D-427 (файлы моложе 2 с) — не трогал.
- #1 `DecisionRecord.key/outsideInputs`; `decisionFor` — только решение под тем же ключом и с теми же закреплениями (перечитанными);
  `decide` перечитывает закрепления после ожидания (Void), финал — перед фиксацией; `FullSuite.NotCertified` несёт квитанцию шлюза
  (закрепления шлюза были вне ключа). Тест `OutputPolicyScenarioTest` «an accept of evidence whose pinned input moved…».
- #2 `DeclaredOutputs.applyNow` — `IllegalStateException` до мутации при живом прогоне/ячейке. Тест «apply now while … runs».
- #3 `FinishReceipts.holdsBack` — структурная классификация. `PublicationTest` «a decider's reason quoting…».
- #4 `ScratchPolicy.toolchains` (v3, в id только если не пусто), `withToolchains`; заморожено при первом открытии из run-пунктов
  контракта, `declaredChecks`, quality gates. Тест «a toolchain a check launches from under a … marker stays in identity…».
- #5 ответ-поправка → `message(Answer, answers=q.id, changesRequirements=true)`; `commit` сначала выводит инкремент поправки
  (иначе граф невалиден — `cannot accept an invalid requirement graph` в WF-15). `TaskToolTest` (усилен).
- #6 финал решает goal-`check:` модели, не оценённые ни одним инкрементом (unverified → решающий). `GoalEvidenceScenarioTest`.
- #7 инкремент-ответ: только regression-пункты; ответ на записанное сообщение не требует исполняемой приёмки (`validate`).
  `MessageKindScenarioTest` (WF-13 card): `response.accept == []`.
- #11/T-44 липкий долговременный эффект из наблюдений (кандидат после исполнения ≠ s0). `AnswerScenarioTest` T-44.
- T-37 дайджест — `objectiveRequests` (`ChecksTest`). T-41 сценарий заметки посреди ячейки (`AppendOnlyPrefixScenarioTest`).
- T-42 `Answer.decider`; вопрос, называющий все флаги, получает варианты харнесса; выбор «approve» человеком (`Decider.User`)
  → запись ревью на пути human (кандидат, ревизия, версии путей); только для инкрементов без `check:`/`review:` (2 теста
  `AcceptanceEvidenceTest`). P2 предел переноса родителя (`CarryForward.capped`, `CarryForwardTest`).

## Решения
- #1: пины входов (D-374) не замораживаются в политику; закреплены и перечитываются, как в §5.2 — безопасная альтернатива.
- T-42: одобрение по свободному тексту не читается (WF-8); без `decider` ответ ничего не решает — Studio должна ставить `User`.

## Тесты
- Цикл 1 (воспроизведение): 8 классов, 6 падений по P1/T-37 (#1 в первой форме не воспроизводился — сценарий переписан, см. #1).
- Цикл 2: пакеты L2 + atlas + `AttemptConfigTest` — 1423, 2 падения (WF-15 после #5; сценарий #1). Цикл 3: WF 43/43, campaign.* 261/0.
- `updateKotlinAbi` (core); `assemble testClasses checkKotlinAbi -Pastrolabe.aiGateBuild=…` — зелёные. Циклов «правка → тест»: 3.
- WF: 43/43, 179,5 с (при параллельной нагрузке; базовые классы медленнее прошлого замера на 3–18 %). Расход токенов не виден.

## Отклонения от карточки
- `DirtyRepoScenarioTest`: запрос назван с путём (усиливает охват стража WF-2); `MessageKind` card-тест усилен утверждением #7.

## Хвосты и риски
- P2 WF-11 (фактические ответы мимо истории, `TaskTool.kt`): запись в `requests` даст инкремент-ответ на собственный вопрос
  модели и двойной pinned-ряд — не ≤20 строк. P2 `ContractSlice.kt:85` (цель/статус в срезах), `Verify.kt:642` (затенение
  одинаковых команд цели) — не исправлены. Средняя.
- T-03: повторное чтение D-427 для файлов моложе 2 с остаётся (eval-live пишет грязь прямо перед открытием); финал читает
  дерево дважды (два свежих штампа D-374). Низкая. Пред-скан всё ещё перечитывает разобранные исходники (динамический скан).
- WF 179,5 с — запаса нет; следующая линия со сценарием сначала режет время (кандидаты: слить `AnswerScenarioTest` в
  `GoalEvidenceScenarioTest`, `UnreadableFile…` в `MessageKind…` — с правкой реестра). Средняя.
- Studio: `Answer.decider` не выставляется — T-42 в Studio инертен до правки хоста. Средняя.

Статус: ГОТОВО К СЛИЯНИЮ · v2/WR2 e758494
