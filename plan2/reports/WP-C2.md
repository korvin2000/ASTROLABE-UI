# WP-C2 — ось происхождения в итоговом объекте и метриках (отчёт линии)

Ветка `v2/C2` (worktree `ASTROLABE/.claude/worktrees/bold-leavitt-29fc09`), от `main` `940ef5a`; влиты `main` `138db32` (B1)
и `c4f33ba` (C8, C1a) — без конфликтов (строка `emit` в `Controller.kt` цела).

## Сделано
1. **`verify/Resolution.kt`** — ось происхождения критерия:
   - `ObligationResult.origin: Origin?`; `ItemProvenance.origin: Origin?` и `ItemProvenance.result: ResultStatus?`
     (результат до решения: `passed` / `unverified` / `failed` отзыва, принятый пользователем). `Resolver.increment`
     берёт `origin` из пункта контракта, `Resolver.resolve` переносит его и статус в `ItemProvenance` — так ось
     попадает в `IncrementEvidence.provenance` и `LedgerEntry.provenance` без правок `graph`/`Controller`.
   - `Author { User, Host, Model }` (wire `user`/`host`/`model`): `Author.of(origin)`, `Author.of(requirement, requests)`.
   - `RiskAcceptor { Runtime, User, Policy }`; вычисляемые `ItemProvenance.checkBy`, `riskAcceptedBy` (не сериализуются).
   - `ProvenanceClass { Unverified, AgentTest, Independent }` (wire `unverified`/`agent_test`/`independent`, от худшего)
     с правилами `item(by, result)`, `requirement(declared, agent)`, `campaign(requirements)` — см. «Решения».
   - `Obligations.INTEGRITY` = `"integrity:"` (префикс обязательства test-integrity; раньше — литерал).
2. **`campaign/FinishReceipt.kt`** — итоговый объект:
   - `FinishReceipt.provenanceClass` (статус остаётся `completed` — D-389/№3) и `acceptanceSurfaceUnreviewed` (пути
     тестов, изменённых агентом и принятых без одобряющего ревью);
   - `RequirementLine`: `by`, `authorityRef`, `acceptance` (свои пункты + пункты модели `strengthens` требования),
     `provenanceClass`;
   - `AcceptanceLine`: `origin`, `checkBy`, `command`, `receiptId`, `riskAcceptedBy`, `result` (D-337 на финальном
     дереве: `Obligations.run` для `run:`; одобрение — `passed`; для принятого — результат до решения),
     `provenanceClass` (дерево — уже было: `stamp`, `currency`);
   - `acceptedWithoutVerification` кампанийного уровня несут `origin`.
3. **Событие** `campaign.finished`: поле `provenanceClass` (wire) — для аудитора.
4. **Исход для хоста:** `CampaignHandle.finish` (квитанция с классом после `await`); Java-зеркало
   `JavaCampaignHandle.finish()` — без `suspend`/`Flow`.
5. `@JvmOverloads` на расширенных data-классах (`ObligationResult`, `ItemProvenance`, `RequirementLine`,
   `AcceptanceLine`, `FinishReceipt`, `Campaign.Finished`): прежние Java-конструкторы сохранены (политика D-387).
6. **docs:** `runtime/gates-termination.md` §5.9 (ось и правила), `verification/acceptance-review.md` §8.7 (Provenance) —
   без номера D (его даст оркестратор).
7. **Тесты:** `campaign/ProvenanceTest` (9) и `java/AstrolabeJavaTest` (1) — см. «Тесты».
8. **Метрика аудитора** (после слияния B1, `main` `138db32` влит в `v2/C2`): `eval/audit/Provenance.provenanceClass`
   из последнего `campaign.finished` (`null` в журналах до C2; поле больше не попадает в `extra`);
   `GroupAudit.provenanceClasses: ProvenanceShares` — число прогонов `independent` / `agent_test` / `unverified` /
   `unknown` и доли трёх классов (доли `null`, пока у какого-то прогона класс неизвестен — как у B1: «не измерено —
   не ноль»); `audit.md` — колонка класса в «Runs: provenance» и таблица «Groups: provenance class». Тест
   `AuditProvenanceTest` (2).
