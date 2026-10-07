# WP-D4 — golden `[S]` по протоколу, ≤ 15 fixtures direct, выбор протокола в Studio (P8.D.4, сессия 5)

Читать вместе с `plan2/COMMON.md` (обязательно). Исполнитель — t3. Две части, одна линия, порядок: сначала ядро, затем Studio.
- Ядро: ветка `v2/D4` от `main` ядра (после слияния D7 и C18), worktree `C:\work.astrolab\ASTROLABE\.claude\worktrees\D4`.
- Studio (корневой репозиторий `C:\work.astrolab`, модули `ASTROUI/backend/bridge`, `ASTROUI/backend/server`, `ASTROUI/frontend`):
  worktree `C:\work.astrolab\.claude\worktrees\D4` на ветке `v2/D4` корня (создаёт оркестратор, путь даётся при запуске);
  сборка против вашего worktree ядра: `-Pstudio.astrolabeBuild=C:/work.astrolab/ASTROLABE/.claude/worktrees/D4 -Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm`.
  **Никогда** не линковать `ASTROUI/frontend/node_modules` основного checkout в worktree; если frontend трогается — `npm ci` в worktree.
Спецификация: `docs/reference/kernel-contract.md` A-D.8 (стражи дрейфа — **список fixtures там, он обязателен**), A-D.7, A-D.5, A-D.6;
план §6 D4, §4.3 («защита от дрейфа — golden-байты `[S]` на каждый протокол и ≤ 15 fixtures direct»); `Log:` P8.D.1–D.3 в `TODO.md`
(долги D4); D-414 п. 1 (одна роль на S0 и S1 — golden-байты закрепляют это).

## Цель
1. **Golden `[S]` и отпечаток схем на каждую роль со своими байтами:** сейчас `cell/LayoutTest.kt:129-138` держит пару
   `GOLDEN_S_IMPLEMENTING` / `GOLDEN_SCHEMAS_IMPLEMENTING` (`:276-277`). Добавить пару для `Roles.direct` (A-D.8), а также
   golden `[S]` остальных структурных ролей со своими байтами (долг D1: plan, probe, review, repair — те, у кого `[S]` отличается;
   роли с одинаковыми байтами — один golden с проверкой равенства). Структурная пара снимается **после C18** (байты схемы `look`
   изменились один раз) — зафиксировать текущие байты `main`; direct — текущие. Сообщение об отказе остаётся прежним
   («a change here is a harness change — bump … VERSION and refresh the goldens»).
2. **Маски и главная линия (A-D.8, unit):** `Roles.mainLine` для каждого протокола и формы; эффективная маска `Roles.direct` в
   каждой форме: `state.note` и `task.finish` включены в S0–S3, `task.propose` замаскирован в S0 и включён с S1. Часть уже есть в
   `cell/RoleTest.kt` — дополнить, не дублировать.
3. **≤ 15 fixtures direct** по списку A-D.8 — сценарии через настоящую сборку (`campaign`-тесты с поддельным адаптером или
   `CellTesting`), один класс `DirectFixturesTest` (пакет `io.astrolabe.campaign` или `io.astrolabe.cell`; **не** `workflow`),
   каждый fixture — один тест с номером `DX-nn` в имени (без `.`/`:`/`;`). Уже покрытое в D1–D3 (`GatesTest`, `NoteTest`,
   `HandoffTest`, `TaskToolTest`, `RoleWiringTest`) **не повторять**: перечислить в отчёте таблицей «пункт A-D.8 → где покрыт»,
   новые fixtures — только для непокрытых пунктов. Долги D1/D2/D3 (из `Log:`): прогон S0 через `Controller` с
   `Config.protocol = Direct`; тело, замороженное до D1, переоткрывается без `config-frozen`; fixture «`state(blocked)` после
   split запускает replan» (Dp3); решённая поправка показывается `(pending)` до архивации; `AgentEvent.Blocked` уходит хосту при
   снятом блоке; текст «poll the handle» — первые три обязательны, остальные если входят в предел 15 (иначе хвост в отчёт).
   WF-15 действует для обоих протоколов: golden direct не переупорядочивает и не перерисовывает проецируемую голову `[S][R][K]` —
   один fixture это проверяет (префикс запроса direct-ячейки неизменен после уточнения/ответа), стражи `workflow` не трогать.
