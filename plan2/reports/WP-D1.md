# WP-D1 — `Roles.direct`, `kernel-direct/1`, подмножество схем, переключатель `protocol` (P8.D.1)

Ветка `v2/D1` от `main` `a5d8ffa`, перед L1 слит `main` `2c8b288` (только TODO.md, без конфликтов); запушена.
Коммиты: `5cd63dc` (код), `56e2824` (тесты), `af3d867` (merge main), `84a3f52` (исправление двух тестов), `9db408e`
(JvmOverloads + дамп ABI); после ревью: `39be554` (merge `main` `440ebb7`, C16, без конфликтов), `7543bf2` (KDoc).

## Сделано
- **Протокол (A-D.1).** `Protocol { Structured, Direct }` (`cell/Role.kt:19`, serial `structured`/`direct`);
  `Role.protocol` (`Role.kt:67`, не кодируется по умолчанию) + явный прежний 13-параметровый конструктор для Java;
  `Config.protocol` (`Config.kt:97`, `@EncodeDefault(NEVER)`, по умолчанию `Structured`) + прежний полный конструктор,
  `withProtocol`; заморожен в `AttemptConfig` через снимок конфигурации.
- **Роль и выбор.** `Roles.direct` (`Role.kt:241`): копия `implementing` (view, scopes, skill filter, permission, tier,
  ask-back, policy version, packet), 23 операции, без persona, duties A-D.1, `protocol = Direct`; в `Roles.defaults`.
  `Roles.mainLine(protocol, shape)` (`Role.kt:266`) — единственное место условия формы; `Direct` × S2|S3 →
  `implementing` (`:270`, ветка H1).
- **Маски форм (A-D.3 п. 3).** `ToolOps.directOnly` во всех четырёх масках (`Role.kt` `shapeMask`, `S0_MASK`/`S1_MASK`/
  `ALL_MASK`); `ToolOps.implementingS0` не тронут (это маска по умолчанию инструментов). Структурные эффективные маски
  не изменились (тест по всем ролям × формам).
- **Известные операции (A-D.3 п. 2), все 7 мест:** `ToolCall.kt:122`, `Args.kt` (state, task), `Role.kt` init,
  `ToolSchemas.forLineage(mask)`, `Capability.kt:127`, `Capsule.kt:27`, маски форм. `ToolOps.known`, `ToolOps.directOf`
  (порядок имён direct, п. 4) — `tool/ToolFamily.kt:73-95`.
- **Схемы (T2, T3).** `ToolSchemas.forLineage(adapter, profile, role)` и `internal fingerprint(role)` идут через одну
  функцию `schemas(role)` (`ToolSchemas.kt:83`); прежний `forLineage(…, mask)` — структурный набор. Direct: 6 схем,
  enum операций и свойства сужены по маске (edit — поля форм; state — `note`/`blocked`; task — question/options, text,
  after_checks, kind+proposal; verify — только `paths`); `proposal` — открытый `{type, description}` без `amendment`;
  описания A-D.3 дословно, у verify и task собираются из клауз операций (`DIRECT_VERIFY`, `DIRECT_TASK`, `:195, :200`).
  `Cell.kt:181` и `Precompile.kt:134` берут набор и отпечаток от роли.
- **Kernel и `[S]` (S1–S4).** `KernelDirect` (`Layout.kt:88`, 8 строк, 2 194 символа — сверено с A-D.2);
  `ErrorPolicy.directRows` (13 строк, `note refused` на месте строки STATE, `:158`), `ErrorPolicy.render(protocol)`;
  `Layout.system`: версия kernel — функция роли (`kernelVersion`, `:278`), текст kernel (`:239`), `tools:` и строка
  enabled по именам протокола роли (`names`, `:281`).
- **Валидатор (V1, V3).** `Validator(…, protocol)` (`Validator.kt:73`); правило Next выключено для `Direct` (`:218`);
  `Controller.kt:2268` передаёт `role.protocol`.
- **Ворота (G1–G5, G8, G9).** `GateState.protocol` (`Gates.kt:244`); меняется только текст: loop (`loopRequirement`,
  `:330`; `requiredOp = "state"` прежний), entry, pressure, stall, refusal loop, scope; `ImpactNudge.line(protocol)`,
  `ImpactNudges.summary(…, protocol)`; отказ edit-инструмента при повторном выходе за scope (`Edit.protocol`).
  Текст whole-turn отказа loop-ворот в `Cell.kt:913`.
