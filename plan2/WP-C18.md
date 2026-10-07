# WP-C18 — разрывы между модулями по вердиктам ревью; тест достижимости настроек (P8.C.18, сессия 5)

Читать вместе с `plan2/COMMON.md` (обязательно). Исполнитель — t3. Ядро: ветка `v2/C18` от `main` ядра (после слияния D7),
worktree `C:\work.astrolab\ASTROLABE\.claude\worktrees\C18` (создан оркестратором; работать только в нём).
Спецификация: план §6 C18, §14 (строка «Настройка или обещание схемы не доходит через сборку модулей»);
`C:\work.astrolab\CODEX-REVIEW-VERDICT.md`, абзацы после «Найдены и конкретные разрывы между модулями»;
`C:\work.astrolab\FABLE-REVIEW-VERDICT.md` §5 п. 9, §2.3. Пункт (3) карточки плана (настройки переноса) **уже сделан W9**
(`Defaults.seedFallback`, `parentCarryMaxTokens`, `seedsMaxTokens` в `SeedSelector`/`CarryForward`) — его не переделывать,
только покрыть тестом достижимости (п. 5).

## Цель (места сверены с кодом `main` на старте сессии 5; сверьтесь с деревом после D7)
1. **Бюджет чтения хоста доходит до `look`.** `Controller.kt:2668` строит `Look(…, budgetTokens = config.defaults.lookBudgetTokens)`,
   `Look.defaultReadTokens` (`tool/look/Look.kt:131-141`) его отдаёт, но `Cell.recording` (`cell/Cell.kt:1751-1753`) оборачивает
   исполнитель в SAM-лямбду `ToolExecutor { call, context -> … }`, реализующую только `execute`; `defaultReadTokens` падает в
   `null` (`tool/Dispatcher.kt:83`), и диспетчер подставляет `DEFAULT_LOOK_TOKENS = Defaults().lookBudgetTokens` = 4000
   (`:245`, `:258`), записывая его в аргументы вызова. Правка: обёртка делегирует `defaultReadTokens` (и любой другой
   метод интерфейса, кроме `execute`) исполнителю; `DEFAULT_LOOK_TOKENS` остаётся только для исполнителя без бюджета.
   Проверьте тем же способом остальные обёртки исполнителей в `cell/` и `delegate/` (ревью-ячейка, probe).
2. **Структурная схема `look` не обещает лишнего.** `find` с `in=kb` отвечает отказом «arrives in P2.6» (`Look.kt:338`), хотя
   `kb.search` есть; `since` принят схемой (`tool/ToolSchemas.kt:114`, `tool/Args.kt:25`) и отвергается в `recall`
   (`Look.kt:456`), в поиске не участвует. Решение по умолчанию: убрать `kb` из перечисления `in` и `since` из схемы `look`
   структурного протокола (в direct их уже нет), убрать мёртвые ветки; аргументы, переданные без схемы, по-прежнему дают
   понятный отказ парсера (не исключение). Байты структурной схемы меняются **один раз** в этой линии — D4 снимает golden после вас.
   Любой тест/golden, фиксирующий старые байты схемы, обновить и назвать в отчёте.
3. **Поиск берёт ripgrep, когда он установлен.** `Controller.kt:2668` жёстко `Searches.jvm()`; в `os/search/Search.kt` есть
   backend ripgrep. Правка: выбор backend один раз на открытие (ripgrep из PATH или настроенного пути, иначе JVM), результат
   журналируется одной строкой; тесты остаются офлайн и детерминированными (в тестах — JVM или фальшивый бинарник, как в
   `SearchBackendParityTest`). Семантика результатов `find` не меняется (паритет уже проверен тем тестом).
