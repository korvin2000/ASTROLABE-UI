# WP-W4 — ревьюер, способный блокировать, может читать

Ветка `v2/W4` (от `main` `e75d38d`, в неё слит `main` `7a09bf2` — сокращение времени WF от W3). Исполнитель: суб-агент t3 (Opus).
Свои изменения: 9 файлов, +255/−18 (из них тесты +182, ABI +3/−1).

## Сделано
- **Сначала красный сценарий** `io.astrolabe.workflow.ReviewScenarioTest` (`9f3420e`): на `main` оба теста падали.
  Ревью: `partial: TokenBudget: reserve reached: 67513 tokens of generation exceed the 24000 working tokens left`, то есть
  3 513 входа + 64 000 выхода против 24 000. 0 запросов к модели, 0 `look`. Неудачное открытие: 0 событий `phase.counted`.
- **WD-16, п. 1.** `CellContext.boundedOutput` (новый параметр, по умолчанию `false`). `Controller.runCell` ставит его
  каждой дочерней ячейке (`child != null`). В `Cell.turn` у такой ячейки выход запроса =
  `min(максимум модели, доступно для траты хода − оценка входа)`. Запрос уходит с этим `maxOutputTokens`, допуск,
  резерв учёта, запасное списание выхода и запас окна считают по `request.maxOutputTokens`. Для основной линии это
  то же число, что и раньше, поведение не меняется. Новый метод `CellBudget.available(spend)` (internal): те же разделы,
  что у `admit`, порядок вынесен в `order(spend)`.
- **П. 3.** Если после оценки входа остаётся меньше `min(2048, максимум модели)`, ход заканчивается до вызова модели
  (`partial`, `TokenBudget`/`Reserve`) с текстом `turn N not admitted before its model call: usable budget U tokens,
  input estimate E, needed output 2048 (model maximum M)`. Ревью получает `ReviewOutcome.Unavailable`: вердикта нет,
  резервный путь — человек (D-23). Это не «отклонено» (не `ReviewRejected`) и не одобрение. Запись сохраняется, и по I3
  повторно к ней не обращаются, поэтому круга c14 нет.
- **П. 2.** `Controller.reviewBudget(c)` собирает `ReviewBudget` из `defaults.reviewLookMax`, `reviewIncrementTokens`,
  `reviewCampaignTokens` замороженной попытки. Значение передаётся в `CellReviewJudge` (ревью инкремента и кампании) и в
  `CellChildRunner` делегатора. Раньше эти три настройки нигде не читались.
- **П. 4 (WD-18).** Каждый отказ `verify(review)` в `Verify.kt` дописывает `this cell accepts scope=…`, а если путей
  нет — `this cell accepts no review scope`.
- **Хвост W0.** Закрытый `Controller.open` теперь начинает подсчёт и вызывает `opening(...)` (тело перенесено без
  изменений). Исключение по ходу открытия выпускает `phase.counted` (`open`) и пробрасывается дальше.
- **П. 5.** Реестр `docs/reference/workflow-invariants.md`: строка WF-9 (ядро) — страж `ReviewScenarioTest`, файлы.
  Часть Studio остаётся за P8.W.5.
- ABI: `:core:updateKotlinAbi` один раз (после слияния `main`), дамп +3/−1 (только конструктор и геттер `CellContext`).

## Числа допуска до/после (сценарий, бюджет ревью по умолчанию 30 000 → рабочих 24 000, модель 200K/64K)
- До: ход 1 ревью = 3 513 + 64 000 = 67 513 > 24 000. Отказ, 0 запросов, ревью `unavailable`, кампания `WaitingForInput`.
- После: 2 запроса ячейки ревью (оценки входа 3 022 и 3 124), выход запросов 20 487 и 16 499 (вместо 64 000), 1 `look`.
  Вердикт `approve` → ревью одобрено, кампания `Completed`. Запросы основной линии остались на 64 000.
- Недопустимый вариант (`reviewIncrementTokens = 3000`): `usable budget 2400 tokens, input estimate 3513, needed
  output 2048`. 0 запросов ревью, ревью `unavailable`, кампания `WaitingForInput` (ждёт решения, не отклонение).

