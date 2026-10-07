# WP-WAF2 — отчёт (сессия 5, этап 0)

## Сделано
- **Д1** `io.astrolabe.DefaultsTest`: `seedFallback` и `parentCarryMaxTokens` отнесены к существующей строке
  «Workset seeds per cell / KB injection / focus notes / focus zoom» (там уже `seedsMaxTokens`/`seedRule`), число строк
  осталось 26. В `declared values match the table` добавлены `true` и `4_000`. Документ
  `docs/reference/defaults.md` (строка 29): в столбец значений добавлены правило V1, запасной путь Seeds v2 под тем же
  лимитом (`seedFallback` вкл.) и перенос родителя ≤ 4K (`parentCarryMaxTokens`); в примечание — `seedReason: fallback`
  и порядок детерминированной обрезки (task-workflow §4.2, §4.5).
- **Д2** `io.astrolabe.workflow.OutputPolicyScenarioTest` (declaredOutput): утверждение «отчёт сдвинул кандидата, файл
  маркера — нет» читается из типизированных данных запроса решения — у всех пунктов AC-1 из `asked`
  `rewrittenInputs == [reports/out.json]` (и список пунктов не пуст), а не из текста `run.state?.reason`.
- Коммит `7769efb` на `v2/WAF2`, ветка запушена.

## Решения
- Д1: строка — существующая, не новая «Carry settings»: карточка велит присоединить к строке с `seedsMaxTokens`/`seedRule`;
  метку строки не менял (она повторена в `Defaults.kt:52` и `sources/`, вне границ линии). Безопасная альтернатива —
  отдельная строка (счётчик 27), если владелец хочет развести seeds и перенос родителя.
- Д2: причина остановки уже называет сдвинувший путь — локально на Windows: `… (scope touched) — inputs moved during the
  check: reports/out.json` (в карточке цитата обрезана на «— input»). Но та же причина эхом содержит argv команды, где на
  Linux оба пути записаны буквально через `/` — любая проверка вхождения строки (и `OUT in`, и `PYC !in`) зависит от
  разделителя. Спецификация (task-workflow §5.3: «outside identity (no flag, no candidate move)») говорит именно о флаге,
  т.е. о `DecisionItem.rewrittenInputs`. Правка `Controller.kt`/`Resolution.kt` не нужна.
- Почему пройдёт на Linux: `rewrittenInputs` берутся из `receipt.testedInputs.mutatedDuringCheck` — пути штампа
  относительно корня репозитория в виде `WorkspacePath` (всегда `/`, на Windows печатается `reports/out.json`), отсортированы
  `Stamper.PATH_ORDER`; `tests/__pycache__/x.pyc` исключён `ScratchPolicy` v3 до сравнения и в список не попадает на обеих
  ОС. Текст команды в утверждение не входит; ветвления по ОС в тесте нет. Проверка строже прежней (точное равенство списка).

## Тесты
- L1 (1 раз): `:core:test --tests 'io.astrolabe.DefaultsTest' --tests 'io.astrolabe.workflow.OutputPolicyScenarioTest'` —
  DefaultsTest 3/3, OutputPolicyScenarioTest 8/8, 0 падений (XML этого worktree).
- L2 (1 раз): `:core:test --tests 'io.astrolabe.workflow.*'` — 43/43, 0 падений; сумма времени классов по XML 207,2 с
  (OutputPolicy 28,9 с; машина делилась с параллельными линиями — изменение время не добавляет).
  `assemble testClasses checkKotlinAbi -Pastrolabe.aiGateBuild=…` — зелёный. Публичный API не менялся, дампы ABI не трогал.
- Циклов «правка → тест»: 1 (после теста удалена только временная отладочная печать причины).
- Расход токенов: около 100 тыс.

## Отклонения от карточки
- Нет. (Строка §17 не новая — по ветке «если они уже в другой строке — к ним».)

## Хвосты и риски
- Linux-подтверждение — только полный CI следующей метки.
- WF-набор по сумме XML 207 с при нагрузке машины; бюджет 180 с — забота D7 (T-56), не этой линии.

Статус: ГОТОВО К СЛИЯНИЮ · последний коммит `7769efb`
