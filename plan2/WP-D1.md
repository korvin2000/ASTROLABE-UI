# WP-D1 — `Roles.direct`, `kernel-direct/1`, подмножество схем, переключатель `protocol`

**Исполнитель:** суб-агент t4 (Opus) в worktree ядра (cwd `C:\work.astrolab\ASTROLABE`). **Ветка:** `v2/D1` от `main`
(в `main` слиты Dp3 — спецификация, C16 — одна ветка в `Cell.kt`, B7). **TODO:** P8.D.1.
**Общие правила:** `C:\work.astrolab\plan2\COMMON.md`. **Ревью:** Fable (один раунд).
**Оценка:** ≈ 1,2 тыс. строк с тестами, ≈ 2,0 млн токенов; вдвое больше — `БЛОКЕР`.
**Спецификация (главный документ):** `docs/reference/kernel-contract.md`, приложение A-D: A-D.1 (протокол, роли,
`mainLine`, матрица), A-D.2 (kernel и `[S]`), A-D.3 (поверхность инструментов, маски, схемы, отпечаток), A-D.7
(строки V1, V3, G1–G5, G8, G9, S1–S5, T1–T4, K1, группа R). Читать только эти разделы.
**План:** `C:\work.astrolab\ASTROLABE-2-PLAN.md` §4.3, §6 строка D1 и абзац «Что волна D делает иначе».
**Сводка против Dp2:** `C:\work.astrolab\plan2\reports\WP-Dp3.md`, раздел «Для карточек D1–D3» (места `путь:строка`).

## Что сделать (ровно то, что спецификация помечает D1)
1. `Protocol { Structured, Direct }` и `Role.protocol`; `Config.protocol` (необязательный слой, по умолчанию
   `Structured`), замороженный в `AttemptConfig`. Выбор протокола — поле конфигурации, не следствие формы.
2. `Roles.direct` — 23 операции (включая `task.propose`; в S0 его скрывает маска формы), в `Roles.defaults`.
   `Roles.mainLine(protocol, shape)` — **единственное** место условия формы; `Direct` × S2|S3 → `Roles.implementing`
   до H1. Заменить им все места группы R.
3. Маски форм: операции direct (`ToolOps.directOnly`: `state.note`, `task.finish`) — в масках S0, S1, S2, S3.
   «Известные операции» — все семь мест из отчёта Dp3.
4. Схемы: набор строит одна функция от роли (маска + протокол), сужает операции и свойства; отпечаток — дайджест
   фактически отправленных схем. Маска формы набор схем не меняет.
5. Kernel `kernel-direct/1` и `[S]` роли direct; выбор текста kernel — функция роли (чтобы H1 добавил lead без нового
   поля `Role`).
6. Переключатель `protocol` в валидаторе и воротах (правило Next, `requiredOp` loop-ворот, текст entry-ворот и
   остальные строки V/G спецификации). Ни одни ворота форму не читают.
7. Seeds: для direct принудительно селектор V2 (проводка границы ячейки уже в коде).
8. Операции `state.note` и `task.finish` в D1 **только объявлены** (имена, маски, схемы) — их исполнение делают D2 и
   D3. До них вызов отвечает типизированным отказом «не реализовано», а не падением.

9. После ревью Codex спецификации (уже в тексте A-D.3): `proposal` в схеме `task` — **открытый** объект
   `{type: object, description}` без `properties` и без `additionalProperties`; `additionalProperties: false` — только
   у объектов с объявленными свойствами. Описание `task`: `plan` главной линии только записывается, перепланирование —
   после `increment_split`.
10. В `main` может появиться слияние `v2/C16` (одна ветка `QuotaExhausted` в `Cell.kt`, узкая правка в
   `Controller.kt` около `:823`). Перед финальным L1 выполни `git merge main`; конфликт в этих двух местах решай,
   сохраняя обе правки.

## Не в D1
`Roles.directLead`, `Roles.directWriter`, `kernel-direct-lead/1`, их схемы и golden (H1). Якорь direct и исполнение
`note` (D2). `finish`, счётчик финализаций, handoff (D3). Golden-наборы и fixtures direct (D4). Studio.

## Границы
`K/cell/` (`Role.kt`, `RoleTexts.kt`, `Layout.kt`, `Gates.kt`, `Cell.kt`, `CellOrder.kt`), `K/register/Validator.kt`,
`K/tool/ToolSchemas.kt`, `ToolCall.kt`, `Args.kt`, `K/Config.kt`, `K/AttemptConfig.kt`, места группы R в
`K/campaign/Controller.kt` и `K/kb/StoreKb.kt`, прочие места из строк A-D.7, помеченных D1. Ничего сверх них.
Роли структурного протокола, их маски, текст `[S]` и отпечатки схем **байт-в-байт прежние** — это условие приёмки.

## Тесты (L1 один раз в конце; назвать в отчёте до запуска)
Новые: `mainLine` × протокол × форма (включая `Direct` × S2|S3 → implementing); маски всех четырёх форм содержат
операции direct; `propose` отклонён маской в S0 и доступен в S1; схемы direct — 23 операции, сужены и по свойствам;
отпечаток меняется вместе с фактическим набором схем; байты `[S]` и отпечаток структурных ролей не изменились;
`Config.protocol` по умолчанию `Structured` и заморожен в `AttemptConfig`; ворота и валидатор при `Direct` не требуют
`state`-хода и правила Next. Существующие (изменённые классы и прямые потребители): `io.astrolabe.cell.RoleTest`,
`RoleTextsTest`, `LayoutTest`, `GatesTest`, `CellTest`, `io.astrolabe.register.ValidatorTest`,
`io.astrolabe.tool.ToolContractsTest`, `io.astrolabe.context.SeedSelectorTest`, `PrecompileTest`,
`io.astrolabe.campaign.RoleWiringTest`, `S2CampaignTest`, `VerticalSliceTest`.
L2 в конце один раз: `./gradlew assemble testClasses checkKotlinAbi -q --console=plain
-Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm`; публичный API менялся → `:core:updateKotlinAbi`,
дамп закоммитить.

## Готово, когда
Новые тесты, L1 и L2 зелёные; структурный протокол не изменился ни в одном байте `[S]` и отпечатке; ветка `v2/D1`
запушена; в отчёте — раздел «Для D2 и D3»: интерфейс роли и точки, куда они подключают `note` и `finish`
(`путь:строка` на ветке).

## Отчёт `C:\work.astrolab\plan2\reports\WP-D1.md` (формат COMMON.md). Ответ оркестратору — до 40 строк.
