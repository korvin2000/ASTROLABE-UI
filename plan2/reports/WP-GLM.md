# WP-GLM — refusal loop на `z-ai/glm-5.3-flash` (D5): где теряются вложенные аргументы (сессия 5)

## Сделано (ветка `v2/GLM` от `main`, новых коммитов нет)
- **Сырые аргументы отказанных вызовов в стенде не записаны.** `events.jsonl` несёт только `family`/`op`
  (`cell.tool_called`), заголовок результата и тексты гейтов; вызов, отказанный схемой (`ParsedCalls.Invalid`,
  `cell/Cell.kt:1058`), событий `tool_called/tool_resulted` не порождает вовсе. Сырые `argsJson` всех вызовов хода, отказанные
  тоже, лежат в журнале хранилища (`journal` kind `Call`, payload пишется до валидации — `Cell.kt:603`, `journalOutput`
  `:1274`; проверено на уцелевшем store DeepSeek-прогона в `%TEMP%\eval-live\run-5409…`), но скрининг шёл без
  `--keep-workspaces`, и `eval-live` удалил каталоги прогонов (`Bench.kt:308`). Процитировать сырые аргументы нельзя.
- **Что записано и что из этого следует (форма на входе декодера).** 16 причин `refusal loop` в `result.json` GLM — ровно четыре
  текста из `Args.kt` init: `an edit op needs exactly one form …, got 0` (9), `anchored edits need hunks (§9.1)` (2),
  `state(patch) needs ops` (4), `task(propose) needs a proposal object` (3). Порядок kotlinx — сначала декодирование
  (неизвестный ключ → `SerializationException` с другим текстом), потом `init`, — значит у этих вызовов аргументы были
  **валидным JSON-объектом только из известных схеме ключей**, а вложенное значение **отсутствовало, было `null` или пустым**:
  `proposal` нет/`null` (строка прошла бы: `proposal: JsonElement?`); `patch` нет/`null`/`[]` (строка с массивом уже
  разбирается, D-347); у op все шесть ключей формы нет/`null` (остались только `expect|hunks|content|to|if`); `path` есть,
  `hunks` нет/`[]`. Исключены: двойное кодирование (строки `ops/patch/hunks` разбираются D-347/D-373, строка `proposal`
  принимается), утечка разметки `<arg_key>` (дала бы неизвестный ключ и пометку F8), уплощение наверх (неизвестные ключи
  `anchor/next/increments`), обрезка (ошибка разбора/`JsonRepair`). Сама модель (direct red-test r1, `state(blocked)`) пишет:
  «the transmitted op JSON keeps losing its 'path' key and carrying stray 'create'/'content' keys» — 23 `edit.create`
  исполнены и отказаны исполнителем («empty path»).
- **Где теряется — upstream OpenRouter `InferenceNet`.** `facts.upstream` в `cell.model_responded` (default + direct, 32 прогона,
  798 ходов): все 46 срабатываний гейта `refusal-loop` — на ходах `InferenceNet` (он обслужил 654/798 = 82 % ходов). Из 22
  прогонов только на `InferenceNet` refusal-loop был в 19; в 10 прогонах с любым другим upstream (`Decart`, `Parasail`,
  `Friendli`, `Fireworks`, `Relace`, `SiliconFlow`) — 0. Исполненные вложенные вызовы на ход: `task.propose` 0/654 на
  `InferenceNet` против 11/108 на `Decart`; `state.patch` 9/654 против 17/108; `edit.create` (почти все — пустой путь) 87
  против 3. Плоская петля (`loop`, 4 инструмента со строковыми полями) на `InferenceNet` — 13 прогонов, все приняты.
- **Наша сторона чиста (чтение кода, без изменений с зонда 2026-09-30, `harness-fiasco-analysis.md` §7, где сырые SSE-кадры
  сравнивались с выходом SDK).** SDK: `CompletionsCodec.java:361-370` добавляет строковые фрагменты `arguments` по `index`,
  `Accumulator.java:71-73,44` склеивает их в `argumentsJson` дословно; адаптер: `ResponseTranslator.kt:94` передаёт
  `part.argumentsJson()` как есть; ядро: `ToolCall.kt:73` разбирает `call.argsJson`, `InputTolerance` (`Args.kt:146`) ничего
  не удаляет из присутствующих значений формы.
