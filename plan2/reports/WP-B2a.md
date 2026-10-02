# WP-B2a — runner + `interrupt-csv` + `env-launcher` + `wrong/` для v0

Ветка `v2/B2a` (worktree ядра, от `main` = `97ce447`), запушена. Ядро (`core/`), `provider-ai-gate`, TODO/handoff не тронуты.

## Сделано
1. **`wrong/` в самопроверке** — `Acceptance.validate` (`eval-live/src/main/kotlin/io/astrolabe/evallive/Acceptance.kt:51`)
   прогоняет приёмку на базе, база+`wrong/`, база+`reference/` и видимые тесты на эталоне; `TaskValidity.sound`
   (`Acceptance.kt:86`) требует: база падает, wrong падает, эталон проходит, видимые зелёные. `eval-live check` печатает
   три кода выхода. Задача без `wrong/` (или с пустой частью) — ошибка загрузки (`Tasks.kt:52`, `BenchTask.load`).
2. **Скрытое вне дистрибутива** — задача Gradle `hiddenJar` (`eval-live/build.gradle.kts:37`) пишет
   `build/hidden/eval-live-hidden.jar`: ресурсы `evallive/hidden/<task>/<part>/<path>` + индекс `evallive/hidden/index`;
   jar подключён `runtimeOnly(files(hiddenJar))` → попадает в `lib/` дистрибутива и в тестовый classpath. Дистрибутив
   исключает `*/acceptance/**`, `*/reference/**`, `*/wrong/**` (и в догрузке dot-файлов). Загрузчик: `HiddenBundle`
   (`Tasks.kt:120`) читает через classloader; если у каталога задачи есть открытые скрытые части (исходное дерево,
   `--tasks-dir`) — читаются они, всё или ничего (без смешения). Исходное дерево `eval-live/tasks/` не менялось
   (кроме новых задач и `wrong/`). Проверено: `installDist -PbenchDir=<scratch>` → в `tasks/<id>/` только `task.json`,
   `prompt.md`, `base/`; `lib/eval-live-hidden.jar` (25 записей); `bin/eval-live check` из установки → 5/5 sound.
3. **Утечка пути через окружение** — выяснено: **не утекает**. `eval-live.bat` делает `set APP_HOME=…`,
   `set CLASSPATH=…` (JVM их наследует; unix-скрипт не экспортирует), но процессы агента (`run`, `verify`, transforms,
   baseline) ядро запускает с `EnvPolicy` (`core/.../os/Os.kt:158`: «The child never inherits the parent environment
   implicitly»; `LocalOs.resolveEnvironment` — essentials платформы + `inheritedNames`), где `inheritedNames =
   config.redaction.envAllowlist` (`tool/run/Run.kt:231`, `verify/Checker.kt:184`, `Controller.kt:1863`).
   `DEFAULT_ENV_ALLOWLIST` (`auth/Redaction.kt:69`) не содержит ни одной переменной скриптов. Тест
   `EnvironmentTest` фиксирует: allowlist `StudioPolicy.config` не пересекается с `APP_HOME, APP_BASE_NAME, DIRNAME,
   CLASSPATH, JAVA_OPTS, EVAL_LIVE_OPTS, DEFAULT_JVM_OPTS, JAVA_EXE, CMD_LINE_ARGS`. Правки runner/скрипта не нужны.
4. **Сценарий `interrupt`** — `InterruptSpec` в `task.json` (`Tasks.kt:29`). `Interrupter` (`StudioAttempt.kt:309`)
   подписан на шину попытки и после K-го `cell.model_responded` вызывает `campaign.cancellation.cancel("stopped by the
   user")` (причина Studio `TaskService.stop`); попытка дожидается исхода. Затем `Bench.segment` (`Bench.kt:199`)
   запускает второй отрезок в той же рабочей области и state root: новый WorkId, запрос = `StudioPolicy.recap`
   (`StudioAttempt.kt:185`, копия `TaskService.recap`) + текст ограничения. Агент закончил раньше K → то же (режим
   `followUp`). `result.json.interrupt` = `{afterResponses, constraint, mode: cancelResume|followUp|null, atResponse,
   segments[{workId, outcome, stopCode, reason, failure, cells, attemptWallMillis, totals}]}` (`Results.kt:66–100`);
   поля прогона — по последнему отрезку (outcome/ids) и суммы (cells, wall, totals по всем событиям, policyDecisions
   конкатенацией); `summary.csv` + колонка `interrupt_mode` в конце. Тесты на поддельном провайдере: `BenchTest`
   «stopped after K responses… follow-up» (K=3: режим cancelResume, atResponse 3, первый отрезок `cancelled`,
   ≥3 ответов, новый WorkId, запрос второго содержит recap «Outcome: stopped by the user before it finished.» и
   ограничение, totals = сумма отрезков, result.json/csv) и «ends before K… follow-up» (режим followUp).
   **Публичный API ядра не менялся** — критерий отказа не сработал.
