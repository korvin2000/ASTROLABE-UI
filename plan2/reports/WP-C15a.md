# WP-C15a — отчёт (ветка `v2/C15a` от `main` `b0901dc`)

## Сделано
1. **Поштучный разбор `node --test`** (`core/.../tool/run/GenericShaper.kt`, новый `NodeTests`): репортёр spec (`✔`/`✖`/`﹣`,
   вложенность — 2 пробела под `▶`) и TAP (`ok`/`not ok`, вложенность — 4 пробела под `# Subtest:`, `type:` и `error:` из
   YAML). Идентичность: `suite` = путь наборов через ` > `, `name` = имя теста; `# SKIP`/`# TODO` → Skipped. Чтение spec
   останавливается на `✖ failing tests:` (раздел повторяет падения). Записи отдаются гейту D-406 только если сходятся со
   сводкой (total, pass, fail+cancelled, skipped+todo); иначе — ни одной идентичности и ограничение в виде «do not add up».
   Оборванный вывод (нет полной сводки) — прочитанные тесты как неполная запись (`Shaped.evidenceIncomplete`), счётчиков
   нет. Версия `GenericShaper` 3 → 4. Коммит `b6c185f`.
2. **`gradle` вне PATH** (`core/.../verify/GradleWrapper.kt`, `tool/verify/Verify.kt`, `verify/Baseline.kt`,
   `verify/Scheduler.kt`): если команда проверки — голое `gradle`, а его нет на PATH (`HostProbe`), wrapper
   (`gradlew.bat` на Windows, `gradlew` иначе) ищется в каталоге проверки через `WorkspacePath` и запускается вместо него —
   и в рабочем дереве, и на кандидате s0 для baseline. В квитанции — объявленная команда и ограничение «gradle is not on
   PATH: ran the repository's wrapper … instead». Нет ни того, ни другого — объявленная команда запускается как раньше,
   а у квитанции `unavailable` первая причина «gradle is not on PATH and … has no gradlew… wrapper». Коммит `b198684`.
   Причина терялась (сверено по коду): `Scheduler.currency` (D-338) и строка проверки в `Verify` брали
   `limits.firstOrNull()`, а у изолированного прогона или прогона с неизвестным замыканием первым идёт `input_stability`.

## Решения
- Как отличить родительский тест от набора в spec (Node 22+ закрывает оба через `✔`/`✖`) → по числу `tests` в сводке: все
  родители — наборы или все — тесты; иначе идентичности не записываются → честное `unknown`, не выдуманные исходы.
  Безопасная альтернатива: TAP (`type:` даёт ответ точно).
- Несходящиеся со сводкой строки → пустой список, а не `evidenceIncomplete`: иначе зелёный прогон с непонятной вложенностью
  стал бы `inconclusive` (регрессия относительно сегодняшнего). Пустой список гейт уже трактует как «runner lists no
  passed tests» / «did not identify».
- Оборванный вывод без сводки, но с выводом mocha → по-прежнему побеждает mocha (сводка node не появилась — тесты не node).
- Типизированная причина: вид ограничения `unavailable` (`Scheduler.UNAVAILABLE`) для всех runner-ограничений квитанции
  `unavailable` (раньше `runner`; `Cell.kt` уже ищет оба вида), выбор причины — `Scheduler.cause`.
- Без wrapper команда `gradle` всё равно запускается (не отказ до запуска): хост или подменный runner может её исполнить;
  проверка PATH через `HostProbe.system()` — тот же PATH, что получает дочерний процесс; тесты подставляют свой.
- Публичный API не менялся (новое — `internal`): `checkKotlinAbi` зелёный, дампы не обновлялись.

## Тесты
L1 (названы до запуска): `GenericShaperTest`, `BaselineTest`, `VerifyTest`, `SchedulerTest` (`:core:test --tests …`).
- Новые: `GenericShaperTest` «node test results are read one by one under the spec and TAP reporters with nested
  suites» (фикстуры `shaper/node-spec-fail.txt`, `shaper/node-tap-fail.txt` — настоящий вывод Node 24.18, стеки урезаны);
  `BaselineTest` «a failed node test run is held test by test as fixed, new or failed before, and a cut one shows nothing
  fixed» (spec и TAP: new / failed before / fixed, оборванный — unknown «did not finish with a complete record»);
  `VerifyTest` «a gradle check with no gradle on PATH runs through the repository's wrapper, and without one is
  unavailable with the reason» (настоящий `gradlew.bat`/`gradlew` без внутренних кавычек).