- **`tool_call_id_normalized` — не причина.** Строка есть ровно в 6 логах, и в каждом есть ходы `Decart`; это переименование id
  ходов истории для openai-completions (`Handoff.java:139-144`, правило `Codecs.toolCallId`: `[A-Za-z0-9_-]`, ≤ 40), без
  потерь, аргументы не трогает. На `Decart` refusal-loop не было ни разу — признак антикоррелирован с отказом.

## Решения
- Нормализация на границе → **не вводится**. Почему: данных нет (значение отсутствует/`null`/пусто), любое восполнение —
  догадка; строковые формы, у которых одно прочтение, уже разбираются (D-347, D-373). Тексты отказов оставлены как есть:
  это настоящие отказы на отсутствующие данные. Безопасная альтернатива — обход upstream (ниже), не ядро.
- Фикстура «красная сегодня» → **не написана**. Почему: точной записанной формы нет, а все совместимые с отказами формы
  ядро отказывает правильно — зелёная фикстура ничего не воспроизводила бы, красную можно получить только выдумав форму.
- Исключение `InferenceNet` из маршрутов `z-ai/*` → **не сделано, предложено**. Прецедент — D-362 (`Together`):
  `eval-live/.../StudioAttempt.kt:80` `OPENROUTER_UPSTREAM_IGNORES` и Studio `AutoProfiles`. Решение о маршрутизации и смене
  условий стенда — за оркестратором/владельцем, после живого подтверждения.

## Тесты
- Код не менялся → L1/L2 не запускались (проверять нечего). Циклов «правка → тест»: 0.
- Доказательная база — разбор `C:\work.astrolab\bench\d5a` (result.json, events.jsonl, логи) скриптами в scratch и чтение кода
  SDK/адаптера/ядра; живых прогонов не было.

## Отклонения от карточки
- П. 1: сырые аргументы в записях стенда отсутствуют — форма восстановлена из текстов отказов, порядка декодирования и
  самоотчёта модели, источник — по `facts.upstream`.
- П. 2–3: фикстуры и правки нет — потеря не на нашей стороне, безопасной нормализации нет (п. 4 карточки). Коммитов и push нет:
  ветка `v2/GLM` = `main`, сливать нечего.

## Хвосты и риски
- **Подтвердить вживую (центы):** один GLM-таск D5 (`api-currency` default ×2) с `--keep-workspaces`, затем
  `select body from journal where kind='Call'` в `state.sqlite` — сырой `argsJson` отказанного вызова; либо зонд
  `GlmToolCallProbeTest`/`or_raw_capture.py` с `provider.order=["InferenceNet"]` против `["Decart"]` (сырые SSE-кадры).
- После подтверждения — `InferenceNet` в `OPENROUTER_UPSTREAM_IGNORES["z-ai/"]` и в Studio (как D-362), иначе GLM-класс в
  D5 меряет парсер upstream, а не ядро.
- Стенд: `eval-live` мог бы сохранять `state.sqlite` прогона, закончившегося `blocked_external` (сейчас — только по
  `--keep-workspaces`), чтобы следующий скрининг мог цитировать сырые аргументы.
- Латентный риск SDK (не этот отказ): `CompletionsCodec.java:369` `optString("arguments")` молча отбрасывает дельту, где
  upstream прислал `arguments` объектом, а не строкой — весь вызов остался бы без аргументов (проявилось бы как
  отсутствие `op`). SDK вне моей зоны записи.

Статус: ГОТОВО К СЛИЯНИЮ (вердикт без кода: причина — upstream `InferenceNet`, безопасной нормализации нет; ветка без новых коммитов, сливать нечего) · последний коммит ветки `8e4e428`

## GLM2 — маршрутизация и живое подтверждение

