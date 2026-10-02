# WP-C1a — объявленная приёмка распознаётся в `run`; виды свидетельств; команда модели как проверка (P8.C.1)

Ветка `v2/C1a` от `main` (`97ce447`), `main` влит четырежды (`f1c0385`: C9/D-390, B2; `c40a0c1`: B1; `4b89a95`: C8 и
исправленный ResultRecallTest; `09e3341`: B4, только `TODO.md`), запушена. Дифф к `main`: 18 файлов, +1438/−92.
Worktree: `ASTROLABE/.claude/worktrees/jolly-visvesvaraya-b6081b`.

## Сделано
- **Распознавание до исполнения** (`tool/run/Run.kt`, `tool/verify/Verify.kt`, новый `tool/run/Recognition.kt`):
  `run` после всех своих ворот (EffectPolicy, потолок, D-класс, режим исполнения, охрана unknown-outcome) спрашивает
  `Verify.recognize(...)`. Совпало (правило ниже) → `Run.scheduled`: интент как у обычного `run` →
  `Verify.runRecognized` → `Scheduler.runInWorkspace` (тот же эксклюзивный протокол, свежий штамп, рескан входов) →
  исполняется **объявленный** argv один раз → квитанция каждой совпавшей проверки. Вид `run` = обычный вывод +
  строка `receipt <CHK>: <строка Checks> · <вид>` на квитанцию; статус `run` = исход квитанции. Verify-on-stop
  находит квитанцию текущей и ничего не перезапускает. Не совпало — обычный `run`, байт-в-байт как раньше.
- **Фон** (`run(bg)` / `until_*` → `wait`/`poll`): `Scheduler.pin` при запуске (штамп, хеши+метаданные входов под
  замком, архив старых JUnit-отчётов), запуск объявленного argv; при окончании (`ended`, т.е. терминальный `poll`/`wait`)
  свежий отчёт штампа и анонс, `Verify.settleRecognized` по **сырому** захвату → `Scheduler.settle` (квитанция с фактическим
  исходом, `input_stability = unknown` — **не сертифицирует** дерево, D-45; stop-верификация сертифицирует одним
  эксклюзивным прогоном); `cancel` снимает pin — квитанции нет; `Lost`/`Cancelled` — нет; не стартовал — явная
  `unavailable`-квитанция (FX-13).
- **Виды свидетельств**: `evidence/EvidenceKind { Tests, Build, Typecheck }`; `Receipt.evidenceKind`,
  `Receipt.checkOrigin` (кто создал проверку), производные `passesOnExit`, `independent`; инвариант `Receipt`: `Passed`
  без счётчиков допустим только при `passesOnExit` (Build/Typecheck и происхождение не `Model`).
  `Acceptance.Run.evidence` — объявленный вид (в `criterion` как ` [build]`, только если объявлен).
  `Check.origin`, `Check.evidence` (объявленный), `Check.evidenceKind` (объявленный ?: распознанный по инструменту).
  `Checks.seed`: приёмка — происхождение и вид пункта; types/lint/full/quality — `Origin.Harness`; `CHK-full` —
  объявленный `Tests`. `Scheduler.recordRun`/`record(CheckerResult)` пишут вид и происхождение в квитанцию.
- **Ослабление D-50** (`Verify.passesOnExit`, страж в `Scheduler.recordRun`): **объявленная** (`Acceptance.Run.evidence`)
  сборка/typecheck хоста или пользователя проходит по коду 0 без счётчиков, если: исход шейпера `inconclusive` без счётчиков, нет обёртки, скрывающей код,
  захват полный и не обрезан, не таймаут, и распознаваемый typecheck-инструмент (`DiagnosticsParser`) не напечатал
  ошибок. Тесты и проверки модели — строго по D-50. В квитанции — лимит `evidence … (plan §4.4, D-50 relaxed)`.
