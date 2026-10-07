# WP-WAF — починка полного набора метки `v2-wave-WA` (сессия 4B, до W6/W10)

Читать вместе с `plan2/COMMON.md` (обязательно). Ветка `v2/WAF` от `main` ядра (`4ce32a5`). Исполнитель — t3.

## Цель
Полный набор CI на метке `v2-wave-WA` (run 37389888135, код `1a8659c`) упал. Исправить три дефекта целевыми правками,
каждый сначала воспроизвести падающим тестом (уже существующие тесты ниже — это и есть воспроизведение).

### Д1 (Linux, core) — WF-4 в форме S0
`UnreadableFileScenarioTest > WF-4 a locked file stops the run resumably and names the path` (только Linux):
```
AssertionFailedError: the run returns an outcome instead of throwing:
java.lang.IllegalArgumentException: only a cancelled checkpoint interrupts a cell
  at io.astrolabe.campaign.Transition$Interrupted.<init>(Lifecycle.kt:233)
  at io.astrolabe.campaign.Controller.unreadable(Controller.kt:855)
  at io.astrolabe.campaign.Controller.runS0(Controller.kt:841)
```
Нечитаемый вход в S0 должен давать возобновляемую остановку `Stopped(BlockedExternal, "unreadable input <path>")`, как
в S1 (D-427). Почему на Windows зелёный — выяснить (вероятно, другой путь блокировки); сценарий должен проходить
этот путь на обеих ОС. Не ослаблять `require` в `Transition.Interrupted`, если он охраняет инвариант — выбрать верный
переход для `unreadable`.

### Д2 (Windows, eval-live ×3) — длинный путь recovery-блоба
`AskModeTest > auto accepts on the policy's word…`, `LoopTest > the accounting of the loop…`,
`ScenarioTest > a repository without a commit stays…`:
```
GitError: git exited 128: git hash-object -w --no-filters --stdin-paths -- fatal: could not open
'C:/Users/RUNNER~1/AppData/Local/Temp/junit-…/t0/run-…/state/astrolabe/projects/<64 hex>/blobs/recovery/<64 hex>'
for reading: Filename too long
```
Источник — W2 (`workspace/ShadowRef.kt` ≈ :446, запись recovery-блобов через `hash-object --stdin-paths`). Это дефект
продукта (пути Studio бывают длинными), а не только тестов: исправить в ядре (например, `-c core.longpaths=true` для
этого вызова, относительные пути от рабочего каталога процесса, или подача содержимого не путём — выбор за линией,
обосновать в «Решениях»). Идентичность (SHA-256 сырых байтов, D-374) и счётчик «один процесс git на снимок» (WF-2/WF-3)
не меняются. Добавить тест ядра с путём хранилища длиннее 260 символов (на Linux он просто проходит).

### Д3 (Linux, eval-live) — `.Git` вне регистра
`LoopToolsTest > file tools never reach outside the workspace through a link nor into git in any case`
(`LoopToolsTest.kt:52`): `wrote 1 bytes to .Git/hooks/pre-commit`. Защита каталога git в файловых инструментах
`loop`-плеча `eval-live` сравнивает регистрозависимо на Linux; тест требует запрета «in any case». Исправить
инструмент (сравнение сегмента без учёта регистра на всех ОС), тест не трогать. Проверить, когда тест появился
(`git log` по файлу) — в отчёт.

## Границы
Трогать: `campaign/Controller.kt` (только `unreadable`/путь S0), при необходимости `campaign/Lifecycle.kt`,
`workspace/ShadowRef.kt` (или `os/Git.kt` для флага вызова), файловые инструменты `eval-live` (loop), их тесты.
Не трогать: стражи WF (`io.astrolabe.workflow`), формат идентичности, `DecisionKey`, Studio.

## Тесты
- L1 (один раз, когда правка закончена): `:core:test --tests 'io.astrolabe.workflow.UnreadableFileScenarioTest'`,
  новый тест длинного пути, `:core:test --tests 'io.astrolabe.workspace.ShadowRefTest'`,
  `:eval-live:test --tests 'io.astrolabe.evallive.LoopToolsTest' --tests 'io.astrolabe.evallive.AskModeTest'
  --tests 'io.astrolabe.evallive.LoopTest' --tests 'io.astrolabe.evallive.ScenarioTest'`.
  Д1 на Windows может не воспроизводиться: если так — объяснить в отчёте, почему исправленный путь покрыт тестом,
  который идёт на Windows (например, юнит-тест перехода `unreadable` в S0).
- L2 (один раз): `:core:test --tests 'io.astrolabe.campaign.*' --tests 'io.astrolabe.workspace.*'
  --tests 'io.astrolabe.workflow.*'`, `:eval-live:test`, затем
  `./gradlew assemble testClasses checkKotlinAbi -Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm`.
- Не больше трёх циклов «правка → тест». Публичный API изменён → `updateKotlinAbi` один раз в конце.

## Готово / отказ
Готово: три дефекта исправлены, указанные тесты зелёные локально (Windows), L2 зелёный, отчёт написан.
Отказ: исправление требует ослабить страж WF или изменить идентичность → `БЛОКЕР` с обеими сторонами.

## Отчёт
`C:\work.astrolab\plan2\reports\WP-WAF.md` по формату `COMMON.md`, ≤ 40 строк; последняя строка — статус и последний
коммит ветки. Push ветки только так: `git -c credential.helper= push -u origin v2/WAF` (владелец запретил вызывать
git credential manager; никаких `git credential …`); если push отклонён — не настаивать, написать в отчёт.
