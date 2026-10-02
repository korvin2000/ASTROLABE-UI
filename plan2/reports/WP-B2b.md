# WP-B2b — три задачи screening-набора: `red-test`, `ui-clear-done`, `investigate-totals`

Ветка `v2/B2b` от `main` (97ce447), запушена. Карточка: `plan2/WP-B2.md`, часть B2b. Исполнитель: t2. Runner и ядро не тронуты.

## Сделано
- `eval-live/tasks/red-test/` — склад `inventory/` (`models.py`, `reorder.py`, `report.py`). На базе красный видимый
  `tests/test_reorder.py` (дозаказ при остатке **≤** порога; код использует `<`). Два пути: одиночный
  (`needs_reorder`/`order_for`) и пакетный `reorder_batch` (решение вписано в него «ради скорости», поэтому исправить
  нужно в двух местах). Видимые: `test_reorder.py` (красный), `test_report.py` (зелёный). Приёмка (`accept.py` +
  `visible_test_reorder.py`) запускает **свою** копию видимого теста, сверяет байты `tests/test_reorder.py` рабочей
  области с копией, добавляет скрытые случаи: граница с обеих сторон, нулевой порог, пакет (на пороге, выше порога,
  смешанный, сортировка по sku, пустой, итератор), согласованность одиночного и пакетного пути перебором сетки,
  отчёт. `wrong/` — исправлен только `needs_reorder` (видимые тесты зелёные, пакет остаётся на `<`). Эталон — `<=` в обоих
  местах + `tests/test_reorder_batch.py`.
- `eval-live/tasks/ui-clear-done/` — todo-приложение: `server.py` (`http.server`, `Store` с блокировкой; GET/POST/PATCH
  `/api/todos`, статика), `static/index.html`, `static/app.js` (vanilla JS, `render()`/`load()`), `tests/test_api.py`
  (поднимает сервер на свободном порту). Запрос задаёт контракт: кнопка `id="clear-completed"`, `DELETE /api/todos?done=true`
  → 200 `{"removed": N}`, без `done=true` → 400 и ничего не удаляется, id не переиспользуются. Приёмка: (1) HTTP-сценарий
  на своём сервере; (2) `GET /` разобран `html.parser` — ровно один `button#clear-completed` с текстом «Clear completed»,
  счётчик `todo-count` на месте; (3) `GET /static/app.js` без комментариев проверен как текст: поиск кнопки, обработчик
  click (переменная/цепочка/делегирование), `DELETE` + `/api/todos?done=true`, перерисовка в 500 знаках после вызова,
  механизм скрытия (`.hidden=`, `style.display=`, `classList`, `*Attribute("hidden")`), слово `left` сохранено.
  `wrong/` — сервер очищает **все** задачи; UI в `wrong/` правильный (эталонный), поэтому падение только по API.
  Эталон — `Store.clear_completed`, `do_DELETE`, кнопка (`hidden` по умолчанию), `app.js`, README, `tests/test_clear_completed.py`.
- `eval-live/tasks/investigate-totals/` — `billing/`: `loader.py` → `normalize.py` → `aggregate.py` → `format.py` (+ `report.build_report`),
  `data/invoices.csv` (25 строк, 2 void, одна полночь 1 февраля на 480.00), `repro.py`, `tests/test_pipeline.py`. Ошибка:
  `start <= issued_at <= end`, где `end` — начало следующего месяца, значит счёт ровно в полночь 1-го попадает в оба месяца;
  `repro.py` печатает «months are off by 480.00». Запрос подсказывает ложную гипотезу (float). Приёмка работает через
  `build_report(path)` на CSV, которые сама пишет, плюс своя копия данных (`acceptance/invoices.csv`) с буквальным ожидаемым
  отчётом; независимый оракул на `decimal` (группировка по `(год, месяц)`). Случаи: полночь 1-го, последняя микросекунда месяца,
  високосный/невисокосный февраль, смена года, другие записи полуночи (`T`, пробел, только дата), void в полночь, все границы
  2023–2024, 400 счетов с seed по границам, и четыре теста округления **без** счетов на границе (проходят на базе:
  округление не причина). `wrong/` — переход на `Decimal` + `ROUND_HALF_UP` (`normalize.py`, `aggregate.py`, `format.py`),
  видимые тесты зелёные, граница не исправлена. Эталон — `<` в `aggregate.py` + `tests/test_boundaries.py`.
- `eval-live/README.md` — абзац о трёх задачах в разделе Tasks (формат `wrong/` и самопроверка описываются в B2a).
- `eval-live/src/test/.../TaskValidityTest.kt` — список ожидаемых id расширен до шести (см. «Отклонения»).
- Коммиты: `f0b11ca` red-test, `4684af5` ui-clear-done, `9db0a8f` investigate-totals, `36580a4` README.

## Решения (черновые, без номеров)
1. **Список id в `TaskValidityTest`.** Вопрос: тест жёстко сравнивает три id, новые задачи его ломают, а карточка требует его зелёным.
   Выбор: добавлять id по мере задач (в итоге шесть, по алфавиту). Почему: минимальная правка без смены смысла теста.
   Безопасная альтернатива: `containsAll`. B2a правит ту же строку (8 id) — при слиянии тривиальный конфликт.
2. **Контракт операции в промпте ui-clear-done.** Без заданного URL/ответа/400 приёмка не может проверить API. Выбор:
   `DELETE /api/todos?done=true`, `{"removed": N}`, 400 без `done=true`. Побочный эффект — отсекает «удалить всё» без фильтра.
