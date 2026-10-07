# WP-WAF — починка полного набора метки `v2-wave-WA` (отчёт линии)

Ветка `v2/WAF` от `main` `4ce32a5`, запушена. Ядро и `eval-live`; Studio, стражи WF, идентичность, `DecisionKey` не тронуты.

## Сделано
- **Д1 (S0, WF-4 Linux).** `unreadable` всегда делал `Interrupted(latest)`, а `require` там верно охраняет §3.7/D-26. На Linux
  `UnreadableInput` прилетает после возврата ячейки (чекпойнт не `cancelled`), но до `Returned`: снимок после ячейки
  перечитывает файл — `chmod` фикстуры меняет ctime, `ContentCache` промахивается. На Windows блокировка диапазона не
  меняет ChangeTime, файл читается позже, без бегущей ячейки — поэтому зелёный. Исправление: `Lifecycle.unreadableSettlement`
  (`core/.../campaign/Lifecycle.kt:356`, internal): `cancelled` → `Interrupted`, иначе (и без чекпойнта) → `Lost`, затем
  `Stopped(BlockedExternal, "unreadable input <path>")` (`Controller.kt:855`). `require` не ослаблен. Коммит `18eae8b`.
- **Д2 (длинный путь recovery-блоба).** Воспроизведено новым тестом (`ShadowRefTest.kt:155`, тот же `Filename too long`).
  Каждый вызов `Git` получает `core.longpaths=true` через `GIT_CONFIG_COUNT/KEY_0/VALUE_0` (`core/.../os/Git.kt:639`).
  argv, число процессов git, `--no-filters`, SHA-256 сырых байтов не меняются. Коммит `f6277c6`.
- **Д3 (`.Git`, Linux).** `LoopAttempt.resolve` (`eval-live/.../LoopAttempt.kt:502`) отказывает, если сегмент названного
  или разрешённого пути равен `.git` без учёта регистра, на всех ОС; тест не тронут. Тест появился в `b296edd`
  (2026-10-04, «B5 review: tests — loop tools keep the core's containment…»). Коммит `dd1ce39`.

## Решения
- Д1: не-`cancelled` чекпойнт → `Lost` → вернувшийся, но не применённый выход не выдаётся за отмену и не засчитывается;
  это та же запись, что пишет переоткрытие, инкремент открыт для новой ячейки. Альтернатива: применять `Returned(exit)`
  до остановки (ловить в снимке после ячейки) — шире границ карточки.
- Д2: флаг на все вызовы → временный индекс (`candidates/shadow/…`) под тем же корнем упал бы следующим; через окружение,
  не `-c` → argv/`GitError` неизменны; прочие git ключ игнорируют. Относительные пути не помогают (cwd тоже ≤ MAX_PATH),
  `--stdin` по блобу ломает «один процесс git на снимок».

## Тесты
- До правки Д2: `ShadowRefTest` 14 / 1 fail (Filename too long). Циклов «правка → тест»: 1 (+1 прогон воспроизведения).
- L1 (Windows): `UnreadableFileScenarioTest` 1/0; `ShadowRefTest` 14/0 (1 skip, прежний); `LifecycleTest` 13/0 (новый
  юнит-тест Д1); `eval-live` `LoopToolsTest` 2/0 (1 skip — симлинки, после проверки `.Git`), `AskModeTest` 2/0,
  `LoopTest` 7/0, `ScenarioTest` 4/0.
- L2: `:core:test` campaign.*+workspace.*+workflow.* 396/0 (10 skip, 49 кл.); `:eval-live:test` 33/0 (1 skip);
  `assemble testClasses checkKotlinAbi -Pastrolabe.aiGateBuild=…` OK (публичный API не менялся). Токены не видны.

## Отклонения от карточки
- WF-4 на Windows не проходит через бегущую ячейку; фикстуру `io.astrolabe.workflow` не трогал (граница). Исправленный
  путь на Windows покрыт `LifecycleTest` «an unreadable input settles a running cell whatever its checkpoint…».
- Д3 на Windows не воспроизводится (ФС регистронезависима, ядро уже отказывает); подтверждение — CI Linux.

## Хвосты и риски
- `Lost` помечает вернувшуюся ячейку `failed` (учёт размеров инкремента) — только в гонке снимка после ячейки.
- Корень проекта длиннее ~246 символов на Windows: sqlite-jdbc не открывает `state.sqlite` (`SQLITE_CANTOPEN`), вне карточки.

Статус: ГОТОВО К СЛИЯНИЮ — последний коммит `dd1ce39`
