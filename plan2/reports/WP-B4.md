# WP-B4 — baseline против волны A на screening-наборе

## Сборка
Дата: 2026-10-02. JDK 26 (`eclipse_adoptium-26-amd64-windows.2`), Git Bash. Тесты и полный build не запускались.

| плечо | worktree | ядро | eval-live | SDK | дистрибутив |
|---|---|---|---|---|---|
| `base` | `ASTROLABE/.claude/worktrees/b4-base` (ветка `v2/B4`, запушена) | `v2/BL` = `eada1c0` (`a245ac7` + A2a + A0, как BL) + `00ff898` (прослойка) | `main` `940ef5a` + 1 строка | `fdbd733` (`main`) | `bench/b4-2026-10-02/base` |
| `waveA` | `ASTROLABE/.claude/worktrees/b4-waveA` (detached) | `v2-wave-A` = `4bb181b` | `main` `940ef5a`, без изменений (staged, не закоммичено) | `fdbd733` (`main`) | `bench/b4-2026-10-02/waveA` |

- `eval-live/` в обоих worktree заменён деревом `940ef5a` (`git checkout 940ef5a -- eval-live`); лишних файлов
  вне дерева `main` не осталось. `settings.gradle.kts`, `build.gradle.kts`, `gradle/`, `build-logic/` совпадают с `main`
  у обоих коммитов ядра — не трогались.
- SDK: оба плеча собраны с `llm-transport-sdk` `fdbd733`; `base` с ним собирается, worktree SDK на `dba7ab7` не понадобился.
  Отличие от BL: BL шёл на SDK `dba7ab7`; здесь оба плеча на одном SDK, так что пара сопоставима.
- **Единственное отличие харнесса** (`v2/B4` `00ff898`, только плечо `base`): `eval-live/src/main/kotlin/io/astrolabe/evallive/Recorder.kt:125`
  `modelFailures = responded.count { it.failure != null }` → `modelFailures = 0`. Причина: в ядре `v2/BL` у
  `AgentEvent.Cell.ModelResponded` нет поля `failure` (добавлено волной A, D-387) — без правки `:eval-live:compileKotlin`
  падает (`Unresolved reference 'failure'`). Других ошибок компиляции не было. Следствие: в `base` `totals.modelFailures`
  всегда 0, и неуспешные/отменённые вызовы вообще не дают `ModelResponded` (их usage не входит в totals) — известная асимметрия
  D-387; в `waveA` они считаются. StudioPolicy, totals (кроме этого поля), приёмка — один и тот же исходный код.
  `eval-live/src/test/.../TotalsTest.kt` в `base` не скомпилируется (использует `failure`) — тесты не запускались и для B4 не нужны.
- Сверка исходников (sha256 по отсортированному списку файлов, первые 16 знаков):
  `eval-live/tasks` — `8952eaeb23b7af89` в обоих; `eval-live/src` — `9c14dde5…` (base) / `2560fa83…` (waveA), без `Recorder.kt` —
  `f990dba67ceecfed` в обоих; `diff -r` src = только строка 125 `Recorder.kt`.
- Сверка дистрибутивов: имена `lib/` совпадают; `lib/eval-live-hidden.jar` (`61eeaf27d0cdcfab`), `bin/eval-live` и дерево
  `tasks/` (`1745426b3ce6c551`) байт-в-байт одинаковы. `lib/eval-live-0.1.0-SNAPSHOT.jar` различается в классах
  `Totals$Companion*` (прослойка) и `RunResult*` (байткод `javap -c -p` идентичен — разница в метаданных из-за компиляции против
  другого ядра). `core`, `provider-api`, `provider-ai-gate` jar — различаются (код под тестом).
- `tasks/<id>/` в обоих дистрибутивах содержит только `task.json`, `prompt.md`, `base/` (скрытые части — в `eval-live-hidden.jar`).
- `eval-live tasks` — одинаковый список в обоих (8): api-currency, bugfix-pagination, env-launcher, interrupt-csv,
  investigate-totals, red-test, rest-todo, ui-clear-done.
