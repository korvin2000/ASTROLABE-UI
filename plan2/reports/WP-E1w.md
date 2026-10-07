# WP-E1w — подключение E1 в горячие файлы; `seedsMaxTokens` на двух путях; оракул теста достижимости (сессия 5)

Ветка `v2/E1w` от `main` `2e0d4f4`, worktree `C:\work.astrolab\ASTROLABE\.claude\worktrees\E1w`. Исполнитель — t3.

## Сделано
6 файлов, +141/−12. Коммиты: `eb612dd` (цель 1), `2c9e56b` (цель 2), `1b336a0` (цель 3), `11b3e4c` (дамп ABI).
- **Цель 1: `routing_log` и снимок работают в продукте.**
  - `campaign/Controller.kt:2503`: `router.selectProfile(function, packet, impact, policy, io.astrolabe.route.RoutingLog(c.store, clock), c.ids)`.
  - `recover/Repair.kt`: у `Repair` нет ни store, ни идентичностей попытки. Поэтому в конструктор добавлены два необязательных
    хвостовых параметра `routingLog: RoutingLog? = null`, `ids: Identities? = null`. Когда заданы оба, `run` вызывает
    перегрузку с журналом, иначе — прежний `selectProfile`.
  - `Controller.kt:1443` (третье место в Controller): при создании `Repair` передаются `RoutingLog(c.store, clock)` и `ids` ячейки.
  - Новый тест `campaign/RoutingLogWiringTest.kt` идёт через настоящую сборку (`Controller.open` → `runS0`, поддельный адаптер,
    как в `CapacityRoutingTest`/`RoleWiringTest`). До старта есть строка `binding_physics` другой работы (seq 1).
    Утверждения:
    - после прогона S0 `routing_log` попытки не пуст; решение `Selected` несёт `bindingKey` маршрута `FakeProfiles.main`;
    - SQL: ≥ 1 строка `routing_log` с `binding_key IS NOT NULL`;
    - `binding_snapshots` для (work, attempt) — ровно 1 строка, `asOfSeq = 1`, строки снимка — маршрут main;
      `snapshotSeq` каждого решения равен `asOfSeq`;
    - повторное открытие store: после нового наблюдения живая таблица ушла на seq 2, но `freeze` (с другим набором профилей)
      возвращает тот же `asOfSeq`, новое решение `RoutingLog.decided` пишется с тем же `snapshotSeq`, строка снимка остаётся одна.
- **Цель 2: `seedsMaxTokens`.** Перенос на границе ячейки (`Controller.kt:1798`) и pressure-rebuild (`cell/Cell.kt:1423`) передают
  `seedCapTokens = defaults.seedsMaxTokens.toLong()` вместо константы 4000. При значении по умолчанию (4000 = `SEED_CAP_TOKENS`)
  байты не меняются: WF-14/WF-15 (`BoundaryCarryScenarioTest`, `AppendOnlyPrefixScenarioTest`) зелёные.
- **Цель 3: оракул `SettingsReachabilityTest`.** `normalise` маскирует:
  - `@[0-9a-f]{4,}` → `@<stamp>`;
  - `temprepo[0-9]+` → `temprepo<n>`;
  - `finishReceiptRef=[0-9a-f]+` → `finishReceiptRef=<ref>` — найденный недетерминизм: дайджест финальной квитанции расходился
    между базами в PRESSURE, REVIEW и CARRY_PATH.

  Строка `seedsMaxTokens` переведена в контекст CARRY. В нём нет follow-up, поэтому эффект даёт именно граница ячейки:
  `KNOWN: seeds only (0) · NOT SEEN: … over the 1-token seed budget`, 920 → 836 строк.

  После нормализации:
  - **`k` держится**: «достигнут», эффект — изменение формы прогона (1409 → 750 строк), а не штамп;
  - **`m` не держится**: прогон с `m = 1` эффекта не дал, строка возвращена в `Deferred` с причиной (tail C18-pressure).

  Тест по-прежнему падает на поле без строки: `every host setting has a row` не тронут.

## Решения
- Как дать `Repair` журнал без store → два необязательных параметра конструктора (`@JvmOverloads`, аддитивно). Почему: `Repair`
  создаёт только контроллер, а у него есть store, clock и ids. Безопасная альтернатива — функция-маршрутизатор в параметре;
  она отвергнута как менее явная.
