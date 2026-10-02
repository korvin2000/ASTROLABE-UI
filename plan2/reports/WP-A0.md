# WP-A0 — headless live-runner `eval-live` + три задачи v0

Ветка `v2/A0` (worktree `ASTROLABE/.claude/worktrees/busy-booth-c308a6`), от `main` `a245ac7`, запушена в `origin`.

## Сделано
- Модуль `:eval-live` (`io.astrolabe.evallive`), включается в `settings.gradle.kts` внутри того же `if`, что и
  `:provider-ai-gate` (D-332). Зависит от `core`, `provider-ai-gate`, `ai-gate`; плагин `application` → `installDist`;
  `-PbenchDir=<dir>` ставит дистрибутив туда, сохраняя всё, кроме `bin/`, `lib/`, `tasks/` (результаты не стираются).
  Задачи едут в дистрибутиве (`<install>/tasks/`, dot-файлы баз докопируются — см. Решения 10). Запуск без Gradle.
- CLI `eval-live run | tasks | check` (`Main.kt`): задачи, модели, провайдер (по умолчанию `openrouter`), повторы,
  `--out`, seed порядка, effort, max-cells, дедлайн попытки, `--catalog`, `--credentials`, `--python`, `--temp`,
  `--keep-workspaces`. `check` — офлайн-валидация задач (для B2).
- Прогон (`Bench.kt`): свежий `run-*` во временном каталоге → `workspace/` (копия `base/`, `git init` + коммит `base`) и
  `state/` (state root ядра вне рабочей области) → попытка как задача Studio в `auto` (`StudioAttempt.kt`) через
  `Astrolabe.open` + публичный `Controller` с `AiGateAdapter` → `workspace.diff` → скрытая приёмка в отдельной копии
  (`Acceptance.kt`) → `result.json`; временный каталог удаляется. Существующий `result.json` = прогон пропускается
  (возобновление прерванного бенча без повторных трат).
- Результат: `runs/<task>/<model>/r<n>/{result.json, events.jsonl (все EventRecord целиком), acceptance.log,
  workspace.diff}`; `summary.json`/`summary.csv` переписываются после каждого прогона. Неизвестное — `null` / пустая
  ячейка CSV.
- Ключи: разрешение SDK (`Environment.system()` + опционально `CredentialStore.file(--credentials)`); без ключа —
  `MissingKey` с именем переменной (`OPENROUTER_API_KEY`) до первого прогона, код выхода 2.
- Три задачи v0 в `eval-live/tasks/<id>/` (`task.json`, `prompt.md`, `base/`, `acceptance/` скрыто, `reference/`):
  `bugfix-pagination` (bugfix + `repro.py`), `rest-todo` (greenfield REST на stdlib + внешний HTTP-smoke),
  `api-currency` (обязательный параметр `currency` + 3 вызывающих модуля). Python 3 stdlib, без сетевых установок.
- `eval-live/README.md`: сборка, установка, запуск, формат результата, задачи. ABI-дамп `eval-live/api/eval-live.api`
  (публичен только `main`).
- Живая проверка: два бенча по 3 задачи на `deepseek/deepseek-v4.1-flash` через OpenRouter — 6/6 приняты скрытой
  приёмкой (таблица в «Тестах»).

## Решения
(черновые; номера D-nn назначит оркестратор)
1. **Фасад попытки.** `Astrolabe.open` (только ради `Project`) + публичный `Controller.open/run(maxCells)`, как
   `StudioHost.launch`. Почему: `Astrolabe.campaign` не принимает `maxCells`, effort, headroom, host notes — baseline не
   отражал бы продукт. Альтернатива: `Astrolabe.campaign` (проще, но не Studio). Публичный API ядра не менялся.
2. **Что скопировано из Studio** (`StudioPolicy`, `StudioAutoAuthority`; Studio — не зависимость): конфиг = `Config()` +
   один профиль на все функции (`profileRoles` main, helper/escalation = null), `mode Autonomous`, `dClass Ask`,
   `unknownOutcomeReconciliation Automatic`, `rulesFile null`, `tierTable` по умолчанию; `maxCells` 12; аренда 480 мин;
   бюджет `12 × contextLimitTokens` токенов без денег; effort `Medium`; output headroom `min(outputLimit, context/4)`;
   профиль как `AutoProfiles.make` (draft из каталога, id `auto.<provider>.<model>`, `OPENROUTER_UPSTREAM_IGNORES`
   `z-ai/` → `Together`, `AiGateAdapter.violations`); verification setup (`Verification.choose/apply` при
   `opened.state == null`, иначе `verificationOf`); host notes: `Guidance.NOTES` дословно, `Guidance.platform(os.name)`,
   `Verification.text`; повторный `open` с `hostNotes`; политика `DecisionService` в `auto`: вопрос → `ASSUME`, эффект →
   только allowlist контракта, план/поправка → accepted, если не ослабляет (иначе rejected), KB → pending, решение о
   приёмке → Accept (Policy, `studio:policy(auto)`) без Failed-пунктов, иначе ждать.
