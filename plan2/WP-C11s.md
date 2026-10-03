# WP-C11s — Studio: одобрение изменений тестов человеком (шаг Studio задачи P8.C.11)

**Исполнитель:** суб-агент t3. **Репозиторий:** корневой `C:\work.astrolab` (Studio = `ASTROUI/`), ветка `v2/C11s` от `main`
(в `main` уже слита C4 `cee4fdf`). **TODO:** P8.C.11 (шаг Studio). **Общие правила:** `C:\work.astrolab\plan2\COMMON.md`.
**Читать с:** решения D-397, D-400, D-404 (`rg -n '^\| D-(397|400|404) ' C:/work.astrolab/ASTROLABE/TODO.md`), отчёт ядра
`C:\work.astrolab\plan2\reports\WP-C11.md` (разделы «Решения» и «Ревью»: что видит хост), карточка и отчёт C4
(`plan2/WP-C4.md`, `plan2/reports/WP-C4.md`).

## Что изменилось в ядре (main `8a3b5e1`, K = core/src/main/kotlin/io/astrolabe)
В режиме `IntegrityApproval.Human` флаг test-integrity (агент изменил поверхность обязательной проверки) снимает только
вердикт с `"reviewer":"human"`, пришедший через `Authority.review`. Вердикт модели — лишь сведение. Пока человека нет:
- запрос ревью приходит с `ReviewRequest.humanOnly = true`;
- кампания останавливается `waiting_for_input` с `StopCode.IntegrityReview` (wire `integrity_review`) в
  `CampaignState.stopCode`, `campaign.finished.stopCode`, `AcceptanceDecisionRequest.code`; в запросе решения пункт
  `obligation = integrity:<path>`, `kind = Integrity`, `humanOnly = true`, `by` = подписант вердикта модели, `findings`;
- политика (auto-режим) такой пункт не покрывает; решение самого пользователя покрывает;
- хоста спрашивают один раз за открытие кампании на (инкремент, кандидат, ревизия); вопрос человеку хранит id первого
  запроса — поздний ответ засчитывается.
Режим `Autonomous` не изменился (судья-модель снимает флаг, класс не выше `agent_test`).

## Что сделать в Studio
1. Запрос `review` с `humanOnly` уходит пользователю карточкой (существующий поток решений `DecisionService`, вердикт
   с `"reviewer":"human"` уже есть после C4), а не в `ReviewPass`. `ReviewPass` (модель) может дать сведение для
   карточки, но его вердикт не отправляется как ответ на `humanOnly`-запрос вместо человека.
2. В режиме `auto` Studio не принимает политикой пункты с `humanOnly`: поднимает ту же карточку.
3. Карточка показывает путь изменённого теста, причину, обязательные проверки, которых он касается, и приложенный
   вердикт модели с находками; действия — «Одобрить изменение теста» / «Отклонить» (тексты RU/EN, словарь
   `vocabulary.spec.ts`). Состояние задачи при `integrity_review` — «ждёт вас», а не ошибка.
4. Настройка `config.integrityApproval` (`settings/SettingsSchema.java`, `SettingsService.java`): значение по умолчанию
   и существующие значения не менять; в описании настройки сказать, что `human` требует вашего одобрения каждого
   изменения тестов, а при `autonomous` изменение одобряет модель и итог помечается «одобрено судьёй-моделью».
5. Не трогать ядро; не хватает данных от ядра — в «Требуется от ядра», без хака.

## Проверки
Git Bash, `export JAVA_HOME=/c/Users/user/.gradle/jdks/eclipse_adoptium-26-amd64-windows.2`; Gradle Studio из
`C:\work.astrolab\ASTROUI` с `-Pstudio.astrolabeBuild=C:/work.astrolab/ASTROLABE`. Тесты затронутых классов backend и
spec затронутых компонентов frontend (включая `vocabulary.spec.ts`); в конце один раз — затронутые модули backend целиком.
e2e и полный набор не запускать. В ядре Gradle не запускать.

## Git
Работать прямо в `C:\work.astrolab`: `git -C C:/work.astrolab switch -c v2/C11s`; коммитить только `ASTROUI/`; push
`git push -q -u origin v2/C11s` (URL remote не печатать); в `main` не сливать и на `main` не переключаться.

## Готово, когда
Под `human` изменение теста в Studio не завершает задачу без действия пользователя ни в обычном, ни в auto-режиме;
`autonomous` работает как раньше; тесты зелёные; ветка запушена.

## Отчёт
`C:\work.astrolab\plan2\reports\WP-C11s.md` по формату COMMON.md.