- **Команда модели как проверка**: не покрытая объявленными команда, распознанная как tests/build/typecheck,
  после прохождения ворот `run` (метка политики, аренда) регистрируется `Verify.adopt` ← `Checks.modelCheck`: `CHK-model-<hash8(argv,cwd)>`, `Origin.Model(strengthens = требования
  инкремента через "+")`, `Selector.Named`, `Closure.Unknown`, `Trigger.OnDemand`, `CheckKind.Unit` (tests) / `Type`
  (build, typecheck), без `acceptanceIds` → не обязательная, не пункт контракта. Квитанции — `independent = false`
  («тест агента»). `verify` её не запускает (расширение D-262 в `Verify.runOne`); Checker/Layers её не выбирают
  (OnDemand, нет acceptance). Флаг `Config.modelChecks` (по умолчанию `true`) + `withModelChecks`.
- **Проводка**: `cell/Cell.kt` — в начале ячейки `Verify.requirementIds = increment.requirementIds` и
  `Run.verify = tools.verify`, сброс в `finally`; метка `agent tests|build|typecheck` для `CHK-model-*` в блоке Checks.
- **Рефакторинг `Verify.runOne`** → `invoke` (запуск/наблюдение/лог/шейпинг) + `executedOf` (исход) — общий для
  `verify` и `run`; порядок `idGen`, виды и отказы `verify` прежние.
- **После `git merge main`** (C9, D-390): распознанные пути идут через живую редакцию C9 — фон: `shapeable` + `safeView`;
  передний план: `safeView` по сырому захвату; блоб лога в `Verify.invoke` — `applyLive(…, openAtEnd = false)`
  (так же, как `run` после D-390; для `verify` — строго безопаснее).
- **Документы**: `docs/runtime/tools.md` (строка о распознавании и проверках модели), `docs/verification/scheduler.md`
  §8.4 (вид свидетельства, происхождение, ослабление D-50).
- Схема `run` в `ToolSchemas.kt` **не менялась** (байты `[S]` прежние, `LayoutTest` не нужен): строка квитанции в
  результате `run` сама говорит модели, что проверка засчитана.

