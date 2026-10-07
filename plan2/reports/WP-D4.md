# WP-D4 — golden `[S]` по протоколу, direct-fixtures, выбор протокола в Studio (P8.D.4, сессия 5)

Исполнитель: t3 (Opus 5.5). Ветки: ядро `v2/D4` (от `ea55b5b`), корень `v2/D4` (от `3717b23`).

## Сделано
1. **Golden `[S]` и отпечаток схем на каждую роль** (`core/.../cell/LayoutTest.kt`, новый тест «every role with its own bytes
   has a golden S and schema set, the direct pair included»). Таблица `GOLDEN` роль → (`[S]` в TrustedLocal, отпечаток набора
   схем на `FakeProfiles.main`) для всех девяти ролей `Roles.defaults`; проверяется, что ключи таблицы = `Roles.defaults`,
   отпечаток = `ToolSchemas.fingerprint(role)`, все `[S]` различны, общий набор схем только у `writer` и `implementing`;
   `Roles.mainLine(Direct, S0) == Roles.mainLine(Direct, S1)` (D-414 п. 1: одна direct-пара). Прежний тест структурной пары
   и его текст отказа («a change here is a harness change — bump … VERSION and refresh the goldens») не тронуты.
2. **Маски** (`cell/RoleTest.kt`, +2 строки в существующем тесте direct-роли): эффективная маска `Roles.direct` в каждой
   форме равна целиком `toolMask − task.propose` в S0 и `toolMask` в S1–S3 (раньше проверялись только три имени).
   `Roles.mainLine` для каждого протокола и формы уже покрыт D1 (`RoleTest` «the main line's role is chosen…») — не дублировал.
3. **`DirectFixturesTest`** (`core/.../campaign/DirectFixturesTest.kt`, 6 fixtures DX-01…DX-06, только непокрытые пункты
   A-D.8 и долги D1–D3; таблица ниже). Дефектов ядра fixtures не вскрыли; `Controller.kt`, `Cell.kt` не менялись; пакет
   `io.astrolabe.workflow` не вырос.
4. **Studio: выбор протокола.**
   - `bridge/ConfigSupport.kt`: новый `public object StudioProtocol` — настройки `protocol` (`auto | structured | direct`,
     по умолчанию `auto`) и `protocolByModelClass` (класс модели → протокол; по умолчанию все четыре класса `structured`).
     Это ключи Studio рядом с полями `Config` в config-части слоя настроек; `ConfigSupport.decode` разрешает их в
     `Config.protocol` до декодирования (ядро видит только своё поле). Класс модели = уровень (`Tier`) главного профиля в
     `Config.tierTable` (нижний уровень, где профиль указан); профиль без класса → `structured`. Неверный выбор или ключ
     таблицы → `InvalidConfig` с именем ключа. `libraryDefaultsJson()` содержит оба ключа (нижний слой и `default` в схеме).
     `declaredRolesJson` уже отдавал девятую роль `direct` (`Roles.defaults` её содержит с D1) — исправлен KDoc, тест проверяет.
   - `bridge/RunSpecs.kt`: `taskConfigJson` разрешает `auto` для профиля задачи (`profileId`), а не для `profileRoles.main`
     слоёв — протокол доходит до `RunSpec.config.protocol`.
   - `server/settings/SettingsSchema.java`: две строки `f(...)` в разделе models («S P», `next-attempt`, `editable`).
   - frontend: настройка 20 `protocol` в разделе «Дополнительно» существующего экрана (сегмент auto/structured/direct +
     таблица класс → структурный/прямой), читает `GET /settings` (слой Studio, ревизия, эффективные значения) и сохраняет
     слой командой `settings.save` с ожидаемой ревизией. Каталоги EN/RU без запрещённых слов словаря.
   - `TaskService.java` не менялся: протокол идёт через `RunSpecs.taskConfigJson`, который он уже вызывает.

## Решения
- Где хранить `auto` и таблицу → в config-части слоя под ключами `protocol`/`protocolByModelClass` (как в карточке:
  `config.protocol`), разрешение в мосте при декодировании → ядро не знает про `auto`, все пути декодирования (валидация,
  открытие проекта, старт задачи) видят одно правило. Безопасная альтернатива: ключи `runtime.*` и разрешение в `TaskService`.
- Чистый `Config`-JSON без обоих ключей проходит без изменений (`resolve` их не трогает) → закодированная ядром конфигурация
  (`"protocol":"direct"` или его отсутствие = structured) читается как прежде.
- Класс модели при нескольких уровнях → нижний уровень, где профиль указан (детерминировано по `Tier.entries`).
- Frontend сохраняет через существующую команду `settings.save` (слой Studio целиком, ожидаемая ревизия), без нового API.

## Отклонения от карточки
- `vocabulary.ts` не менялся: слова протокола не запрещены. Изменён `vocabulary.spec.ts`: имя команды `'settings.save'`
  добавлено в `NOT_KEYS` (список «names … that look like keys»), иначе проверка каталога принимает его за ключ перевода.
- `features/task/task.spec.ts`: нумерация настроек 1…19 → 1…20 (бюджет «не больше двадцати» соблюдён; тест не ослаблен).
- Карточка: «Roles.defaults должна содержать direct; если нет — добавить в ядре» — уже содержит, ядро не менялось.

## Тесты
- Ядро L1 (1 цикл): `:core:test --tests 'io.astrolabe.cell.LayoutTest' --tests 'io.astrolabe.cell.RoleTest'
  --tests 'io.astrolabe.campaign.DirectFixturesTest'` → 13/0, 6/0, 6/0 (с первого прогона).
- Ядро L2 (1 прогон): `:core:test --tests 'io.astrolabe.cell.*' --tests 'io.astrolabe.campaign.*' --tests 'io.astrolabe.workflow.*'`
  → 63 класса, 558/0, WF 43/43 (новых классов в `workflow` нет); `assemble testClasses checkKotlinAbi
  -Pastrolabe.aiGateBuild=…` зелёный. Публичный API ядра не менялся (только тесты) — ABI не регенерировался.
- Studio (1 цикл, `-Pstudio.astrolabeBuild=<worktree ядра D4>`): `:backend:bridge:test --tests '*RunSpecsTest*'
  --tests '*WorkflowScenario*'` → RunSpecsTest 3/0, StudioWorkflowScenarioTest 4/0; `:backend:server:test
  --tests '*WorkflowScenario*'` → TaskWorkflowScenarioTest 20/0, CampaignWorkflowScenarioTest 1/0. Повторный запуск с `:backend:server:compileTestJava` — всё UP-TO-DATE, зелёный.
- Frontend: `npm ci`, `npx vitest run vocabulary.spec.ts task.spec.ts` → 60/2; оба падения есть и на `3717b23` без правок
  (проверено на stash): `verified.unavailable` содержит «evidence», текст WF-8 карточки приёмки — хвост, не D4.
  `npm run build` зелёный.
- Циклы «правка → тест»: ядро 1, Studio 1 (+1 правка `NOT_KEYS` после первого прогона vitest). Расход токенов не виден
  точно; оценка ≈ 250 тыс.

## Хвосты и риски
- Не сделаны (вне файлов линии, предел 15 исчерпан): решённая поправка показывается `(pending)` до архивации
  (`NotesRender.kt`); `AgentEvent.Blocked` уходит хосту при снятом блоке (`tool/state/StateTool.kt:285`); «poll the handle»
  → «wait on the handle» (`tool/run/Run.kt:778`, меняет байты обоих протоколов).
- Не покрыты fixtures (не в списке A-D.8): строки 1–2 таблицы A-D.5 (finish + отвеченный `task(ask)`), реоткрытие с
  сохранённой записью без расхода (хвосты D3).
- Frontend-настройка проверена сборкой и словарными тестами, не e2e; сохранение слоя проходит полную валидацию
  `ConfigSupport.validate` — при невалидном слое Studio сохранение протокола откажет с ошибкой слоя.
- Предсуществующие красные frontend-тесты (2) — см. «Тесты».

## Покрытие A-D.8
| Пункт A-D.8 | Где покрыт | Fixture |
|---|---|---|
| Golden `[S]` + схемы `implementing` и `direct` (+ остальные роли) | `LayoutTest` «every role with its own bytes…» (D4) | unit |
| `Roles.mainLine` для каждого протокола и формы | `RoleTest` «the main line's role is chosen…» (D1) | unit |
| Маска `direct` в S0–S3: note/finish везде, propose с S1 | `RoleTest` «the direct role lists 23 operations…» (D1 + D4 полная маска) | unit |
| Заметка каждого вида | `NoteTest` «every kind is recorded…» (D2, unit); `CellTest` «a direct cell journals its notes…» (D2) | CellTest-830 |
| `closes`, `refutes`, отказ заметки | `NoteTest` (поле не того вида, проверка опровержения, dead end без записи); `ValidatorTest` «closes and refutes at a full register» (D2) | unit |
| Ячейка от первого хода до finish без патча | **DX-01** (S0 через `Controller`, `protocol = Direct`) | DX-01 |
| Первый ход без вызова (nudge) и второй (предложение) | `CellTest` «a direct turn without a call only nudges…» (D3) | CellTest-755 |
| Plain и conditional finish с отказом каждого | `CellTest` «a direct finish alone…», «a finish beside passing work…» (D3) | CellTest-698, -727 |
| `finish not attempted` с невалидным спутником | **DX-06** (невалидный `run` + finish); вариант «edit не применён» — `CellTest`-727 | DX-06 |
| Сброс счётчика изменением дерева; второй отказ plain без него | `CellTest` «a direct finish alone…» (D3) | (698) |
| Handoff в S0 и S1, реоткрытие между эпохами, грант исчерпан | `HandoffTest` «runS0 continues…», «a direct S1 line hands off…», «a reopen after a crash restores the grant…» (D3) | Handoff-163, -129, -187 |
| Бюджет ходов с работой и без | `CellTest` «a spent turn budget hands off only…» (D3) | CellTest-806 |
| Архивация регистра, отказ по ёмкости, блок по ёмкости под loop-воротами | `ValidatorTest` «a direct register archives…», `FactCoherenceTest`, `NoteTest` «a note refused for capacity…» (D2) | unit |
| Обязательная заметка loop-ворот | `GatesTest` «the direct protocol changes gate wording only…», `NoteTest` «a required note recorded first…» (D2) | unit |
| Скрытая операция в direct; direct-only в structured | **DX-05** (уровень ячейки, обе стороны); unit — `TaskToolTest` finish masked, `NoteTest` flat form | DX-05 |
| `task.propose` отказан в S0; split записан в S1 | `CellTest` «a direct cell sends its own S…» (D1/D2); **DX-03** | CellTest-652, DX-03 |
| Долг D1: S0 через `Controller` с `Direct` | **DX-01** | — |
| Долг D1: тело до D1 открывается без `config-frozen` | **DX-02** | DX-02 |
| Долг Dp3: `state(blocked)` после split → replan | **DX-03** | — |
| WF-15 для direct (голова `[S][R][K]` — префикс) | **DX-04** (golden direct `[S]` = `Layout.system(direct)`, ответы и ревизия только дописываются) | DX-04 |

Счёт direct-fixtures (сценарии через сборку; unit-тесты инструментов не считаются): засчитанные D1–D3 — `CellTest` 652,
698, 727, 755, 806, 830 (6) + `HandoffTest` 129, 163, 187 (3) = 9; новые DX-01…DX-06 = 6; **итого 15 ≤ 15**.

## Golden-хэши (SHA-256, `[S]` в TrustedLocal / отпечаток схем на `FakeProfiles.main`)
| Роль | `[S]` | схемы |
|---|---|---|
| implementing | `311827f81e8390431317be6be1732eef68fc76872729623f6dcc12b1c7dce024` | `cfe7784bcfc70dbddff371d84db2a80fda042172d43bb73ee9e61f19cacd2858` |
| direct | `015fc5bd535ed9a1ececb530044f0cad6bffb26abd72203fa01eb0ebcd134767` | `1ef3b4ba75ab9f8c0b960677a02462783d66b184c0cbf1e38a976a28d90f1f4b` |
| plan | `478142ac99f4d5b31f8f397279373eab313e9e27b3f505eec4f18ca4c5addeb4` | `f7f36060e0162042860feff312325a0626263fa9c8e60ff6cf4b9fa1b2527a87` |
| probe | `b5c5739efcbc037785b3e149e3d1ebd89054d9d2f2cadb7421bbc0e3a665f492` | `141099704ee3191db91f8b90a6576aab299503e8e90e4558c6fab76c48299645` |
| review | `9c58d5e6b7b4cc57d2386594f539f4aff5fc8b2ed6f0c65c06eb8a477470d0d6` | `448263e08a4d68d8b72758e483f66c05ca2e0cb3fa7f8b5e985dbe1b188595f9` |
| qa | `13bce1146538d36d266db8ab3ca67f65707cfd9a8467c607d69bdee348320922` | `b5ccfa954e4c01d6c1d098f94bacc18b481b71879f8397c8cfccae1b540dabbe` |
| writer | `1bef7859f822ee0b8001cdc813dda6bf32b4e5541ec423309ab00cf87459705f` | = implementing |
| repair | `28e3167b8b553a44897c75c0817cec86474fa6861b60c30f96d841567bad8b12` | `c072159dd8d57eb3cee7e09b430d016946218327f33756151317f594e003b7e0` |
| extractor | `0d259f5beb4f7eed75d51480b121f8f0b0d71f2628bcd7f0455c923021cb84f3` | `28e31acd2df192b9f37f264d0879c4920631cfb9637eab5190ca2f6eb9e059d0` |

Структурная пара `implementing` совпадает с байтами `main` после C18 (`cfe7784…`).

Статус: ГОТОВО К СЛИЯНИЮ

Последние коммиты: ядро `v2/D4` — `5e5520d` (goal 3; также `89d70c7` goal 2, `69b7bb6` goal 1); корень `v2/D4` — `7c6e5d2` (goal 4).