- **Seeds (K1).** `SeedRule.of(protocol, configured)` (`SeedSelector.kt`); потребители: `Cell.kt:1186` (rebuild),
  `Controller.carryFrom` (роль принимающей ячейки).
- **Группа R.** `Controller.mainLine(c, contract)` (`Controller.kt:1236`); заменены `:955, 972, 1002` (одна роль на
  итерацию, `:931`), `:1231` (fingerprint), `:1253, 1257` (precompile trigger), `:1410` (RoleSwitch), `:1574, 1600`
  (runS0), `:2452` (increment review); `CellOrder.key/next` берут роль. `StoreKb.kt:24` — см. «Отклонения».
- **`note`/`finish` только объявлены.** `StateArgs.note` (сырой `JsonElement`), `TaskArgs.afterChecks`; вызов
  отвечает `unsupported`: «… is declared by the direct protocol and not implemented in this harness version; the call
  had no effect» (`StateTool.kt:111`, `TaskTool.kt:124`, текст `ToolOps.notImplemented`).
- `@JvmOverloads` на `Validator`, `StateArgs`, `TaskArgs` — прежние Java-конструкторы остались в ABI; дамп
  `core/api/core.api` перегенерирован (удалены только synthetic/`copy`).

## Решения
(вопрос → выбор → почему → безопасная альтернатива)
1. Где `Protocol` → в `cell/Role.kt` рядом с носителем → спецификация: `io.astrolabe.cell`. Пакеты `tool`, `register`,
   `context` импортируют его (цикл пакетов внутри модуля). Альтернатива: булев флаг в инструментах.
2. Байты структурных записей → `@EncodeDefault(NEVER)` на `Role.protocol` и `Config.protocol` → JSON структурной роли и
   конфигурации прежний. Но отпечаток попытки меняется у всех попыток: `Roles.defaults` теперь содержит `direct`, а снимок
   конфигурации и `RoleTexts.versions` перечисляют роли по умолчанию (следствие A-D.1 «added to Roles.defaults»).
   Тело попытки, замороженной до D1, при чтении проходит `configSnapshot`, который доливает `Roles.defaults` вместе с
   `direct` (`ConfigSnapshot.kt:26`): замороженная и запрошенная конфигурации равны, предупреждения `config-frozen` нет,
   resume не меняется (`Controller.kt:539-543`, `Controls.kt:143`). Альтернатива: исключить `direct` из снимка —
   противоречит спецификации.
3. Сужение свойств → по операциям маски (поле → операции-владельцы); look и run — фиксированный список A-D.3. Свойства и
   клаузы операций H1 (`review`, `delegate`, `collect`) не добавлены — H1 дописывает две карты и `directJson`.
4. `note.evidence` → строка (`#N` или `op:N`, A-D.4 «evidence?» — одно значение), не массив, как у `blocked`.
   Таблица A-D.3 тип не задаёт.
5. G9, строка-сводка direct → `impact: … and N more in <paths> → look(refs)` (A-D.7: «→ look(refs) in both lines»;
   формулировка моя).
6. Типизированный отказ `note`/`finish` → до проверки маски инструмента: `StateTool` в `Controller` строится с маской по
   умолчанию `implementingS0` (без `state.note`), иначе direct-ячейка получила бы `masked`. Маску ячейки решает цикл раньше.
7. Поля `StateArgs.note`/`TaskArgs.afterChecks` → добавлены в D1: парсер с `ignoreUnknownKeys = false` иначе отклоняет
   вызов как schema error до исполнителя, а карточка требует типизированный отказ. `note` — сырой `JsonElement`, D2
   разбирает (неизвестные ключи «ignored and named»).
8. Правило 5 A-D.3 (структурная роль не перечисляет direct-only, direct-роль — скрытые) → не проверяется в конструкторе
   `Role` (п. 2: конструктор читает «известные операции»); проверено тестом на объявленной таблице.
9. Seeds при ремонте/carry → протокол принимающей ячейки (`carryFrom(…, role)`).
10. Java-совместимость → явные конструкторы у `Role`, `Config`; `@JvmOverloads` у `Validator`, `StateArgs`, `TaskArgs`.

