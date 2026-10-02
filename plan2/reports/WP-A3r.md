# WP-A3r — правки по ревью A3 (стабильный префикс)

Ветка `v2/A3r` (база локальный `main` 6e7b794, «Merge v2/A3»), запушена в `origin/v2/A3r`. Исполнитель: суб-агент (Opus 5.5).

## Сделано
1. Отпечаток компиляции покрывает то, что A3 замораживает. `context/Precompile.kt`: в `Fingerprint` два новых поля —
   `system` (дайджест `Layout.system(role, attempt.config.executionMode)`) и `schemas` (отпечаток набора схем роли);
   оба участвуют в `differences`. `tool/ToolSchemas.kt`: internal `ToolSchemas.fingerprint(roleMask)` считает тот же
   дайджест, что `SchemaSet.fingerprint` (байты схем семейств, выбранных `families(role.toolMask)`), `forLineage`
   использует его же. KDoc исправлены так, чтобы утверждения были верны: `Layout.system` хешируется в отпечаток
   компиляции (`Fingerprint.system`), `Kernel.VERSION` стоит в заголовке `[S]`, `SchemaSet.fingerprint` записывается в
   `Fingerprint.schemas`.
2. `docs/runtime/context-layout.md` §5.1: в блоках `[A]` добавлена строка `enabled this turn` (маска хода относительно
   инструментов роли из `[S]`, никогда не сокращается) перед gauge.
3. Ход ремонта D-366: `Layout.enabled(role, mask, ownFilesOnly)` добавляет ` (edits: own files only)`, если на ходу
   ремонта включена хоть одна операция edit. `Cell.renderAnchor(…, repair)` на таком ходу заменяет строку гейта
   `CellBudget.GATE` («no new edits») на `reserve reached: verify and report; repairs to your own files only`
   (`Cell.REPAIR_GATE`, private companion). `cell/Layout.kt`, `cell/Cell.kt`.
4. `GlmToolCallProbeTest`: инструменты берутся из `ToolSchemas.forLineage(adapter, profile, Roles.plan.toolMask)`
   (как в production), `[S]` — из `Layout.system(role, mode)` без маски; маска хода S1 передаётся в `Request.mask`.
5. Выбран `check` в `Cell` после выбора набора схем: маска хода называет только операции семейств, которые есть в
   `Request.tools` (инвариант 12). Ветку в `Layout.enabled` не удалял: функция internal и для маски вне роли остаётся
   честной.

Коммиты: 1a56665 (1), 72e5933 (2), fc3631e (3), 6225cf9 (4), bd3969a (5), d9260be (ABI-дамп).

## Решения
- Хеш набора схем считается без адаптера: диалект у `ToolSchemas` один, поэтому значение совпадает с
  `SchemaSet.fingerprint` любой поддержанной линии (тест это проверяет на `FakeAdapter`).
- Режим исполнения для `[S]` берётся из `attempt.config.executionMode`. Поэтому сигнатура `Fingerprint.of` не менялась,
  и `campaign/Controller.kt` (зона A1) трогать не пришлось.
- `AttemptConfig.fingerprint` не расширял: он не зависит от роли (общий на попытку), а текст ядра уже покрыт
  `harnessVersion`. Вместо этого поправлены KDoc.
- Для п.5 использован `check` (IllegalStateException), а не `require`: это внутренний инвариант, а не аргумент вызывающего.

## Тесты
- `PrecompileTest`: в оба теста «каждое поле сдвигает отпечаток» добавлены `system` и `schemas`; новый тест
  `the role's system bytes and schema set enter the fingerprint`: `system` = дайджест `Layout.system`, `schemas` =
  `SchemaSet.fingerprint` из `forLineage` (значит, изменение текста схемы его двигает); более узкая маска с теми же
  семействами меняет только `system`; маска без `kb` меняет `system` и `schemas`; режим Confined меняет `system` и `policy`.
- `LayoutTest`: суффикс own-files на ходу ремонта; без edit-операций строка не меняется.
- `CellTest` (тест резервного ремонта D-366): `[A]` хода 3 — строка enabled кончается на `(edits: own files only)`,
  есть текст ремонтного гейта, нет `CellBudget.GATE`.
- L1: PrecompileTest 7/0, LayoutTest 10/0, CellTest 48/0.
- L2: `:core:test` cell.* + context.* + tool.* — 432 теста, 0 падений, 1 skip; `:core:checkKotlinAbi`,
  `:eval:compileTestKotlin` — зелёные; `:provider-ai-gate:test GlmToolCallProbeTest` (`-Pastrolabe.aiGateBuild=…`) —
  компилируется, 1 тест пропущен (живой зонд).
- `:core:updateKotlinAbi`: дамп обновлён (новые поля `Fingerprint`), закоммичен.

## Отклонения
- Для п.5 нет отдельного теста: инвариант недостижим через публичный API (маска хода ⊂ маски роли, набор схем выбран
  по маске роли). Проверено отсутствие ложных срабатываний на всём L2 (CellTest проходит check на каждом ходу).
- Ссылка на D-379 в документации не ставилась (в TODO §3 строки D-379 пока нет); указан инвариант 12.

## Хвосты
- `context/Compiler.kt` (зона A1) по-прежнему зовёт устаревший `Layout.render(role, mask, …)`; перевести при работе A1.
- Изменение отпечатка инвалидирует уже ожидающие precompile только в рамках процесса (Fingerprint не персистится), миграция не нужна.

Статус: DONE — последний коммит d9260be (A3r: ABI dump for Fingerprint.system and Fingerprint.schemas).
