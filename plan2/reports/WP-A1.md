# WP-A1 — допуск и маршрутизация: wire / резерв / выход раздельно

Ветка `v2/A1` (worktree `ASTROLABE/.claude/worktrees/musing-benz-2c3de9`), от `main` `a245ac7`; `main` (A4, A5, A2a)
влит в ветку перед L2.

## Сделано
- **Учёт раздельно** (`context/ContextCover.kt`, `context/Compiler.kt`): `ContextBudget.reserves` — теперь только резерв
  роста (`[A]` max + следующее наблюдение); новое `ContextBudget.outputHeadroomTokens` — лимит выхода. В
  `ContextArithmetic` новые поля `wireTokens` (S+R+T+K, то, что отправляется), `reserveTokens`, `outputTokens`;
  `totalTokens` = их сумма, каждый член учитывается один раз.
- **Масштаб резерва роста** (`Defaults.growthReserveTokens`, новое поле §17 `growthReserveFullWindowTokens = 65_536`):
  резерв = (`anchorMaxTokens` + max(look, run)) × min(1, W / 65 536). Строка §17 в `docs/reference/defaults.md` и
  `DefaultsTest` дополнены.
- **Router** (`route/Router.kt`): `RoutingPacket.reserveTokens` (новое, по умолчанию 0). Проверка окна:
  wire + резерв + выход ≤ окно (выход один раз). `conservativeCost` — wire как неза­кэшированный вход + выход; резерв не
  цена. `conservativeTokens` = wire + выход.
- **Controller.route** (`campaign/Controller.kt`): компиляция через `(CellModel) -> Compiled` — каждый
  маршрутизированный профиль компилируется своим оценщиком и своим headroom (`model.rebind`), а не исходным
  `maxOutputTokens`. **Capacity-fallback:** если контекст не помещается в окно исходного профиля
  (`NeedsRescoping` со статусом `Capacity`), перекомпиляция на кандидатах с бо́льшим окном (по возрастанию окна, затем
  id); каждый вместивший — база маршрутизации со своим headroom; если роутер базе отказал, пробуется следующая
  (её собственный headroom может допустить кандидатов, которых исключил предыдущий). Профиль, выбранный роутером, чья собственная компиляция не помещается,
  исключается из кандидатов, роутер спрашивается снова (цикл конечен: ≤ числа кандидатов). `BlockedExternal`
  (`NEEDS_RESCOPING_OR_LARGER_PROFILE`) — только если не подошёл ни один; причина перечисляет опробованные окна.
  Отказ роутера после исключений перечисляет их в `excluded`.
- **Дети/writers без исключения в `check`**: `childCell`/`writerCell` бросают внутренний `ChildNotStarted`
  (`delegate/ChildCells.kt`), который ловят `CellChildRunner` (probe, judge) и `Writers.run` →
  `ChildOutcome.Failed` / `JudgeRun` с нулевым расходом (вызова модели не было); dispatch и worktree writer'а
  остаются, как у любого неудавшегося writer'а (уборка не может превратить нулевой расход в полный). Раньше `IllegalStateException` превращался Delegator'ом в «threw …,
  reservation retained» с полным резервом, а у review-судьи — пробивал вызывающего.
- **Потребители старого `totalTokens`**: `WorthTest` получает wire-вход (раньше — с резервами и выходом);
  `writerEstimates` — wire + резерв, выход добавляет `writerEstimate` один раз (раньше выход учитывался дважды).
- Спецификация: `docs/context/compiler.md` §6.1 (масштаб резерва, fallback до rescoping, три величины раздельно),
  `docs/operations/routing.md` §11.2 (учёт окна и цены, fallback).

### Запас под S+R+T+K (выход Studio = W/4, α = 0,65)
| Окно | до: ⌊αW⌋ − W/4 − 9000 | резерв роста после | после: ⌊αW⌋ − W/4 − резерв |
|---|---|---|---|
| 16 384 | **−2 447** | 2 250 | **4 303** |
| 32 768 | 4 107 | 4 500 | **8 607** |
| 65 536 | 17 214 | 9 000 | 17 214 (без изменений) |
| 131 072 | 43 428 | 9 000 | 43 428 (без изменений) |

Измерено (`HeuristicEstimator`, роль implementing, минимальный S0-контракт): S 2 206 + R 5 + T 6 = 2 217, K = 41 →
остаток под K после: 16K — 2 086, 32K — 6 390. Схемы инструментов в `[S]` компиляции не входят (см. «Хвосты»).

Роутер до: окно проверялось как wire + 9000 + 2·выход, цена — (wire + выход + 9000)·вход + выход·выход;
после: окно wire + резерв + выход, цена wire·вход + выход·выход.