- `eval-live check` (exit 0) в обоих: **8/8 task(s) sound** — по каждой задаче base fails, wrong fails, reference passes,
  visible tests on reference green.
- Запуск дистрибутива требует `JAVA_HOME` (без него `bin/eval-live` не стартует).

## Команды запуска
Ключ: `OPENROUTER_API_KEY` в окружении этой сессии **не задан**. Runner берёт ключ через разрешение SDK: переменная
`OPENROUTER_API_KEY` или файл хранилища SDK, переданный `--credentials <file>` (README/`--help` дистрибутива; runner ключ не
читает и не печатает, без ключа останавливается до первого прогона). BL запускался с
`--credentials "%LOCALAPPDATA%\AstrolabeStudio\credentials.json"` (`bench/baseline/run-bl.cmd`); файл существует
(`C:\Users\user\AppData\Local\AstrolabeStudio\credentials.json`, не читался). Команды ниже используют его; если ключ задан в
окружении, `--credentials …` можно опустить. Опции сверены с `eval-live --help` и README (`--effort Low|Medium|High`,
`--out` с готовыми прогонами продолжает bench). Лог — рядом с каталогом результатов.

Git Bash, один раз в каждой оболочке:
```bash
export JAVA_HOME=/c/Users/user/.gradle/jdks/eclipse_adoptium-26-amd64-windows.2
```
Четыре процесса (одновременно, каждый в фоне):
```bash
C:/work.astrolab/bench/b4-2026-10-02/base/bin/eval-live run --models deepseek/deepseek-v4.1-flash --out C:/work.astrolab/bench/b4-2026-10-02/base/results-deepseek --tasks all --repeats 2 --seed 7 --effort Medium --max-cells 12 --deadline-minutes 60 --credentials "$LOCALAPPDATA/AstrolabeStudio/credentials.json" > C:/work.astrolab/bench/b4-2026-10-02/base/results-deepseek.log 2>&1
C:/work.astrolab/bench/b4-2026-10-02/base/bin/eval-live run --models z-ai/glm-5.3-flash --out C:/work.astrolab/bench/b4-2026-10-02/base/results-glm --tasks all --repeats 2 --seed 7 --effort Medium --max-cells 12 --deadline-minutes 60 --credentials "$LOCALAPPDATA/AstrolabeStudio/credentials.json" > C:/work.astrolab/bench/b4-2026-10-02/base/results-glm.log 2>&1
C:/work.astrolab/bench/b4-2026-10-02/waveA/bin/eval-live run --models deepseek/deepseek-v4.1-flash --out C:/work.astrolab/bench/b4-2026-10-02/waveA/results-deepseek --tasks all --repeats 2 --seed 7 --effort Medium --max-cells 12 --deadline-minutes 60 --credentials "$LOCALAPPDATA/AstrolabeStudio/credentials.json" > C:/work.astrolab/bench/b4-2026-10-02/waveA/results-deepseek.log 2>&1
C:/work.astrolab/bench/b4-2026-10-02/waveA/bin/eval-live run --models z-ai/glm-5.3-flash --out C:/work.astrolab/bench/b4-2026-10-02/waveA/results-glm --tasks all --repeats 2 --seed 7 --effort Medium --max-cells 12 --deadline-minutes 60 --credentials "$LOCALAPPDATA/AstrolabeStudio/credentials.json" > C:/work.astrolab/bench/b4-2026-10-02/waveA/results-glm.log 2>&1
```