3. **Счётчик «N items left» считает открытые задачи** (как в TodoMVC), поэтому очистка выполненных его число не меняет;
   «обновляется» в карточке трактуется как «список и счётчик перерисованы по новому состоянию», что приёмка проверяет статически
   (вызов `load/render/…` в окне 500 знаков после вызова DELETE). Альтернатива: считать все задачи — искусственно.
4. **Приёмка investigate-totals не запускает `repro.py` рабочей области** (агент мог его править) и не зависит от внутренних
   типов: единственный вход — `build_report(path)`; формат отчёта закреплён видимыми тестами и README.
5. **urllib без прокси** (`ProxyHandler({})`) в тестах и приёмке ui-clear-done: loopback не должен уходить в `HTTP_PROXY`.
   Существующий smoke `rest-todo` так не делает — не трогал (вне карточки).
6. Классы задач в `task.json`: `red-test`, `ui-change`, `investigation` (у существующих: `bugfix`, `api-change`, `greenfield`).

## Тесты
Самопроверка вручную (скрипт в scratchpad: копия `base/` во временный каталог, наложение `wrong/`|`reference/`, `acceptance/` →
`_acceptance/`, запуск `acceptance.argv` с `{python}` = Python 3.14, `PYTHONDONTWRITEBYTECODE=1`). Код выхода приёмки:

| задача | база | wrong | эталон | видимые тесты: эталон | видимые: база / wrong |
|---|---|---|---|---|---|
| red-test | 1 | 1 | 0 | 0 | 1 (красный, так задумано) / 0 |
| ui-clear-done | 1 | 1 | 0 | 0 | 0 / 0 |
| investigate-totals | 1 | 1 | 0 | 0 | 0 / 0 |

Детали падений: red-test база — 7 из 14 (в т.ч. видимый красный тест), wrong — 5 (пакетный путь, согласованность, отчёт);
ui-clear-done база — 3 из 3, wrong — 1 (`removed: 3 != 2`, API); investigate-totals база и wrong — по 8 из 13 (все граничные
случаи; 4 теста округления и void проходят), эталон — 13/13. Время приёмки: ≈0,7 с (ui-clear-done, поднимает сервер), менее 0,1 с у остальных.

Проверки справедливости (не входят в набор): investigate-totals — альтернативные исправления `end - 1 µs` и группировка
по `(год, месяц)` проходят, `end - 1 с` падает (6 тестов); ui-clear-done — `style.display`+`onclick`+локальная фильтрация и
`querySelector`+`.then(load)`+`classList.toggle` проходят, закомментированный обработчик и отсутствие перерисовки падают.

Официальные команды (Git Bash, `JAVA_HOME=…jdk-26`):
- `./gradlew :eval-live:installDist -Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm -PbenchDir=<scratchpad>/bench -q --console=plain` — OK.
- `<scratchpad>/bench/bin/eval-live check` — вывод: `api-currency`, `bugfix-pagination`, `investigate-totals`, `red-test`,
  `rest-todo`, `ui-clear-done`: «base fails, reference passes, visible tests on reference green»; `6/6 task(s) sound`.
- `./gradlew :eval-live:test -Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm -q --console=plain` — exit 0;
  XML (`eval-live/build/test-results/test`): BenchTest 2, LiveModelsTest 1, TaskValidityTest 1 (6 задач), TotalsTest 4, падений 0.
- Полный `./gradlew build` не запускался (по карточке). Живые прогоны не делались.

## Отклонения от карточки
- Правлен `eval-live/src/test/kotlin/io/astrolabe/evallive/TaskValidityTest.kt` (одна строка — список id), хотя «код runner'а
  не менять»: это тест, не код runner'а, без правки он красный при любой новой задаче. Конфликт с B2a ожидаем (его список — 8 id).
- Проверка `wrong/` выполнена вручную: runner её ещё не умеет (B2a); `eval-live check` в этой ветке проверяет только базу и эталон.
- Worktree стартовал на ветке `worktree-agent-a17cc30d9b7dee7b6`; `v2/B2b` создана от того же HEAD (97ce447 = `main`).
- ui-clear-done: счётчик и видимость кнопки проверяются структурно, не исполнением JS (см. риски).

## Хвосты и риски
- **UI-поведение проверено статически.** В приёмке нет движка JavaScript и браузера: что кнопка действительно скрывается, а
  счётчик верен после очистки, доказывается только текстом `app.js` и перерисовкой после DELETE. Агент с нетипичной структурой
  кода (шаблоны `innerHTML`, делегирование с нестандартным выбором цели, URL, собранный из частей) может получить ложное падение;
  типовые альтернативы проверены (выше). Для D5 при необходимости добавить опциональную проверку через `node`, если он есть.
- **Linux локально не проверялся.** OS-специфики нет: `pathlib`, `sys.executable`, свободный порт через `bind(0)` на 127.0.0.1,
  без `shell=True`, без `cmd`/`/`-путей; файлы в LF (`.gitattributes`: `eol=lf`), байтовое сравнение в red-test корректно.
- Python 3.14 локально; код рассчитан на `>=3.10` (формы `fromisoformat` — только допустимые в 3.10: без суффикса `Z`,
  дробная часть 6 цифр), на 3.10 не запускался.
- Гонка «порт освобождён → занят» между `bind(0)` и стартом сервера — как у существующих задач.
- red-test: `wrong/` проходит видимые тесты по замыслу; приёмка защищается копией теста и сверкой байтов.
- После слияния B2a оркестратору прогнать общий `check` (проверит `wrong/` всех восьми задач) и разрешить конфликт в `TaskValidityTest.kt`.

Статус: ГОТОВО К СЛИЯНИЮ
Последний коммит ветки `v2/B2b`: `36580a4` (eval-live README: the three B2b tasks)
