# WP-WG — режим `ask` для живого прогона шлюза P8.W-A

Ветка `v2/WG` от `main` 7a09bf2; коммит `5b84625`; запушена.

## Сделано
- `eval-live run --mode auto|ask` (по умолчанию `auto`): `Main.kt` (опция, usage), `Bench.kt` (`HostMode`, `BenchPlan.mode`;
  `ask` — только для рук ядра, `loop` отклоняется), `README.md` (строка опции).
- `StudioAttempt.kt`: `StudioAutoAuthority` → `StudioAuthority(user: ScriptedUser?)`; без `user` — прежняя политика `auto`.
  `ScriptedUser`: `decide` без ответа держит запрос открытым (`open`) и возвращает `null` → кампания `waiting_for_input`;
  `accept()` записывает ответ по `AcceptanceDecisionRequest.key` (D-428); повторный запрос с тем же ключом получает
  `AcceptanceDecision(Accept, Decider.User, "user:local", "the user confirmed the task is done")` — как
  `DecisionService.decide`/`TaskService.decideAcceptance` Studio. Вопросы, эффекты, поправки, ревью — как в `auto`.
- `Bench.runOne`: после сеансов (включая interrupt/reopen) в `ask`: пока последний сеанс `waiting_for_input` и есть
  открытый запрос — ответ + новый сеанс той же `work` в том же корне состояния (как `continueRun` Studio: тот же
  `CampaignRequest(work, FIRST_ATTEMPT, text)`); не больше 3 ответов, дальше `ask.outcome = "ask-exhausted"`.
- `result.json` (`Results.kt`, `Recorder.kt`): `mode`, `ask {answers, outcome, segments}` (только `ask`), `phases`
  `{opens, finishAttempts, byPhase{open|snapshot|finish: events, gitProcesses, filesRead, bytesRead, objectsWritten,
  blobsRead, blobBytesRead}}` из событий `phase.counted`.
- `Arms.kt` `Fingerprints.config`: `mode=ask` добавляется только для `ask` — отпечатки `auto` прежние.
- Тест `AskModeTest` (новый). Итого +165/−10 в main/README + 97 строк теста.

## Решения
- Ответ ищется по `key`, а не по `id` (Studio ищет по `request_id`): по карточке и D-428; ключ включает кандидата,
  ревизию и обязательства — та же проверка, что `contract_revision` у Studio. Альтернатива — по `id`.
- `ask.outcome` отдельно от `outcome`: `outcome` остаётся исходом кампании (wire ядра), `ask-exhausted` — исход
  сценария. Альтернатива — писать `ask-exhausted` в `outcome` (ломает словарь wire).
- В `ask` пользователь отвечает Accept и на запрос с `Failed` (отказ ревью) — карточка требует Accept на ожидающий запрос.

## Тесты
- Цикл 1: `./gradlew :eval-live:test -Pastrolabe.aiGateBuild=… -q` — 33 теста, 31 зелёный, 1 пропущен, 2 упали
  (оба новых): `GitError … hash-object … Filename too long` — путь recovery-блоба ядра > 260 символов из-за длинного
  имени temp в тесте (`tmp-auto`). Исправлено коротким именем (`t0`/`t1`), тест не ослаблен.
- Цикл 2: `--tests 'io.astrolabe.evallive.AskModeTest'` — 2/2 зелёные (`ask` → `completed` после одного ответа, та же
  `workId`, решения `waiting, answered`; `auto` → `completed`, `accepted`, `ask` = null, отпечаток config прежний).
- `:eval-live:checkKotlinAbi` — зелёный (публичный API не менялся).
- Циклов «правка → тест»: 2. Расход токенов не виден.

## Отклонения от карточки
- `Decider.Human` в ядре нет: enum `Decider { User, Policy }` — используется `Decider.User`.

## Хвосты и риски
- Путь `state/astrolabe/projects/<64>/blobs/recovery/<64>` у ядра близок к MAX_PATH Windows: при длинном `--temp`
  git падает `Filename too long`, и ошибка доходит до хоста (`failure`). Для живого прогона умолчание
  `%TEMP%/eval-live` короче junit-пути; длинный `--temp` не задавать. Владелец — ядро (`ShadowRef`/blob store, W3).
- `phases.opens` считает события `open`; неудачное открытие события не даёт (хвост W0) — сводка его не видит.

## Живой прогон (не запускался)
```bash
export JAVA_HOME=/c/Users/user/.gradle/jdks/eclipse_adoptium-26-amd64-windows.2
./gradlew :eval-live:installDist -Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm -PbenchDir=C:/work.astrolab/bench/wa
C:/work.astrolab/bench/wa/bin/eval-live run --models deepseek/deepseek-v4.1-flash --tasks real-dirty-repo --mode auto \
  --out C:/work.astrolab/bench/wa/results-auto --credentials "$LOCALAPPDATA/AstrolabeStudio/credentials.json" --repeats 1 --seed 1
C:/work.astrolab/bench/wa/bin/eval-live run --models deepseek/deepseek-v4.1-flash --tasks real-dirty-repo --mode ask \
  --out C:/work.astrolab/bench/wa/results-ask --credentials "$LOCALAPPDATA/AstrolabeStudio/credentials.json" --repeats 1 --seed 1
```
Результат: `results-*/runs/default/real-dirty-repo/deepseek_deepseek-v4.1-flash/r1/result.json` (`outcome`, `mode`,
`ask`, `phases`, `failure`).

Статус: ГОТОВО К СЛИЯНИЮ — `5b84625` (v2/WG)