## Решения
1. **Выход внутри C·α или вне его?** → внутри (бюджет = ⌊αC⌋ − S − R − T − выход − резерв роста), как в §6.1.
   Почему: ответ модели входит во вход следующего запроса; рантайм ячейки (D-374, `cell/Cell.kt:472`) считает так же;
   смена — редизайн спецификации. Двойной учёт был в Router/Controller, не в компиляции. Безопасная альтернатива:
   предел = min(⌊αC⌋, C − выход) − резерв (16K → 8 399, 32K → 16 799, 64K → 33 598, 128K → 76 196) — меняет
   поведение при ≥ 64K (больше необязательного контекста); решать владельцу при калибровке.
2. **Формула масштаба резерва роста** → резерв(W) = (`anchorMaxTokens` + max(`lookBudgetTokens`, `runBudgetTokens`)) ×
   min(1, W / `growthReserveFullWindowTokens`), целочисленно, `growthReserveFullWindowTokens = 65 536` (поле §17,
   настраивается). Почему: при ≥ 64K ровно прежние 9 000 независимо от α и выхода; ячейка сама режет чтения до
   остатка окна (пол 300), поэтому недорезерв стоит максимум более раннего rebuild, а перерезерв блокирует кампанию.
   Альтернатива: доля «комнаты» ≤ ½(⌊αC⌋ − выход) — адаптивна к выходу, но меняет 64K при иных выходах.
3. **Резерв в роутере** → отдельное `RoutingPacket.reserveTokens` (по умолчанию 0, Java-совместимо через
   `@JvmOverloads`): входит в проверку окна, не в цену и не в `conservativeTokens`.
4. **Порядок fallback** → кандидаты с окном строго больше исходного, по возрастанию (окно, id), каждый со своим
   `rebind` от исходной модели (сужение выхода ограничивается лимитом каждого профиля один раз, без накопления).
   Отказ роутера базе → следующая вместившая база; отказ последней остаётся `BudgetExhausted` (бюджет — правда), в
   `excluded` видны исключённые по окну профили. Каждый отказ пишет запись `Refused` в журнал калибровки — на
   `promotes` не влияет (учитываются только `Accepted`/`VerifiedFailure`).
5. **Дети/writers** → внутренний `ChildNotStarted` вместо смены публичных `ChildCell`/`WriterCell` (альтернатива —
   новый тип результата, ломает API). Незапущенный writer не трогает worktree и dispatch.
6. **Сообщение о неподходящем окне** → «context W+R+O does not fit C»; резерв печатается только если > 0 (прежний
   формат и тест сохранены).

## Тесты
- L1 (после каждого цикла): `./gradlew :core:test --tests 'io.astrolabe.context.CompilerTest' --tests
  'io.astrolabe.context.CompilerFullTest' --tests 'io.astrolabe.context.ContextCoverTest' --tests
  'io.astrolabe.route.RouterTest' --tests 'io.astrolabe.campaign.CampaignLoopTest' --tests
  'io.astrolabe.campaign.CapacityRoutingTest' --tests 'io.astrolabe.DefaultsTest' -q --console=plain` → 51/51 зелёные.
- Затронутые delegate: `--tests 'io.astrolabe.delegate.ProbeTest' --tests '…ReviewCellTest' --tests
  '…IntegratorTest' --tests '…DelegatorTest'` → 29/29 зелёные.
- Новые кейсы: `CompilerTest` (16K/32K/64K/128K при выходе W/4: Ready, резерв 2 250/4 500/9 000/9 000, wire без
  резерва и выхода, total = wire + резерв + выход); `ContextCoverTest` (три величины раздельно);
  `RouterTest` (окно = wire + резерв + выход ровно; резерв не в цене, `conservativeTokens` = wire + выход);
  `CapacityRoutingTest` (S0: 16K с выходом 4 096 компилируется и отправляет 4 096; маршрутизированный профиль —
  свой headroom 16 000 вместо 8 000; fallback на большее окно → ячейка на `main`; все окна малы → `BlockedExternal`
  без вызова модели); `ProbeTest` (ребёнок без окна → `Collected.Failed`, «not started», расход 0).
  Прогон тех же тестов на старом коде не делался: тесты используют новые поля API.
- Ревью Codex (`codex:codex-rescue`, read-only, по диффу `a245ac7..eba4ede`): 3 находки.
  1) база fallback, первой вместившая контекст, но не обслуживающая ярус, своим headroom исключала подходящее
  большее окно → **исправлено** (следующая база после отказа) + тест `a fallback base that is refused gives way to
  the next larger window with its own headroom` (красный без исправления: `NoSuchElementException`, вызова модели нет;
  зелёный с ним). 2) после перекомпиляции выбранного профиля доступность/цена роутера не пересчитываются → не
  исправлял: существовало до A1, а ячейка сама резервирует цену вызова перед отправкой (`Cell.kt:372`,
  `accounting.reserve` против `contract.budget.cost`) — перерасхода нет, будет `partial` вместо отказа роутера; в
  «Хвосты». 3) уборка worktree незапущенного writer'а могла бросить и превратить нулевой расход в полный резерв →
  **исправлено** (уборки нет). Открытый вопрос Codex (оценщик фабрики vs исходный при смене только effort) —
  существовал до A1, в «Хвосты». Проверки Codex без замечаний: арифметика 16K/32K/64K/128K, конечность цикла,
  журнал калибровки, предкомпиляция.