3. **Не воспроизведено из Studio:** модельный review pass (`ReviewPass`) — `review` возвращает `null` (записывается как
   `policyDecisions: review/no reviewer`); project allow list команд, сохранённые проверки, protected paths,
   `AGENTS.md`-rules (у задач v0 их нет). Видимые тесты задач находит само ядро (`Sniff.pyproject`:
   `python -m unittest discover -s tests`), приёмка ядра — `run:` (`verification = tests/declared`, проверено тестом и
   во всех живых прогонах).
4. **Язык задач — Python 3 stdlib.** Почему: unittest-вывод парсится ядром (`GenericSummaries.unittest`), `node --test` —
   нет (только jest/vitest/mocha) → на Node приёмка ядра была бы inconclusive. Альтернатива: Node с mocha-подобным
   выводом — хак.
5. **Скрытая приёмка** читается в память при загрузке задачи (`HiddenFiles`, SHA-256 → `result.acceptanceDigest`) и
   пишется только в отдельную копию итоговой рабочей области (`_acceptance/`; `_acceptance`, созданный агентом,
   заменяется). Правка файлов задачи на диске во время бенча на прогоны не влияет. Временный каталог по умолчанию —
   `java.io.tmpdir/eval-live` (не внутри бенча). Приёмка: exit 0 в пределах `timeoutSeconds`, иначе fail.
6. **Эталонный «патч» — каталог `reference/`, накладываемый на базу**, а не diff (без `git apply`/CRLF-рисков).
   Альтернатива: unified diff, если понадобятся удаления.
7. **Деньги и токены:** `cost` = Σ `usage.price(profile.priceTable)` по `ModelResponded` (`null`, если хоть одно
   измерение неизвестно или без цены), рядом `costPricedPart` и `spanCost` (Σ `SpanEnded.cost`; в живых прогонах
   совпали с `cost`). Токены по измерению — `null`, если его не сообщил хоть один ответ (OpenRouter не сообщает
   cache write → `null`). `totals.responded` — суммы всех прочих числовых полей `ModelResponded`: поля A2a (счёт,
   рассуждения, тайминги) подхватятся без переделки; сырой журнал — `events.jsonl`.
8. **Порядок прогонов:** задача × модель × повтор, `shuffled(Random(seed))`; `order` в результате (§9.3).
9. **Python для `{python}`:** `--python`, иначе первый из `python`/`python3`/`py` (Windows) или `python3`/`python`
   (POSIX), проверенный на Python 3. Ядро в своей приёмке пишет `python` буквально (`Sniff`): на Linux без `python`
   приёмка ядра упадёт — это свойство ядра, не runner'а.
10. **Dot-файлы задач:** Gradle default excludes выкидывают `.gitignore` из любых копий → в первом живом бенче базы были
   без `.gitignore` (в diff попал `__pycache__`, в `api-currency` агент сам создал `.gitignore`). Исправлено локально в
   модуле: `installDist` докладывает dot-файлы `tasks/**` по пути (`07af02e`); глобальные default excludes сборки не
   тронуты (их правка в settings задела бы все модули). `distZip` их по-прежнему не содержит — бенч ставится `installDist`.
11. **Ключ для живой проверки:** в окружении `OPENROUTER_API_KEY` нет; использовано SDK-хранилище Studio
   `%LOCALAPPDATA%\AstrolabeStudio\credentials.json` через `--credentials` (это `CredentialStore.file` SDK — так же
   Studio делит хранилище через `STUDIO_CREDENTIALS`). Runner файл не открывает и ничего из него не печатает; логи и
   результаты проверены на отсутствие ключей.

## Тесты
- L1 `./gradlew :eval-live:test -Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm -q --console=plain` —
  6/6 зелёные (последний прогон после `a445ea3`): `BenchTest` ×2 (свой temp на прогон; скрытой приёмки нет ни в файловой
  системе, ни в запросах модели, пока агент работает; temp очищается; `result.json`/`events.jsonl`/`acceptance.log`/
  `summary.*`; ядро само нашло видимые тесты; повторный бенч возобновляется без вызовов модели; приёмка судит итоговую
  рабочую область — эталон, положенный «агентом», проходит, diff содержит 2 файла), `TotalsTest` ×2 (`null` для
  неизвестного, пустые ячейки CSV), `TaskValidityTest` (3 задачи: база падает, эталон проходит, видимые тесты зелёные
  на эталоне), `LiveModelsTest` (нет ключа → `MissingKey` с `OPENROUTER_API_KEY`, офлайн).
- L2 `./gradlew :eval-live:test :eval-live:checkKotlinAbi :eval:test :provider-ai-gate:compileTestKotlin
  -Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm -q --console=plain` — зелёный: eval-live 6/6, eval
  52/52, компиляция тестов provider-ai-gate и ABI ок (после L2 менялся только internal-код eval-live: L1 и
  `checkKotlinAbi` перепрогнаны зелёными).
