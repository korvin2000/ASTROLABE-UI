# WP-Dp1 — Seeds v2 за интерфейсом селектора; устаревание отброшенных якорей фактов

Ветка `v2/Dp1` (worktree ядра `agent-a8bf47cef32456645`), TODO P8.C.6. Карточка: `plan2/WP-Dp1.md`.

## Сделано
1. **Шов селектора seeds** — новый `core/src/main/kotlin/io/astrolabe/context/SeedSelector.kt`:
   `SeedRule` (данные конфигурации, `@Serializable`, `V1`/`V2`, `selector`), `fun interface SeedSelector`
   (`candidates(SeedInputs): List<SeedCandidate>`), `SeedInputs`, `SeedCandidate`, `SeedReason`
   (`Referenced`, `Touched`, `Red`, `Noted`, `Recent`; `announced`), реализации `SeedSelector.V1` / `SeedSelector.V2`,
   порядок `SEED_V2_ORDER`; `mentions`/`inFocus` перенесены из `CarryForward` без изменений.
2. **Одно отсечение по бюджету для всех правил** — `Seeds.fit(candidates, currentVersion, capTokens)` (internal,
   `context/Seeds.kt`): прежний цикл `CarryForward` дословно + «объявлять NOT SEEN только `announced`».
3. **Оба потребителя через селектор.** `CarryForward.carry(…, selector = SeedSelector.V1, touched = ∅,
   latestReceipts = ∅)` — новые параметры с умолчаниями (v1, прежние байты). Перестройка под давлением
   (`cell/Cell.kt` `rebuild`) передаёт `defaults.seedRule.selector`, чистые изменения ячейки (`changes()`) и последнюю
   квитанцию каждой проверки. `Rebuild.run` получает seeds через `Carry` — менять `Rebuild.kt` не понадобилось.
4. **Точка выбора в конфигурации** — одна строка в `Defaults.kt`: `val seedRule: SeedRule = SeedRule.V1` (рядом с
   `seedsMaxTokens`, строка §17 «Workset seeds per cell»); `DefaultsTest` — поле добавлено в эту строку таблицы.
5. **Устаревание отброшенного якоря** — `tool/state/PatchParser.kt`: `v`-факт, чей якорь отброшен (версия не
   разрешается в одну показанную), сохраняется как `h` с заметкой; `h`/`x` — как раньше. Воспроизведено тестом до
   исправления (факт возвращался свежим `Verified`), после — зелёный.

## Решения
(черновые, без номеров: вопрос → выбор → почему → безопасная альтернатива)

1. **Сигнатура селектора.** →
   ```kotlin
   public fun interface SeedSelector { public fun candidates(inputs: SeedInputs): List<SeedCandidate> }
   public data class SeedInputs(val register: Register, val export: List<Entry>,
       val touched: Set<String> = emptySet(), val receipts: List<Receipt> = emptyList())
   public data class SeedCandidate(val entry: Entry, val reason: SeedReason)
   public enum class SeedRule { V1, V2; val selector: SeedSelector }   // Defaults.seedRule, по умолчанию V1
   ```
   Селектор только упорядочивает кандидатов (чистая функция записей); отсечение и «файл сдвинулся» — общий
   `Seeds.fit`, поэтому никакое правило не решает KNOWN само. Почему: v1 доказуемо байт-в-байт (тот же код), а v2
   отличается только порядком. Альтернатива: селектор возвращает готовый `SeedFit` (больше свободы, но два бюджета).
