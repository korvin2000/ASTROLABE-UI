# WP-W3 — одна объявленная политика расходного вывода для идентичности кандидата

Ветка `v2/W3` от `main` `e75d38d`. Исполнитель: суб-агент (Opus), worktree ядра. Фаза A влита (`7a09bf2`). Фаза B: всё,
кроме проводки в `Controller.kt`, сделано и запушено (`03903d2`); проводка ждёт слияния W4.

## Сделано
- **Фаза A — время набора WF (`931bd56`).** Сценарии одного класса играют одновременно (`Scenario.concurrently`: у каждого
  свой репозиторий, хранилище, контроллер и счётчики — D-426 считает их на экземпляр); `DirtyRepoTest` не ждёт racy-окно.
  Утверждения, пороги и 300/1500 файлов прежние; все 12 строк `WF-counters` совпадают с `main`.

  | Класс (Windows, XML) | до (`e75d38d`) | после (`931bd56`) | фаза B (`03903d2`) |
  |---|---|---|---|
  | `DirtyRepoScenarioTest` | 119,8 с | 92,9 с | 90,3 с |
  | `FinalizationScenarioTest` | 48,4 с | 22,6 с | 21,9 с |
  | `DirtyRepoTest` | 10,6 с | 1,8 с | 1,7 с |
  | `UnreadableFileScenarioTest` | 9,2 с | 8,9 с | 8,8 с |
  | `OutputPolicyScenarioTest` (новый) | — | — | 11,6 с |
  | **Итого** | **188,0 с** | **126,2 с** | **134,4 с** |

  Замер JFR (1500 файлов): ≈ 60 % времени ячейки — `WorkspacePath.canonicalise` (`toRealPath` → `FindFirstFile` на
  каждый компонент пути) на каждом штампе; хвост.
- **Спецификация** пересмотрена по ревью Codex и решениям оркестратора (`WP-W3-spec.md`, раздел «Ревью Codex →
  решения») и перенесена в `docs/verification/scheduler.md` (§8.1 «Declared output outside the candidate», §8.4 —
  состав штампа); строка WF-5 в `docs/reference/workflow-invariants.md` дополнена.
- **Код без `Controller.kt`.**
  - `ScratchPolicy` версии 2: якорные корни, `excludes`, `id`, `NONE`, `BUILT_IN`; `isScratch` для собственного вывода
    проверки остался прежним.
  - `Stamper`/`StampReport`: неотслеживаемое под корнями отфильтровано, `scratchCount`, untracked-manifest v2.
  - `DirtyState`/`Snapshot`: тот же фильтр; перепроверка статуса под политикой (P2-3); `latest`; манифест v2.
  - `AttemptConfig.scratch`: заморозка до s0, у наследия — `NONE`, в JSON без поля. `Contract.scratch`, `deriveS0(scratch)`.
  - `Scheduler`: путь, объявленный известным замыканием, и отслеживаемый путь остаются входами при любом имени;
    закреплённый вход вне идентичности перечитывается; `Receipt.inputPolicy` проверяется до коротких путей;
    `Currency.rewrittenInputs`; отслеживаемое экспортируется в изолированного кандидата.
  - `Resolution`: `ObligationResult` и `DecisionItem` получили `rewrittenInputs`, добавлен `Resolved.decisionItems`;
    красный с переписанным входом остаётся красным.
  - `Atlas.build(root, captured)`. В S3 (`S3Run`, `Integrator`, `ReplayRebase`) — политика попытки.
  - Все новые JSON-поля помечены `@EncodeDefault(NEVER)`.

## Решения
- Один `ScratchPolicy`, два правила: для идентичности — якорные корни (решение 1), для собственного вывода проверки —
  прежнее совпадение сегмента (D-45). Иначе в многомодульном проекте (`app/build/`) каждая квитанция была бы негодна:
  вывод проверки попадает в перечисленные входы. Безопасная альтернатива — общий якорный предикат и для входов — ждёт
  объявления вложенных корней.
