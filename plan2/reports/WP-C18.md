# WP-C18 — отчёт линии (P8.C.18, сессия 5)

Ветка `v2/C18` (от `main` c5a8485, после D7), worktree `ASTROLABE/.claude/worktrees/C18`.

## Сделано
1. **Бюджет чтения хоста доходит до `look`** (`cell/Cell.kt`, `recording`): обёртка исполнителя стала объектом
   `ToolExecutor`, который делегирует `defaultReadTokens` исполнителю (раньше SAM-лямбда отдавала `null`, диспетчер
   подставлял 4000). Других обёрток исполнителей в `cell/` и `delegate/` нет: ревью-ячейка, probe, writer и дочерние ячейки
   собираются через тот же `runCell` → одна сборка `Look`, одна обёртка (WF-9 — ревью-ячейка получает тот же бюджет).
   `DEFAULT_LOOK_TOKENS` диспетчера остался только для исполнителя без бюджета.
2. **Схема `look` без ложных обещаний**: из структурной схемы убраны `in=kb` и `since` (`tool/ToolSchemas.kt`, описание
   «find (in workspace|store)»); `LookArgs.since` удалён (`tool/Args.kt`), `in` принимает `workspace|store`; мёртвые ветки
   `Look.find` (отказ «arrives in P2.6») и `recall since=` убраны (`tool/look/Look.kt`). Переданные без схемы
   аргументы — отказ парсера, не исключение: `in=kb` → «unknown look scope 'kb': in is workspace or store; search the
   knowledge base with kb.search», `since` → ошибка декодера «unknown key 'since'». `docs/runtime/tools.md` строки 19, 29.
3. **Поиск берёт ripgrep при наличии** (`campaign/Controller.kt`): `search(c)` выбирает backend один раз на открытие
   (`WeakHashMap<OpenedCampaign, Search>`, как `plugged`): `Searches.auto { host.onPath("rg") }` — ripgrep, если `rg`
   находится на `PATH` хоста (`HostProbe`, уже внедряемый в `Controller`), иначе JVM; одна строка SLF4J
   `search backend <rg|jvm> for <work>/<attempt>`. Строка сборки `Look` берёт `search(c)` вместо `Searches.jvm()`.
4. **Тест достижимости настроек** `io.astrolabe.campaign.SettingsReachabilityTest` (не в `workflow`): таблица «поле →
   контекст → значение → наблюдение» для всех полей `Defaults` и `Config` (по дескриптору сериализации; новое поле без
   строки валит `every host setting has a row`). Сборка настоящая: `Scenario` (Controller → ячейка → диспетчер →
   инструменты, поддельный адаптер) на `DirtyRepo` + `src/big.py`. Оракул дифференциальный: прогон с нестандартным значением
   должен отличаться от **обоих** базовых прогонов контекста в строке, где базовые совпадают (все запросы модели, события
   без tool/telemetry, исход, число предкомпиляций). Контексты: S0, PRESSURE, CARRY, CARRY_PATH, FOLLOW_UP, REVIEW (S2 с
   ревью инкремента и кампании), DIRECT. Собственные проверки: `lookBudgetTokens` (чтение большего файла на бюджете 300
   режется — `truncated=yes`, на умолчании — нет), `turnsPerCell` (`turnsMax` = 4), `stateRoot` (хранилище под ним).
   Плюс `SearchBackendChoiceTest` (выбор backend по `PATH` хоста — тестовый каталог, и на Windows; `rg` не запускается).

## Решения
- П.2: `since` удалён из `LookArgs` целиком (а не только из схемы) → изменение публичного ABI (`core/api/core.api`
  перегенерирован). Почему: поле, которое никто не читает, — то же ложное обещание; без него декодер сам даёт
  понятный отказ. Безопасная альтернатива — оставить поле и отказывать в `recall` (как было).
- П.2: байты структурной схемы `look` изменились один раз; golden `LayoutTest.GOLDEN_SCHEMAS_IMPLEMENTING`
  455bb296… → cfe7784b…; `[S]` (`GOLDEN_S_IMPLEMENTING`) не изменился. D4 снимает golden после C18.
