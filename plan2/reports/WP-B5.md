# WP-B5 — плечи как конфигурация; опорное плечо `loop` (отчёт линии)

Ветка `v2/B5` от `main` (`3ad87ce`, в нём слита B7). Правки только в `eval-live/` (13 файлов, +1319/−57).

## Сделано
- `7207f8f` — правила честного сравнения в `eval-live/README.md` («Arms», «The loop arm: rules of a fair
  comparison», 11 правил) записаны до кода.
- `e037c7c` — `Recorder.kt`: цена каждого вызова по таблице профиля, который назвал его `ModelRequested`
  (`Totals.of(events, tables, currency)`); `costBasis` (`paid|nominal|unpriced|unknown|mixed`, `null` без вызовов)
  и `profiles` (ответы по профилям). Старая перегрузка `of(events, priceTable)` оставлена.
- `6faa418` — `StudioAttempt.kt`, хвосты ревью B7: P2-1 — `SessionClose` (сессия закрыта, только если закрытие
  отменило прогон; закончившийся сам прогон сохраняет исход, второй сессии нет); P2-2 — `ResponseCount`: `closedAt`
  — измеренное число ответов сессии при закрытии (отменённый вызов включён), `deliveredAt` — число ответов, увиденных
  в момент доставки сообщения в контракт.
- `8a08a86` — `Arms.kt`: `Arm(name, runner, protocol, shape, models)`, каталог `default`, `loop`, `direct`
  (отклоняется до D1); shape (H2) и таблица моделей (H3) — явная ошибка; `ResultKey(arm, config, code, task)` и
  `Fingerprints`. `Bench.kt`: путь `runs/<arm>/<task>/<model>/r<n>`, результат подхватывается только при равном
  ключе, иначе каталог откладывается в `r<n>.stale-<k>` и прогон делается заново; диспетчер ядро/петля.
  `Main.kt`: `--arm`. `Results.kt`: `arm`, `key`, столбцы `arm`, `cost_basis`. `LoopAttempt.kt`: петля и четыре
  инструмента. `Trees.kt`: `Proc.run(inherit = false)`.
- `c06590e` — тесты и раздел Results в README.

## Решения
- Плечо → `Arm.spec(RunSpec)`: поддержанные поля ничего не меняют в `RunSpec.defaults` (так `RunSpecTest` остаётся
  оракулом); неподдержанное поле → `UsageError` в CLI (до сети), `require` в `BenchPlan`, `check` в `spec`.
  Безопасная альтернатива — файл описаний плеч (`--arm-file`); не сделан, сверх карточки.
- Путь результата включает плечо: несколько плеч в одном `--out`. Старые результаты без ключа не подхватываются
  (откладываются, не удаляются).
- Отпечаток конфигурации: поля плеча, provider, model, effort, effortExplicit, maxCells, deadline, `RunSpec.LIMITS`,
  `LEASE_MINUTES`, `TOKEN_GUARD_WINDOWS`. Seed и номер повтора не входят (влияют на порядок/путь, не на прогон).
  Профиль (цены каталога) не входит: он известен только после `bind` (сеть) — риск ниже.
- Отпечаток кода: SHA-256 байтов classes/jar `eval-live`, ядра, `provider-api`, AI Gate адаптера и SDK + `Astrolabe.VERSION`,
  один раз на процесс; в `Bench` внедряемый параметр `code` (для тестов).
- Отпечаток задачи: id, класс, заголовок, prompt, поля task.json, дерево `base/`, скрытая приёмка (reference/wrong не
  влияют на прогон и не входят).
- Петля использует чистые функции ядра, не правя его: `LimitRule.decide`/`nextCost`, `LimitSpend`,
  `EffectPolicy.classify`, `Sniff.commands`, `WorkId.sessionKey`, `Defaults` из `RunSpec.config`.