- P1-2 при неизвестном замыкании: расходный файл, который проверка читает, не заявив его, доверяется так же, как
  игнорируемый файл сегодня (§8.4) — ограничение принято. Файл, заявленный в замыкании, закрепляется и перечитывается.
- P1-4: красный остаётся красным, когда квитанция негодна из-за переписанного входа (`rewrittenInputs` не пуст).
  Негодность из-за неизвестной стабильности (фоновый или незатихший прогон) обрабатывается по-старому: перезапуск.
- P2-1: квитанции базовой линии (`Regressions.isBaseline`) из проверки политики исключены — их пишет не штамповщик.

## Тесты
- Цикл 1 (L1, один прогон): `StamperTest`, `DirtyStateTest`, `CaptureBytesTest`, `SnapshotCaptureRegressionTest`,
  `SchedulerTest`, `ScratchPolicyTest` (новый), `ExitGateTest`, `AttemptConfigTest`, `io.astrolabe.contract.*`,
  `AcceptanceDecisionTest`, `CadenceTest`, `IntegratorTest`, `io.astrolabe.workflow.*`. Итог: 174 теста, 4 упали, все
  ожидаемо.
  - `CaptureBytesTest` v2: вместо векторов стояли заглушки; вставлены значения этого прогона. Деревья и tracked-delta
    совпали с v1.
  - Три сценария `OutputPolicyScenarioTest` красные, пока нет проводки в `Controller` (политика `NONE`):
    - «принять» покрыло красный финал;
    - в пункте решения нет `rewrittenInputs`;
    - в сценарии вывода, помимо этого, гейт `if not exist …` не распознан как pytest — заменён строкой, как у варианта
      данных.
  - Набор WF — 134,4 с при пределе 180.
- Циклов «правка → тест» в фазе B: 1 из 3.

## Отклонения от карточки
- Выбор «объявить выводом этой задачи» не реализован (решение оркестратора 3) — хвост в 4B.

## Хвосты и риски
- «Объявить выводом этой задачи» — 4B (W6/W7).
- Fail-closed при ошибке обхода `filesUnder` и большие входы (P2-4).
- Мемоизация `WorkspacePath.canonicalise` (D-47).
- Переоткрытие перечитывает дерево.
- `git status -uall` по-прежнему перечисляет расходные файлы.
- ABI перегенерирую один раз после проводки и L2.

## БЛОКЕР (место): `Controller.kt` — ждёт слияния W4
Нужная правка, ≈ 10 строк. Строки — на `e75d38d`; после W4 перенести по смыслу:
```kotlin
// open(): убрать  val stamper = Stamper(workspace, EnvFingerprint.compute(env))  (сразу после registry); перед DirtyState:
val stamper = Stamper(workspace, EnvFingerprint.compute(env), scratch = frozen.scratch)
val atlas = Atlas.build(workspace.root, dirty.latest?.entries?.associateBy { it.path }.orEmpty())
val derived = contracts.deriveS0(..., protected, policy.cost, scratch = frozen.scratch)
// ask():
val items = waiting.decisionItems
// fullSuite():
data class NotCertified(val detail: String, val rewritten: List<String> = emptyList()) : FullSuite
val red = required.firstOrNull { currency.getValue(it.id).let { c -> c.red && c.applicability == Current && (c.eligible || c.rewrittenInputs.isNotEmpty()) } }
FullSuite.NotCertified("…", required.flatMap { currency.getValue(it.id).rewrittenInputs }.distinct().sortedWith(Stamper.PATH_ORDER))
// campaignResults():
is FullSuite.NotCertified -> results += ObligationResult(FULL_SUITE, Run, Unverified, "final full suite could not certify: ${suite.detail}", rewrittenInputs = suite.rewritten)
```
После слияния W4:
1. `git merge main` в `v2/W3`.
2. Эта правка.
3. Цикл 2: WF и затронутые классы.
4. L2: `workflow.*`, `workspace.*`, `verify.*`, `contract.*`, затем `assemble testClasses checkKotlinAbi`.
5. `updateKotlinAbi`.

Статус: В РАБОТЕ: ждёт W4 · последний коммит ветки `03903d2`
