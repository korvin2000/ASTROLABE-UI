# WP-A5 — `run(wait)`: ожидание до выхода / строки / порта

Ветка `v2/A5` (база `main` a245ac7). Исполнитель: суб-агент t3 (Opus 5.5).

## Сделано
- `run(op=wait, handle, until_line?, until_port?, timeout?)` — новый op (`ToolOps.run` = run, poll, wait, cancel).
  Один вызов наблюдает фоновый handle до: конца процесса (без условия), строки вывода по regex (`until_line`),
  открытия loopback-порта (`until_port`) или дедлайна ожидания. `core/src/main/kotlin/io/astrolabe/tool/run/Run.kt`
  (`wait`, `await`, `Until`, `Waited`, `TailBuffer`, `tailWithin`).
- `run(argv|cmd, until_line|until_port)` — запуск в фоне (условие подразумевает `bg=true`) и ожидание готовности в
  том же вызове; ожидание начинается с курсора 0, поэтому первый вывод запуска тоже проверяется и показывается.
  Намерение коммитится и handle сохраняется до ожидания — отменённое ожидание не оставляет открытого intent.
- Дедлайн ожидания — `timeout` (зажат как у run: ≤ max(3600, runTimeoutSeconds), по умолчанию runTimeoutSeconds)
  на **инжектированном `Clock`**; истечение заканчивает только наблюдение («wait timed out after Ns before …, the
  process keeps running (no relaunch)»), процесс и handle остаются `running`.
- Отмена: цикл в `runInterruptible`; отмена корутины (кампании) прерывает `os.poll`, процесс не трогается,
  handle не меняется.
- Риск §14: завершение процесса (любой терминальный статус) до готовности прерывает ожидание; результат — полный
  терминальный вид (shaped-лог, код выхода) с строкой «wait ended: the process ended before <условие>».
- Строки сопоставляются после редакции (`ModelFacing`): regex модели не оракул для скрытых секретов. Хвост
  вывода в ответе ограничен бюджетом `budget` (последние целые строки), в памяти ≤ 256 KiB, полный лог — в файле.
- `Os.listening(port)` — метод интерфейса с реализацией по умолчанию: TCP connect к 127.0.0.1 и ::1 (250 мс),
  ничего не отправляется. `core/src/main/kotlin/io/astrolabe/os/Os.kt`.
- `RunArgs`: поля `until_line`, `until_port` (1–65535). Схема `run` в `ToolSchemas.kt`: +2 поля, описание
  упоминает `op=wait` (минимальная правка). Вид фонового запуска подсказывает `run(op=wait, handle=…)`.
- Терминальная ветка `poll` вынесена в `ended(...)` и переиспользуется `wait` (поведение poll не изменилось).
- FX-22 (RunTest): причина флейка найдена — запуск фона делает `os.poll(proc, 0, 0)`; если `bg-start` уже
  успел попасть в первый вывод, курсор handle проходит за него, и ранний `poll` ждал `bg-end` (при `running`),
  не содержа `bg-start`. Исправлено в тесте: ранний poll читает с `since:0`; досрочное ожидание — один `wait`
  вместо цикла poll (`awaitSettled`). Продуктовый код poll не менялся.

## Решения
- `poll` → оставлен как раньше (возврат на любых новых байтах, срез 30 с) → `wait` — отдельный op с теми же
  условиями; `poll` с `until_*` трактуется как `wait` (терпимость D-365) → poll-как-wait с дедлайном на
  инжектированном Clock повесил бы тихие серверы до дедлайна и сломал бы проверенную семантику «observation timed
  out» (FX-22, ResumeTest, VerticalSliceTest); модель направляется к `wait` описанием схемы и видом запуска →
  безопасная альтернатива: позже сделать poll = wait без условия со срезом poll по умолчанию.
- Маска: `run.wait` разрешён там, где разрешён `run.poll` (то же право наблюдать handle) → роли plan/probe в
  `cell/Role.kt` перечисляют `run.poll` явно, а `cell/` — зона A3 → альтернатива: A3 добавит `run.wait` в маски
  явно, тогда эквивалентность в `Run.execute` можно убрать.
- Условие на запуске подразумевает `bg=true` (терпимость: модели не нужно знать про bg) → mcp-инструменты с
  `until_*` отказываются как фоновые (как и раньше с bg).
- Дедлайн ожидания = `timeout` вызова (тот же бюджет, что у процесса при запуске) → «в пределах существующих
  бюджетов run»; ожидание порта опрашивает раз в 1 с, ожидание строки/выхода просыпается на выводе или конце.
- Невалидный regex сопоставляется буквально (терпимость), а не отклоняется.
- Если в одном срезе процесс завершился и строка совпала — побеждает терминальный результат (больше диагностики).

## Тесты
- L1: `./gradlew :core:test --tests 'io.astrolabe.tool.run.RunTest' -q --console=plain` — 35/35 зелёные
  (XML). Новые кейсы: выход (`a background build is awaited in one call until it exits`), строка
  (`a server launch waits for its readiness line and keeps running`), порт (`... until its loopback port accepts
  connections`, + `Os.listening` false на закрытом порту), дедлайн (`a wait deadline on the injected clock ...`,
  FakeClock двигается фиктивным Os; + poll-с-условием и маска poll→wait), отмена (`cancelling the caller
  interrupts a wait ...`), ошибка во время ожидания (`a process that ends before readiness stops the wait ...`).
- FX-22 ×5 (`--tests 'io.astrolabe.tool.run.RunTest.a background run persists*' --rerun`): 5/5 зелёные, 9,3–10,5 с.
- L1 `io.astrolabe.os.ProcOwnershipTest`: 6 тестов, 0 падений (1 skipped, как и до изменений).
- L2: `./gradlew :core:test --tests 'io.astrolabe.tool.*' --tests 'io.astrolabe.os.*' --tests 'io.astrolabe.cell.*'
  :eval:compileTestKotlin --continue -q`: exit 0; по XML этого checkout 720 тестов, 8 skipped, 0 failures, 0 errors;
  `:eval:compileTestKotlin` собран.
- `./gradlew :core:updateKotlinAbi`: дамп `core/api/core.api` обновлён (в RunArgs добавлены until_line/until_port,
  `Os.listening` + `Os$DefaultImpls`) и закоммичен. Полный `build` не запускался (по правилам).

## Отклонения от карточки
- `poll` не заменён на `wait`, а дополнен им (см. «Решения»); `poll` с условием = `wait`.
- Таймер среза внутри `LocalOs.poll` остаётся на `System.nanoTime` (граница ОС, без изменений); решение о
  дедлайне ожидания принимает только инжектированный `Clock`.

## Хвосты и риски
- A3: добавить `run.wait` в маски plan/probe (`cell/Role.kt:95,114`) и, если нужно, в тексты ролей.
- Ожидание при «замороженном» Clock хоста не истекает по дедлайну (только по условию/концу процесса); в продукте
  Clock системный.
- Окончание процесса ≠ «событие ошибки» в выводе работающего сервера: строки вида `Error:` без выхода ожидание
  не прерывают (дедлайн их ограничивает).

Статус: ГОТОВО К СЛИЯНИЮ · последний коммит ветки v2/A5: c692ab1