9. **Сопоставление C1a** (после слияния `c4f33ba`): собственные проверки модели `CHK-model-*`
   (`Origin.Model(strengthens = "R1+R2")`) — свидетельство агента для требований, которые они называют
   (`RequirementLine.agentChecks`; результат на финальном дереве — D-337 по валюте); они никогда не делают требование
   `independent`. `strengthens` разбирается по `+` и у пунктов модели. Квитанция с `independent == false`
   (`checkOrigin` модели) делает свой пункт свидетельством агента (защита; у объявленных пунктов не бывает).
   `AcceptanceLine.evidenceKind` (вид из квитанции, иначе из проверки), `CheckRun.checkOrigin/evidenceKind` — что
   запущено и чьё. Вид свидетельства класс не меняет: класс — «кем», вид — «чем» (объявленная хостом сборка,
   прошедшая на финальном дереве, — `independent` с `evidenceKind: build`). Тест: модель запускает `pytest` (своя
   проверка), ревью хоста без ревьюера принято политикой → требование и кампания `agent_test`.
10. **ABI:** `core/api/core.api`, `eval/api/eval.api` регенерированы; прежние Java-конструкторы на месте
   (`@JvmOverloads`), меняются только синтетические `copy`/`<init>` с маркером (как в D-387: Kotlin-бинарники пересобираются).

## Ревью Fable (через оркестратора) — исправлено на `v2/C2`
- **F2 (bug):** квитанция бралась при `c.stamper.report()` (из кэша), а валюты — при `report(fresh = true)`: при
  D-374 в одной квитанции могли оказаться два кандидата. Теперь `Controller.finish` читает свежий отчёт один раз и
  передаёт его в новую перегрузку `FinishReceipts.build(c, packets, currencies, report, receipts)`. Прежняя
  перегрузка (её зовёт `QaDriverTest` с завершающей лямбдой) сама читает свежий отчёт.
- **F1 (risk) → полный вариант** (основной код ~40 строк, порог 150 не превышен): порча считается по финальному
  дереву. Пути, изменённые с s0 агентом, run или неизвестно кем (`agent` + `byRun` + `unattributed` из
  `DirtyState.separate`), на acceptance surface классифицируются `TestIntegrity.classify` по байтам на s0 (recovery
  blob снимка s0 или blob базового коммита) и сейчас (через `WorkspacePath`). Порча — флаг с обязательными
  проверками и видом не `additions-only`. Снимается только `Reviewed`-происхождением `integrity:<path>`
  инкремента, проверенного на финальном штампе, или одобряющим `ReviewRecord`, чьи строки integrity называют путь,
  а версия пути в `evidenceVersions` (если записана) совпадает с текущей. Сценарий воспроизведён до исправления:
  ячейка правит тест → решение `rework` → продолжение без правок → `completed`, `acceptanceSurfaceUnreviewed` пуст,
  то есть `independent` (баг). После исправления — `agent_test`. Прежний источник (принятые `integrity:` в
  Verified-инкрементах) заменён: финальное дерево его покрывает, а отменённую правку не считает.
- **F4:** порча касается только пунктов `Acceptance.Run`, чьи проверки затронуты флагом
  (`requiredChecks` → `acceptanceIds`), а не всех объявленных и не `check:`/`review:`.
- **F3:** `AcceptanceLine.verifiedBy`: `runtime` для квитанции; для одобрения — последний тир судьи из
  `ReviewRecord.path`, `human` для пути через хоста (иначе подписант). Считать ли судью независимым, решит владелец в C4.
- **F5 (хвост C1b):** проверка модели, зарегистрированная без `requirementIds` у ячейки, получает в `strengthens`
  все требования контракта (C1a: `requirementIds.ifEmpty { contract.requirements }`) и усиливает их все.
- **F6:** `@JvmOverloads` на конструкторах `GroupAudit` и `Provenance` в `eval`; ABI `eval` обновлён.
- **F7 (тесты):** (a) зелёная объявленная проверка, устаревшая для финального дерева → `unverified`; (b) `Author.of`
  host/user — чистый тест (origins, `authorityRef` `U1` и `host:setup`) и интеграция R1 `user` / R2 `host`;
  (c) пункт модели `check:`, одобренный ревьюером → `agent_test`, `verifiedBy = human`; плюс сценарий F1.
  (d–f) не формулировались явно; `ProvenanceTest` — 13 тестов.