## Решения
- Ограничивать выход только у дочерних ячеек (флаг) или у всех → у дочерних. У основной линии бюджет — остаток
  кампании, а отказ допуска там запускает резервный ход C3r/§5.9. Безопасная альтернатива — ограничивать у всех ячеек,
  но тогда нужно перепроверить C3r.
- Порог выхода → 2 048 токенов (константа `Cell.MIN_OUTPUT_TOKENS`, private). Хватает на вердикт или вызов инструмента.
  Альтернатива — настройка в `Defaults` (сейчас лишняя).
- Флаг ставится всем дочерним ячейкам, писателям S3 тоже. У писателя с большим бюджетом выход не меняется.
- Недопустимое ревью по-прежнему спрашивает хоста (D-23: нет вердикта → человек). `AutonomousAuthority` отвечает
  `null`, итог `unavailable`.

## Тесты
- Красный: `:core:test --tests 'io.astrolabe.workflow.ReviewScenarioTest'` — 2/2 упали (числа выше).
- L1 (один раз): `ReviewScenarioTest`, `cell.CellTest`, `cell.TerminalAccountingTest`, `budget.CellBudgetTest`,
  `delegate.ReviewCellTest`, `delegate.InjectedDefectTest`, `tool.verify.VerifyTest`, `campaign.S2CampaignTest`,
  `AcceptanceEvidenceTest`, `ProvenanceTest`, `RefactorCampaignTest`, `ShapeSelectorTest`: 168 тестов, 0 упало.
- L2 (один раз, после `git merge main` до `7a09bf2`): `:core:test --tests 'io.astrolabe.workflow.*' --tests
  'io.astrolabe.cell.*' --tests 'io.astrolabe.delegate.*' --tests 'io.astrolabe.campaign.*' --tests
  'io.astrolabe.tool.verify.*'`: 64 класса, 490 тестов, 0 упало, 0 пропущено. Затем `./gradlew assemble testClasses
  checkKotlinAbi -Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm` — успешно.
- Набор WF в L2 (Windows): DirtyRepoScenarioTest 83,0 + DirtyRepoTest 1,7 + Finalization 20,6 + Review 19,1 +
  UnreadableFile 8,8 = **133 с** тестов (≤ 180).
- `VerifyTest`: в существующий тест отказов добавлено утверждение: `scope=diff` → `denied`, называются принятые области.
  Старые утверждения не менялись.
- Циклов «правка → тест»: 1 (красный прогон + L1 + L2). Расход токенов: не виден.

## Отклонения от карточки
- Сценарий не использует общий `Scenario`: нужны риск `Hard` при посеве (S2 с обязательным ревью), модель 64K и
  `FaultPoints` в контроллере, а `Scenario` этого не даёт. Чужие файлы `workflow/` не менялись. Репозиторий — 2 файла,
  без `DirtyRepo`.
- Сбой открытия получен через `FaultPoints` (крах блоб-хранилища при захвате), а не через `LockedFile`: W3 может
  изменить поведение захвата при нечитаемом файле.
- После L2 `main` ушёл дальше (изменения `eval-live`, ветку не затрагивают). В ветку слит `main` на `7a09bf2`.

## Хвосты и риски
- Порог 2 048 не настраивается. Если запрос дочерней ячейки с большим входом проходит по окну, но не по бюджету,
  теперь будет честный `partial` с числами, а не «reserve reached».
- Отказ допуска дочернего хода срабатывает до проверки лимитов задачи в `budget.admit`. Ветвь C3r «перерисовать как
  резервный ход» для дочерних ячеек в этом случае не запускается: дочерние ячейки её и раньше не достигали при
  исчерпании рабочих токенов. На тестах не проявилось.
- `verify(review)` в S1 по-прежнему недоступен для инкремента (п. 4 только называет области). Включение — вне карточки.
- Studio WD-17 и сторона WF-9 в Studio — за W5.

Статус: ГОТОВО К СЛИЯНИЮ — последний коммит ветки `c000b78` (ветка запушена).