- П.3: «настроенного пути» к `rg` нет — в `Config` такого поля нет, а `Config.kt` вне границ карточки. Выбор только по
  `PATH` хоста через `HostProbe.onPath` (детерминирован в тестах фальшивым `PathProbe`). Журнал — строка SLF4J, а не запись
  в журнал кампании (не сдвигает seq и счётчики стражей). Безопасная альтернатива — поле `Config.ripgrepPath` (будущая карточка).
- П.4: исключения трёх видов, все названы в таблице и печатаются тестом: `Excepted` (не наблюдается офлайн/только
  ожиданием wall-clock), `Unwired` (нет потребителя — находка), `Deferred` (путь, который тест не играет).

## Тесты
Окружение: Windows, JDK 26, worktree C18; итоги — по XML `core/build/test-results/test` этого worktree.
- Цикл 1 (L1): `:core:test --tests 'io.astrolabe.tool.*' --tests 'io.astrolabe.os.search.*' --tests '…campaign.SettingsReachabilityTest' --tests '…campaign.SearchBackendChoiceTest' --tests '…cell.LayoutTest'` — 8 мин 23 с; падения: golden схем в `LayoutTest` (ожидаемо), `SearchBackendChoiceTest` (второе открытие того же репозитория — shadow-ref уже есть), 14 строк достижимости (5 — недопустимые значения в валидации `Defaults`, остальные — нет эффекта).
- Цикл 2: упавшие классы — 3 мин 30 с; осталось 6 (найден разрыв `seedsMaxTokens`, см. хвосты).
- Цикл 3: `SettingsReachabilityTest` — 3 мин 49 с; осталось 1 (`defaults.m` — достигнут в одном прогоне из двух) → `Deferred`.
- L2 (один раз): `:core:test --tests 'io.astrolabe.tool.*' --tests 'io.astrolabe.cell.*' --tests 'io.astrolabe.campaign.*' --tests 'io.astrolabe.os.*' --tests 'io.astrolabe.workflow.*'` — 41 мин 27 с, **1224 теста, 0 падений, 8 пропусков** (105 классов). WF-набор **43/43, 168 с** (сумма по классам). `SettingsReachabilityTest` 73/73 (210 с: ~90 прогонов `Controller` на 8 потоках), `SearchBackendChoiceTest` 1/1, `LookTest` 19/19, `LayoutTest` 12/12, `SearchesTest` 5/5.
- L2: `./gradlew assemble testClasses checkKotlinAbi -Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm` — зелёный. `:core:updateKotlinAbi` один раз, дамп закоммичен (`LookArgs` без `since`).
- Циклов «правка → тест»: 3 (+ переклассификация `defaults.m` без отдельного прогона, проверена L2). Расход токенов мне не виден.

Покрытие теста достижимости (`Defaults` 73 поля + `Config` 20 полей = 93 строки):
- **Достигнуты (71: 52 поля `Defaults` + 19 `Config`; 69 по разнице, 2 только собственной проверкой):** все поля `Defaults`, кроме перечисленных ниже, и `Config`: `profileRoles`, `mode`,
  `executionMode`, `dClass`, `integrityApproval`, `unknownOutcomeReconciliation`, `ceiling`, `rulesFile`, `redaction`, `flags`
  (через `precompile`), `roles`, `qualityGates`, `tierTable`, `modelChecks`, `balance`, `capabilitySet`, `protocol`;
  `stateRoot` и `defaults` — собственной проверкой. `lookBudgetTokens` — и по разнице, и проверкой «чтение режется ровно
  на бюджете хоста» (готовность п. 1).
- **Excepted (6, только wall-clock или живые провайдеры):** `providerTerminalWaitSeconds`, `checkerTimeBoxSeconds`,
  `checkerFallbackTimeBoxSeconds`, `gitDeadlineSeconds`, `runTimeoutSeconds` (сроки; команды фикстуры кончаются за мс),
  `config.profiles` (профили живых адаптеров; маршрут через них проверяет `tierTable`).