2. **Правило приоритета и отсечения v2** (проверяет Codex; уточнено по ревью, `04aa2c7`). Кандидаты — записи
   экспорта Workset (журнал чтений: что показано, в какой версии и на каком ходу) с видимыми строками (пустое
   `coverage`, например запись transform, — не кандидат), без повторов. Причина записи — первая подходящая по пути:
   `Touched` (путь в `changes` пакета ∪ `touched`) → `Red` (вход провалившейся квитанции) → `Noted` (путь назван в
   тексте или `needs` незакрытого `Open`) → `Recent` (остальное). Полный порядок `SEED_V2_ORDER`: причина; запись,
   показанная в этой ячейке, раньше перенесённой как seed (ход seed-а — из чужой ячейки); более поздний ход раньше
   (`thenByDescending`, без переполнения); далее путь, первая строка, диапазоны, версия, id результата (`null` раньше
   и отдельно от `""`), токены, источник, скрытые строки — строгий полный порядок, не зависит от порядка экспорта.
   После сортировки на ключ (путь, версия, диапазоны) остаётся первый кандидат: повтор тех же строк не тратит бюджет
   и не объявляется NOT SEEN. Отсечение `Seeds.fit` (общее с v1): идём по порядку с остатком = 4000; файл сдвинулся →
   не seed; токены > остатка → не seed, идём дальше (first fit: меньший следующий может занять остаток); иначе seed,
   остаток −= токены. Сумма ≤ 4000 всегда. NOT SEEN («changed» / «over the 4000-token seed budget») объявляются
   только для `Touched`/`Red`/`Noted`; `Recent`, не вошедший, молчит (покрыт «NOT SEEN: everything else»), чтобы
   строка KNOWN не раздувалась. Альтернатива: «стоп на первом не влезшем» (строгий приоритет, хуже заполнение).
3. **«Файлы последней красной квитанции».** → красная = `outcome == Failed` (§8.7: timeout/unavailable — нехватка
   доказательств, не красная); берутся последние квитанции **каждой** проверки, красные объединяются (без выбора
   «самой поздней» по времени — тайминги не идентичность, I-05). Файлы = пути `Closure.Known` ∪ файлы под
   `Closure.Package` (кроме `""`/`.`) ∪ пути, названные в команде (та же `mentions`, что у v1). `Closure.Unknown`
   добавляет только упоминания в команде — иначе «красное» расползлось бы на весь workspace (`testedInputs` при
   неизвестном замыкании — перечисление всего атласа). Альтернатива: только одна квитанция с наибольшим
   `#alias`.
4. **«Недавно прочитанные»** = записи экспорта по убыванию хода, записи этой ячейки раньше перенесённых seed-ов;
   окна по ходам нет — ограничитель только бюджет (молчаливый хвост). Альтернатива: окно последних N ходов.
5. **Выбор правила — `Defaults.seedRule`** (замораживается с попыткой, входит в отпечаток `AttemptConfig`).
   Альтернатива: `Config`/`Flags` (флаг — для «необязательных слоёв», а это альтернативное правило).
6. **Отброшенный якорь `v`-факта → `h`.** Текущее поведение (D-365): `PatchParser` выбрасывает якорь, если версия не
   хеш или короткий хеш даёт 0 / ≥ 2 совпадений среди известных версий (текущая + показанные в ячейке), и факт
   остаётся `v` без якоря — его `staleAt` больше никогда не ставится (`Register.markStale`, `FactCoherence`,
   `CarryForward` смотрят только на якорь). Типичный путь (D-374 «a dropped fact anchor loses staleness tracking»):
   перенос показывает `v(stale @old) … @old`, модель переписывает факт с `@old`, в новой ячейке `old` не известен →
   якорь выброшен → факт снова выглядит свежим. Выбор: такой `v` хранится как `h` (как `v` с неразрешённым
   evidence, D-373), заметка объясняет и подсказывает добавить с `@hash` из look. Почему: нельзя выдумать
   `FileVersion` (I-05), правила `Validator.kt` не меняются, `h` никогда не рендерится как свежая проверенная
   истина. `h`/`x` — прежнее поведение (тест `StateToolTest` не менялся). Безопасная альтернатива (дороже):
   сохранять путь якоря и ставить `staleAt` сразу — требует поля «версия неизвестна» в `Fact`/`Anchor` или
   правила в `Validator` (D1).

