# WP-D7 — direct: остаток окон сбоя и удержание фактов по протоколу ячейки (P8.D.7, сессия 5)

Читать вместе с `plan2/COMMON.md` (обязательно). Исполнитель — t4. Ядро: ветка `v2/D7` от `main` ядра, worktree
`C:\work.astrolab\ASTROLABE\.claude\worktrees\D7` (уже создан оркестратором; работать только в нём).
Спецификация: `docs/reference/kernel-contract.md` A-D.4 (удержание фактов), A-D.6 (handoff эпохи), D-425;
отчёт `plan2/reports/WP-D3r.md` §4 («Осиротевшая запись handoff»), «Решения» п. 3–4, «Хвосты и риски».
Direct нигде не включается, пока эта линия не слита: вы — предпосылка D4.

## Цель
1. **Осиротевшая запись handoff восстанавливается до любого перехода open, сдвигающего `seq`.**
   Сейчас (`campaign/Controller.kt:793-806`, open): сверка `kept.seq == stored.seq + 1` идёт **после** переходов, уже
   применённых тем же open выше — unblock независимого инкремента после поправки хоста (`:742`, `Transition.Unblocked`),
   прочие `Reconcile`-переходы `:723-786`. Если такой переход сдвинул `seq`, сверка промахивается, ячейка помечается
   `Lost` → `Failed`, и преемник стартует обычным продолжением без перенесённых флагов целостности тестов и обязательств
   public-impact (`ReturnedHandoff.exit`, `campaign/Handoffs.kt:105`; `packet` `:89`). Сценарии: direct S1, сбой между
   записью `returned_handoff` и `Transition.Returned`, затем поправка хоста (unblock) при переоткрытии.
   Правка: сверка и применение `Transition.Returned` из записи — первым делом open для бегущей ячейки, до переходов,
   меняющих `seq`; либо сверка не по `seq + 1`, а по идентичности ячейки и чекпойнта (запись handoff бегущей ячейки с
   чекпойнтом — всегда возврат этой ячейки). Выберите вариант, который не меняет поведение без записи handoff.
2. **Удержание фактов берёт протокол породившей ячейки, а не попытки.** `Controller.retainedFacts`
   (`campaign/Controller.kt:1694-1703`) передаёт `c.attempt.config.protocol` в `FactRetention.capture`
   (`context/FactRetention.kt:16-31` → `FactCoherence.retain`, `context/FactCoherence.kt:54-56`). Структурная ячейка
   внутри direct-попытки (ревью, probe, repair в S2/S3) должна сбрасывать устаревшие verified-факты как прежде; direct —
   хранить (A-D.4). Протокол — у роли ячейки, написавшей регистр (`Role.protocol`, `cell/Role.kt:67`; главная линия —
   `Roles.mainLine(protocol, shape)` `:266`). Найдите, где у ячейки хранится/восстанавливается роль, и передавайте её
   протокол; если роль ячейки нигде не сохранена — сохранить её рядом с чекпойнтом/записью ячейки (минимальная
   правка store допустима; миграцию схемы не начинать — в этой сессии E1 берёт v7; если без столбца никак — `БЛОКЕР`).
3. **Тест эпохи, где ревью отклоняет перенесённый флаг:** ослабление теста в эпохе A, handoff, в эпохе B ревью
   отклоняет → завершение отказано (`campaign.HandoffTest`, рядом с «a test weakened before a handoff binds…»).
4. **T-56 (первым коммитом, до всего остального):** слить `workflow/AnswerScenarioTest.kt` в
   `GoalEvidenceScenarioTest.kt` и `workflow/UnreadableFileScenarioTest.kt` в `MessageKindScenarioTest.kt` — тесты
   переносятся дословно (имена, проверки, счётчики), классы остаются конкурентными как сейчас; удаляемые файлы удалить.
   Ни один страж не ослабляется и не удаляется; число тестов набора WF остаётся 43. В отчёте назвать перенесённые имена
   тестов и новые классы — строки реестра `docs/reference/workflow-invariants.md` (WF-4, WF-12) правит оркестратор.

## Границы
- Ваши файлы: `campaign/Controller.kt` (только open-сверка и `retainedFacts`), `campaign/Handoffs.kt`,
  `context/FactRetention.kt`, `context/FactCoherence.kt`, при необходимости `cell/Checkpoints.kt` / store ячейки;
  тесты `campaign.HandoffTest`, `context.FactCoherenceTest`, `workflow/*` (только слияние п. 4 и, если нужен сценарий
  для п. 1, — **внутрь существующего класса**, не новый файл).
- Не трогать: `cell/Cell.kt` (следующий владелец C18), `tool/`, `TaskService.java`, `docs/reference/workflow-invariants.md`,
  `TODO.md`, `CONTINUE-TASK.md`, `actual_state.md`, `audit/`. Спецификацию `kernel-contract.md` править только там, где
  она противоречит сделанному (A-D.6 порядок сверки при open) — одной фразой.
- Инварианты, которых касаетесь: WF-4 и WF-12 (перенос классов), WF-14 (open и перенос — `Controller.kt` open),
  WF-7 (свидетельства после переоткрытия). Их стражи остаются зелёными и неизменными.

## Проверки
- L1 (один раз, когда правка закончена): `./gradlew :core:test --tests 'io.astrolabe.campaign.HandoffTest' --tests 'io.astrolabe.context.FactCoherenceTest' --tests 'io.astrolabe.workflow.*' -q --console=plain`
  (`export JAVA_HOME=/c/Users/user/.gradle/jdks/eclipse_adoptium-26-amd64-windows.2`). Набор WF: 43 теста, время
  из XML назвать в отчёте (цель — заметно ниже 179,5 с).
- L2 (один раз в конце): `./gradlew :core:test --tests 'io.astrolabe.campaign.*' --tests 'io.astrolabe.context.*' --tests 'io.astrolabe.workflow.*' -q --console=plain`
  и `./gradlew assemble testClasses checkKotlinAbi -Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm -q --console=plain`;
  публичный API изменён → `./gradlew :core:updateKotlinAbi` один раз и закоммитить дамп.
- Не больше трёх циклов «правка → тест»; четвёртый не начинать — `БЛОКЕР` в отчёте.

## Готово, когда
- Fixture сценария сбоя (п. 1) при переоткрытии с unblock/поправкой хоста сохраняет **оба** обязательства (флаг
  целостности тестов и public-impact) у преемника; без записи handoff поведение open не изменилось (`Lost` как прежде).
- Структурная ячейка внутри direct-попытки удерживает факты как структурная попытка; direct-ячейка — как direct (тест).
- Тест п. 3 зелёный; набор WF 43/43 без изменений стражей, два класса слиты; L1 и L2 зелёные; ABI обновлён, если менялся.
- Отказ: нужна миграция схемы store или правка `cell/Cell.kt` сверх строки инициализации → `БЛОКЕР` с обеими сторонами.

## Отчёт
`C:\work.astrolab\plan2\reports\WP-D7.md` по COMMON.md: Сделано · Решения (без номеров) · Тесты (команды, итоги, время WF,
число циклов, расход токенов) · Отклонения от карточки · Хвосты и риски (перенесённые имена тестов для реестра) ·
`Статус: ГОТОВО К СЛИЯНИЮ | БЛОКЕР: …` и последний коммит. Ревью линии нет — одно сквозное ревью после D7+C18+D4.
Оценка расхода: ≤ 400 тыс. токенов; превышение вдвое — остановиться и написать в отчёт.