- Цикл 1: 67 тестов, 1 упал (`BaselineTest`, новый тест: мой помощник создавал квитанцию `Passed` без счётчиков —
  ошибка теста, а не кода; помощнику переданы счётчики прогона). Цикл 2: `BaselineTest` зелёный.
- L2 один раз: `./gradlew assemble testClasses checkKotlinAbi -q --console=plain` — зелёный.
- Циклов «правка → тест»: 2. Расход токенов не виден.

## Отклонения от карточки
- Нет. Уточнение: wrapper подставляется и в `Baseline` (тот же запуск команды проверки на s0) — иначе baseline Gradle-проверки
  был бы `unavailable`, а удержание — `unknown`. Отдельного теста для пути baseline нет (общий `GradleWrapper.plan`).

## Хвосты и риски
- Смешанный вывод (cargo или go вместе с node): приоритет не тронут — node-тесты в нём не читаются.
- Spec-репортёр со смесью `describe` и вложенных `t.test` в одном прогоне: родителей не разделить — идентичностей нет
  (unknown). Несколько прогонов spec в одном выводе с падениями: после первого `✖ failing tests:` чтение останавливается —
  не сходится со сводкой → идентичностей нет.
- Идентичность node без файла: одноимённые тесты в двух файлах — `ambiguous` (честно, но не классифицируются). Node 18
  (файлы как подтесты с абсолютным путём) не поддержан. Сообщение об ошибке есть только у TAP.
- `gradle` в фоновом распознанном `run` (`Run.kt`) и в `Checker` wrapper не подставляют — вне границ карточки.
- В Linux отсутствие `gradle` видно как exit 127 (шейпер → `unavailable`), на Windows — как исключение запуска; оба пути
  получают причину, но тестом покрыт только путь исключения (подменный runner).

## Ревью и исправления (ревью Opus, один раунд; коммит `04be099`)
- **P1-1, ложное «исправлено» у одноимённых тестов.** `verify/Baseline.kt` `held()`: ключ, который хоть один красный
  прогон сообщил больше одного раза (`tests.ambiguous`), больше не снимается одним проходом на новом дереве. Он уходит в
  `unknown` с текстом «a red run reported it more than once: ambiguous, a pass on this tree shows no fix» (новая ветка
  в `why`). Тест: в `BaselineTest` (тест про node) дубликат, затем удаление упавшего — удержание остаётся.
- **P1-2, wrapper модели исполнялся как проверка хоста.** `verify/GradleWrapper.kt`: подстановка только при условии
  `fromBase`. Новый `GradleWrapper.atS0` проверяет так:
  - путь, который s0 записал как грязный, сравнивается по сырому дайджесту (`FileVersion`);
  - иначе файл должен быть отслеживаемым в базовом коммите s0, `HEAD` всё ещё на нём, `git status` не показывает
    изменений (сравнение с учётом концов строк — `.bat` с `eol=crlf`);
  - в изолированном прогоне байты кандидата должны совпадать с байтами в рабочем дереве.

  Манифест s0 берётся из `Baseline.initial()`, то есть из `shadowRef.manifest(0)` у `regressionBaseline ?: baseline`.
  В основной ячейке Controller его задаёт. Где Verify создан без baseline (дочерний workspace, S3Run, Controller:2800),
  wrapper не подставляется — это безопасная сторона. Если wrapper создан или изменён в задаче либо s0 нет, проверка
  получает `unavailable` с причиной «the wrapper … is not the base tree's (written or changed in this task, or no
  base commit)». В `Baseline` кандидат — сам s0, и wrapper в нём из базы по построению.
  Тесты в `VerifyTest`: wrapper из базы исполняется; созданный в задаче (`sub/`) — нет; изменённый — нет; без wrapper —
  прежняя причина.