### Сделано (ветки `v2/GLM` ядра и Studio от `main`; ядро — после `git merge main`, т. е. от `3c7dacf`)
- **InferenceNet обходится для `z-ai/*` (как D-362 для Together).** eval-live
  `eval-live/src/main/kotlin/io/astrolabe/evallive/StudioAttempt.kt:80` и Studio
  `ASTROUI/backend/bridge/src/main/kotlin/io/astrolabe/studio/bridge/AutoProfiles.kt:35`:
  `OPENROUTER_UPSTREAM_IGNORES["z-ai/"] = [Together, InferenceNet]`; тест Studio `UpstreamRoutingTest` ожидает
  `"ignore":["Together","InferenceNet"]` (тест обновлён, потому что изменён сам список; второй тест не тронут).
  В тестах eval-live список не утверждается — новых тестов не писал.
- **Хвост GLM: store прогона `blocked_external` сохраняется** (`eval-live/.../Bench.kt:148,306,310-316`, +9 строк):
  без `--keep-workspaces` прогон с исходом `blocked_external` оставляет `<run>/state` (там `state.sqlite` с журналом,
  где лежат сырые `argsJson` отказанных вызовов), остальное (`workspace`, `base.index`) удаляется; путь печатается в лог.

### Живое подтверждение (`bench/glm2`, `api-currency`, auto, `--repeats 2 --seed 1 --keep-workspaces`; 2 прогона, $0.048)
| прогон | исход | приёмка | ходов | upstream (`facts.upstream`, ходы) | refusal loop |
|---|---|---|---|---|---|
| r2 | `waiting_for_input` | не прошла | 29 | Decart 24, Morph 5 | 0 |
| r1 | `completed` | прошла | 21 | Decart 14, Modal 4, GMICloud 3 | 0 |
- `InferenceNet` не встретился ни разу (0/50 ходов против 82 % ходов в D5) — маршрут работает. Гейт `refusal-loop`
  не срабатывал ни разу (в событиях гейты только `entry/exit/impact/register/repeated-failure/stall`).
- r2 — другой класс отказа, не refusal loop: plan-ячейка закончилась `blocked` — модель в роли plan пыталась
  `edit.anchored` и W-команду (обе корректно отказаны ролью), затем 5 срабатываний `stall`; план зарегистрирован, исход
  `waiting_for_input` (в auto-режиме продолжения нет). Это поведение модели/роли, к upstream-потере не относится.
- Сырые `argsJson` цитировать не пришлось: отказанных схемой вызовов с отсутствующими вложенными значениями не было.
  Каталоги прогонов сохранены: `%TEMP%\eval-live\run-6038300056398238420` (r2), `run-4957471683584955383` (r1).

### Решения
- Обход upstream вместо нормализации в ядре → как в вердикте GLM: данных для восстановления нет. Безопасная альтернатива —
  убрать `InferenceNet` из списка, если OpenRouter исправит парсер (проверка — один прогон с `provider.order=["InferenceNet"]`).
- Хранение store только для `blocked_external` (не для всех неудач) → минимальный объём диска; refusal loop в стенде
  кончается именно так. Безопасная альтернатива — `--keep-workspaces`.

### Тесты
- `./gradlew :eval-live:test -Pastrolabe.aiGateBuild=…` — 17 классов, 50 тестов, 0 падений, 1 пропуск (XML).
- Studio: `./gradlew :backend:bridge:test --tests 'io.astrolabe.studio.bridge.UpstreamRoutingTest' -Pstudio.astrolabeBuild=…/studio-core -Pastrolabe.aiGateBuild=…` — 2/2.
- Циклов «правка → тест»: 1. Набор WF не запускался: ядро (`core`) не тронуто, правки только в eval-live и Studio bridge.

### Отклонения от карточки
- Нет. Путь задачи Studio — `:backend:bridge`, не `:bridge`.

### Хвосты и риски
- Новый тест на сохранение store `blocked_external` не написан (хвост ≤ 30 строк ограничивал правку; проверено только
  компиляцией и тестами eval-live). Живой прогон его не задел — `blocked_external` не случилось.
- r2: plan-роль пытается редактировать в auto-режиме и стопорится (`stall` ×5) — кандидат для отдельного разбора D5.

Статус: ГОТОВО К СЛИЯНИЮ · последние коммиты: ядро `v2/GLM` `d9cab0d`, Studio `v2/GLM` `64849be`