5. **`wrong/` для v0**: `bugfix-pagination` — `page_count = total // per_page + 1` (23→3 верно; 0→1 и 20→3 сломаны);
   `api-currency` — новый `format_amount(cents, currency)` + invoice/report, `receipt.py` остался на старом вызове;
   `rest-todo` — «идемпотентный» `DELETE`: неизвестный id → 204 вместо 404.
6. **`interrupt-csv`** (класс `interrupt`): пакет `reports/` (weekly, export, daily), `export_rows(rows, path)`
   используется ночным `export_daily`; `display_rows` даёт US-даты (ловушка). Запрос — `export_weekly(report, path)`,
   заголовок `date, category, amount`, ISO-даты, суммы `15.50`. `interrupt`: K = 3, ограничение «`;`, публичную
   `export_rows` не менять». Приёмка: заголовок `date;category;amount`, строки через `;` (csv.reader), ISO, без запятых;
   `inspect.signature(export_rows) == (rows, path)`, вывод `export_rows` и `export_daily` побайтно прежний.
   `wrong/` — запятая через `export_rows`. Эталон — `csv.writer(delimiter=";")` + тест.
7. **`env-launcher`** (класс `environment`): `dev.py test` вызывает `python3` и всегда возвращает 0. Приёмка создаёт
   свежий venv (`--without-pip`, ~15 мс), `PATH` = пустой каталог, кладёт в `tests/` свою пробу (пишет `sys.prefix`) и
   запускает `<venv python> dev.py test`: код 0 и проба с префиксом venv; затем добавляет намеренно красный тест: код ≠ 0
   и проба снова из venv. `wrong/` — `python` (+ проброс кода возврата). Эталон — `sys.executable` + код возврата.
8. **README** (`eval-live/README.md`): упаковка скрытых частей, `check` (4 условия, коды), окружение, формат
   (`wrong/`, `interrupt`, результат `interrupt`), таблица задач с описанием `wrong/`.

### Самопроверка (Windows, `bin/eval-live check` из установленного дистрибутива; код выхода приёмки)
| задача | база | wrong | эталон | видимые на эталоне | причина падения wrong |
|---|---|---|---|---|---|
| `api-currency` | 1 | 1 | 0 | green | `TypeError: format_amount() missing … 'currency'` (receipt) |
| `bugfix-pagination` | 1 | 1 | 0 | green | `page_count(20,10)`: 3 ≠ 2; страница за концом не отвергнута |
| `rest-todo` | 1 | 1 | 0 | green | `DELETE /todos/2`: 204 ≠ 404 |
| `interrupt-csv` | 1 | 1 | 0 | green | `'date,category,amount' != 'date;category;amount'` |
| `env-launcher` | 1 | 1 | 0 | green | тесты прошли интерпретатором `C:\Python314`, а не venv, запустившим `dev.py` |
База: `api-currency`/`bugfix-pagination`/`rest-todo` — как в A0; `interrupt-csv` — нет `export_weekly`;
`env-launcher` — `FileNotFoundError` (`python3`) → код 1 на зелёных тестах.

## Решения
- **Продолжение после отмены** → follow-up Studio (новый WorkId в том же workspace/state, запрос = recap + текст),
  а не `amend` + resume той же кампании. Почему: в коде Studio сообщение после стопа (`TaskService.message`, ~650–660)
  идёт в `followUp`, т.к. `cancelled` не входит в `resumable` (`waiting_for_input|waiting_for_process|blocked_external`);
  `continueRun` с `amend` — только для `paused`; в ядре `cancelled` финален (R-CMP-06). Безопасная альтернатива:
  `amend` через `Contracts.amendByUser` + повторный `controller.open` того же WorkId — расходилось бы с продуктом.
- **Recap без «последнего отчёта агента»**: Studio берёт его из своего `event_log` (`journal.call`), у runner его нет
  без API ядра; Studio сама опускает строку, когда текста нет. Метка `completed` приближена: «accepted by the auto
  policy» при решении политики `acceptance accepted`, иначе «no passing check recorded» (Studio читает finish receipt).
  Влияет только на режим `followUp`. Альтернатива: читать журнал из store проекта (нужен API ядра).
- **Счёт K** — `ModelResponded` с seq > момента подписки (после `open`, до `controller.run`); доставка асинхронна,
  поэтому ответ уже летящего вызова может прийти после отмены: `atResponse` = K, фактическое число — в `segments[0].totals`.