## Решения (черновые, без номеров)
- **Правило свёртки** (обсуждено с Codex, read-only; он рекомендовал именно его). Проверки требования R = его
  `acceptance` + пункты `Origin.Model(strengthens = R)`; «объявленные» — автор хост/пользователь, «агента» — модель.
  Результат пункта на финальном дереве — D-337 (`passed` / `failed` / `unverified`; решение никогда не делает
  `passed`). **R = `independent`**, если у R есть объявленная проверка и все объявленные `passed`; **иначе
  `agent_test`**, если ни одна проверка R не `failed` и хотя бы одна проверка агента `passed`; **иначе `unverified`**.
  Требование не `verified` в реестре → `unverified`. **Кампания** = наихудший класс требований
  (`unverified < agent_test < independent`); нет требований → `unverified`. Класс пункта: `passed` + автор не модель →
  `independent`, `passed` + модель → `agent_test`, иначе `unverified`.
  Почему: класс отвечает «кем проверено», а не «всё ли проверено» (полноту несут `notVerified` и
  `acceptedWithoutVerification`, они не тронуты); проверки агента не понижают объявленную проверку; отказ
  объявленной проверки (красная или отклонение, принятое пользователем) не покрывается тестом агента.
  Отвергнуто: «строго все» (любой непроверенный пункт → `unverified`, кампания `unverified` при непустом
  `notVerified`) — смешивает происхождение с полнотой и не различает случай «объявленная проверка принята без проверки,
  тесты агента прошли» (`agent_test` — ровно случай №3 плана).
- **Непросмотренная правка acceptance surface** (после ревью Fable, F1/F4). Изменение с s0 на acceptance surface
  обязательной проверки, которого не покрыло одобряющее ревью (см. «Ревью Fable»), делает затронутые им `run:`
  пункты свидетельством агента: зелёный объявленный набор на тестах, изменённых без ревью, — «тест агента». Это
  ровно 6/12 прогонов BL (acceptance-surface, без ревьюера) → `agent_test`, а не `independent`. Неизвестный автор
  (`unattributed`) тоже портит: «независимо» нельзя утверждать о непросмотренной правке теста неизвестного автора.
- **Кто «хост».** `Origin.Harness` (набор из манифеста проекта) и `Origin.Amended` (поправка, которую применяет хост:
  `amendByHost`, Studio/eval-live) → `host`; только `Origin.Model` — модель (та же граница, что D-262 и C1a).
  «Не goal-level» у harness — про конкретность, а не авторство (так же оценил Codex).
- **Кто задал требование:** `authorityRef` = id дословного запроса пользователя → `user`, иначе `host`; модель
  требований не создаёт (пути в коде нет).
- **Остаточный риск:** `runtime`, если пункт `passed`; иначе решающий: `user` (`Decider.User`) или `policy`
  (`Decider.Policy` = accept-unverified); `null`, если никто не принимал.
- **Обязательства уровня кампании** (полный набор, ревью кампании), принятые без проверки, в класс не входят
  (остаются в `notVerified`); красная собственная проверка агента (`CHK-model-*` или записанная в `Open`) не понижает
  `independent`, но мешает `agent_test`.
- **Проверки модели C1a** привязаны к требованиям через `strengthens` (то, что обслуживал инкремент ячейки), а не ко
  всей кампании (по совету Codex: несвязанные проверки к каждому требованию молча не применять).
- **Wire:** `agent_test` (snake_case, как `waiting_for_input`); Kotlin — `AgentTest`. Класс считается для любого
  исхода (для незавершённых почти всегда `unverified`).

## Тесты
- L1, цикл 1: `:core:test --tests ...AcceptanceDecisionTest --tests ...AcceptanceEvidenceTest --tests ...LifecycleTest
  --tests ...ProvenanceTest` — 35, упал 1 (`ProvenanceTest`: два требования при `shape = S0` уводили в plan-ячейку;
  тест исправлен — два требования → `S1`, run-only контракт сам себе план); `ProvenanceTest` 7/7.
- `:core:test --tests 'io.astrolabe.java.AstrolabeJavaTest'` — сначала упал (репозиторий без набора: кампания
  отказана при открытии, квитанции нет — тест исправлен: `Makefile`), затем 1/1.
- L1, цикл 2 (правило C + загрязнение surface): `ProvenanceTest` 9/9; `AcceptanceDecisionTest` 10/10,
  `AcceptanceEvidenceTest` 8/8, `LifecycleTest` 10/10, `AstrolabeJavaTest` 1/1.
