# WP-A6 — гигиена и безопасность

**Исполнитель:** задача (spawn task), тир t4. **cwd:** `C:\work.astrolab\ASTROLABE`. **Ветка:** `v2/A6`.
**Общие правила:** `C:\work.astrolab\plan2\COMMON.md`. **TODO:** P8.A.9.
**План:** §5 (таблица CT), §6 (A6). Источник пунктов: `ASTROLABE/CONTINUE-TASK.md` (версия 2026-10-01, «Next» 4–6) и
`TODO.md` §3 D-363…D-375 (контекст решений об эффектах); `C:\work.astrolab\phase0-progress.md:83`.

## Пункты (каждый — закрыть кодом с тестом или записать решение в отчёт)
1. `EffectPolicy` (`auth/EffectPolicy.kt`): (a) перевод строки в `cmd` — разделитель команд; (b) цели перенаправления
   (`>`, `>>`, `2>`) проверяются литерально как пути записи; (c) правило tmp — с проверкой ссылок (link/junction из
   tmp наружу не даёт W). Безопасность: при сомнении — строже (D), не мягче.
2. Рекурсивное удаление каталога со ссылками остаётся D (`node_modules/.bin` на POSIX): ослабить только для `rm`/`rd`
   с доказанным содержанием ссылок внутри рабочей области (CT Next 4; D-375 «delete/move — W только с доказанным
   содержанием»).
3. `Transform` классифицирует без пробы — добавить пробу или записать, почему безопасно (CT Next 5).
4. Pending-save crash: «падение между Returned и сохранением pending → новая ячейка заново предлагает» (phase0-progress
   :83) — довести до идемпотентности или записать решение (модельные вызовы есть, неверного состояния нет).
5. D-356 (`phase0/next-from-cursor`): **по коду ветка уже предок `main`** (проверено оркестратором) — подтвердить
   (`git merge-base --is-ancestor`), тесты Next-from-cursor зелёные → пункт закрыт; ветку не удалять (сделает оркестратор).
6. Flaky: `StamperTest` `git exited -1` (`TempRepo.runGit` без таймаута/повтора — добавить таймаут и вывод stderr);
   `ProcOwnershipTest` «execution deadline kills a grandchild» — READY timeout на Windows CI (тестовая сторона:
   ожидание/таймаут). **FX-22 `bg-end` в RunTest — не здесь (линия A5 владеет `Run.kt`/`RunTest`).** Повтор ×5 каждого.
7. `devtools/` (в корне рабочей области лежит JDK) попадает в атлас и выбор формы (files=1131 → S1, F №14): исключить
   игнорируемые/инструментальные каталоги из подсчёта (`atlas/`), без потери честности атласа.
8. `version` 64-hex в типе якоря факта регистра: поглощается D-365 (короткий хеш) — укоротить или записать решение.

## Границы
Не трогать горячие файлы других линий: `campaign/Controller.kt`, `context/`, `route/` (A1); `cell/Layout.kt`,
`cell/Cell.kt`, `tool/ToolSchemas.kt` (A3); `tool/edit/Edit.kt` (A4); `tool/run/Run.kt`, `os/` main (A5). Если пункт
требует правки там — минимальный изолированный hunk и запись в «Отклонениях», либо перенос пункта в «Хвосты».

## Проверки
- L1: тесты каждого пункта (существующие: `io.astrolabe.auth.BoundaryTest`, `...CeilingTest`,
  `io.astrolabe.tool.run.DiskContainmentTest`, `io.astrolabe.tool.edit.TransformTest`, `io.astrolabe.atlas.AtlasTest`,
  `io.astrolabe.workspace.StamperTest`, `io.astrolabe.os.ProcOwnershipTest` + новые кейсы); flaky — ×5 подряд.
- L2: `--tests 'io.astrolabe.auth.*' 'io.astrolabe.tool.*' 'io.astrolabe.atlas.*' 'io.astrolabe.workspace.*'
  'io.astrolabe.campaign.*' 'io.astrolabe.register.*'`, `:eval:compileTestKotlin`; `updateKotlinAbi`, если менялся API.

## Готово, когда
Все пункты 1–8 закрыты или записаны как решение; flaky-тесты повторены ×5 зелёными.
**Отказ:** ослабление `EffectPolicy` без доказанного содержания — не делать.

## Отчёт
`C:\work.astrolab\plan2\reports\WP-A6.md` (COMMON.md); по каждому пункту — строка «закрыт кодом / решение / хвост».
