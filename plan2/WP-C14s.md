# WP-C14s — Studio: шаг после C14 (бюджет при возобновлении, явный effort, держащий лимит)

**Исполнитель:** суб-агент t3. **Репозиторий:** корневой `C:\work.astrolab` (Studio = `ASTROUI/`), ветка `v2/C14s` от `main`
(в `main` уже слиты C4 и C11s). **TODO:** P8.C.14 (шаг Studio). **Общие правила:** `C:\work.astrolab\plan2\COMMON.md`.
**Читать с:** решение D-405 (`rg -n '^\| D-405 ' C:/work.astrolab/ASTROLABE/TODO.md`), отчёт ядра
`C:\work.astrolab\plan2\reports\WP-C14.md` (API и раздел «Ревью»), отчёт `plan2/reports/WP-C4.md`.

## Что изменилось в ядре (main `693dfb2`, K = core/src/main/kotlin/io/astrolabe)
- Токенный бюджет контракта следует `CampaignPolicy.tokens` на reopen **только вверх**; останов `contract_budget` несёт
  причину (`ContractBudgetCause` tokens / turns / cost / unknown_usage): возобновляемы `tokens` (после подъёма) и `turns`.
- `OpenedCampaign.limitHold` (`LimitHold(stop, status, reason, limit, cause)`) — какой лимит держит после open.
- JSON несёт wire-слова: `BudgetStop` (`task_limit_money|minutes|requests`, `cell_cap`, `contract_budget`), `LimitKind`
  (`money`, `minutes`, `requests`), `CostBasis` (`billed`, `estimated`, `mixed`, `none`); старые имена констант читаются.
- `CellModel.effortExplicit` (по умолчанию false): явный effort хоста не сдвигается шагом подхода.

## Что сделать (пути от `ASTROUI/`; строки — по ревью, сверяй с кодом)
1. `backend/server/src/main/java/io/astrolabe/studio/campaigns/CampaignService.java:477` — возобновление шлёт
   `StartSpec("resume", 1, …)`: передавать сохранённый бюджет запуска, а не заглушку (ядро теперь игнорирует
   уменьшение, но заглушка остаётся ошибкой).
2. `backend/server/src/main/java/io/astrolabe/studio/tasks/TaskService.java:650-665` — комментарий «core keeps tokens
   from first open» неверен; `Math.max(tokens, 1)` при `contextTokens() == 0` — передавать осмысленное значение.
3. `backend/bridge/src/main/kotlin/io/astrolabe/studio/bridge/StudioHost.kt:295` — `CellModel` без `effortExplicit`:
   ставить `true` только когда effort выбрал пользователь (умолчание «Medium» — не выбор: `TaskService.java:660-664`,
   `CampaignService.java:290, 478`).
4. `StudioHost.kt:313`, `HostApi.kt:72-73` — добавить `limitHold` в `CampaignRef`; убрать поиск держащего лимита по
   `event_log` (`TaskService.java:214-228`), упростить `reopened` (`:603-608`).
5. `HostApi.kt:77-86` — ветка `BudgetStop` в `StopCodes.wire` больше не нужна (ядро отдаёт wire-слова); для `StopCode`
   оставить. Проверить, что чтение терпимо к обеим формам там, где читаются старые сохранённые записи.
6. `TaskService.java:781` (и `:194-199`) — возобновляем не только `cell_cap`: `contract_budget` с причиной `tokens`
   (после подъёма) и `turns` продолжается на месте; `cost` и `unknown_usage` — честный текст «продолжить нельзя»
   без кнопки, которая ничего не даст.
7. `StudioHost.kt:262, 288` — двойной open дублирует «still reached» в журнале и событии: один open на действие.
8. Фикстуры: `frontend/src/app/timeline/meter.spec.ts:7, 34`, `backend/bridge/src/test/kotlin/io/astrolabe/studio/bridge/TaskLimitsTest.kt:102`
   — на wire-слова.
Не трогать ядро; не хватает данных — в «Требуется от ядра».

## Проверки
Git Bash, `export JAVA_HOME=/c/Users/user/.gradle/jdks/eclipse_adoptium-26-amd64-windows.2`; Gradle Studio из
`C:\work.astrolab\ASTROUI` с `-Pstudio.astrolabeBuild=C:/work.astrolab/ASTROLABE`. Тесты затронутых классов backend и spec
затронутых компонентов frontend; в конце один раз — затронутые модули backend целиком. e2e и полный набор не запускать.
В ядре Gradle не запускать.

## Git
`git -C C:/work.astrolab switch -c v2/C14s`; коммитить только `ASTROUI/`; push `git push -q -u origin v2/C14s` (URL
remote не печатать); в `main` не сливать и на `main` не переключаться.

## Готово, когда
Возобновление не шлёт заглушку бюджета; явный effort пользователя не сдвигается подходом, умолчание — сдвигается;
держащий лимит берётся из ответа ядра; `contract_budget` показывается по причине; тесты зелёные; ветка запушена.

## Отчёт
`C:\work.astrolab\plan2\reports\WP-C14s.md` по формату COMMON.md.
