# WP-C4 — Studio: лимиты на задачу, профиль, живой счётчик, ярлыки исхода с происхождением

**Исполнитель:** этап 1 — суб-агент t5 (дизайн, без кода); этап 2 — суб-агент t3 в worktree **корневого** репозитория
(`C:\work.astrolab`, Studio = `ASTROUI/`). **Ветка:** `v2/C4` (корневой репозиторий). **TODO:** P8.C.5.
**Общие правила:** `C:\work.astrolab\plan2\COMMON.md`. **План:** §6 C4, §4.4 (C2), §4.6, §1 строки 20, 26, §8.2
(Studio собирается с `-Pstudio.astrolabeBuild=<checkout ядра>`). **Зависит:** C2 (слит, D-396), C1b, C3 —
выпускаются вместе; этап 2 стартует после слияния C1b и C3 в `main` ядра.

## Цель
Пользователь Studio задаёт лимиты и профиль на задачу при старте, видит живой расход и честный исход.

## Этап 1 — дизайн (t5): `C:\work.astrolab\plan2\WP-C4-design.md`
По коду Studio (`ASTROUI/backend/bridge` `HostApi.kt`, `ASTROUI/backend/server` `TaskService.java`,
`ASTROUI/frontend/src` `features/task`) и API ядра (C2: `FinishReceipt`, `provenanceClass`; C3/C1b — по карточкам
`WP-C3.md`, `WP-C1b.md` и их отчётам, если есть) описать: изменения `StartSpec` (лимиты деньги / минуты / запросы
вместо глобального `Preferences.LIMIT` в токенах; профиль), поток данных живого счётчика (деньги, время, запросы,
контекст), экраны и тексты, список файлов и тестов этапа 2. Обязательные решения:
- Ярлыки исхода: «проверено независимо» / «проверено тестом агента» / «не проверено» (по `provenanceClass`).
  **Решение владельца 2026-10-03:** одобрение только судьёй review-ячейки — не «проверено независимо»; показывать
  отдельной пометкой «одобрено судьёй-моделью» (по `verifiedBy`).
- Исход по лимиту: «остановлено по лимиту» + лучший проверенный кандидат + действие «поднять лимит и продолжить».
- Карточка «сделать `npm test` проверкой проекта» (перенесена из C1b): предложение объявить проверку модели
  (`Origin.Model`) проверкой проекта.
- Потолки: ничего из дизайна не требует изменений ядра сверх C1b/C3; если требует — отдельным списком.

## Этап 2 — реализация (t3)
По `WP-C4-design.md`: bridge `HostApi`, server `TaskService` (вы — владелец файла в волне), frontend
`features/task`. Тесты: backend-тесты затронутых классов, frontend spec затронутых компонентов (не весь набор e2e).
Не трогать ядро; несовпадение API ядра с дизайном — в «Отклонения».

## Готово, когда
Лимиты и профиль уходят в ядро через `StartSpec`; счётчик живой; ярлыки и пометка судьи показаны; карточка проверки
проекта работает; тесты Studio по затронутому зелёные; ветка запушена (корневой репозиторий).

## Отчёт
`C:\work.astrolab\plan2\reports\WP-C4.md` по формату COMMON.md.

## Этап 2 — уточнения оркестратора (2026-10-03, после слияния C1b `d2b6d48` и C3 `c871b18` в `main` ядра)
Дизайн: `C:\work.astrolab\plan2\WP-C4-design.md` — блок «Поправка владельца» в его начале главнее остального текста.
Раздел дизайна «Допущения об API ядра» писался до C1b/C3: **сверь его с фактическим API** и работай по фактическому.

