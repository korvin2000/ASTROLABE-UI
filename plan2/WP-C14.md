# WP-C14 — хвосты ядра для лимитов Studio (P8.C.14)

**Исполнитель:** суб-агент t4 в worktree ядра (cwd `C:\work.astrolab\ASTROLABE`). **Ветка:** `v2/C14` от `main`.
**TODO:** P8.C.14. **Общие правила:** `C:\work.astrolab\plan2\COMMON.md` (обязательны). **Читать с:** D-401, D-402, D-403
(`rg -n '^\| D-40[123] ' TODO.md`); отчёты `C:\work.astrolab\plan2\reports\WP-C3.md` (API лимитов, «Хвосты»),
`WP-C3r.md`, `WP-C4.md` (раздел «Требуется от ядра»). K = core/src/main/kotlin/io/astrolabe.

## Цель
Закрыть то, что Studio (линия C4) сейчас обходит у себя, и последние невозобновляемые остановы по техническим потолкам
(указание владельца: скрытые пределы не срабатывают раньше лимитов пользователя и не выглядят тупиком).

## Что сделать
1. **Токенный бюджет контракта следует политике на resume.** Сейчас `policy.tokens` берётся только для нового контракта,
   при reopen остаётся сохранённый `contract.budget.tokens` (`K/campaign/Controller.kt` ≈ 543–553), а останов
   `BudgetStop.ContractBudget` не возобновляется. Сделать: reopen с большим `policy.tokens` поднимает бюджет контракта
   журнальной записью (тот же принцип, что `Transition.LimitRaised`: поднять может только хост; уменьшение не ниже
   уже потраченного) и останов `ContractBudget` становится resumable. Инвариант 10 (бюджет) и идемпотентность resume
   (D-392) сохраняются; повторное открытие без изменения ничего не поднимает и не списывает.
2. **Какой лимит держит после попытки поднять.** После `open` с поднятыми лимитами, если кампания осталась остановленной
   (другой лимит исчерпан или резерв), хост должен получить типизированный ответ: вид держащего лимита и статус
   (`LimitStatus`) — поле на `OpenedCampaign` (и Java-форма), а не только событие `budget.limit_reached`.
3. **Wire-имена.** `@SerialName` для `CostBasis`, `BudgetStop`, `LimitKind` (значения — существующие wire-слова:
   `BudgetStop.wire`, `LimitKind` money / minutes / requests и т. п.), чтобы JSON событий и квитанций нёс wire-слова,
   а не имена констант. Чтение СТАРЫХ записей (с именами констант) должно остаться возможным — проверь, где эти типы
   декодируются из сохранённого (`CampaignState`, `FinishReceipt`, события в журнале), и сделай совместимое чтение.
   `StopCode` (линия C1b) не трогать, если это не тривиально безопасно — запиши в «Хвосты».
4. **Effort хоста сильнее шага профиля.** Явно заданный хостом effort не сдвигается шагом `BalanceProfile`
   (Economy −1 / Thorough +1): описать в KDoc `BalanceProfile`/`Config.balance` и docs, покрыть тестом; если сейчас
   не так — исправить.
5. **«Поднять и продолжить» через фасад.** `Astrolabe` / `AstrolabeJava` всегда создают новый `WorkId`. Дать путь
   продолжения остановленной работы с поднятыми лимитами через фасад (Java-форма без `suspend`/`Flow`/`value class`,
   D-07). Если это требует нового публичного API больше ~80 строк — сделать минимальный вариант (метод resume по
   `WorkId` с политикой) и записать остальное в «Хвосты».

## Границы
`campaign/Controller.kt` (ветка open/resume и бюджет контракта), `campaign/Lifecycle.kt`, `campaign/Limits.kt`,
`budget/Limits.kt`, `Balance.kt`, `Astrolabe.kt`, `java/`, события, их тесты; docs `architecture/lifecycle.md`,
`reference/defaults.md`. **Не трогать:** `verify/` (правило приёмки и регрессионный гейт — линия C10 в работе),
`tool/verify/Verify.kt`, `tool/run/Run.kt`, `cell/Gates.kt`, `campaign/FinishReceipt.kt` сверх `@SerialName`-совместимости,
`delegate/`, `context/`, `register/`, Studio.

## Проверки
- L1: `./gradlew :core:test --tests 'io.astrolabe.budget.*' --tests 'io.astrolabe.campaign.TaskLimitsTest' --tests 'io.astrolabe.campaign.LifecycleTest' --tests 'io.astrolabe.BalanceProfilesTest' -q --console=plain` + новые случаи.
- L2 один раз в конце, после `git merge main`: `--tests 'io.astrolabe.budget.*' --tests 'io.astrolabe.campaign.*' --tests 'io.astrolabe.java.*' --tests 'io.astrolabe.event.*'`,
  `:eval:compileTestKotlin`, `:provider-ai-gate:compileTestKotlin -Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm`,
  `:core:updateKotlinAbi` (публичный API меняется).

## Готово, когда
Пункты 1–4 реализованы с тестами, п. 5 — минимальный путь или обоснованный хвост; поведение без лимитов и Balanced не
меняется; старые сохранённые записи читаются; L1/L2 зелёные; ветка запушена.

## Отчёт
`C:\work.astrolab\plan2\reports\WP-C14.md` по формату COMMON.md; в «Решениях» — точные wire-слова и новые имена API
(их возьмёт Studio, чтобы убрать своё сопоставление `StopCodes.wire` и поиск держащего лимита по журналу событий).