4. **Выбор протокола в Studio** (так, чтобы H5 расширял, а не заменял): настройка `config.protocol` = `auto | structured | direct`
   (по умолчанию `auto`), таблица «класс модели → протокол» для `auto` (`config.protocolByModelClass`, по умолчанию везде
   `structured`, пока D5 не решил), девятая роль `direct` в `declaredRolesJson` (`bridge/ConfigSupport.kt:49` — `Roles.defaults`
   должна её содержать; если нет — добавить в ядре). Места: `SettingsSchema.java:66-68` (строки `f(...)` раздел models, видимость
   «S P», применение `next-attempt`), `RunSpecs.kt` (протокол в `RunSpec.config`), frontend — настройка в существующем экране
   настроек (минимально: селект + таблица; `vocabulary.ts`). Класс модели — существующая `TierTable`/уровень профиля; если
   класса у профиля нет — `auto` = `structured`. Эффект наблюдаем в `RunSpecsTest` (Studio по умолчанию = `structured`; явный
   `direct` доходит до `RunSpec.config.protocol`; `auto` с таблицей выбирает по классу).

## Границы
- Ядро — ваши файлы: тесты `cell/LayoutTest.kt`, `cell/RoleTest.kt`, новый `DirectFixturesTest`, `cell/Role.kt` только если
  `Roles.defaults` без `direct`; `campaign/Controller.kt` и `cell/Cell.kt` — **только** если fixture вскрывает дефект и правка
  ≤ 20 строк (вы — текущий владелец обоих после D7/C18; ничего попутного). Не трогать `tool/ToolSchemas.kt` сверх чтения,
  `docs/reference/workflow-invariants.md`, `TODO.md`, `CONTINUE-TASK.md`, `actual_state.md`, `audit/`.
- Studio — ваши файлы: `bridge/ConfigSupport.kt`, `RunSpecs.kt`, `HostApi.kt` (если нужен геттер), `server/settings/SettingsSchema.java`,
  `TaskService.java` (вы владелец в этой волне; минимально), frontend settings + `vocabulary.ts`; тесты `RunSpecsTest`,
  `TaskWorkflowScenarioTest`/`StudioWorkflowScenarioTest` не ослаблять.
- Инварианты: WF-15 (golden direct как префикс), WF-11/13 (Studio `TaskService`) — стражи `*WorkflowScenario*` зелёные.

## Проверки
- Ядро L1: `./gradlew :core:test --tests 'io.astrolabe.cell.LayoutTest' --tests 'io.astrolabe.cell.RoleTest' --tests '<DirectFixturesTest>' -q --console=plain`.
- Ядро L2: `./gradlew :core:test --tests 'io.astrolabe.cell.*' --tests 'io.astrolabe.campaign.*' --tests 'io.astrolabe.workflow.*' -q --console=plain`
  и `./gradlew assemble testClasses checkKotlinAbi -Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm -q --console=plain`; ABI при смене публичного API.
- Studio L1/L2 (Gradle-корень Studio — `<worktree корня>/ASTROUI`, там `./gradlew … -Pstudio.astrolabeBuild=<ваш worktree ядра> -Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm`):
  `:backend:bridge:test --tests '*RunSpecsTest*' --tests '*WorkflowScenario*'`, `:backend:server:test --tests '*WorkflowScenario*'`
  (как в `plan2/reports/WP-WR2s.md`: bridge 25/0, server `*WorkflowScenario*` 25/0); frontend — `npm run build` только если он менялся.
- `export JAVA_HOME=/c/Users/user/.gradle/jdks/eclipse_adoptium-26-amd64-windows.2`. Не больше трёх циклов «правка → тест» на часть.

## Готово, когда
- Golden-пары для `implementing` и `direct` (+ структурные роли со своими байтами) зелёные и названы в отчёте с хэшами.
- Таблица покрытия A-D.8 полная; новых fixtures ≤ 15 в сумме с уже засчитанными direct-fixtures D1–D3 (счёт в отчёте).
- Studio: `config.protocol` и таблица по классу модели видимы в настройках и доходят до `RunSpec` (тест); по умолчанию поведение
  Studio не меняется (`structured`).
- L1/L2 ядра и Studio зелёные; WF 43/43 (+ ни одного нового класса в `workflow`).
- Отказ: fixture требует изменения поведения ядра > 20 строк → не чинить, хвост в отчёт (`БЛОКЕР`, если это блокирует golden).

## Отчёт
`C:\work.astrolab\plan2\reports\WP-D4.md`: Сделано · Решения · Тесты (команды, итоги, циклы, расход) · Отклонения ·
Хвосты и риски · таблица покрытия A-D.8 · `Статус: …` и последние коммиты (ядро и корень). Ревью линии нет — сквозное после D7+C18+D4.
Оценка расхода: ≤ 500 тыс. токенов.