- **Отрезок 1 упал** (исключение харнесса или `failure` попытки) → второго нет, `mode = null`. Дедлайн и `maxCells` —
  на каждый отрезок, как у каждого запуска в Studio.
- **Пакет скрытых частей** — свой zip (не `Jar`), чтобы не терять dot-файлы (default excludes Gradle) и иметь
  воспроизводимые записи (фиксированное время), плюс индекс (листинг каталогов через classloader ненадёжен).
  Источник частей — всё из каталогов или всё из пакета.
- **env-launcher через venv**: на Windows `CreateProcess` ищет `python` в каталоге запущенного интерпретатора
  независимо от `PATH` (проверено: при пустом `PATH` `subprocess.call(['python', …])` → `C:\Python314`), поэтому
  «пустой PATH» карточки на Windows не отличает `python` от `sys.executable`. Из venv дочерний `python` — базовая
  установка (другой `sys.prefix`), `sys.executable` — venv; проба фиксирует `sys.prefix`. На Linux `python3`/`python` при
  пустом `PATH` просто не находятся.
- **`wrong/` env-launcher** также пробрасывает код возврата: так приёмка обязана поймать именно ошибку интерпретатора
  (сильнее, чем карточный минимум «`python3` → `python`»).
- **Схема `result.json`** осталась 1: `interrupt` — необязательное поле с умолчанием `null`, старые результаты (BL)
  читаются; колонка CSV добавлена в конец.
- **`TaskValidityTest`** проверяет `containsAll` пяти задач этой линии, а не точный список, — задачи B2b после слияния
  проверяются тем же циклом без правки теста.

## Тесты
- L1 (после каждого цикла): `./gradlew :eval-live:test -Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm -q --console=plain` — зелёный.
- L2 (в конце): `./gradlew :eval-live:test --rerun :eval:compileTestKotlin -Pastrolabe.aiGateBuild=… -q --console=plain` —
  exit 0; `eval-live`: 13 тестов, 0 падений, 0 пропусков (BenchTest 4, TaskValidityTest 3, EnvironmentTest 1,
  TotalsTest 4, LiveModelsTest 1).
- Установка и проверка дистрибутива: `./gradlew :eval-live:installDist -Pastrolabe.aiGateBuild=… -PbenchDir=<scratch>/bench`;
  `<scratch>/bench/bin/eval-live check --temp <scratch>/chk` → `5/5 task(s) sound`, exit 0 (коды в таблице выше);
  в `tasks/` нет `acceptance/`, `reference/`, `wrong/`, `accept*.py`, `smoke.py`.
- Причины падения проверены вручную (скрипт в scratch: копия base [+часть] + `_acceptance/`) — см. таблицу.
- Живые прогоны не делались. Полный `build` и `:core:test` не запускались.

## Отклонения от карточки
- П.4: продолжение — follow-up Studio, а не `amend` + resume (см. «Решения»: код Studio и R-CMP-06). Режимы названы
  по карточке: `cancelResume` = остановлен на K-м ответе и продолжен, `followUp` = агент закончил раньше K.
- П.7: «PATH без python/python3» реализован через venv + пробу `sys.prefix`, т.к. на Windows поиск по каталогу
  приложения обходит `PATH`; `wrong/` дополнительно пробрасывает код возврата.
- П.3: правка runner/скрипта не потребовалась — ядро уже не передаёт окружение; доказательство — тест + ссылки выше.

## Хвосты и риски
- Скрытые части лежат в `lib/eval-live-hidden.jar` — не открытыми файлами, но на диске; агент, нашедший каталог
  бенча (например обходом диска) и распаковавший jar, их прочтёт. Путь к бенчу через окружение агенту не передаётся;
  `TEMP` указывает на системный temp, где лежит `eval-live/run-*` (только workspace/state текущего прогона; копии
  приёмки создаются после попытки).
- Linux локально не проверялся: задачи без OS-специфики (`os.path`, без `shell=True`, venv с symlinks на POSIX), runner
  кроссплатформенный; подтвердит CI/B4.
- `TaskValidityTest` выполняет все задачи (≈9 с сейчас); с задачами B2b дольше.
- Отмена приходит асинхронно: при живом провайдере первый отрезок может содержать K+1 ответ (отменённый вызов
  учтён в totals как `ModelResponded` со стопом `Cancelled`).
- Recap без последнего отчёта агента может немного отличаться от продукта (см. «Решения»).
- README перечисляет только задачи этой линии; строки задач B2b добавит оркестратор/B2b при слиянии.

Статус: ГОТОВО К СЛИЯНИЮ — последний коммит ветки `v2/B2a`: `fd346c7`