## Тесты
Классы L1 (названы до запуска): `cell.RoleTest`, `RoleTextsTest`, `LayoutTest`, `GatesTest`, `CellTest`,
`register.ValidatorTest`, `tool.ToolContractsTest`, `context.SeedSelectorTest`, `PrecompileTest`,
`campaign.RoleWiringTest`, `S2CampaignTest`, `VerticalSliceTest`, `AttemptConfigTest` (добавлен: заморозка протокола).
- Цикл 1: `./gradlew :core:test --tests <13 классов> -q --console=plain` — 151 тест, 2 упали (оба — мои новые тесты:
  `single` по воротам loop, где есть и nudge, и rejection; `AttemptConfig.freeze(Config())` без профилей).
- Цикл 2: `RoleTest`, `GatesTest` — 30/30 зелёные. Итого 151/151, **2 цикла**.
- `:core:updateKotlinAbi` — дамп закоммичен. L2: `./gradlew assemble testClasses checkKotlinAbi -q --console=plain
  -Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm` — зелёный (после коммита `@JvmOverloads`; L1 до него —
  правка только добавляет перегрузки конструкторов).
- Новые проверки: `mainLine` × протокол × форма; маски всех форм с `state.note`/`task.finish`, `propose` скрыт в S0
  (текст отказа) и доступен в S1; структурные эффективные маски не изменились; 23 операции, правило 5; `[S]` direct
  (заголовок, 8 строк = 2 194 символа, `tools:`, 13 строк политики); golden `[S]`/схем `implementing` прежние, и
  `forLineage(role)`/`fingerprint(role)` = маскировому набору для каждой структурной роли; схемы direct (enum, свойства,
  открытый `proposal`, описания); отпечаток = дайджест отправленного набора, меняется с набором; парсинг direct-only;
  ворота: те же ключи и `requiredOp`, другие тексты, без `task.propose`/STATE/plan; правило Next выключено, прочие
  правила работают; Seeds v2; direct-ячейка (схемы, `[S]`, enabled, отказы `note`/`finish`/`propose`); S1-кампания с
  `Config.protocol = Direct`: plan-ячейка структурная, главная линия — `direct`.
- Изменён существующий тест: `RoleTest` — набор ключей `Roles.defaults` + `direct` (требование A-D.1).
- Цикл 3 (после ревью и слияния C16): L1 `CellTest`, `TaskLimitsTest`, `ToolContractsTest` — 93/93; L2 (`assemble
  testClasses checkKotlinAbi` с aiGateBuild) — зелёный; дампы ABI после автослияния совпали, перегенерация не нужна.
- Расход токенов исполнителю не виден.

## Отклонения от карточки и спецификации
- **`StoreKb.kt:24` (группа R) — код не менялся, добавлен комментарий.** KB строится при открытии кампании до того, как
  известна форма контракта (`Controller.kt:530` vs `:560`), а `kb.skill` вызывает только структурная роль (все direct
  скрывают `kb`), для которой `mainLine` = `implementing` в любой форме. Безопасный вариант — прежнее значение.
- **G2:** в direct из `<why>` убрано «and no plan step carries an accept:» — у direct-регистра нет плана.
- **План §4.3 «переключатель `requiredOp` loop-ворот»** → по A-D.7 G1 и «Not switched» `requiredOp = "state"` прежний,
  меняется только текст; формулировку карточки «не требуют state-хода» прочитал так: правило Next выключено, entry не
  смотрит на план, loop-ворота принимают `state(note)`/`state(blocked)`.
- Нейтральная формулировка `Run.kt:772` («poll» → «wait») не сделана: это не строка D1 (абзац «Not switched», файл —
  строка T8 D2).

## Хвосты и риски
- `Config.protocol = Direct` до D2/D3 непригоден для живых прогонов: `[A]` ещё рисует STATE (A1), завершение — ход без
  вызовов (C1), `note`/`finish` отвечают `unsupported`. По умолчанию `Structured` — на продукт не влияет.
- До D2 loop-ворота direct-ячейки удовлетворяет и неисполненный `state.note` (проходит валидацию хода, `requiredOp`
  снимается) — ожидаемо до появления исполнителя.
- Отпечаток попытки изменился для всех попыток (решение 2). Повторное открытие попытки, замороженной до D1, предупреждения
  `config-frozen` не даёт: `configSnapshot` доливает `direct` в обе стороны сравнения (`ConfigSnapshot.kt:26`,
  `Controller.kt:539-543`), resume не меняется. Pre-compile прежних попыток не переиспользуется.