**Фактический API ядра** (checkout `C:\work.astrolab\ASTROLABE`, ветка `main`; K = core/src/main/kotlin/io/astrolabe):
- C3 — `C:\work.astrolab\plan2\reports\WP-C3.md`, раздел «Публичные имена API (для C4)» и «Решения»; решение D-401 в
  `ASTROLABE/TODO.md`. Коротко: `TaskLimits(maxCost: Money?, maxMinutes: Int?, maxRequests: Int?)`, `TaskLimits.NONE`;
  `CampaignPolicy(…, limits: TaskLimits? = null, balance: BalanceProfile? = null)` — `limits = null` оставляет сохранённые с
  кампанией лимиты, `NONE` снимает; `BalanceProfile` Economy / Balanced / Thorough; события `budget.spent` (`LimitStatus`,
  выпускается всегда, и без лимитов, и ещё раз в `finish`), `budget.limit_reached` (`limit`, `stage` reserve|stopped,
  `reason`, `status`, `bestCandidate`, `action`), `campaign.finished.budgetStop`; `BudgetStop`
  (`TaskLimitMoney|Minutes|Requests`, `CellCap`, `ContractBudget`; `taskLimit`, `resumable`, `wire`); `LimitStop(limit,
  reason, status, bestCandidate, verified, workingTree, workingStamp, verifiedEarlier, accepted)` в `S0Run.limit` и
  `FinishReceipt.limit`. Продолжить после поднятия лимита: `Controller.open(тот же CampaignRequest, CampaignPolicy(…,
  limits = поднятые))`, затем `run` (фасад `Astrolabe` для этого не годится — он создаёт новый `WorkId`; Studio ведёт ядро
  через `Controller`). Останов `CellCap` тоже возобновляется повторным `open`.
- C1b — `C:\work.astrolab\plan2\reports\WP-C1b.md`, решения D-397 и D-400: `Verdict.reviewer` (`"model"` | `"human"`,
  по умолчанию `model`, JSON без поля = `model`); `FinishReceipt`: `provenanceClass` (independent / agent_test / unverified),
  `acceptanceSurfaceModelApproved`, `verifiedBy` (`human` / `host_model` / tier судьи), `CheckRun.command` (argv + cwd),
  `checkOrigin`, `evidenceKind`, строки `openItems` «X known red since receipt #N (recorded by the runtime)».

**Обязательное сверх дизайна:**
1. `DecisionService` (≈ строка 445, там собирается вердикт ответа пользователя) шлёт `"reviewer":"human"`; `ReviewPass`
   явно шлёт `"reviewer":"model"`. Без этого одобрение человека в Studio получит класс `agent_test`. Понижение по подписи
   `studio:review-pass(` — только запасной путь для старых квитанций.
2. Умолчания лимитов $50.00 / 480 мин / 3000 запросов, «без лимита» по каждому полю; `maxCells` 48;
   `tokens = окно × max(12, requests ?? 10000)`; лимиты действуют на запуск (подпись в UI — «на запуск»).
3. Живой счётчик — по событию `budget.spent` (оно идёт всегда); останов по лимиту — по `budgetStop` / `budget.limit_reached`
   (типизированный код, а не разбор строки причины); технический потолок `CellCap` показывать как «продолжить», не как тупик.
4. Ярлык исхода: класс из `provenanceClass`; пометка «одобрено судьёй-моделью» — по `verifiedBy` / `acceptanceSurfaceModelApproved`;
   красная регрессионная проверка ядро само сводит к `unverified` — Studio класс не пересчитывает.
5. Слово в интерфейсе — «Подход» / "Approach" (`vocabulary.spec.ts` запрещает «профиль»); effort «по подходу», явный
   выбор хоста сильнее.

**Рабочее место и git.** Работай прямо в `C:\work.astrolab` (корневой репозиторий; worktree не создавай — в нём нет
`ASTROUI/frontend/node_modules`): сначала `git -C C:/work.astrolab switch -c v2/C4`. Коммить только пути `ASTROUI/`
(`git add ASTROUI`), файлы `plan2/` и план не добавляй — их коммитит оркестратор. Push: `git push -q -u origin v2/C4`
(не печатай URL remote). Ядро (`C:\work.astrolab\ASTROLABE`) не менять и Gradle в нём не запускать.

**Сборка и проверки.** `export JAVA_HOME=/c/Users/user/.gradle/jdks/eclipse_adoptium-26-amd64-windows.2`; Gradle Studio из
`C:\work.astrolab\ASTROUI` с `-Pstudio.astrolabeBuild=C:/work.astrolab/ASTROLABE`. После каждого цикла — только тесты
затронутых классов backend (`--tests`) и spec затронутых компонентов frontend, включая `vocabulary.spec.ts`; e2e и полный
набор не запускать. Объём выше 1,2 тыс. строк — урезай в порядке §7 дизайна и запиши, что отложено.

