# WP-A3 — стабильный префикс

Ветка `v2/A3` (база локальный `main` adc65a7: A4 и A5 уже слиты). Исполнитель: суб-агент t3 (Opus 5.5).

## Сделано
- Строка `enabled this turn:` ушла из `[S]` в `[A]`. `Layout.system(role, mode)` и `Layout.render(role, mode, prime, k,
  transcript, explicitBreakpoints)` больше не принимают маску: `[S]` зависит только от роли и режима исполнения.
  В `[S]` строка `tools:` теперь перечисляет инструменты роли по семействам (`look(tree, …) · run(run, poll, wait,
  cancel) · …`, порядок объявления), то есть то, что модели можно вызывать в этой линии вообще.
  `core/src/main/kotlin/io/astrolabe/cell/Layout.kt`.
- `Layout.enabled(role, mask)` (internal) строит строку для `[A]` относительно инструментов роли:
  `all role tools`; `all role tools except …`, пока этот вариант короче; иначе сами разрешённые операции по
  семействам; `none` для пустой маски. `Anchor.render(…, enabled = …)` — новый последний параметр со значением по
  умолчанию. Строка стоит перед gauge и никогда не сокращается. `cell/Anchor.kt`.
- Набор схем выбирается ролью: `ToolSchemas.forLineage(adapter, profile, roleMask)` отдаёт только семейства, в
  которых маска роли называет хотя бы одну операцию (`families`, internal). `SchemaSet.mask` теперь означает маску
  роли. `Cell` выбирает набор один раз на ячейку из `ctx.role.toolMask` (поле `schemaSelection`), а не на каждый ход
  из маски хода. `tool/ToolSchemas.kt`, `cell/Cell.kt`.
- Маскированная операция по-прежнему отклоняется при исполнении: гейт `Cell.kt` (`mask.allows`) и исполнители
  семейств получают маску хода, как и раньше. `Request.mask` — тоже маска хода.
- `run.wait` добавлен в маски ролей plan и probe рядом с `run.poll` (`cell/Role.kt`). Эквивалентность poll→wait в
  `Run.execute` оставлена. Без этого гейт `Cell` отклонял `run.wait` ещё до `Run`. Добавлен тест в CellTest: ячейки
  plan и probe вызывают `run(op=wait)`, и вызов доходит до исполнителя run.
- Описание схемы `run` (по ревью A5): таймаут запуска убивает дерево процессов, а таймаут `wait` заканчивает только
  ожидание, процесс продолжает работать. Сервер нужно ждать с `until_line`/`until_port` или с коротким `timeout`.
  Golden схем из-за этого обновлён один раз. `Run.kt` не трогался.
- Версия текста ролей: `Roles.POLICY_TEXT_VERSION` `roles/4` → `roles/5`.
- Комментарий `provider-ai-gate` `RequestTranslator`: маску называет `[A]`, а не `[S]`.
- Старые сигнатуры `Layout.system(role, mask, mode)` и `Layout.render(role, mask, mode, …)` оставлены как
  `@Deprecated` и маску игнорируют. Поэтому `context/Compiler.kt` (зона A1) и `GlmToolCallProbeTest`
  (`provider-ai-gate`) не правились.

## Решения
- Куда переносить маску → в `[A]` (якорь, хвост каждого запроса, вне кэша), строкой перед gauge → модель видит её
  в том же ходе, а провайдерский контракт не меняется (`Request.mask` по-прежнему не отправляется) → безопасная
  альтернатива: дословно перенести полный плоский список (~150 токенов вне кэша на каждый ход).
- Форма строки в `[A]` → разница с инструментами роли, перечисленными в `[S]` (`all role tools [except …]`) → обычно
  это 5–25 токенов вне кэша вместо ~150, а полный список закэширован в `[S]` → альтернатива: плоский список.
- Набор схем → семейства из `Role.toolMask`; enum операций внутри семейства не сужается → байты схемы семейства
  одинаковы во всех ролях, поэтому нет новых вариантов схем → альтернатива (хвост): сузить enum до операций роли.
- Сигнатура `forLineage` → оставлен параметр `ToolMask`, переименован в `roleMask` (без зависимости `tool` → `cell`).
  То, что передаётся маска роли, гарантирует вызывающий (`Cell`) → альтернатива: перегрузка с `Role`, но тогда
  `tool` начнёт зависеть от `cell`.