- **Попутно, однострочно:** при `Wrapped`, который не стартовал, причина называет запущенную программу
  (`Verify.kt` `launched.first()`, `Baseline.kt` `plan.argv.first()`).
- **Тесты.** L1 (`GenericShaperTest` 14, `VerifyTest` 17, `BaselineTest` 13) — всё зелёное с первого прогона.
  `Scheduler` в этом раунде не менялся. L2 `assemble testClasses checkKotlinAbi` зелёный. Циклов «правка → тест»
  всего 3 из 3.
- **В хвосты (не чинилось, по решению оркестратора):**
  - P2: путь baseline с wrapper'ом и путь Linux exit 127 без отдельного теста;
  - P3: разделитель наборов ` > ` может совпасть с текстом имени;
  - P3: TAP чужих раннеров с `# Subtest:` читается как node.
- **Остаточный риск.** Для чистого файла проверка «из базы» опирается на `git status` и на `HEAD == baseCommit`. Если
  модель закоммитит в рабочем дереве, `HEAD` сдвинется и wrapper не подставится — сторона безопасная.

## Сужение пакета (второй раунд ревью, решение оркестратора; коммит `5d9e638`)
**Почему.** P1-1 закрыт. P1-2 закрыт не полностью: проверку «wrapper из базы» можно было обойти через индекс git.
- `git mv gradlew.bat x.bat` и новый `gradlew.bat`: status показывает переименование с `path=x.bat`, а новый файл
  скрыт.
- `--skip-worktree` / `--assume-unchanged` и правка файла: status правку не показывает.

По плану §8.8 п. 5 пакет сужается, третьей починки нет. Законный случай подстановки редок: `Checks.seed` пишет голое
`gradle`, только когда wrapper'а в репозитории нет (`Sniff.kt:251`).

**Что убрано.** Исполнение через wrapper целиком:
- `Plan.Wrapped`, `atS0`, `fromBase` в `verify/GradleWrapper.kt`;
- `Baseline.initial()`;
- подстановка argv в `tool/verify/Verify.kt` и `verify/Baseline.kt`.

Команда `gradle` без исполняемого файла на PATH снова `unavailable`, как до линии.

**Что осталось.**
- `GradleWrapper.missing` строит текст причины. Если в каталоге проверки лежит `gradlew.bat` / `gradlew`, причина
  говорит, что wrapper не запускается вместо `gradle` и проверку надо объявить через wrapper. Файл проверяется только
  на существование — не исполняется и не читается.
- Типизированная причина (вид ограничения `unavailable`, `Scheduler.cause`) доходит до строки проверки и до currency.
- P1-1 и разбор node не тронуты.

**Тесты.** Тест `VerifyTest` переписан:
- `gradle` вне PATH без wrapper → `unavailable` с причиной;
- с wrapper'ом рядом → тоже `unavailable`, причина называет wrapper; запускалась только объявленная команда `gradle test`.

L1 `VerifyTest` 17/17, `BaselineTest` 13/13; `Scheduler` не трогался. L2 `assemble testClasses checkKotlinAbi` зелёный.
**Циклов «правка → тест»: 4**, четвёртый — сужение по решению оркестратора.

## Хвосты (дополнение после второго раунда)
- **Подстановка wrapper'а при `gradle` вне PATH** — отдельная задача. Варианты:
  - сравнивать содержимое: `git hash-object` с фильтрами пути против `baseCommit:path`;
  - или считать `gradlew*` входом команды `gradle` в `TestIntegrity.namesPath`.

  Обходы, которые нужно закрыть: `git mv`, `--skip-worktree` / `--assume-unchanged`, символическая ссылка.
- **P2 второго раунда:**
  - красный прогон по одному файлу и повтор имени только на новом дереве;
  - `ambiguous` обрезается до `MAX_FAILED` (`Baseline.kt:228`), так что повтор сверх лимита не попадает в `repeated`.
- Пункты «Остаточный риск» и «P2: путь baseline с wrapper'ом» из раздела первого раунда сняты вместе с подстановкой.
  Путь Linux exit 127 без отдельного теста остаётся.

Статус: ГОТОВО К СЛИЯНИЮ · последний коммит `5d9e638`
