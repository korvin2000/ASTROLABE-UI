# WP-C10 — строгий регрессионный гейт (P8.C.10) и живой фоновый запуск при stop-верификации (P8.C.12)

**Исполнитель:** суб-агент t4 в worktree ядра (cwd `C:\work.astrolab\ASTROLABE`). **Ветка:** `v2/C10` от `main`.
**TODO:** P8.C.10 и P8.C.12 (две части, отдельные коммиты и разделы отчёта). **Решение владельца 2026-10-03:** делать
(правило строже v1.0 — одобрено). **Общие правила:** `C:\work.astrolab\plan2\COMMON.md` (обязательны).
**Читать с:** D-337 (единое правило приёмки), D-394, D-396, D-400 — `rg -n '^\| D-(337|394|396|400) ' TODO.md`; отчёт
`C:\work.astrolab\plan2\reports\WP-C1b.md` («Хвосты и риски»: (а) строгий гейт, п. 5 — фоновый handle; таблица проверок).
K = core/src/main/kotlin/io/astrolabe.

## Часть 1 — P8.C.10: регрессию, найденную harness, нельзя «признать» заметкой
Сейчас (D-400): `CHK-tests-blast` и `CHK-types-touched` — обязательные, но красная текущая + eligible проходит, если
модель записала `Open`-заметку с именем проверки (`K/verify/Resolution.kt` ≈ 504 — проверка подстроки). Унаследованные
падения из красного не исключаются: `PreexistingLedger.classify` (`K/verify/Baseline.kt:82`) в приёмке не используется,
`red = receipt.outcome == Failed` (`K/verify/Scheduler.kt:437`). После падения любой не-Failed результат (timeout,
inconclusive) снимает красное (`K/verify/Check.kt:278`).

Сделать:
1. **Без лазейки `Open`:** текущая + eligible красная `CHK-tests-blast` / `CHK-types-touched` — rework и блок `[>]`;
   `Open`-заметка её не снимает. Проверки приёмки и Full/Quality — как сейчас (не ослаблять и не менять).
2. **Унаследованные падения не считаются регрессией:** падение, которое `PreexistingLedger.classify` относит к
   существовавшим до изменений (та же идентичность, окружение, сигнатура, что на базовом кандидате), не делает
   проверку красной для приёмки; оно раскрывается строкой в `openItems` итоговой квитанции («pre-existing failure …»).
   Квитанция, где ВСЕ падения унаследованные, не блокирует. Смешанная — блокирует, причина называет новые падения.
3. **Нет базовой классификации** (baseline не снят или недоступен). Сначала выясни, может ли harness получить её сам
   существующим механизмом (`verify.baseline` / `Baseline.kt`: прогон того же набора на исходном кандидате, один раз
   на попытку) до решения о красном. Если может за ограниченную цену — делай так. Если не может — безопасный откат:
   прежнее правило D-400 (лазейка `Open`) + строка раскрытия «no baseline: pre-existing failures cannot be told from
   regressions» + сводный класс `unverified`. Выбор и цену опиши в отчёте (проверит Codex).
4. **Красная до `Passed`:** для обязательных проверок падение держится, пока той же проверке не придёт более поздняя
   квитанция `Passed` (timeout / inconclusive / отсутствие квитанции красное не снимают). Не должно превращать
   устаревшую зелёную в красную; сузившийся набор blast не снимает непокрытое падение.
5. Ограниченность: модель, которая не может починить регрессию, заканчивает так же, как при красной обязательной
   проверке приёмки сегодня (rework → отказ завершения → существующая лестница); новых бесконечных путей нет.
6. Детерминизм: решение — чистая функция записей (квитанции, ledger, штамп); без wall-clock.

Тесты (fixtures): регрессия blast с `Open`-заметкой → rework; та же при унаследованном падении в ledger → завершение с
раскрытием; смешанная; нет baseline (оба исхода п. 3); red → timeout → всё ещё красная; red → passed → снята;
types-touched аналогично; S1-инкремент.

## Часть 2 — P8.C.12: живой фоновый запуск во время stop-верификации
Хвост C1a/D-394: живой фоновый handle во время stop-верификации невидим для `Scheduler.exclusive` — верификация может
удостоверить дерево, которое ещё меняет фоновый процесс. Предложение C1b (в её отчёте): квитанция, полученная при живом
фоновом запуске, несёт предел `concurrent`, а exit-гейт возвращает работу с «background run live: wait or cancel».
Ограничение: `campaign.ResumeTest` держит `sleep 30` в фоне во время stop-верификации.

Сделать: stop-верификация никогда не удостоверяет дерево при живом фоновом запуске, который может его менять. Выбери
вариант с наименьшим числом ходов модели и без нового тупика для модели, которая просто оставила сервер запущенным:
(а) harness сам улаживает фоновые запуски перед stop-верификацией (короткое ожидание, затем отмена — они и так
завершаются с ячейкой) и проверяет тихое дерево; либо (б) предложение C1b (предел `concurrent` + возврат работы).
Обоснуй выбор в отчёте; `ResumeTest` должен остаться осмысленным (если меняешь — объясни, это не ослабление).

## Границы
`verify/Resolution.kt`, `verify/Scheduler.kt`, `verify/Baseline.kt`, `verify/Check.kt`, `campaign/FinishReceipt.kt`
(строки раскрытия и класс), для части 2 — `cell/Gates.kt`, `tool/run` (handles), `verify/Scheduler.kt`; их тесты; docs
`runtime/gates-termination.md`, `verification/acceptance-review.md`, `verification/scheduler.md`. **Не трогать:**
`campaign/Controller.kt`, `budget/`, `campaign/Limits.kt`, `cell/Cell.kt` сверх одной-двух строк проводки (их правит
параллельная линия C3r), `delegate/ReviewCell.kt` и ветка `IntegrityApproval` (линия C11), `context/`, `register/`, Studio.

## Проверки
- L1: `./gradlew :core:test --tests 'io.astrolabe.verify.ExitGateTest' --tests 'io.astrolabe.verify.SchedulerTest' --tests 'io.astrolabe.verify.BaselineTest' --tests 'io.astrolabe.campaign.ProvenanceTest' --tests 'io.astrolabe.campaign.AcceptanceDecisionTest' -q --console=plain` + новые случаи.
- L2 один раз в конце, после `git merge main`: `--tests 'io.astrolabe.verify.*' --tests 'io.astrolabe.cell.*' --tests 'io.astrolabe.campaign.*' --tests 'io.astrolabe.tool.run.*' --tests 'io.astrolabe.tool.verify.*' --tests 'io.astrolabe.java.*'`,
  `:eval:compileTestKotlin`, `:core:checkKotlinAbi` → `updateKotlinAbi` при изменении публичного API.

## Готово, когда
Обе части реализованы с тестами; ни один существующий сценарий приёмки не ослаблен; L1/L2 зелёные; ветка запушена.
При слиянии: Codex — правило классификации унаследованных падений и «красная до Passed»; Fable — поток приёмки.

## Отчёт
`C:\work.astrolab\plan2\reports\WP-C10.md` по формату COMMON.md, разделы «Часть 1» и «Часть 2».