## Решения
1. **Правило нормализации команды** (`CommandMatch`): запрос и объявленная команда приводятся к каноническому списку
   токенов и сравниваются **точно** (не префикс, не подмножество, не перестановка; `pytest -q -x` ≠ `pytest -q`):
   - argv-запрос — как есть; `cmd`-строка — только если «простая»: нет `| & ; < > ( ) $ \` ' * ? [ ] { } ~ ! % ^ #`,
     CR/LF, а на POSIX и `\`; слова по пробелам, слово может быть целиком в `"…"` (непустое, без `\"`); иначе — не
     распознаётся (обычный `run`);
   - одна обёртка оболочки разворачивается в токены своей простой строки: `sh|bash|dash|zsh|ash -c <line>` (ровно 3
     элемента) и `cmd[.exe] [/d /s /q /v:… …] /c <line…>`; `/k` — никогда; с обеих сторон;
   - имя программы на Windows: регистр, `/`→`\`, ведущий `.\` не различаются; **расширение сохраняется** (`x.exe` ≠
     `x.cmd` ≠ `x`); остальные токены и всё на POSIX — как написаны (`./gradlew` ≠ `gradlew` на POSIX);
   - разворачивается только оболочка, названная голым именем или абсолютным путём (`./sh` — любой файл дерева);
     простая строка делится только по пробелу и табу, любой другой пробельный/управляющий символ (NBSP и т.п.) → не
     распознаётся;
   - каталог: `cwd` запроса и объявления → путь относительно корня (`WorkspacePath`, реальный путь; корень = `""`);
     должны совпасть.
   Исполняется **объявленный** argv (квитанция называет то, что запущено) — и только если его метка политики
   (`EffectPolicy`: класс, неизвестные эффекты, возможности) не шире метки запроса, уже прошедшего ворота `run`
   (обёртка вокруг простой строки маркируется как сама строка — это ровно то, что `run` запускает для `cmd`);
   иначе запрос исполняется как обычный `run`. Безопасная альтернатива: сравнивать только буквальный argv.
2. **Таблица «вид свидетельства ← признак»** (`EvidenceKinds`, сначала объявление пункта/проверки, затем инструмент;
   токены после `npm|pnpm|yarn|bun` (скрипт), `npx|pnpx|bunx|uvx|uv|poetry|pdm|hatch|pipx (run|exec)`, `python -m`):

   | Вид | Признак |
   |---|---|
   | tests | `pytest`, `py.test`, `jest`, `vitest`, `mocha`, `ava`, `karma`, `rspec`, `phpunit`, `ctest`, `tox`, `nox`, `nosetests`, `python -m unittest`; скрипт `test`/`t`/`tests`/`test:*`; `go test`; `cargo test|nextest`; `dotnet|swift|deno|mix test`; `make test|check`; `gradle(w)` с задачей `check` или `*test`; `mvn(w) test|verify|integration-test`; `manage.py test`; объявлено `[tests]`; `CHK-full` (сниффнутый набор) |
   | build | скрипт `build`/`compile`/`build:*`; `tsc`/`vue-tsc` без `--noEmit`; `go|cargo|dotnet|swift build`; `mix compile`; `make` (без цели), `make all|build`; `gradle(w) build|assemble|classes|jar|compile*`; `mvn(w) compile|test-compile|package|install`; `javac`; объявлено `[build]` |
   | typecheck | `tsc|vue-tsc --noEmit`; `mypy`, `pyright`, `basedpyright`; `cargo check`; `go vet`; `deno check`; скрипт `typecheck|type-check|check-types|types|typecheck:*`; объявлено `[typecheck]` |
   | — (нет) | линтеры/форматтеры (`eslint`, `ruff`, `npm run lint`), неизвестные скрипты, `npm install` и т.п. |
3. Несколько проверок с одной командой (типично S0: `AC-1` и `CHK-full` — один сниффнутый `npm test`) → **одно**
   исполнение, квитанция каждой проверки, чья объявленная команда **дословно** та же (argv и каталог) и tested inputs
   совпадают с первой; другая объявленная форма той же строки (лишний пробел, обёртка) — без квитанции.
4. Распознанный `run` исполняется **всегда в рабочем дереве** под эксклюзивным протоколом, даже если планировщик
   изолировал бы медленную проверку (`s3Writers`/`isolateAll`): модель запускала команду в дереве, её эффекты должны
   там остаться. Повтора по §8.10 (flaky) после распознанного `run` нет — модель просила одно исполнение.
5. **Фоновый протокол**: квитанция по окончании с фактическим исходом, но `InputStability.Unknown` + лимит
   `input_stability: background run: the workspace was not held between its launch and its end, so no concurrent writer
   was kept out (D-45); the receipt cannot certify a tree`; рескан всё равно называет изменённые входы. Сертификацию
   даёт stop-верификация (один эксклюзивный прогон) или распознанный прогон на переднем плане. Pin живёт в памяти `Run`
   (рестарт/граница ячейки → квитанции нет). Отклонённый вариант (первая версия): `Exclusive` по рескану — Codex показал
   контрпример (правка+восстановление байтов и mtime в интервале, в т.ч. инструментами самой модели), D-45 требует
   принудительной границы «нет писателей». Будущее: счётчик записей harness между pin и settle → сертифицирующий фон.
6. **Ослабление D-50** — только **объявленный** `Build`/`Typecheck` (`Acceptance.Run.evidence`; распознанный вид —
   только метка: `gradle build`, `mvn package|install` гоняют и тесты), `Receipt.evidenceDeclared`, только
   происхождение ≠ `Model`, `make -i/-k/--ignore-errors/--keep-going` — никогда, и только если код выхода — код
   одной команды (`CommandMatch.exitPropagates`: argv без интерпретатора командной строки или одна оболочка вокруг
   простой строки; `sh -c "false; exit 0"`, `cmd /c "x&exit /b 0"`, `powershell -Command` → нет); двойная защита
   (исполнитель + `recordRun`) и инвариант `Receipt`. Безопасная альтернатива: `inconclusive` с меткой «build ok».
7. **Проверки модели**: по умолчанию включены (решение владельца №4) — исключение из правила «необязательные слои
   выкл. по умолчанию». Регистрируются только после ворот `run`; в правиле «красная проверка без пункта Open» резолвера и
   в наборе `redChecks` валидатора регистра **не участвуют** (не обязательны и не независимы; запись красной
   необязательной проверки — C1b); `Cell.repeatedFailures` их видит (сигнал застревания). `strengthens` = требования инкремента ячейки через `+` (вне ячейки — все требования контракта).
   ID — дайджест команды и каталога (детерминированно, без часов); занятый другой командой ID (коллизия) → обычный run.
8. **Происхождение** на проверках и квитанциях: приёмка — `origin` пункта; сниффнутые types/lint/full и quality gates —
   `Origin.Harness`; проверки модели — `Origin.Model`. `Receipt.independent = checkOrigin !is Origin.Model`: квитанции
   пунктов приёмки, добавленных моделью, тоже «тест агента». Для C2 (ось происхождения) — читать
   `Receipt.checkOrigin`/`evidenceKind`/`independent`.
9. Пункты приёмки с `Origin.Model` **не** распознаются как объявленные (карточка); их команда, запущенная моделью,
   становится проверкой модели (если это tests/build/typecheck).
10. Объявленный вид входит в `Check.definitionVersion` только если объявлен (иначе дайджест прежний); у `CHK-full`
    теперь объявлен `Tests` → его дайджест сменился один раз (старые квитанции CHK-full — stale по определению).

## Тесты
- L1 (каждый цикл, `./gradlew :core:test --tests RunTest --tests VerifyTest --tests SchedulerTest --tests ContractsTest
  --tests AcceptanceEvidenceTest -q --console=plain`):
  - после реализации, до новых случаев: RunTest 48/48, VerifyTest 14/14, SchedulerTest 14 (1 skipped), ContractsTest
    18/18, AcceptanceEvidenceTest 8/8 — зелёные;
  - с новыми случаями: RunTest 54, VerifyTest 15, SchedulerTest 17 (1 skipped), ContractsTest 19,
    AcceptanceEvidenceTest 9 — зелёные (первый прогон RunTest: 1 падение в самом тесте — счётчик логов учитывал
    sidecar-файл процесса; исправлен тест-хелпер, не код);
  - после `git merge main`: RunTest 66 (с 12 случаями C9), VerifyTest 15, SchedulerTest 17 (1 skipped), ContractsTest
    19, AcceptanceEvidenceTest 9 — зелёные.
- Новые случаи: RunTest — объявленная команда через `run` → одна квитанция, `verify-on-stop` не перезапускает (1 лог
  исполнения); необъявленная/вариант/синтаксис оболочки/другой каталог/пункт модели → нет квитанции; тестовая
  команда модели → проверка `Origin.Model`, повтор = та же проверка, `modelChecks=false` → обычный run; сборка хоста
  проходит по коду 0, сборка модели — `inconclusive`; фон + `wait` → квитанция, `cancel` → нет; таблицы нормализации
  и видов. SchedulerTest — вид/происхождение в квитанции и страж D-50, одно исполнение → квитанции нескольких проверок,
  pin/settle (правка в интервале → ineligible). VerifyTest — `verify` отказывает проверке модели; объявленная сборка
  проходит по коду. ContractsTest — объявленный вид: хранение, `criterion`, засеянная проверка. AcceptanceEvidenceTest —
  сквозной: модель запускает объявленную команду `run`-ом, кампания `Completed`, одна квитанция, строка квитанции в
  результате самого `run`.
- После правок по ревью Codex (L1): RunTest 67, VerifyTest 15, SchedulerTest 17 (1 skipped), ContractsTest 19,
  AcceptanceEvidenceTest 9 — зелёные. Новые/изменённые случаи: одна квитанция только дословной декларации; фоновая
  квитанция не сертифицирует, stop-верификация сертифицирует одним прогоном; расширения на Windows, относительная
  оболочка, NBSP, `exitPropagates`; объявленная сборка в виде `…; exit 0` → `inconclusive`.
- Ревью Codex (read-only, `codex:codex-rescue`, effort medium), 5 находок — все подтверждены по коду и исправлены
  (`c875f4a`): (1) расширения на Windows и разные декларации получали квитанцию одного исполнения → дословное
  совпадение, расширение сохраняется, проверка доминирования метки политики; (2) фоновая квитанция `Exclusive` могла
  сертифицировать промежуточную мутацию → `Unknown`, не сертифицирует; (3) скрытый код выхода (`; exit 0`) обходил
  ослабление D-50 → `exitPropagates`; (4) фоновое свидетельство читалось из редактированных байтов → из сырого захвата;
  (5) несвежий отчёт штампа при конце фона мог пропустить анонс → свежий. Плюс: NBSP/управляющие символы, относительная
  оболочка. Несогласий нет. Замечание «вид шейпера `inconclusive` при квитанции `passed` (сборка)» оставлено: строка
  квитанции объясняет («build passes on exit 0 (no test counts)»).
- **L2** (один раз, после `git merge main`, на `c875f4a`; второе слияние `c40a0c1` принесло только `eval/` и документы):
  `./gradlew :core:test --tests 'io.astrolabe.tool.*' --tests 'io.astrolabe.verify.*' --tests 'io.astrolabe.contract.*'
  --tests 'io.astrolabe.campaign.Acceptance*' --tests 'io.astrolabe.cell.*' --tests 'io.astrolabe.evidence.*'
  --tests 'io.astrolabe.AttemptConfigTest' --continue -q` — 64 класса, 598 тестов, 2 skipped, **1 падение:
  `cell.ResultRecallTest` «successive polls under one run alias…» (`ResultRecallTest.kt:103`)**. Пакеты `cell.*`,
  `evidence.*`, `AttemptConfigTest` добавлены к L2 карточки, потому что тронуты `Cell.kt`, `Receipt.kt`, `Config.kt`
  (§8.4: все затронутые пакеты); `cell.LayoutTest` в их числе — зелёный (схема не менялась).
  - Падение **предсуществующее, не C1a**: тот же класс на чистом `main` (`739e5a4`, временный worktree
    `agent-c1a-mainprobe`, удалён) падает так же — 4 теста, 1 падение, строка 103. Причина по коду: `Run.wholeLines`
    из C9 (D-390) делает второй `os.poll` для среза без перевода строки, а сценарный `Os` теста отвечает на каждый
    опрос новым `poll-result-N` → второй `run(op=poll)` видит `poll-result-3/4`, а не `2`. C1a `poll` не трогает.
    Не чинил (вне границ, файл C9) — передать владельцу C9/оркестратору. **Исправлено оркестратором в `main`
    `c61490a`** (фикстура пишет целые строки в читаемый лог).
- `:eval:compileTestKotlin` — зелёный (после второго слияния).
- `:core:checkKotlinAbi` — расхождение ожидаемое → `:core:updateKotlinAbi` → `checkKotlinAbi` зелёный, дамп закоммичен
  (`aa08ede`). `provider-ai-gate`/`eval-live` не компилировались (не трогались, в L2 карточки их нет).

## Ревью Fable (через оркестратора S2, решения оркестратора)
Утечки приёмочной силы нет. Исправлено (`d35143a`), L1 зелёные:
1. (risk medium) Красная текущая `CHK-model-*` превращалась в `Failed "… is red without an Open item naming it"` и
   блокировала завершение → `verify/Resolution.kt` (цикл красных проверок): `CHK-model-*` пропускаются; то же в
   `Cell` `redChecks` валидатора (иначе красный тест агента не давал двигать `[>]` — тот же корень, решение
   распространено, безопасная сторона: поведение до C1a). `repeatedFailures` оставлен. Тест: AcceptanceEvidenceTest
   «a red check of the model's own on the final tree does not block completion».
2. (risk) Выведенный вид давал ослабление D-50 → ослабление только для объявленного вида (`Check.evidence`,
   `Receipt.evidenceDeclared`, инвариант `Receipt`); `Checks.modelCheck` вид не объявляет; `make -i/-k` (и длинные
   формы, кластеры) — никогда. Тесты: RunTest «a recognised kind is a label only…», SchedulerTest (метка → inconclusive,
   `evidenceDeclared = false` → инвариант), таблица `exitPropagates`.
3. (risk) Модельная проверка регистрировалась до `Run.authorizes` и `beforeDispatch()` → `recognize` её не
   регистрирует, `Verify.adopt` — после ворот (передний план: после `beforeDispatch` в `scheduled`; фон: перед pin).
   Правило доминирования вынесено в чистую `CommandMatch.covered`. Тесты: RunTest «the model's own check joins the
   registry only after the run passed its gates» (истёкшая аренда) + таблица `covered` (класс, неизвестные эффекты,
   лишняя возможность). Конструктивного отказа доминирования запросом модели при текущей нормализации нет — проверено
   юнит-таблицей.
5. Тест: секрет (AWS-ключ и незакрытый PEM-блок) в выводе распознанного запуска не виден — передний план и фон, и в
   блобе квитанции (RunTest «a secret in the output of a recognised run is not shown, foreground or background»).
6. Явные v1.0-конструкторы (как D-387 для `Defaults`) у `Receipt`, `Check`, `Acceptance.Run` и — по тому же
   принципу — у `Config` (поле `modelChecks`): все публичные конструкторы дампа `main` сохранены (сверено `git diff main
   -- core/api/core.api`: удалены только synthetic `$default`/`copy`/`component`, как в D-387). ABI перегенерирован
   (`031acf5`).
7. Потерянный pin: `ended` для фонового handle, чей запрос совпадает с объявленной проверкой, а pin нет, дописывает
   «no receipt: pin lost on restart (or taken in another cell) — this run matches CHK-…». Тест: RunTest «a recognised
   background run that lost its pin ends without a receipt and says so».
4. Не чинилось (решение оркестратора) — хвост, см. ниже.

Проверки после правок по Fable: L1 (карточка) — RunTest 71, VerifyTest 15, SchedulerTest 17 (1 skipped), ContractsTest
19, AcceptanceEvidenceTest 10 — зелёные. L2 (один раз, после `git merge main` `09e3341`):
`./gradlew :core:test --tests 'io.astrolabe.tool.run.*' --tests 'io.astrolabe.tool.verify.*' --tests 'io.astrolabe.verify.*'
--tests 'io.astrolabe.contract.*' --tests 'io.astrolabe.evidence.*' --tests 'io.astrolabe.cell.*'
--tests 'io.astrolabe.campaign.Acceptance*' --continue -q` — 50 классов, 459 тестов, 2 skipped, **0 падений**.
`:eval:compileTestKotlin` — зелёный; `:core:updateKotlinAbi` → `:core:checkKotlinAbi` — зелёный. После v1.0-конструктора
`Config`: `AttemptConfigTest` 8/8, `java.JavaConsumptionSmokeTest` 3/3.

## Отклонения от карточки
- Правки вне перечисленных границ (необходимые): `cell/Cell.kt` — проводка `Run.verify`/`requirementIds` (3 строки) и
  метка агентских проверок (1 строка): `Run` и `Verify` строятся в горячем `campaign/Controller.kt`, а связывать
  исполнителей ячейки принято в `Cell.run` (там же `beforeDispatch`); `evidence/Receipt.kt` (поля квитанции),
  `verify/Check.kt` (происхождение/вид проверки, засев), `Config.kt` (флаг), новый `tool/run/Recognition.kt`, `docs/`.
  Горячие файлы (`Controller.kt`, `Gates.kt`, `CampaignFinish.kt`) не тронуты; `verify/Resolution.kt` — одна строка в
  цикле красных проверок по решению оркестратора (ревью Fable, п. 1).
- Схема `run` не менялась (п. 4 карточки «только если нужна»).
- После слияния с C9 блоб лога `verify` редактируется `applyLive` (как `run` по D-390) — изменение поведения `verify`
  в безопасную сторону, иначе распознанный `run` откатил бы D-390 для своих логов.

## Хвосты и риски
- Мелочи Fable после слияния (хвосты ведёт оркестратор): формулировка «pin lost on restart» и для никогда не
  закреплённого handle; pin, снятый в `ended` при `verify == null`, теряется; нет интеграционного теста на отказ
  `make -i/-k` и на вызов v1.0-конструкторов; `nmake /I /K` не учтены в `exitPropagates`.
- **(Fable п. 4, владелец C1b/C3) Живой фоновый handle во время stop-верификации.** Сценарий: модель запускает в фоне
  долгую команду (распознанную или нет: тесты, dev-сервер, сборка с кэшем в дереве) и предлагает завершение, не дождавшись
  её конца. Stop-верификация (`Verify.onStop` → `Scheduler.runCheck`) идёт эксклюзивно, но `Scheduler` не знает о живых
  handle: замок рабочего дерева не останавливает внешний процесс, поэтому (а) записи фонового процесса во входы во время
  проверки делают квитанцию ineligible или — при восстановлении байтов и mtime — проскакивают мимо рескана (как п. 2
  ревью Codex), (б) два прогона делят порты/файлы → нестабильный исход, (в) pin фоновой распознанной команды позже даёт
  квитанцию на уже сдвинутом дереве (не сертифицирует, но видна). Предложение: stop ждёт/отменяет живые handle своей
  ячейки или помечает квитанции, полученные при живом handle, как несертифицирующие.
- Pin фонового распознанного запуска — в памяти: рестарт или конец ячейки до конца процесса → квитанции нет.
- Фоновая квитанция не сертифицирует (D-45): объявленная команда, запущенная в фоне, всё равно перепроверяется
  stop-верификацией (второй прогон). Чтобы фон сертифицировал, нужна принудительная граница «нет записей harness»
  между pin и settle (счётчик записей `Edit`/`run` W-класса) — отдельная задача.
- Проверка доминирования метки политики не находит конструктивного расхождения при текущей нормализации — защита на
  будущее; если расхождение есть, запрос идёт обычным `run` (без квитанции).
- Пункт приёмки, добавленный моделью (план S1+), по-прежнему требует авторизации хоста/пользователя для запуска
  `verify` (D-262); запуск той же команды моделью даёт только квитанцию теста агента. UX — C1b/C2.
- `Cell.repeatedFailures` видит красные проверки модели → подсказки о повторной ошибке могут срабатывать на тестах
  агента (смотреть в B4).
- Каждый распознанный `run` хеширует перечислимое дерево дважды под замком (как `verify`) — цена на больших репо.
- Блок Checks в `[A]` показывает проверки агента (`agent tests ✓`) — байты `[A]` меняются, когда модель гоняет тесты.
- `EvidenceKinds` — эвристическая таблица; ошибка вида влияет на метку теста агента или на объявленные без вида
  команды хоста (`run: make` → build → проходит по коду 0; для `make` по умолчанию это честно: код 0 = цель прошла).
- Публичный API: конструкторы `Receipt`, `Check`, `Acceptance.Run`, `Config` получили параметры в конце (Kotlin — с
  умолчаниями; Java-конструкторы — разрыв, Studio использует `new Config()` — не затронуто); новые `EvidenceKind`,
  `Checks.MODEL_PREFIX`, `Config.withModelChecks`. ABI-дамп — после L2.
- Номера D-nn для решений 1–10 и строки в `docs/` (ссылаются на «plan §4.4») — у оркестратора.
- Предсуществующее падение `cell.ResultRecallTest` на `main` (C9, `Run.wholeLines`) — см. «Тесты»; закрыто в `main` `c61490a`.
- Ветка на ревью Fable у оркестратора; по его просьбе ветка не меняется до находок.

Статус: ГОТОВО К СЛИЯНИЮ · последний коммит `031acf5` · влито оркестратором в `main` (`c4f33ba`)