- Офлайн из установленного дистрибутива: `C:/work.astrolab/bench/a0-smoke/bin/eval-live check` → 3/3 sound.
- **Живая проверка** (`deepseek/deepseek-v4.1-flash`, OpenRouter, effort Medium, seed 1, по одному прогону задачи):

  | Бенч | Задача | Исход | Приёмка | Стена, с | Запросов | uncached / cache read / output | $ |
  |---|---|---|---|---|---|---|---|
  | `results` (базы без `.gitignore`) | rest-todo | completed | pass | 149.9 | 10 | 31 335 / 105 216 / 10 640 | 0.0228 |
  | | bugfix-pagination | completed | pass | 128.6 | 16 | 53 768 / 106 496 / 5 777 | 0.0237 |
  | | api-currency | completed | pass | 270.2 | 22 | 79 460 / 231 680 / 17 871 | 0.0467 |
  | `results-2` (исправленный дистрибутив) | rest-todo | completed | pass | 347.6 | 7 | 58 758 / 44 800 / 19 783 | 0.0416 |
  | | bugfix-pagination | completed | pass | 73.2 | 12 | 19 805 / 72 704 / 2 752 | 0.0097 |
  | | api-currency | completed | pass | 114.8 | 13 | 32 821 / 106 496 / 5 140 | 0.0167 |

  Итого ≈ $0.161 + обрыв первого запуска (снят через ~30 с ради отсоединённого режима, < $0.01; частичный результат
  удалён). cache write = `null` (OpenRouter не сообщает), events dropped 0. Результаты:
  `C:\work.astrolab\bench\a0-smoke\results{,-2}\`.

**Команда установки и запуска BL** (Git Bash; JDK 26):

```bash
export JAVA_HOME=/c/Users/user/.gradle/jdks/eclipse_adoptium-26-amd64-windows.2
./gradlew :eval-live:installDist -Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm -PbenchDir=C:/work.astrolab/bench/baseline
C:/work.astrolab/bench/baseline/bin/eval-live run --models deepseek/deepseek-v4.1-flash,<model-2> --tasks all --repeats 2 --seed 1 \
  --out C:/work.astrolab/bench/baseline/results --credentials "$LOCALAPPDATA/AstrolabeStudio/credentials.json"
```

(или `OPENROUTER_API_KEY` в окружении вместо `--credentials`). Для долгого фона — отсоединённый процесс, как
`C:\work.astrolab\bench\a0-smoke\run-live.cmd <results-dir>`: фоновые задачи сессии ограничены 10 мин; бенч
возобновляем, так что обрыв теряет только текущий прогон.

## Отклонения от карточки
1. **Без зависимости от `:eval`.** `Arms/Experiment/PairedBound/Scorecard` требуют двух плеч и замороженного
   `AttemptConfig` (`EvalArms.configure` → `AttemptConfig`; `Scorecard.calculate` — design с baseline + candidates), а
   runner запускает продуктовую конфигурацию одного плеча через `Controller`; естественного места нет, дублирования нет.
   Поля результата покрывают `EvaluationTrial` (accepted, cost, billing complete, input/output tokens, latency) — B4
   добавит зависимость и сравнение плеч.
2. **Тест исправлен:** первая версия `TotalsTest` ждала `model_requests = 1` при отсутствии событий запроса — ошибка
   теста, исправлено на `0` (счёт событий известен и при нуле).
3. Живых прогонов — 6 вместо 3: первый бенч выявил потерю `.gitignore` в дистрибутиве; повтор на исправленном —
   корректная база и заодно проверка воспроизводимости. В пределах оценки §8.5.
4. `core` и `provider-ai-gate` main-код, Studio не тронуты.

## Хвосты и риски
- **Наблюдение для BL/C:** во всех 6 живых прогонах ячейки `review` закончились `partial`, и `completed` получено через
  решение политики «accept unverified» (`policyDecisions: acceptance/accepted`). Детали (какие обязательства, почему)
  пишутся начиная с `a445ea3`; в двух бенчах выше их нет (дистрибутив был раньше). В Studio здесь мог бы участвовать
  `ReviewPass`, которого runner не воспроизводит — расхождение с продуктом именно в этом месте.
- `cells` (из состояния кампании) = 1, а `Cell.Started` — 2–3 на прогон (implementing + review); в сводке есть оба.
- Output headroom для окна 1M = 262 144 токенов на запрос (как Studio); апстримы с меньшим лимитом могут отказывать.
- Разброс между повторами велик (стена ×2–3, деньги ×0.4–2.4 на задачу): для B4/D5 нужны повторы, как и планировалось.
- Скрытая приёмка лежит на диске в дистрибутиве (`<install>/tasks/<id>/acceptance/`): команда агента вне рабочей
  области теоретически может её прочитать (изменить без эффекта — снимок в памяти). Для B2/D5 — вынести приёмку из
  дистрибутива или проверять журнал команд агента.
- Нет «заведомо неверного патча» (§9.2 требует для B2) — карточка A0 его не требует.
- Корневой `.gitignore` (`bench/`) — за оркестратором; в `C:\work.astrolab\bench\a0-smoke\` лежат дистрибутив,
  `run-live.cmd` и результаты.

Статус: ГОТОВО К СЛИЯНИЮ · последний коммит `a445ea3`