## Результаты (оркестратор; пересчёт и замечания Codex учтены, 2026-10-02)
Прогоны 64/64 (≈ 20:11–21:50 UTC), четыре процесса одновременно, seed 7; таблица прогонов —
`C:/work.astrolab/bench/b4-2026-10-02/analysis/runs.csv`; аудитор B1 — `analysis/audit-{base,waveA}/audit.md`.
Billed — **известные записанные счета** из `cell.model_responded` (не гарантия полноты: в `base` неуспешный вызов не даёт
`ModelResponded` — D-387; в waveA glm один ответ без usage после таймаута). Неизвестное не считается нулём.

| плечо | модель | принято (прогоны) | billed $ | wall, с | ответов | out (вкл. reas) | reas | cache % |
|---|---|---|---|---|---|---|---|---|
| base | deepseek | 16/16 | 0.0921 | 1379 | 174 | 95 332 | 46 051 | 76.7 |
| base | glm | 16/16 | 0.1226 | 2762 | 220 (+1 неуспешный без записи) | 56 368 | 21 412 | 77.0 |
| waveA | deepseek | 16/16 | 0.1111 | 2123 | 202 | 115 235 | 60 660 | 75.5 |
| waveA | glm | 14/16 | 0.1477 | 3052 | 235 (1 без usage) | 85 567 | 50 497 | 73.7 |

**Главная метрика §9.1** (сумма по всем попыткам / число принятых), waveA/base: deepseek — billed **1.21**, wall **1.54**;
glm — billed **1.38**, wall **1.26**. Волна A на этих коротких задачах не дала экономии, а по точечным оценкам дороже и дольше.

Парные отношения waveA/base по задачам (среднее геометрическое, повторы усреднены в лог-шкале; **номинальные
поисковые 95 % t-интервалы** по 8 задачам — много метрик и моделей, без подтверждающей точности; Codex воспроизвёл):
| метрика | deepseek | glm |
|---|---|---|
| billed | 1.12 [0.89; 1.42] | 0.94 [0.59; 1.49] |
| wall | **1.46 [1.12; 1.91]** | 0.80 [0.47; 1.35] |
| N | 1.12 [0.95; 1.32] | 0.97 [0.69; 1.36] |
Это геометрический эффект на прогон, не главная метрика: у glm он не означает экономию (см. выше).

**Качество, №9a.** Правило агрегации повторов (зафиксировано здесь, **после** просмотра данных — честно отмечено):
задачи-эквиваленты = Σ по задачам (принятые повторы / повторы). deepseek 8 против 8 — проходит; glm 7 против 8 —
**ровно на границе** (−12,5 п.п.; поисковый интервал по задачам [−31,9; +6,9] п.п.); при правиле «оба повтора» glm 6/8 —
не проходит, при «любой» — 8/8. Неудачи glm — разные задачи: api-currency r1 (`blocked_external`, «refusal loop: unknown
tool 'unknown'» — пустое имя инструмента от апстрима) и env-launcher r2 (решение не прошло приёмку).

**Замедление deepseek** наблюдается, причина не установлена. Медиана эффективной скорости по прогонам 179 → 89 ток/с;
суммарная задержка модели 992 → 1721 с; апстрим почти тот же (base Relace 174/174; waveA Relace 201, Morph 1). В
одинаковых окнах по времени окончания (оценка `output/(latency − firstOutput)`) база быстрее: 20:20 — 197 против 123,
20:30 — 247 против 128; в окне 20:10 — 110 против 108. Дрейф и взаимное влияние **не исключены** (разница стартов в паре:
медиана 330 с, максимум 723 с у deepseek), пары не были рандомизированными соседними блоками AB/BA. Гипотезы: задержка
в основном внутри ответа модели (умеренная уверенность); причина — содержимое запросов волны A и планирование у
провайдера (низкая уверенность). На проводе адаптера отличается только ключ (`RequestBytesTest`), но A3 меняет
содержимое `[S]` и набор схем.

