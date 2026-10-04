# WP-S4s — отчёт: шаги Studio сессии 4 (P8.B.7, P8.C.16, P8.C.15)

Ветка `v2/S4s` корневого репозитория (от `main` `89e270b`), правки только в `ASTROUI/`. Ядро — `ASTROLABE` `main` `440ebb7`
(только чтение). Три части — три коммита: `dd25d51` (RunSpec), `c4f4881` (подписка), `5fa0f9c` (auto и класс D).

## Сделано

### Часть 1 — запуск Studio из `RunSpec` ядра (P8.B.7)
- Новый `backend/bridge/.../RunSpecs.kt`:
  - `of(spec, config, main)` (:45) — `RunSpec.defaults(main, config.stateRoot, config.mode)` + выбор пользователя из
    `StartSpec` через `copy` (Kotlin, в мосте). `maxCells`, `leaseMinutes`, `maxOutputTokens` зажимаются до 1, как и
    раньше (0 из настроек не роняет запуск, `require ≥ 1` ядра не срабатывает).
  - `policy(spec, defaults)` (:64) — бывший `StudioHost.corePolicy`, теперь `defaults.copy(...)` политики `RunSpec`.
  - `taskConfigJson(configJson, profileId, taskMode)` (:31, Java) — поля запуска конфигурации (`profileRoles`, `mode`,
    `dClass`, `unknownOutcomeReconciliation`) берутся из `RunSpec.defaults(...).config`; режим задачи передаёт Studio
    (`auto` → `Autonomous`, иначе `Interactive`).
- `StudioHost.launch`: `RunSpecs.of(...)` (:248) → `run.config`, `run.leaseDuration`, `run.policy`,
  `run.cellModel(...)` (:292), `maxCells = run.maxCells` (:318). `corePolicy`/`cellModel` из `StudioHost` удалены,
  `AutoProfiles.outputHeadroom` удалён (правило — `RunSpec.outputHeadroom`).
- Умолчания без своих чисел: `StartSpec` (`maxCells`, `leaseMinutes`, `effort`, `preset`) → константы `RunSpec` /
  `BalanceProfile.Balanced.wire`; `TaskLimits.DEFAULTS` (HostApi.kt:65) из `RunSpec.LIMITS`; сервер: `Limits.DEFAULTS`
  из него, `SettingsService.RUNTIME_DEFAULTS`, `Preferences` (`defaultEffort`, `defaultPreset`), `TaskService.spec`
  (`RunSpec.tokenGuard` вместо `TOKEN_GUARD_WINDOWS`, :689; `MAX_CELLS`, `LEASE_MINUTES`, `EFFORT`), `TaskService.config`
  (:670 → `RunSpecs.taskConfigJson`), старый путь `CampaignService.legacySpec` (48/480/"Medium"/"balanced").

### Часть 2 — цена и условный расход подписочной модели (P8.C.16)
- `AutoProfiles.make(..., planBilled, subscription)` (:66): подписка → `AiGateProfiles.planPriceTable(...)` (таблица
  `Billing.Plan` с официальной ценой), нет цены → пустая `Plan`-таблица (вызовы `unpriced`, без денежного учёта).
  Локальный сервер и демо — как раньше (пустая `Plan` только при отсутствии цены). `ModelService.bind` передаёт
  `subscription` = учётная запись `oauth`.
- Список моделей (`ModelService.dto`, :249): у подписочной модели знак цены по официальной таблице
  (`subscriptionMark`, :124; кэш `officialPrice` по `provider/model@дата`, :83–88) и `nominal: true`; без цены —
  `price: "unpriced"`. Прежний знак `included` убран. Frontend `model-picker.ts:116`: «$$ условно» / «$$ nominal»,
  «без денежного учёта» / «no money accounting».
- `StatsService`: `price` (:151) читает `charge` вызова из `body` строки `usage` (`CallAccount.charge`, нет — `paid`);
  `nominal` — в общей сумме и отдельно; `unpriced` — токены считаются, деньги нет, счётчик
  `callsWithoutMoneyAccounting` (не «неизвестная цена»). В JSON итогов добавлены `paidMoney`, `nominalMoney` (:91),
  `callsWithoutMoneyAccounting` (:95), строка покрытия «… N without money accounting».
- Счётчик задачи (`timeline/meter.ts:67`, `features/task/limits.ts:80, :88`): из `budget.spent` берутся `paidCost`,
  `nominalCost`, `unpricedRequests`; при условном расходе — «≈ $1.20 (оплачено $0.00, условно $1.20)», при запросах без
  денежного учёта — «запросов без денежного учёта: N». Тексты в `catalog.en.ts` и `catalog.ru.ts`.