- `:eval:test --tests 'io.astrolabe.eval.*Audit*'` (после merge main с B1): AuditCli 1, AuditJournal 4, AuditLosses 8,
  AuditMath 7, AuditProvenance 2, AuditResidency 3 — зелёные; LiveAudit 1 пропущен (нет каталога `diags`, как задумано B1).
- После слияния C1a: `ProvenanceTest` 10/10 (+ случай `CHK-model-*`).
- **L2** (один раз, после merge `main` `c4f33ba`; `--continue`): `:core:test --tests 'io.astrolabe.verify.*' --tests
  'io.astrolabe.campaign.*' --tests 'io.astrolabe.java.*' --tests 'io.astrolabe.event.*' :eval:test :core:checkKotlinAbi
  :eval:checkKotlinAbi` — exit 0. По XML: core 313 тестов (campaign 30 классов, verify 15, event 4, java 2), 0 падений,
  1 пропуск; eval 84 теста (eval 10 классов, eval.audit 7), 0 падений, 1 пропуск (`LiveAuditTest` без `diags`); ABI
  core и eval совпадают с дампами. Изменённые типы в `eval-live`, `provider-ai-gate`, `index-treesitter` не
  используются — их компиляция не нужна.
- **После ревью Fable** (main `c592289` влит — менялся только `TODO.md`): воспроизведение F1 до исправления —
  `ProvenanceTest` упал (`acceptanceSurfaceUnreviewed` пуст при `completed`); после исправлений `ProvenanceTest`
  13/13. L2 один раз (тот же набор, покрывает L1: `AcceptanceDecisionTest` 10, `AcceptanceEvidenceTest` 10,
  `LifecycleTest` 10, `ProvenanceTest` 13, `AstrolabeJavaTest` 1) — exit 0: core 316 тестов, 0 падений (1 пропуск);
  eval 84, 0 падений (1 пропуск — `LiveAuditTest`); `checkKotlinAbi` core и eval — совпадают с дампами (`94bc880`).

## Отклонения от карточки
- **`campaign/Controller.kt` изменён одной строкой** (вопреки «не трогать», C8): событие `campaign.finished`
  создаётся только в `Controller.finish()`; правка — аргумент `provenanceClass = receipt.provenanceClass.wire` в
  существующем `emit` (~стр. 1251). Ханки C8 (по его незакоммиченному дереву) её не задевают. Альтернатива, если
  оркестратор против: поле события остаётся `null`, протягивание — после слияния C8.
- **`Astrolabe.kt` (вне перечня):** `CampaignHandle.finish` — без него Java-фасаду нечего зеркалить. Аддитивно.
- `campaign/CampaignFinish.kt` нет: `CampaignFinish` — объект в `FinishReceipt.kt`; не менял (класс — в `FinishReceipts.build`).
- В `ItemProvenance` из цепочки — `origin`/`result` (+ вычисляемые `checkBy`, `riskAcceptedBy`): команда, квитанция и
  дерево уже есть (`AcceptanceLine.command/receiptId/stamp/currency`, `ItemProvenance.evidenceRef`, `IncrementEvidence.stamp`).

## Хвосты и риски
- Красная `CHK-model-*` сейчас не записывается runtime (это C1b) — класс её учитывает (мешает `agent_test`).
- Studio-ярлыки «проверено независимо / тестом агента / не проверено» — C4 (поле `provenanceClass` готово).
- Ревью `integrity:` из инкремента на другом штампе (S1: тест одобрен в I1, I2 менял только `src/`) путь не
  снимает, если нет `ReviewRecord` с совпадающей версией. Это консервативно: `agent_test` вместо `independent`.
- Правка, сделанная после одобренного ревью потерянной ячейкой, при совпадении версии в `ReviewRecord` невозможна (версия
  изменилась бы); без записанной версии (`evidenceVersions` без пути) одобрение засчитывается.
- F5: проверка модели без `requirementIds` усиливает все требования (C1a) — хвост C1b.
- Тесты, добавленные агентом в объявленный набор (additions-only, без ревью по §8.6), класс не меняют.
- Записи `ItemProvenance` до C2 — без `origin`; квитанция берёт автора из контракта, класс от этого не зависит.

Статус: ГОТОВО К СЛИЯНИЮ — последний коммит `94bc880` (ветка `v2/C2` запушена)
