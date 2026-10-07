# WP-B6b — закрытый набор длинных задач (confirmation) и режим пар (P8.B.6, сессия 5)

Ветка `v2/B6b` от `main` ядра `ac88f6b` (уже содержит B6a), worktree `ASTROLABE/.claude/worktrees/B6b`. Ядро не тронуто.

## Сделано

Пять задач закрытого набора (`eval-live/tasks/<id>/`, формат `rest-todo`/B6a: `task.json`, `prompt.md`, `base/`, скрытые
`acceptance/`, `reference/`, `wrong/`). Python 3 stdlib (Node-задача — только встроенные модули Node), без сети и `shell=True`,
интерпретатор `{python}`/`sys.executable`, пути через `os.path`/`pathlib`; приёмка 0,2–3,4 с. В README набор помечен
«Closed confirmation set … not for debugging or threshold tuning».

| id | класс | файлов в base | пакеты | суть | `wrong/` |
|---|---|---|---|---|---|
| `scenario-1004` | `scenario` | 19 | `notes`, `notesclient` (+ `tests`) | сценарий 4 октября: `baseCommit:false`; HTML-вид заметки через `marklet` 1.2.0 — wheel в `base/vendor/` (собран детерминированно, pip ставит его офлайн — проверено в venv), установить в `.venv`, объявить в `requirements.txt`; `message` после 4 ответов: сырой HTML показывать текстом | страница верна, но сырой HTML проходит: сообщение посреди работы потеряно |
| `api-callers` | `api-change` | 21 | `depot.stock`, `orders`, `web`, `admin`, `reports` (+ `tests`) | `reserve(sku, qty, *, order_id)` → `Reservation`, `OutOfStock` вместо `False`, `release/ship(reservation)`, `held(id)`; вызывающие: checkout (всё-или-ничего), cancel, fulfil, 409 магазина (+`available`), пульт оператора | все вызовы переведены, но короткий заказ не возвращает ранние резервы (утечка) |
| `merge-conflict` | `merge-conflict` | 17 | `spend.core`, `spend.export`, `spend.cli` (+ `tests`) | две независимые подзадачи (CSV и JSON экспорт) правят один файл `spend/export/registry.py`; приёмка: оба формата, ничего не потеряно (старые форматы, описания), ничего дважды (AST: дубли ключей dict, определений, присваиваний `EXPORTERS`; `spend formats`) | JSON зарегистрирован дважды, CSV потерян — плохое слияние |
| `node-api` | `api-change-node` | 18 | `packages/pricing`, `api`, `cli` | монорепозиторий Node без `npm install` (`node --test`): `quote(items, { region, coupon })` → разбивка в центах, `formatMoney(cents, currency)`; вызывающие — API на `node:http` и CLI. Приёмка — Python: `shutil.which("node")`, без node — `FAILED: node is not on the PATH …`, exit 2 (проверено с пустым PATH); проверки — `_acceptance/check.mjs` на `node:test` | API теряет купон (новый параметр не передан) |
| `second-task-pairs` | `second-task` | 21 | как `api-callers` | вторая задача пары (`"after": "api-callers"`): `Inventory.reservations(order_id)` по номеру, `GET /orders/<id>/reservations`, `holds` пульта, строка утреннего отчёта только по резервам пульта | `holds` и строка отчёта считают все резервы, а не только пульта |

**Режим пар** (`Tasks.kt` — загрузка `after`; `Bench.kt` — прогон пары): `TaskFile.after`, `BenchTask.after`/`first`;
`BenchTask.all` связывает вторую задачу с первой (`pairedWith`), неизвестный `after` — ошибка загрузки. Runner копирует
базу первой задачи, прогоняет первую как отдельную работу (auto, обычный `SessionScript`), запускает её приёмку, коммитит
результат (`after <id>`), затем вторую задачу — тот же рабочий каталог, тот же state root (один store). Измеряется только
вторая: outcome/cells/решения/время/totals/phases и `workspace.diff`/`changedFiles` против коммита первой. `result.json` →
`pair = {after, firstAcceptance, first: SegmentResult}`; отпечаток задачи включает отпечаток первой (только у пар).
Собственный `base/` второй задачи = base первой + её `reference/` (только для тройной проверки; `TaskValidityTest` сверяет).

## Решения (черновые, без номеров)
1. **Результат первой задачи коммитится перед второй** → дифф и `changedFiles` второй задачи — только её правки; так делает
   пользователь между задачами. Альтернатива: не коммитить и мерить дифф против базы — смешивает обе задачи.
2. **Пары без сценарных вставок**: у обеих задач пары нет `interrupt`/`reopen`/`message`/`dirt`, первая — на коммите
   (проверка в `BenchTask.init`); первая всегда в auto-режиме. Альтернатива — комбинации, которые runner сейчас не различает
   по сегментам; безопаснее отказ при загрузке.
3. **Сбой первой задачи как прогона харнеса** (исключение/транспорт) останавливает пару с `failure`; неуспешный, но
   завершённый исход первой не останавливает (её приёмка — в `pair.firstAcceptance`).
4. **Node в `TaskValidityTest`**: видимые тесты Node-задачи — `node --test` (Sniff ядра дал бы `npm test`); без node на PATH
   задача пропускается с сообщением (её приёмка и так падает с причиной). Альтернатива — падать всему тесту без node.