- L1 после исправлений: те же классы + `ProbeTest`, `IntegratorTest` → 65/65 зелёные.
- L2 (один раз, на итоговом коде `51e21f0` + merge main): `./gradlew :core:test --tests 'io.astrolabe.context.*'
  --tests 'io.astrolabe.route.*' --tests 'io.astrolabe.campaign.*' --tests 'io.astrolabe.cell.*' --tests
  'io.astrolabe.delegate.*' --tests 'io.astrolabe.DefaultsTest' :eval:compileTestKotlin
  :provider-ai-gate:compileTestKotlin -Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm --continue -q`
  → exit 0; 69 классов, **413 тестов, 0 падений** (campaign 164, cell 128, context 41, route 42, delegate 35,
  Defaults 3); `:eval` и `:provider-ai-gate` тесты компилируются (модуль включён, 88 классов).
  Два предыдущих запуска L2 не в счёт: первый остановлен ради правок по ревью, второй упал на
  `NoSuchFileException …/in-progress-results-generic.bin` — пересечение Gradle-прогонов в одном checkout (известная
  ловушка §8.2), не тест.
- ABI: `./gradlew :core:updateKotlinAbi` → изменения только ожидаемые (`Defaults.growthReserveFullWindowTokens`,
  `growthReserveTokens`; `ContextArithmetic.wireTokens/reserveTokens/outputTokens`;
  `ContextBudget.outputHeadroomTokens` + `@JvmOverloads`; `RoutingPacket.reserveTokens`), коммит `f3dfbd6`.
  Поле `Defaults` вставлено рядом с look/run (группа §17), поэтому `componentN` у `Defaults` сдвинулись; позиционных
  вызовов `Defaults(...)` в ядре, eval, ai-gate и Studio нет (проверено поиском). `provider-api` не менялся.

## Отклонения от карточки
- `totalTokens` по-прежнему включает резерв и выход (это плановый итог); исправлены потребители — они читают
  `wireTokens`/`reserveTokens`/`outputTokens`.
- Тронуты файлы вне списка карточки (не запрещённые): `delegate/ChildCells.kt`, `delegate/Writer.kt` (дети без
  крэша), `Defaults.kt` + `DefaultsTest` + `docs/reference/defaults.md` (новое поле §17).
- `main` влит в ветку до L2 (A4, A5, A2a), конфликтов нет.

## Хвосты и риски
- `cell/Cell.kt:472` (A3): бюджет чтения ячейки вычитает полный `maxOutputTokens` и (`anchorMax` − якорь) внутри αC —
  согласовано с решением 1, но не использует масштабированный резерв; на 16K чтения быстро упираются в пол 300.
- Схемы инструментов не учитываются в `[S]` компиляции (выбираются в `Cell`); wire-вход занижен на их размер,
  рантайм-допуск это ловит. Существенно для 16K. Владелец — A3 (набор схем фиксирован на линию).
- Router исключает кандидата, чей лимит выхода меньше `packet.outputTokens`, даже если исходная модель не сужена
  (её headroom — просто её лимит), хотя `rebind` дал бы кандидату его собственный лимит. Не менял (поведение
  допуска роутера) — E1/B1.
- В ядре без сужения Studio (выход ≈ окну) 16K-профиль по-прежнему не компилируется; сужение до W/4 делает только
  Studio `AutoProfiles.outputHeadroom`. Кандидат: потолок выхода в ядре.
- `RoutingPolicy` без `attemptPolicies` (§1 строка 5) и `Economics.report` (строка 6) — не тронуты: из учёта
  тривиально не следуют → E1/B1.
- `ManifestArithmetic` не получил wire/резерв/выход (сохраняемая схема); при надобности — вместе с телеметрией.
- `writerEstimates` (S3, выключен по умолчанию) теперь меньше на выход × ходы — оценка slack D-242 сдвинется.
- (Codex 2) Роутер оценивает доступность и цену по компиляции базы; после перекомпиляции выбранного профиля они не
  пересчитываются. Защищает собственная резервация цены в ячейке. Кандидат — E1/B1.
- (Codex, вопрос) При смене только effort `rebind` берёт оценщик из фабрики, а компиляция остаётся от исходного
  оценщика; при разных оценщиках допуск ячейки и компиляция расходятся. До A1 так же.

Статус: ГОТОВО К СЛИЯНИЮ — последний коммит ветки `v2/A1`: `f3dfbd6`