- Правила честного сравнения `loop` (полный текст — README, правила 1–11):
  1. Исходные сведения: prompt дословно; системный текст петли + те же `platform` и `verificationText` Studio; рабочие заметки протокола ядра не даются.
  2. Разрешения: `EffectPolicy.classify` ядра; D-класс отклоняется как в auto Studio (решение `effect skipped`); файлы — только внутри workspace, не `.git`; окружение — essentials + `envAllowlist`.
  3. Внешний бюджет: лимиты `RunSpec.defaults` через `LimitRule.decide` перед каждым вызовом (billed → priced → консервативный hold); `Exhausted` → `budget_exhausted` + `task_limit_*`; первый `Reserve` — просьба проверить и закончить; минуты — по внедрённым часам; тот же deadline; лимита ячеек нет.
  4. Effort и вывод: `RunSpec.effort`, `outputHeadroom(profile)`, тот же профиль, адаптер и оценщик.
  5. Приёмка: та же скрытая, на копии workspace.
  6. Кэш: правило `Layout.render` — `[S]` и `[T]` закрыты точкой кэша при `caching.breakpoints`; `sessionKey` работы; транскрипт только растёт.
  7. Пределы вывода: read — `lookBudgetTokens`, shell — `runBudgetTokens` (3,6 символа/токен, голова+хвост), shell ≤ `runTimeoutSeconds`.
  8. Повторы: транспортные — адаптера; Transport/RateLimit/Timeout — ещё не больше 2 раз; каждый отправленный вызов — запрос и один `ModelResponded` с usage из `terminal()`; прочие ошибки → `failed`, ключи → `blocked_external`.
  9. Переполнение окна: без компакции; один раз заглушить все результаты инструментов, кроме 4 последних; не влезло → `failed` («context window full»).
  10. Завершающая проверка: команды той же verification setup; красная → вывод модели, не больше 2 раз; затем `completed`; review-setup ничего не запускает.
  11. События: `turn_started`, `model_requested`, `model_responded`, `tool_called` на той же шине — `Totals` один код для обоих плеч; ячеек нет (`cells` null).
- `costBasis` назван и посчитан как `Charge.wire` C16 (`paid/nominal/unpriced`), но выводится из `billing` и
  `perMillion`, потому что `Charge` в `main` ещё нет.

## Тесты
Циклов «правка → тест»: 1 (L1 зелёный с первого запуска). Расход токенов не виден.
- L1: `./gradlew :eval-live:test -q --console=plain -Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm` —
  exit 0; XML своего checkout: 26 тестов, 0 падений (ArmTest 2, BenchTest 4, EnvironmentTest 1, LiveModelsTest 1,
  LoopTest 5, RunSpecTest 1, ScenarioTest 4, TaskValidityTest 3, TotalsTest 5).
- Новые: `LoopTest` — петля доводит задачу до приёмки (точки кэша, sessionKey, effort, headroom, чтение кэша); стоп по
  запросам, деньгам, минутам; учёт `default` и `loop` в `result.json` сопоставим (N, вход, выход, кэш, деньги,
  основание, профили). `ArmTest` — чужое плечо, конфигурация, код, задача не подхватываются (и откладываются в
  `stale`); `direct`, shape, таблица моделей отклоняются, в т. ч. из CLI до сети. `TotalsTest` — два профиля в
  одном прогоне и неизвестный профиль. `ScenarioTest` — закрытие после естественного конца сохраняет исход.
- L2: `./gradlew assemble testClasses checkKotlinAbi -q --console=plain -Pastrolabe.aiGateBuild=...` — exit 0
  (публичный API не менялся, дампы не обновлялись).

## Отклонения от карточки
- C16 в `main` не слита (`v2/C16` = `8900ee6`, не предок `main`): `Recorder.kt` правлен без `git merge main`
  содержимого C16. Конфликт при слиянии C16: та же строка `costBasis` в `Totals` — взять версию B5 (по вызову);
  `basis()` можно заменить на `table.charge.wire`.
- `ScenarioTest` изменён (обоснованно, P2-2 ревью B7): `closedAt == 2`/`deliveredAt == 2` проверяли число сценария;
  теперь `closedAt` ≥ 2 и равно ответам первой сессии, `deliveredAt` ≥ 2 и модель увидела сообщение только после него.
- `interruptedAt` по-прежнему K сценария (P2-2 назвал только `deliveredAt`/`closedAt`; `BenchTest` ждёт 3).
- Сценарии B7 в петле: сообщение — пользовательская реплика в транскрипте (версии контракта нет, `contractVersion`
  null); вторая сессия — новый транскрипт на том же workspace (памяти нет); прерывание — как у ядра.

## Хвосты и риски
- Ключ не включает профиль/цены каталога: смена цены у провайдера не инвалидирует результат.
- Отпечаток кода по байтам jar: пересборка без изменений может дать новый отпечаток, если jar невоспроизводим
  (безопасная сторона — лишний перезапуск).
- Verification setup петли — тест корневого пакета (`Sniff`), приближение `verificationOf` ядра; в многопакетном
  репозитории наборы команд могут разойтись.
- Shell на Windows — через временный `.cmd` вне workspace (обход экранирования кавычек JDK); `%` в батч-файле
  трактуется иначе, чем в командной строке.
- Повторы петли без паузы (backoff — у транспорта); `retryAfterSeconds` не учитывается.
- Минуты петли — время сессии на часах (вкл. инструменты), ядро считает активное время своих прогонов; на коротких
  задачах расхождение мало.