- Приём суженных схем живыми провайдерами не проверен (только `FakeAdapter`) — UNMEASURED.

## Ревью Fable
Вердикт: «можно сливать, P1 нет». Сделано по ревью, поведение не менялось: KDoc `Config.protocol` (`Config.kt:93`)
больше не обещает прежний отпечаток попытки; в отчёте исправлено заявление о `config-frozen` (решение 2, хвосты).
Перед слиянием в ветку влит `main` `440ebb7` (C16), конфликтов не было.

Хвосты (не чинились):
- Тест «тело попытки до D1 открывается без `config-frozen`» и прогон S0 через `Controller` с `Config.protocol = Direct` — D4.
- Golden `[S]` есть только у `implementing`; golden `direct` — D4.
- Отката через границу D1 на живом `stateRoot` нет: попытка после D1 хранит роль `direct`.
- Studio покажет девятую роль `direct` в настройках (`ConfigSupport.kt:49`) — D4.
- Eval-манифест, замороженный до D1, с тем же id будет отклонён.

Заметки для следующих линий:
- D2: `StateTool` строится с маской `implementingS0` без `state.note` (`StateTool.kt:55`), отказ `:111` стоит до проверки
  маски; отклонённая заметка и loop-ворота (V4); плоская форма `state(op=note, kind=…)` не поднимается (`Args.kt:132`);
  ветку `note` защищать протоколом.
- D3: `TaskTool` не знает протокол, отказ `TaskTool.kt:124` стоит до маски.

## Для D2 и D3
Интерфейс роли: `Role.protocol` (`core/src/main/kotlin/io/astrolabe/cell/Role.kt:67`), `Roles.direct` (`:241`),
`Roles.mainLine` (`:266`, ветка H1 — `:270`); имена: `ToolOps.directOnly`/`known`/`directOf`
(`tool/ToolFamily.kt:73-90`); ячейка читает протокол как `ctx.role.protocol`.
- **D2 (`note`):** заменить отказ `tool/state/StateTool.kt:111` на ветку `"note" -> note(args, context)` в `when`
  (`:113-118`) и учесть маску инструмента: `StateTool` в `campaign/Controller.kt:2268` строится без маски (по умолчанию
  `implementingS0`, без `state.note`) — передать эффективную маску роли, как у `TaskTool` (`:2280`), или оставить
  direct-only проверку до маски. Аргументы: `StateArgs.note` (`tool/Args.kt:323`, сырой JSON), вложенная форма —
  `InputTolerance.STATE_NESTED` (`Args.kt:132`). Валидатор: `protocol` (`register/Validator.kt:73`), V4 — `:234`
  (кап), `:239` (`nextN`). T7 — `cell/Cell.kt:678, 706` (`op == "patch"`). G6 — `GateState.protocol`
  (`cell/Gates.kt:244`) в `RegisterInvariants`. A1 — `Cell.kt:781-792`. Строка политики `note refused` уже в
  `ErrorPolicy.directRows` (`cell/Layout.kt:158`).
- **D3 (`finish`):** заменить отказ `tool/task/TaskTool.kt:124` на `"finish" -> finish(args)` (маска `TaskTool` —
  эффективная, `task.finish` в ней есть); `TaskArgs.afterChecks` (`Args.kt:348`); совет `TaskTool.kt:190` опустить —
  в `TaskTool` протокол пока не передан (образец: `Edit.protocol`, выставляется в `Cell.kt:266`); C1/C2 — `Cell.kt`
  (`:628, 657-658, 740-766`) и `CellContext.kt:245-266` по `ctx.role.protocol`; текст требования loop-ворот —
  `Gates.loopRequirement` (`Gates.kt:330`), whole-turn — `Cell.kt:913`.
- **H1:** ветка `Role.kt:270`; выбор kernel — `Layout.kt:278` (`kernelVersion`) и `:239`; строки политики lead — к
  `directRows`; клаузы и свойства `review`/`delegate`/`collect` — `tool/ToolSchemas.kt:195, 200, 214`.

Статус: ГОТОВО К СЛИЯНИЮ — последний коммит `7543bf2` (ветка `v2/D1` запушена)