**Что внести в `docs/context/continuity.md` §6.2 (для Dp2/оркестратора):**
- строка «Workset seeds», колонка How: «chosen by the attempt's seed rule (`Defaults.seedRule`, frozen with the
  attempt) — the same rule at cell boundaries and pressure rebuilds: **v1** (structured, default): entries referenced
  by the next step's plan text or `accept`, `Focus` or `Next`, path order; **v2** (direct): entries whose path was
  touched in the cell ∪ is an input of a failed latest receipt ∪ is named by an open item ∪ recently displayed, in
  that priority (then this cell's displays before carried seeds, later turn first); re-served at *current* versions
  with hashes; one first-fit budget ≤ 4K tokens»;
- колонка Not carried: «entries for files that changed and entries over the budget (announced as NOT SEEN, except
  v2's recency filler, which is silent)»;
- §6.4 (или примечание к §6.2 Register): «a `v` fact whose anchor version names no version shown in the cell is kept
  as `h` (its staleness could not be tracked)»;
- `docs/reference/defaults.md`, строка «Workset seeds per cell / …»: добавить `seed rule v1`.

## Тесты
- L1 (после правок): `./gradlew :core:test --tests 'io.astrolabe.context.SeedsTest' --tests 'io.astrolabe.context.CarryForwardTest' --tests 'io.astrolabe.context.RebuildTest' --tests 'io.astrolabe.context.FactCoherenceTest' --tests 'io.astrolabe.context.SeedSelectorTest' --tests 'io.astrolabe.DefaultsTest' -q --console=plain`
  → 19 тестов, 0 падений (XML): CarryForward 2, FactCoherence 4, Rebuild 3, SeedSelector 6, Seeds 1, Defaults 3.
  Существующие тесты `context.*` не менялись.
- Воспроизведение п. 3: тот же `FactCoherenceTest` с `PatchParser.kt` из `HEAD` (до исправления) → падение
  «expected Hypothesis but was Verified»; с исправлением — зелёный.
- Затронутые потребители: `--tests io.astrolabe.cell.CellTest --tests io.astrolabe.tool.state.StateToolTest` →
  CellTest 51/0 (вкл. новый «a pressure rebuild takes its seeds from the attempt's seed rule»), StateToolTest 13/0.
- L2 (один раз, после `git merge main` — `93a4202`, main принёс только TODO/ci.yml):
  `gradlew.bat :core:test --tests 'io.astrolabe.context.*' --tests 'io.astrolabe.register.*' --tests io.astrolabe.campaign.PrecompileCampaignTest --tests io.astrolabe.cell.CellTest --tests io.astrolabe.tool.state.StateToolTest --tests io.astrolabe.DefaultsTest`
  → 18 классов, **285 тестов, 0 падений, 0 пропусков** (XML своего checkout). Дополнительно `AttemptConfigTest` 8/0,
  `AstrolabeTest` 5/0 (новое поле `Defaults` в снимке/отпечатке конфигурации).
- `:eval:compileTestKotlin` — OK. `:core:checkKotlinAbi` — «ABI has changed» (ожидаемо) → `:core:updateKotlinAbi`
  → `checkKotlinAbi` OK; дамп `core/api/core.api` закоммичен (`8b0f555`): новые `SeedRule`, `SeedSelector`,
  `SeedInputs`, `SeedCandidate`, `SeedReason`, `Defaults.getSeedRule`, три новые перегрузки `CarryForward.carry`
  (старые сохранены); у `Defaults` сменился основной конструктор и нумерация `componentN` (v1.0-конструктор для Java
  на месте).

## Ревью Codex (8b0f555 → 04aa2c7)
| Находка | Что сделано |
|---|---|
| P1: запись transform (`tokens = 0`, все строки скрыты) берётся как Touched → seed на весь файл мимо предела | v2 не берёт кандидатом запись с пустым `coverage`; тест `v2 never seeds a record without visible lines` |
| P1: компаратор склеивал `resultId` `null` и `""` (`orEmpty`) → результат зависел от порядка экспорта | сравнение nullable напрямую (`null` раньше `""`); тест: прямой и обратный экспорт дают одно и то же |
| P2: одни строки и показаны, и объявлены NOT SEEN (два чтения одного диапазона) | после сортировки — один кандидат на (путь, версия, диапазоны); тест: seed = позднее чтение, NOT SEEN пуст, 2500 токенов |
| P2: `-turn` переполняется на `Int.MIN_VALUE` | `thenByDescending { turn }`; тест на краях диапазона |

v1 не менялся (байт-в-байт). L1 + `SeedSelectorTest`: 18 тестов, 0 падений (SeedSelector 8, CarryForward 2,
FactCoherence 4, Rebuild 3, Seeds 1). L2 `--tests 'io.astrolabe.context.*'`: 11 классов, 51 тест, 0 падений.
`:core:checkKotlinAbi` — без изменений (публичный API тот же).

## Отклонения от карточки
- **`cell/Cell.kt`** (вне списка карточки, ничьих границ не задевает): перестройка под давлением вызывает
  `CarryForward.carry` именно там — +2 строки аргументов и строка KDoc. `Rebuild.kt` не менялся: seeds приходят в
  `Rebuild.run` через `Carry`.
- **`campaign/Controller.kt` не тронут (C3)** → на границе ячейки `carryFrom` пока вызывает `carry` с умолчанием
  (v1). Чтобы `Defaults.seedRule = V2` действовал и на границе, нужна одна правка в `carryFrom` (≈ стр. 1263):
  `CarryForward.carry(…, emptyList(), emptyList(), selector = c.attempt.config.defaults.seedRule.selector,
  latestReceipts = c.checks.all().mapNotNull { it.last?.receiptId?.let(SqliteReceipts(c.store, clock)::get) })`
  (тронутые пути берутся из `packet.changes` автоматически). Владелец — оркестратор при слиянии или D1.
- **`Defaults.kt`** (C3): ровно одна строка `seedRule`; `DefaultsTest` — имя поля в строку таблицы §17.
- **Исправление п. 3 в `tool/state/PatchParser.kt`**, не в `register/`: якорь выбрасывается именно там (D-365);
  `register/` и `Validator.kt` не менялись.
- `CellTest` получил новый тест (потребитель через конфигурацию); `SeedSelectorTest` — новый класс в L1.

## Хвосты и риски
- Граница ячейки на v2 — правка `Controller.carryFrom` выше (не сделана по границам линий).
- `Defaults.seedsMaxTokens` (4000) по-прежнему не подключён: оба потребителя берут `CarryForward.SEED_CAP_TOKENS`
  (тоже 4000) — долг до Dp1, не менялся.
- Унаследовано v1 и **не** исправлено ради байтовой совместимости (ревью Codex): запись без видимых строк
  (transform), названная Next/Focus, становится seed с нулевой ценой и рендерится строками «⟨redacted⟩»; два чтения
  одних строк — два кандидата (бюджет дважды, одно может уйти в NOT SEEN). В v2 исправлено.
- Перекрывающиеся (не равные) диапазоны одного пути/версии в v2 не сливаются — дедупликация только по равному ключу.
- `Seeds.render` объявляет NOT SEEN и для `Recent`, если файл сменил версию между `fit` и рендером.
- `Entry` не проверяет `tokens ≥ 0`: отрицательная цена увеличивает остаток бюджета (унаследовано).
- Оценка в `fit` — исторические `entry.tokens`, а не размер отрендеренного блока (как и в v1).
- Красное по `Closure.Unknown` видит только пути, названные в команде; места падений из вывода не разбираются (нет
  записи-источника).
- Новый `Defaults.seedRule` меняет отпечаток `AttemptConfig` (как любое новое поле `Defaults`) и сдвигает
  `componentN` у `Defaults` (поле стоит в группе seeds, а не в конце — меньше шанс конфликта с C3; позиционной
  деструктуризации `Defaults` в ядре и `eval` нет). При слиянии с C3 конфликт ABI-дампа — регенерировать.
- `Validator` FactAdd ставит `staleAt` = **текущая** версия, а перенос — **старая** (`v(stale @…)` показывает разное);
  не трогал (правила валидатора — D1).

Статус: ГОТОВО К СЛИЯНИЮ · последний коммит `04aa2c7`