- **Unwired (11, находка — потребителя нет вне `Defaults.kt`, только валидация и Studio `SettingsSchema`):**
  `noteBodyMaxTokens`, `noteSummaryMaxChars` (в силе `Note.MAX_BODY_TOKENS`/`MAX_SUMMARY_CHARS`), `injectionMaxNotes`,
  `injectionMaxTokens` (Controller ранжирует с `InjectionWeights()`), `campaignRecoveryReserve`, `probeTurns`
  (`ProbeBudget.DEFAULT` 15), `probeTier`, `reviewTier`, `reviewRoutineTier` (Controller берёт каждое ревью на `Tier.Medium`),
  `flakyIsolatedReruns` (verify/), `admissionConfidenceMax` (kb).
- **Deferred (5, путь не играется):** `probeTokens`, `writerDepth`, `probeDepth`, `parallelCells` — только при
  `task.delegate` дочерней ячейке; `m` — фикстура не даёт надёжного pressure-rebuild.

## Отклонения от карточки
- `docs/reference/` не перечисляет `in=kb`/`since`; описание схемы `look` — в `docs/runtime/tools.md` (строки 19, 29) —
  поправлено там.
- Выбор backend — без «настроенного пути» (см. Решения).
- Четвёртая правка: после 3-го цикла `defaults.m` (PRESSURE) оказался достигнут в одном прогоне из двух → переведён в
  `Deferred` без отдельного прогона; проверен прогоном L2 (см. Тесты).

## Хвосты и риски
- **Новый недоходящий путь (найден тестом): `seedsMaxTokens`** доходит только до переноса родителя follow-up
  (`Controller.kt:1763`, W9); перенос на границе ячейки (`Controller.kt` ~1793, `CarryForward.carry` без `seedCapTokens`)
  и pressure-rebuild (`Cell.kt` ~1419) получают константу `SEED_CAP_TOKENS` = 4000 — ровно третий пример вердикта Codex.
  Правка — два аргумента, но в горячем `Controller.kt` и в проекции `[K]` `Cell.kt` (граница WF-14, вне моих обёрток) →
  хвост, не правил. В тесте поле проверено в контексте FOLLOW_UP.
- **11 полей без потребителя** (список выше) — хвост C18-unwired: подключить (Controller/kb/verify/delegate — горячие или чужие
  файлы) или убрать из `Defaults` и Studio `SettingsSchema`. Владельцы: Controller (ревью-тиры, инъекция), kb, verify, delegate.
- **Риск оракула (важно для ревью):** базовые прогоны расходятся в строках `── Checks @<stamp> ──` (штамп меняется между
  прогонами, иногда совпадает) и в id CAL-заметок (`CAL-astrolabe-temprepo<N>`). Маска шума — строки, где расходятся две
  базы; если базы случайно совпали по штампу, а изменённый прогон — нет, строка засчитается как «достигнуто» (ложное
  срабатывание). Так объясняется `m` (цикл 2 — достигнут, цикл 3 — нет); `k` (PRESSURE) достигнут в двух прогонах подряд,
  но мог пройти тем же путём — не доказан. Исправление (не начато: лимит трёх циклов): нормализовать `@[0-9a-f]{4}` в
  строке Checks и `temprepo\d+`, затем перепрогнать класс — строки, державшиеся только на шуме, упадут и уйдут в Deferred.
- PRESSURE с `contextCeilingTokens = 31_000` даёт столько же строк, что S0 — rebuild, вероятно, не происходит; хвост C18-pressure.
- `SettingsReachabilityTest` занимает ~3,5 мин (≈90 прогонов) — в WF не входит, но удлиняет `campaign.*`.
- Выбор backend: `PATH` с `rg.cmd`/`rg.bat` (без `rg.exe`) даст ripgrep-backend, который не запустится (ошибка поиска, не
  тихий откат). Настраиваемого пути к `rg` нет (нужно поле `Config`).
- Во всех campaign/WF-тестах на машинах с `rg` в `PATH` поиск теперь идёт через ripgrep (паритет — `SearchBackendParityTest`;
  известное расхождение — регистронезависимый `café`).
- D4: байты структурной схемы `look` изменены здесь один раз (golden cfe7784b…).

Последний коммит ветки `v2/C18`: 866dcc5 (запушена).

Статус: ГОТОВО К СЛИЯНИЮ — 866dcc5