- P2-3 B7 остаётся: модель без цены упрётся в денежный лимит в обоих плечах одинаково.
- Порядок `summary.json/csv` — только результаты текущего запуска (как и раньше): два плеча в одном `--out` дают две
  сводки поочерёдно, файлы `result.json` обоих лежат рядом.

## Для ревью Codex
- Цена вызова (`Recorder.kt`, `Totals.of`): `invocationId → profileId` из `ModelRequested`; цена = `usage.price(table
  профиля)`; нет запроса/таблицы/другая валюта → `Money.unknown` (сумма `cost` = null, `costPricedPart` — известная
  часть). Основание по вызову: PerToken → `paid`; Plan без цены → `unpriced`; Plan с ценой → `nominal`; нет таблицы →
  `unknown`; разные → `mixed`. Таблицы прогона: профили `RunSpec.config` + привязанный; валюта — главного профиля.
- Деньги петли против лимита (`LoopAttempt.spend`, `conservative`): на вызов billed, иначе точная цена usage, иначе
  hold = вход (верхняя граница оценки) × самая дорогая входная ставка достижимых tier + headroom × ставка вывода;
  Plan без цены → 0. `LimitSpend` и `LimitRule.decide/nextCost` ядра; `nextCost = max(hold, крупнейший вызов)`.
- Что входит в сравнение плеч: `Totals` одного кода (N запросов/ответов, вход некэш., кэш-чтение, кэш-запись, выход,
  деньги, основание, профили), исход, приёмка, время; ячейки только у ядра.

## Живой screening
Для оркестратора после слияния (сеть и ключ — у него; модель — дешёвая из README):
```bash
export JAVA_HOME=/c/Users/user/.gradle/jdks/eclipse_adoptium-26-amd64-windows.2
./gradlew :eval-live:installDist -Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm -PbenchDir=C:/work.astrolab/bench/b5-loop
C:/work.astrolab/bench/b5-loop/bin/eval-live run --arm loop --models deepseek/deepseek-v4.1-flash \
  --out C:/work.astrolab/bench/b5-loop/results --tasks all --repeats 1 --seed 1
# плечо ядра для сравнения в тот же каталог (runs/default/... рядом с runs/loop/...):
C:/work.astrolab/bench/b5-loop/bin/eval-live run --arm default --models deepseek/deepseek-v4.1-flash \
  --out C:/work.astrolab/bench/b5-loop/results --tasks all --repeats 1 --seed 1
```
Ожидаемая цена `loop`: 8 задач × ~20–40 вызовов, в основном кэш-чтение — порядка 0,5–2 USD на набор (оценка, не
мера); жёсткий предел — лимиты `RunSpec.defaults` (50 USD / 480 мин / 3000 запросов на задачу) и deadline 60 мин.
Проверить: `result.json` → `arm`, `key`, `totals.costBasis` (после ревью: `billed` при `usage.cost` от OpenRouter,
иначе `estimated`), `totals.costByTable`, `totals.requestEvents`, `totals.profiles`; итог `N/8 accepted`.

## Ревью и исправления (один раунд; Opus — дифф, Codex — учёт)
Шаг 0: `git merge main` (C16 слита). Конфликт в `Recorder.kt` — одно поле `costBasis`, поверх него п. 3. Коммиты
`f05cf63` (слияние + исправления), `b296edd` (тесты, README).
1. Opus P1 — исправлено. `LoopAttempt.kt:540`: в `classify` теперь передаются защищённые пути области контракта по
   умолчанию (`Scope.repositoryMinus(ProtectedPaths())`) и проба `LoopContainment` (`:404`). Это копия внутреннего
   `DiskContainment` ядра по реальному пути, с той же функцией `protects`, что в `Run.kt:258`. Тест: `rm old.txt` не
   отклонён, `rm ../outside.txt` отклонён.
2. Opus P2 — исправлено. `LoopAttempt.kt:496`: read/write/edit идут через `WorkspacePath` ядра (D-47): реальный путь,
   ссылки, `.git` с учётом регистра ФС, защищённые пути при записи. Тест: `.git/config`, `.GIT/config`, `../`, запись в
   `.Git/hooks`, чтение и запись через ссылку. Часть со ссылкой на этой машине пропущена (`assumeTrue`: нет права на
   symlink в Windows).
3. Codex P1 — исправлено. `Recorder.kt:238` `CallPrice` даёт один выбор суммы: положительный счёт = оплачено, иначе
   usage по таблице профиля вызова (paid или nominal по `charge`), unpriced — без денег. Сумму считает `LimitSpend.of`
   ядра — и в `Totals` (`:182`), и в лимите петли (`LoopAttempt.kt:250`, `:320`). Отсюда `costBasis` из
   `CostBasis` ядра (`billed|estimated|nominal|mixed|none`). Добавлены `costByTable` (оценка по таблице),
   `costNominal`, `unpricedCalls`. Отклонение от формулировки: для per-token профиля нулевой счёт считается счётом
   (правило `LimitSpend.of` ядра). Иначе лимит ядра и `Totals` снова разошлись бы.