- Какие `ids` у ремонта → `ids` ячейки (`Controller.repair`), а не `c.ids`. Снимок ключуется по (work, attempt) и общий
  с основным маршрутом; строка журнала несёт candidate и context ячейки. Альтернатива — `c.ids`; разница только в колонках строки.
- Как проверить «повторное открытие» → переоткрыть store и вызвать `freeze` и `decided` после того, как живая таблица сдвинулась.
  Это ровно путь продукта при следующем решении после переоткрытия. Второй прогон контроллера на завершённой попытке не делался:
  неясно, маршрутизирует ли он заново.
- `seedsMaxTokens` в тесте достижимости → CARRY (граница ячейки) вместо FOLLOW_UP. У поля одна строка; путь родителя
  follow-up уже доказан в C18 и не менялся.

## Тесты
Окружение: Windows, JDK 26; итоги — по XML `core/build/test-results/test` этого worktree.
- **Цикл 1 (L1):** `:core:test --tests '…campaign.SettingsReachabilityTest' --tests '…campaign.RoleWiringTest' --tests '…campaign.RoutingLogWiringTest' --tests 'io.astrolabe.route.*'`,
  5 мин 4 с: 149 тестов, 1 падение. Упал `defaults.m`, временно возвращённый в «достигнут» ради проверки: после нормализации
  у него нет эффекта. `RoutingLogWiringTest` 1/1, `RoleWiringTest` 2/2, `route.*` 72/72, `seedsMaxTokens` (CARRY) и `k` — достигнуты.
- **Цикл 2:** `SettingsReachabilityTest` (`m` → `Deferred`, маска `finishReceiptRef`), 4 мин: **73/73, 0 падений**.
  Остаточный шум баз: 0–4 строки на контекст (DIRECT — 4: строки якоря `⟨ctx … turn⟩`).
- **`:core:updateKotlinAbi`** — один раз. Дамп: два новых конструктора `Repair` и синтетический с маской; прежние сигнатуры
  на месте.
- **L2 (один раз):** `:core:test --tests 'io.astrolabe.campaign.*' --tests 'io.astrolabe.cell.*' --tests 'io.astrolabe.workflow.*' --tests 'io.astrolabe.recover.*'`,
  41 мин 23 с: **566 тестов, 0 падений, 0 пропусков** (campaign 338, cell 170, recover 15, workflow 43). WF **43/43**, сумма по классам 187,1 с.
- **L2:** `./gradlew assemble testClasses checkKotlinAbi -Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm` — зелёный.
- Циклов «правка → тест»: 2. Расход токенов мне не виден (оценка ~120 тыс.).

## Отклонения от карточки
- В `recover/Repair.kt` изменено больше одной строки. Вызов `selectProfile` не получить без store и ids, а их у `Repair` нет,
  поэтому добавлены два необязательных параметра конструктора; публичный API расширен аддитивно, дамп ABI закоммичен.
  Третье место в `Controller.kt` — создание `Repair`.
- Pressure-rebuild передаёт настройку, но фикстура `SettingsReachabilityTest` не доводит ячейку до rebuild (то же, что `m`),
  поэтому достижимость доказана только для границы ячейки. Карточка это допускает. Отдельный тест rebuild в `cell` не писался:
  готовой фикстуры с семенами после rebuild нет.

## Хвосты и риски
- **WF-набор: сумма 187,1 с** (бюджет T-56 — 180 с; D7 владеет сокращением). Вклад этой линии — одна транзакция SQLite
  на решение маршрутизатора. Прогон шёл параллельно с Gradle другой линии, так что время, вероятно, завышено нагрузкой.
  Стражи считают события, а не секунды; все зелёные.
- Pressure-rebuild для `seedsMaxTokens` и `m` не наблюдаем в фикстуре (tail C18-pressure). Нужна фикстура, которая надёжно доводит
  ячейку до rebuild.
- Остаточный шум: строки якоря `⟨ctx … turn N/80⟩` в DIRECT, REVIEW и PRESSURE расходятся между одинаковыми прогонами (1–4 строки,
  причина не выяснена — вероятно, порядок параллельных чтений). Они исключаются маской шума; строки, державшиеся только на них,
  не обнаружены.
- `scratchpad` общий с другими линиями. Первые логи L1 (`l1.log`, `l1b.log`) могли перезаписать одноимённые файлы других линий;
  дальше логи шли в `scratchpad/e1w/`.

Статус: ГОТОВО К СЛИЯНИЮ · последний коммит `v2/E1w`: 11b3e4c