- Версия текста → поднята `roles/N` (`Roles.POLICY_TEXT_VERSION`): строки `tools:`/маски принадлежат рендеру роли и
  попадают в отпечаток попытки через `RoleTexts.versions` (D-38). Тексты `kernel/2`, `role-texts/2` и
  `error-policy/5` не менялись, поэтому их версии не поднимались → альтернатива: поднять и `kernel/N`.
- Совместимость → устаревшие перегрузки с маской вместо правки `context/Compiler.kt:99`. Строка 99 прилегает к
  `Compiler.kt:101` — горячей точке A1, поэтому правка там дала бы конфликт слияния.

## Тесты
- L1: `./gradlew :core:test --tests 'io.astrolabe.cell.LayoutTest' --tests 'io.astrolabe.tool.ToolContractsTest'
  --tests 'io.astrolabe.cell.CellTest' --tests 'io.astrolabe.cell.RoleTextsTest' --tests 'io.astrolabe.cell.AnchorTest'
  -q --console=plain` → exit 0. По XML: LayoutTest 10, CellTest 47, ToolContractsTest 8, RoleTextsTest 3, AnchorTest 8;
  0 падений.
- Новое и изменённое:
  - LayoutTest, golden `[S]`: дайджесты байтов `[S]` роли implementing и отпечаток её набора схем; при расхождении
    печатается текст.
  - LayoutTest: `[S]` не меняется ни от маски, ни от маски резерва; все четыре кэшируемых региона одинаковы.
  - LayoutTest: формы `enabled`.
  - CellTest, ход резерва: байты `S R K` и `Request.tools` хода 2 (резерв) совпадают с ходом 1; breakpoints те же;
    в `[A]` хода 2 `edit.anchored` назван замаскированным.
  - ToolContractsTest: семейства по ролям (probe, plan, extractor, implementing); схема семейства не зависит от
    роли; `run.wait` в plan и probe.
- Изменённые старые тесты: в LayoutTest утверждения «маска видна в `[S]`» и «`enabled this turn` в `[S]`»
  заменены на обратные. Они кодировали старый дизайн, который карточка отменяет.
- После правок по ревью A5: `LayoutTest`, `CellTest` (48), `ToolContractsTest`, `tool.run.RunTest` (35) и
  `tool.InputToleranceTest` → exit 0, 0 падений по XML.
- L2: `./gradlew.bat :core:test --tests 'io.astrolabe.cell.*' --tests 'io.astrolabe.tool.*' --tests
  'io.astrolabe.context.*' :eval:compileTestKotlin :provider-ai-gate:compileTestKotlin
  -Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm -q` → exit 0. По XML этого checkout: 51 набор,
  430 тестов, 1 skipped, 0 падений, 0 ошибок. `eval` и `provider-ai-gate` собираются: `GlmToolCallProbeTest` идёт
  через устаревшую перегрузку. L2 прогонялся до правки описания `run`. После неё повторены L1 и `RunTest` (выше).
- `./gradlew.bat :core:updateKotlinAbi` → `core/api/core.api`: только добавления (`Layout.system(Role, ExecutionMode)`,
  `Layout.render(Role, ExecutionMode, …)`, `Anchor.render(…, enabled)`). Закоммичено. Полный `build` не запускался.

## Отклонения от карточки
- В `[S]` осталась строка `tools:`, но теперь это инструменты роли (зависит только от роли), а не все 7 семейств.
- Карточка называет `ToolSchemasTest`; такого класса нет. Тесты схем — в `ToolContractsTest`.
- Worktree был создан от f68032f. Его перевели на `main` adc65a7 через `git merge --ff-only main` (своих коммитов не
  было), а не через `reset --hard`: этот вариант отклонил классификатор разрешений. Итог тот же.

## Хвосты и риски
- Кодам A1 и `provider-ai-gate` после слияния: заменить устаревшие вызовы `Layout.render(role, mask, …)` в
  `context/Compiler.kt:99` и `Layout.system(Roles.plan, mask, …)` в `GlmToolCallProbeTest.kt:152`, затем удалить
  перегрузки (ABI).
- Строка `enabled` добавляет в `[A]` несколько токенов на ход. Её учитывает резерв якоря (`anchorMaxTokens`), под
  сокращения она не попадает.
- enum операций в схемах не сужен по роли: модель видит в схеме операции, которых нет у роли. Их отклоняет гейт.
- Проверены только пакеты L2. `campaign.*`, `delegate.*` и `recover.*` прогоняет только полный build оркестратора.
  Якорь в них меняется на одну строку.

Статус: ГОТОВО К СЛИЯНИЮ · последний коммит ветки v2/A3: cc59368