4. Codex P1 / Opus P2 — исправлено. `LoopBudget` (`LoopAttempt.kt:394`) хранит запросы, деньги и активные минуты
   работы. `Bench.kt:151` передаёт его во вторую сессию той же работы. Follow-up прерывания — новая работа и новый
   бюджет, как у ядра. Тест: `maxRequests = 3`, закрытие после 2 → N = 3 на обе сессии, вторая — `task_limit_requests`.
5. Codex P1 — исправлено. `LoopAttempt.kt:369`: `Accounting.estimateCost` в ядре `internal`, поэтому его правило
   повторено: обязательны цены uncached input, входных `usageFields` и `caching.writeClasses` профиля и output; для
   unpriced — 0.
6. Codex P1 — исправлено. `Recorder.kt:161`: N = число `ModelResponded`; `requestEvents` (`:187`) — число
   `ModelRequested`. Ядро не тронуто.
7. Opus P2 — исправлено. `LoopAttempt.kt:287`: `IOException` проверки → `completed`, причина «check unavailable».
8. Codex P2 — исправлено. `LoopTest` «with a provider bill…»: оба плеча, адаптер со счётом 0,01 USD на вызов.
   Точно совпадают: N, uncached, cache read, output, `cost = N × счёт`, `costByTable` = Σ цены usage, `costBasis =
   billed`, `unpricedCalls = 0`.

Изменённые тесты (обосновано): `costBasis` `paid` → `estimated` (новый словарь, п. 3); `TotalsTest` `model_requests`
`"0"` → `"1"` (N по ответам, п. 6). В `costPricedPart` сохранена известная часть частично оценённого вызова:
`LimitSpend.of` превращает её в «неизвестно».

Тесты: L1 `:eval-live:test` — 30 тестов (+4 новых), 29 прошло с первого запуска, 1 упал (`TotalsTest`,
`costPricedPart`). После исправления повторён только `TotalsTest`: 5/5. В `LoopToolsTest` пропущена только часть со
ссылкой. L2 `assemble testClasses checkKotlinAbi`: exit 0. Циклов «правка → тест» всего по линии: 3 из 3 (1 + 2).

Хвосты, не чинились по решению оркестратора:
- внутренние повторы SDK не видны в N ни одному плечу, а повторы петли — отдельные вызовы (строка в правиле 8 README);
- при `Reserve` петля даёт заметку и продолжает, ядро допускает только проверку и отчёт;
- причина «final check stayed red» ставится и тогда, когда проверка не запускалась;
- `deliveredAt` может отставать от шины (`StudioAttempt.kt`);
- в отпечаток не входят цены каталога и интерпретатор `--python` (`Arms.kt`);
- batch-файл на Windows: `%` и кодовая страница;
- нет тестов завершающей проверки, заглушек при переполнении, повторов и сценариев B7 на плече `loop`.

Добавлено от линии: `LoopContainment` — копия внутреннего класса ядра, её нужно держать в синхроне с `Run.kt`.
Живой screening: команда та же (выше).

Статус: ГОТОВО К СЛИЯНИЮ — b296edd

## Живой screening — результат (оркестратор, 2026-10-04, после слияния `7a92a9f`)
`deepseek/deepseek-v4.1-flash`, 8 задач × 1 повтор на плечо, оба плеча параллельно, каталог `bench/b5-loop/results`.
Один повтор: это проверка «плечо проходит набор», а не сравнение со статистикой.

| Плечо | Принято | Запросы N | Некэш. вход | Кэш-чтение | Выход | Деньги (billed) | По таблице |
|---|---|---|---|---|---|---|---|
| `default` (ядро, структурный) | 8/8 | 75 | 255 628 | 440 320 | 47 873 | 0,1137 USD | 0,1170 |
| `loop` | 8/8 | 102 | 94 756 | 325 632 | 31 360 | 0,0758 USD | 0,0765 |

Основание цены у всех 16 прогонов — `billed`; вызовов без цены и отказов модели нет; `requestEvents` = N в обоих плечах.
Наблюдение (не вывод): на коротких задачах петля сделала на 36 % больше запросов, но потратила на 33 % меньше денег,
на 63 % меньше некэшированного входа и на 34 % меньше выхода, чем ядро.
Хвост: `summary.csv` общий на каталог `--out` — плечо, закончившее последним, затирает сводку другого (здесь остались
только строки `default`); поштучные `result.json` целы. Первые два запуска не стартовали (нет ключа в окружении; не задан
`JAVA_HOME`) — расхода не было.
