# WP-A4 — `create` возвращает квитанцию, не тело

Ветка `v2/A4` (база `main` a245ac7), worktree `ASTROLABE/.claude/worktrees/agent-af7216b9bc6c8d3b8`.

## Сделано
- `core/src/main/kotlin/io/astrolabe/tool/edit/Edit.kt`
  - `EditResult.authored: List<View>` (новое поле, по умолчанию пусто; `:124`): содержимое целиком, которое записал
    `create` (и его замена на месте: create поверх своего/KNOWN-файла, delete+create, D-365/D-371), из аргументов вызова.
  - `apply`: `CreatePlan`/`ReplacePlan` больше не добавляют post-edit view с телом (`:618`, `:635`); строка квитанции
    дополнена `(N lines, B bytes)` (для replace — после прежней пометки: `(… replaced in place; N lines, B bytes)`).
    Итоговая строка: `✓ 1 create src/c.py @new→@<hash8> +2 −0 · syntax ok (2 lines, 22 bytes)`.
  - `render`: тело файла не выводится; для строк, скрытых редактором, — строка
    `<path>:<lines> redacted, NOT SEEN: read it before an anchored edit there` (`:871`).
    Coverage созданного файла регистрируется (`:892`) как `EntrySource.PostEdit` по фактически записанным байтам
    (версия = `FileVersion.of(plan.bytes)`, D-47), минус скрытые редактором строки (D-49); при усечении скана
    (`limitations`) — ни одной строки (`authoredMask`, `:831`). `show` разложен на `mask` + `grant` (`:835`) без
    изменения поведения post-edit views.
  - Отказ/частичный исход — прежняя диагностика (ветки отказов не тронуты).
- `workset/` — изменений не потребовалось: используется существующий `Workset.register`/`carry`; устаревание по
  `onChange` (FX-01) работает как раньше.
- `core/src/test/kotlin/io/astrolabe/tool/edit/EditTest.kt`: три новых теста (`:873`, `:895`, `:909`) — create →
  правка без чтения (в т.ч. после стаба квитанции и вторая правка с перенесённым coverage); внешнее изменение после
  create → `stale_expect` с diff, без записи (FX-01); строка с секретом не даёт coverage, квитанция её называет,
  правка рядом проходит. Обновлены ожидания в двух тестах (строка пометки replace теперь с размером) и в тесте
  create (`(2 lines, 22 bytes)`, текст assert-сообщения).
- `core/api/core.api` — дамп ABI (`EditResult.authored`).

## Решения
- Чей alias несёт coverage созданного файла → `resultId = null`, а не alias квитанции → байты живут в вызове
  модели, а вызовы в `[T]` никогда не стабятся (§5.7, `Residency`); квитанцию (≈20 токенов) residency стабит рано
  (дешёвый refetch под давлением R_max, возраст k=8), и с alias coverage пропадало бы, порождая компенсирующие
  чтения (§14). Следствия: L4 `dropUnseenCoverage` (Cell) такие записи не трогает — корректно, т.к. версия = хеш
  именно тех байтов, что в аргументах; `look` не отвечает «unchanged» по PostEdit-записям (как и раньше); stale-drop
  без recall говорит «read again». → Безопасная альтернатива: передавать alias (как post-edit views) — одна строка в
  `render` (`grant(view, mask, alias, …)`).
- Гейт по редактированию самой квитанции → оставлен прежний консервативный: если вывод квитанции редактирован или
  усечён, coverage не выдаётся никому (сохраняет тест «redacted and omitted edit views grant no new source coverage»
  без изменений). → Альтернатива: выдавать authored coverage независимо от квитанции.
- Редактирование содержимого → по сырым строкам (без нумерации), `ContentClass.ReusableEvidence`, как post-edit; при
  `limitations` (скан упёрся в `maxBytes`, хвост не проверен) — весь файл NOT SEEN.
- Замена на месте (create поверх своего/KNOWN-файла, delete+create) — тоже `create`-операция, получает ту же
  квитанцию и coverage.

## Тесты
- L1: `./gradlew :core:test --tests 'io.astrolabe.tool.edit.EditTest' --tests 'io.astrolabe.workset.WorksetTest' -q --console=plain`
  → EditTest 41/41, WorksetTest 7/7 (XML этого checkout).
- L2: `./gradlew :core:test --tests 'io.astrolabe.tool.*' --tests 'io.astrolabe.workset.*' --tests 'io.astrolabe.cell.*' :eval:compileTestKotlin --continue -q --console=plain`
  → exit 0; 43 класса, 389 тестов, 0 failures, 0 errors, 1 skipped; `:eval:compileTestKotlin` без ошибок.
- `./gradlew :core:updateKotlinAbi` → дамп обновлён и закоммичен.

## Отклонения от карточки
- `workset/` не менялся: карточка ожидала правку там, но существующего API хватило (coverage регистрируется из
  `Edit` через `Workset.register`). `tool/ToolSchemas.kt` не трогался — описание результата `create` там не живёт.
- Изменены ожидания трёх существующих тестов EditTest (пометка replace/create теперь включает размер) — формат
  квитанции изменился по карточке, семантика не ослаблена.

## Хвосты и риски
- Инцидент окружения: scratchpad общий с линией A5 — её скрипт `scratchpad/l2.sh` перезаписал одноимённый мой, и
  один мой запуск выполнил L2 A5 в её worktree (`agent-a026a347155537e44`, с `rm -rf core/build/test-results/test`
  там). Оркестратору: результаты L2 A5 около этого времени стоит перепроверить. Дальше мои файлы — в `scratchpad/A4/`.
- Риск §14 (компенсирующие чтения после create) теперь измерим в B4: рост `look.read` после `create`.
- Модель видит только хеш и размер; если она потеряет точный текст своего вызова (например, после пересборки
  проекции §5.8), coverage тоже уходит (rebuild → только seeds), т.е. рассинхрона нет.

Статус: ГОТОВО К СЛИЯНИЮ · последний коммит 41961fd