### Часть 3 — режим auto и команды класса D (P8.C.15)
- **Что отвечал `auto` до правки (по коду).** Задачи Studio всегда идут с `hostAuthority = true` (`TaskService.spec`),
  поэтому решения принимает сервер, `DecisionService.approve`: эффект с `contractAllowlisted` или из allow-list
  проекта — одобрен политикой; иначе в `auto` **сразу отказ** `approved:false`, причина «auto mode: this action needs
  your approval», строка политики со статусом `skipped` (на карточке результата «Пропущено, требовалось ваше
  разрешение» с «Разрешить и продолжить»); в `ask` — карточка. Мост (`RecordingAutonomousAuthority`, только старый
  API кампаний без host authority): `AutonomousAuthority` ядра — одобрено только `contractAllowlisted`, иначе отказ
  «autonomous mode: D-class effect not allowlisted by the contract».
- **После.** `DecisionService.approve` (:125–135): allow-list одобряет как раньше; всё остальное в `auto` поднимает
  ту же карточку, что в `ask` (`raise`), без автоматического одобрения. Мост `HostAuthority.kt:75`: запрос без
  `contractAllowlisted` уходит в порт хоста (карточка), разрешённый контрактом — политика с записью строки, как раньше.
  Подсказка режима `mode.auto_help` (оба каталога) исправлена: «Спрашивает перед рискованными действиями, которые вы
  не разрешали раньше».

## Решения
- Где собирать конфигурацию: сервер сливает слои настроек, мост накладывает поля запуска из `RunSpec.defaults`
  (`RunSpecs.taskConfigJson`, вызывает сервер) → выбор: накладывать только на пути задач, а не в каждом `launch` →
  старый API кампаний передаёт свои `dClass`/`unknownOutcomeReconciliation` из настроек (резюм проверяет `Host`), общий
  оверлей сломал бы его → безопасная альтернатива: перенести оверлей в `launch` с флагом в `StartSpec`.
- Нули из настроек: зажим до 1 (поведение Studio сохранено), включая `maxOutputTokens` (0 → запас 1 токен, как раньше);
  альтернатива — считать 0 «без сужения».
- `RunSpec` строится до `open` по основному профилю конфигурации (`config.mainProfile`, проверен `runConfig`);
  `cellModel` после `open` — по профилю замороженной попытки, как раньше. Профиль в `RunSpec.defaults` влияет только на
  `config`/`tokens`, которые всё равно заменяются, — замена профиля после `open` расхождения не даёт.
- Официальная цена только для `oauth`: для локального сервера правило «та же модель у единственного платного
  провайдера» могло бы дать случайную условную цену и денежный лимит локальной модели.
- Поле для цены, введённой пользователем, у автоматических профилей нет (профиль перезаписывается при каждом
  `bind`) → профиль без цены; поле не строилось (в «Хвосты»).
- В статистике имя `unpricedCalls` уже занято (неизвестная цена) → новый счётчик `callsWithoutMoneyAccounting`, а не
  переопределение смысла существующего поля.
- Мост: `RecordingAutonomousAuthority` тоже не отказывает (карточка через порт), чтобы `auto` вёл себя одинаково на
  обоих путях.

## Тесты
Циклов «правка → тест»: 1 (всё зелёное с первого прогона). Перед коммитом части 1 — одна компиляция
`:backend:bridge:compileTestKotlin :backend:server:compileTestJava` (OK).
- L1, `./gradlew -Pstudio.astrolabeBuild=C:/work.astrolab/ASTROLABE :backend:bridge:test --tests …TaskLimitsTest
  …OutputHeadroomTest …RunSpecsTest …AutoModeAuthorityTest :backend:server:test --tests …tasks.TaskLimitsTest
  …stats.StatsPriceTest 'io.astrolabe.studio.decisions.*'`: bridge TaskLimitsTest 4, OutputHeadroomTest 3, RunSpecsTest 2,
  AutoModeAuthorityTest 1; server TaskLimitsTest 22, StatsPriceTest 2, AutoModeEffectsTest 2, AcceptanceDecisionsTest 7,
  IntegrityReviewTest 10 — 0 падений.
- Новые тесты: `RunSpecsTest` (запуск с настройками по умолчанию = `RunSpec.defaults` для того же профиля и режима
  `auto`/`ask` — сверка объектов, не чисел; 0 из настроек → 1), `AutoModeAuthorityTest` (мост), `AutoModeEffectsTest`
  (сервер: `auto` → карточка, ответ пользователя доходит; allow-list одобряет без карточки), `StatsPriceTest`.
  Изменены: `OutputHeadroomTest` (те же случаи через `RunSpecs.of(...).outputHeadroom`, т.к. `AutoProfiles.outputHeadroom`
  удалён), `TaskLimitsTest` моста (вызовы удалённых `corePolicy`/`cellModel` → `RunSpecs`).