4. **Тест достижимости настроек (п. 5 плана).** Для каждого поля `Defaults` и `Config`, которое задаёт хост (конструкторы с
   параметрами, Studio `ConfigSupport`), — проверка через **настоящую сборку** `Controller` → ячейка → диспетчер → инструмент
   (каркас `Scenario`/`DirtyRepo` из `io.astrolabe.workflow` или реальная композиция `campaign`-тестов с поддельным
   адаптером), что ненулевое нестандартное значение дошло до потребителя: наблюдаемый эффект (бюджет в аргументе вызова
   `look`, предел в отказе, порог в событии). Поле без потребителя — **падение теста** с именем поля. Допустимо: один
   параметризованный класс `SettingsReachabilityTest` (пакет `io.astrolabe.campaign` или `io.astrolabe.workflow`? — **не** в
   `workflow`: набор WF не растёт) с таблицей «поле → как задать → что наблюдать». Поля, эффект которых нельзя наблюдать
   офлайн без модели (цены, живые провайдеры), перечислить явно как исключения с причиной — не молча.
   Если тест вскрывает **ещё** недоходящее поле — исправить, если правка ≤ 20 строк вне горячих файлов; иначе записать хвостом.

## Границы
- Ваши файлы: `cell/Cell.kt` (только обёртки исполнителей), `tool/Dispatcher.kt`, `tool/look/Look.kt`, `tool/ToolSchemas.kt`,
  `tool/Args.kt`, `campaign/Controller.kt` (только строка сборки `Look`/выбор backend), `os/search/` (выбор backend),
  `Defaults.kt`/`Config.kt` только если тест требует геттера; тесты: `tool.DispatcherTest`, `tool.look.*`, `tool.ToolSchemasTest`
  (или как называется golden схем), `os.search.*`, новый тест достижимости.
- Не трогать: `context/` (W9 сделал; только тест), `verify/`, `TaskService.java`, `docs/reference/workflow-invariants.md`,
  `TODO.md`, `CONTINUE-TASK.md`, `actual_state.md`, `audit/`. `docs/`: править только описание схемы `look` в
  `docs/reference/` там, где она перечисляет `in=kb`/`since` (одной строкой каждое).
- Инварианты, которых касаетесь: WF-14 (`cell/Cell.kt` — границы проекции не трогать), WF-15 (байты префикса: схемы
  входят в `[S]` — меняются один раз, стражи `AppendOnlyPrefixScenarioTest` остаются зелёными), WF-9 (ревью-ячейка читает —
  её обёртка тоже должна отдавать бюджет). Стражи не ослабляются.

## Проверки
- L1 (один раз): `./gradlew :core:test --tests 'io.astrolabe.tool.*' --tests 'io.astrolabe.os.search.*' --tests '<тест достижимости>' -q --console=plain`
  (`export JAVA_HOME=/c/Users/user/.gradle/jdks/eclipse_adoptium-26-amd64-windows.2`).
- L2 (один раз в конце): `./gradlew :core:test --tests 'io.astrolabe.tool.*' --tests 'io.astrolabe.cell.*' --tests 'io.astrolabe.campaign.*' --tests 'io.astrolabe.os.*' --tests 'io.astrolabe.workflow.*' -q --console=plain`
  и `./gradlew assemble testClasses checkKotlinAbi -Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm -q --console=plain`;
  публичный API изменён → `./gradlew :core:updateKotlinAbi` один раз, дамп закоммитить.
- Не больше трёх циклов «правка → тест»; четвёртый не начинать — `БЛОКЕР`.

## Готово, когда
- Нестандартный `lookBudgetTokens` хоста виден в аргументе `budget` вызова `look` через настоящую сборку (тест п. 4 это и показывает).
- Структурная схема `look` без `in=kb` и `since`; мёртвые ветки убраны; golden/тесты схемы обновлены один раз.
- ripgrep выбирается при наличии, иначе JVM; тесты офлайн зелёные на обеих ОС (на Windows — путь без PATH).
- Тест достижимости покрывает все поля `Defaults`/`Config`, задаваемые хостом, кроме явно перечисленных исключений с причиной;
  L1, L2 зелёные; набор WF 43/43.
- Отказ: правка затрагивает границу проекции `[S][R][K]` в `Cell.kt` или требует ослабить стража → `БЛОКЕР` с обеими сторонами.

## Отчёт
`C:\work.astrolab\plan2\reports\WP-C18.md` по COMMON.md: Сделано · Решения · Тесты (команды, итоги, циклы, расход) ·
Отклонения · Хвосты и риски (в т. ч. список полей-исключений теста достижимости) · `Статус: …` и последний коммит.
Ревью линии нет — одно сквозное ревью после D7+C18+D4. Оценка расхода: ≤ 450 тыс. токенов.
