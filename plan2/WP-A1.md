# WP-A1 — допуск и маршрутизация: wire / резерв / выход раздельно

**Исполнитель:** задача (spawn task), тир t4. **cwd:** `C:\work.astrolab\ASTROLABE`. **Ветка:** `v2/A1`.
**Общие правила:** `C:\work.astrolab\plan2\COMMON.md`. **TODO:** P8.A.4.
**План:** §1 строки 1–5, §4.5 (первый пункт), §6 (A1), §0 п.4; CT Next 3. Спецификация: `docs/context/compiler.md`
§6.1, `docs/reference/defaults.md` §17, `docs/operations/routing.md` §11 (только связанные места).

## Подтверждённые дефекты (код `f68032f`)
1. Резерв (выход + якорь 5000 + max(look, run) 4000) входит в `totalTokens`; `Router` ещё раз прибавляет выход;
   `conservativeCost` оценивает резерв как оплаченный вход — `context/Compiler.kt:101`, `context/ContextCover.kt:115-151`,
   `campaign/Controller.kt:1657-1663`, `route/Router.kt:143,148,217-220`.
2. Перекомпиляции под маршрутизированный профиль берут исходный `maxOutputTokens`; ячейка работает с другим headroom —
   `Controller.kt:825,1121,1332,1924,1944`; `cell/CellContext.kt:67-70`.
3. `Controller.route` выходит при не-`Ready`: больший профиль не пробуется; S0/S1 → `BlockedExternal`, дети/writers
   бросают в `check` — `Controller.kt:1651,838,1337,1927,1946`.
4. Запас под S+R+T+K при выходе Studio = W/4: 16K **−2447**, 32K 4107, 64K 17214 токенов — `Defaults.kt:23-34`,
   Studio `AutoProfiles.kt:72-75`.

## Что сделать
- Учёт раздельно: текущий wire input, резерв роста (якорь + наблюдения), лимит выхода; выход учитывается один раз;
  цена резерва — не как оплаченный вход.
- Резерв роста масштабируется под окно (малые окна 16K/32K должны компилироваться; формула — решение в отчёт, с
  безопасным значением по умолчанию для ≥ 64K без изменения поведения там, где места хватало).
- Перекомпиляция с фактическим headroom маршрутизированного профиля.
- Capacity-fallback: при нехватке места — перекомпиляция на кандидатах с бо́льшим окном (от меньшего к большему),
  `BlockedExternal` только если не подошёл ни один; дети/writers — без исключения в `check`.
- Не входит: `RoutingPolicy` без `attemptPolicies` (строка 5 §1) и `Economics.report` (строка 6) — только если
  исправление тривиально следует из учёта; иначе — в «Хвосты» (E1/B1).

## Границы
Горячие файлы волны A этой линии: `campaign/Controller.kt`, `context/Compiler.kt`, `context/ContextCover.kt`,
`route/Router.kt`. Не трогать `cell/Layout.kt`, `cell/Cell.kt` (A3), `tool/` (A4/A5/A6), `auth/` (A6), адаптер (A2a/A2b).
`CellContext.kt` — можно, минимально. Слияние A1 — после A6/A4/A5/A3: ожидайте ребейза.

## Проверки
- L1: `:core:test --tests 'io.astrolabe.context.CompilerTest' --tests '...CompilerFullTest' --tests
  '...ContextCoverTest' --tests 'io.astrolabe.route.RouterTest' --tests 'io.astrolabe.campaign.CampaignLoopTest'`
  + новые кейсы: компиляция 16K и 32K; выход не учтён дважды; fallback на большее окно; все кандидаты малы →
  `BlockedExternal`.
- L2: `--tests 'io.astrolabe.context.*' 'io.astrolabe.route.*' 'io.astrolabe.campaign.*' 'io.astrolabe.cell.*'`,
  `:eval:compileTestKotlin`, `:provider-ai-gate:compileTestKotlin` (с `-Pastrolabe.aiGateBuild=...`);
  `updateKotlinAbi`, если менялся публичный API.

## Готово, когда
16K и 32K компилируются; выход не учитывается дважды; fallback покрыт тестом; числа запаса для 16K/32K/64K/128K до и
после — в отчёте.
**Отказ:** если исправление требует смены публичного контракта `provider-api` — описать и выбрать вариант без неё.

## Отчёт
`C:\work.astrolab\plan2\reports\WP-A1.md` (COMMON.md); формулу масштаба резерва — в «Решения».