- Frontend: `npx vitest run src/app/timeline/meter.spec.ts src/app/features/task/task.spec.ts src/app/vocabulary.spec.ts
  src/app/features/panel/flow/flow.spec.ts` — 4 файла, 115 тестов, 0 падений (добавлены случаи условного расхода);
  `npx tsc --noEmit -p tsconfig.app.json` — OK.
- L2 (модули целиком): `./gradlew -Pstudio.astrolabeBuild=C:/work.astrolab/ASTROLABE :backend:bridge:test :backend:server:test --continue` — bridge 21 тест (9 классов), server 74 (9 классов), 0 падений. Сбоев на коде ядра не было, повторов не понадобилось.

## Отклонения от карточки
- Карточка: «слои настроек сливаются поверх `RunSpec.defaults(...).config`». Сделано наоборот: поля запуска из
  `RunSpec.defaults` накладываются поверх слоёв (так было и раньше с литералами `Ask`/`Automatic`); иначе настройки
  проекта могли бы переопределить `dClass`/режим задачи. Итог для настроек по умолчанию — тот же (проверено тестом).
- Удалён `AutoProfiles.outputHeadroom` (B7: «→ `RunSpec.outputHeadroom`»), его тест переписан на путь `RunSpec`.
- Текст подсказки режима `auto` изменён (иначе он обещал бы «пропускает»), это не новый экран.

## Требуется от ядра
- Ничего блокирующего. Желательно: публичный `officialPrices` пакетно (сейчас `planPriceTable` на каждую модель
  загружает бандлы SDK; в Studio кэш по дате).

## Хвосты и риски
- Поле ввода цены для подписочной модели без официальной цены не построено (по карточке).
- Карточка результата «Пропущено, требовалось ваше разрешение» и «Разрешить и продолжить» теперь видны только у старых
  запусков (`skipped`); код оставлен.
- В `auto` запрос класса D теперь ждёт человека: задача без ответа стоит, как в `ask` (напоминание о решении есть).
- Кэш официальных цен в `ModelService` живёт до смены даты; обновление каталога в тот же день не видно в списке (профиль
  при `bind` берёт цену заново).
- `StatsService` по-прежнему пересчитывает деньги по таблице и не учитывает `billed`: вызов подписки с положительным
  счётом (ядро: `paid` по счёту) в статистике будет «оплачено» по условной цене таблицы.
- `frontend/.../limits.ts` `DEFAULT_LIMITS` по-прежнему дублирует 50 / 480 / 3000 (вне шага бэкенда).
- Живой прогон не делался: знак цены подписки проверен только кодом и тестом статистики, не в браузере.

## Ревью и исправления (Opus, один раунд)
Вердикт: «можно сливать», P1 нет. Исправлено одно замечание (решение владельца №25: условный расход всегда помечен
отдельно): строка расхода задачи в панели и на карточке результата показывала `totals.money` (оплачено + условно) как
обычную цену.
- `backend/server/.../tasks/TaskService.java:388–430` `usage()`: суммирует ещё `totals.nominalMoney`; если условный
  расход есть, `cost` получает `paidAmount` и `nominalAmount` (иначе строка как раньше).
- `frontend/.../ui/units.ts:24, :41–42` `usageText`: при `nominalAmount` — «$1.20 (оплачено $0.00, условно $1.20)»
  (тот же текст `meter.split`, он уже есть в обоих каталогах); `core/model.ts` — поля в типе `usage.cost`. Используется
  в `cards.ts:438` и `progress.ts:99` без изменений.
- Тесты (1 прогон): новый `ui/units.spec.ts` + `vocabulary.spec.ts` — 13 прошли; `tsc --noEmit` OK; сервер
  `io.astrolabe.studio.tasks.*` — ProvenanceTest 8, ReviewPassTest 8, TaskAcceptanceTest 12, TaskLimitsTest 22, 0 падений.

Записано в хвосты (не чинилось):
- `StatsService.java:162–187` — вызов подписки с положительным счётом ядро считает оплаченным по счёту, статистика — по
  таблице (расхождение с суммой лимита; читать `usage.billed`).
- `RunSpecsTest.kt` собирает `StartSpec` вручную, а не через `TaskService.spec` и `SettingsService`.
- `frontend/.../features/task/limits.ts:12` повторяет 50 / 480 / 3000.
- `StudioHost.kt:248` — `checkNotNull(config.mainProfile)` до `open` убрал запасной путь через профили замороженной
  попытки (догадка ревью; случая в Studio не найдено: `runConfig` уже требует основной профиль в конфигурации).
- `ModelService.java` — кэш официальных цен (`officialPrices`) не очищается (ключ по дате, растёт медленно).

Статус: ГОТОВО К СЛИЯНИЮ — ветка `v2/S4s`, последний коммит `eb9dd10` (запушен).