5. **`scenario-1004`: зависимость из wheel**, не sdist (sdist требует setuptools из сети при build isolation). Приёмка
   ставит wheel первым в `sys.path` (zipimport) и сверяет SHA-256 wheel: результат не зависит от того, куда агент поставил
   пакет, а правка `vendor/` ловится. В эталоне `import marklet` внутри функции, чтобы видимые тесты шли без установки.
6. `second-task-pairs` — id из карточки; класс `second-task`.

## Тесты
Команда: `export JAVA_HOME=/c/Users/user/.gradle/jdks/eclipse_adoptium-26-amd64-windows.2; ./gradlew :eval-live:test -q --console=plain -Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm`
(фоновой командой). Итог из XML worktree B6b: **15 классов, 44 теста, 0 упало, 1 пропущен** (`LoopToolsTest`, пропуск был до линии).
Новое: `PairTest` 2 (пара на поддельном адаптере: первая до конца раньше второй, один run-каталог и один `state`, 1 коммит у
первой и 2 у второй, вторая видит правку первой, totals/`phases.opens`=1/дифф — только второй; загрузка `after` и ошибка
неизвестного `after`); `TaskValidityTest` — пять новых id, `node --test` для Node, инвариант базы пары (тройная проверка
всех задач прошла внутри теста, node был на PATH). `:eval-live:checkKotlinAbi` зелёный (изменения только `internal`).

**Тройная самопроверка** (фоновая `python validate.py <id>` в scratchpad: копия `base/` во временный каталог, наложение
`wrong/` или `reference/`, `acceptance/` как `_acceptance/`, `python _acceptance/accept.py`, тайм-аут 120 с; видимые тесты на
эталоне — `python -m unittest discover -s tests`, для Node — `node --test`; Python 3.14.2, Node v24.18.0, Windows):

| задача | base | base + wrong/ | base + reference/ | видимые тесты на эталоне |
|---|---|---|---|---|
| `scenario-1004` | FAIL (exit 1, 3,4 с) | FAIL (exit 1, 3,3 с) | PASS (exit 0, 3,3 с) | зелёные |
| `api-callers` | FAIL (exit 1, 0,2 с) | FAIL (exit 1, 0,2 с) | PASS (exit 0, 0,2 с) | зелёные |
| `merge-conflict` | FAIL (exit 1, 0,2 с) | FAIL (exit 1, 0,2 с) | PASS (exit 0, 0,2 с) | зелёные |
| `node-api` | FAIL (exit 1, 0,3 с) | FAIL (exit 1, 0,5 с) | PASS (exit 0, 0,5 с) | зелёные (`node --test`) |
| `second-task-pairs` | FAIL (exit 1, 0,2 с) | FAIL (exit 1, 0,3 с) | PASS (exit 0, 0,2 с) | зелёные |

`wrong/` падает по задуманной причине (проверено по выводу): утечка резервов; потерянный CSV + дубль JSON; купон в API;
неэкранированный HTML; счёт не только по пульту. Дополнительно: wheel ставится `pip install --no-index --find-links vendor`
в свежий venv; `node-api` без node на PATH → exit 2 с причиной.

Циклы «правка → тест» (gradle): **1** (первый полный `:eval-live:test` зелёный). Отдельно одна правка данных приёмки
`second-task-pairs` (сумма количеств превышала остаток) — в скрипте самопроверки, до gradle. Живые прогоны не запускались.
Расход токенов мне не виден точно; оценка ≈ 260 тыс.

## Отклонения от карточки
- Кроме `Tasks.kt`/`Bench.kt` тронуты по минимуму: `Results.kt` (`PairResult`, поле `RunResult.pair`), `Trees.kt`
  (`GitRepo.commitAll`), `Arms.kt` (отпечаток пары в `Fingerprints.task`, только для второй задачи пары — остальные
  ключи не меняются). Без них пару нечем записать в `result.json` и нечем отличить ключ второй задачи при смене первой.
- `TaskValidityTest`: для Node-задач видимые тесты — `node --test`, без node задача пропускается (Решение 4).
- В `summary.csv` колонка пары не добавлена (есть в `result.json` / `summary.json`).

## Хвосты и риски
- Живая калибровка (минуты агента, `wrong/` на реальной модели, работа `message` в `scenario-1004` на 4-м ответе) — за
  оркестратором.
- Режим `ask` для пар: первая задача всегда в auto; если владельцу нужна первая в ask — отдельная правка `Bench` (сегмент
  первой с `user` и цикл ответов до коммита).
- `scenario-1004`: агент может установить `marklet` в глобальный Python вопреки просьбе про `.venv` — приёмка от этого не
  зависит; `.venv` копируется в копию приёмки (≈ 20 МБ, время копирования).
- `node-api` требует Node ≥ 18 на машине прогона и в CI (`fetch`, `node:test`, `parseArgs`); на runner-ах GitHub он есть.
- Вторая задача пары падает, если первая решена неверно — это свойство класса (меряется вторая на реальном итоге первой);
  `pair.firstAcceptance` позволяет разделить такие случаи в D5.

Статус: ГОТОВО К СЛИЯНИЮ. Последний коммит ветки: `decbdae` (задачи: `1657752`, `9fb12a7`, `c73d5b1`, `779d453`), запушена в `origin/v2/B6b`.