## Абляция ключа сессии (deepseek, 8 задач × 2, seed 11, одновременно, ≈ 21:00–21:45 UTC)
| плечо | принято | wall, с | ответов | время модели, с | медиана ток/с | billed $ | cache % | апстрим |
|---|---|---|---|---|---|---|---|---|
| waveA (ключ) | 16/16 | 1876 | 219 | 1484 | 94 | 0.1145 | 78 | Relace ×219 |
| waveA-nokey | 16/16 | 2097 | 202 | 1666 | 95 | 0.0938 | 78 | Relace ×164, Morph ×38 |
Пары key/nokey: wall 0.97 [0.84; 1.12], billed 1.25 [0.92; 1.72], N 1.09 [0.91; 1.30], ток/с 1.13 [0.89; 1.44] —
**эффекта ключа не обнаружено** (не доказательство эквивалентности); маршрутизация без ключа частично ушла на Morph.
Медиана времени на 1 тыс. токенов выхода: base 7,4 с; waveA 12,5 с; abl-key 13,0 с; abl-nokey 13,0 с.
B1: deepseek@Relace берёт за кэш-чтение полную цену входа (скидки на кэш у этого апстрима нет).

## Решения по линиям волны A (оркестратор, по анализу Codex)
Ни одна линия не идентифицирована как причина регресса качества → по §9.4 откатов нет; все решения **предварительные**:
- **A1** — оставить; границы допуска/fallback не нагружены (вход < 20 тыс. при окне 1 048 576).
- **A2b** — оставить; польза ключа сессии не доказана (доля кэша не выросла), ярусы цен не нагружены.
- **A3** — оставить, **первой на абляцию**: deepseek, waveA против waveA без A3 (и префикс, и выбор схем), 8 × 2,
  рандомизированные соседние блоки AB/BA, апстрим закреплён, журналировать фактический лимит выхода — задача P8.B.4.
- **A4** — оставить; экономия не измерена (в журнале нет аргументов инструментов).
- **A5** — оставить; не проверена (в задачах нет фоновых команд).
- **A6** — оставить по безопасности; отказы проверки — на просмотр.
Для D5: закрепить апстрим, рандомизированные блоки AB/BA, в наборе — задачи, нагружающие A1 (малое окно) и A5
(фоновая сборка/сервер).

Статус: ГОТОВО (решения предварительные; хвост — P8.B.4)

## Повтор B4 (seed 17, 2026-10-03) и сводка по 4 повторам
Те же дистрибутивы, обе модели, 64 прогона; приёмка повтора: deepseek 16/16 и 16/16; glm base 14/16, waveA 16/16.
Сводка B4 + повтор (8 задач × 4 повтора на плечо; номинальные поисковые 95 % t по задачам):
| метрика waveA/base | deepseek | glm |
|---|---|---|
| N (запросы) | 1.00 [0.84; 1.18] | 0.92 [0.72; 1.19] |
| выход, токены | 0.94 [0.80; 1.10] | 0.82 [0.58; 1.17] |
| некэшированный вход | 0.96 [0.79; 1.17] | 0.88 [0.67; 1.16] |
| billed | 0.96 [0.81; 1.13] | 0.82 [0.60; 1.13] |
| wall | 1.03 [0.88; 1.20] | 0.68 [0.44; 1.05] |
Главная метрика §9.1 (все попытки / принятые): deepseek $0.00609 → $0.00597, 86 → 97 с; glm $0.00938 → $0.00885,
233 → 172 с. Приёмка (задачи-эквиваленты, среднее по 4 повторам): deepseek 8.0 / 8.0, glm 7.5 / 7.5 — №9a выполнен.
**Вывод:** на 4 повторах волна A не хуже базы ни по одной метрике; точечные оценки glm в пользу волны A. Замедление
deepseek в первом прогоне — разброс провайдера (подтверждено двумя абляциями и повтором; D-395). Решение — оставить все
линии A (уже не «предварительно» по качеству; польза A1/A4/A5 на этом наборе по-прежнему не измерена).

Статус: ГОТОВО
