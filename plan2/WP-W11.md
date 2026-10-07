# WP-W11 — `canonicalise` измерен; T-03 вживую (файлов ×2 на открытие); T-22; T-59 (P8.W.11, сессия 5)

Читать вместе с `plan2/COMMON.md`. Исполнитель — t4. Ядро: ветка `v2/W11` от `main` `62afbee`, worktree
`C:\work.astrolab\ASTROLABE\.claude\worktrees\W11`. Спецификация: `TODO.md` P8.W.11 (`rg -n '^#### P8\.W\.11' TODO.md`, ~8 строк),
D-427 (один проход на захват), D-374 (идентичность — SHA-256 сырых байтов, никакого доверия метаданным на границе приёмки),
реестр `docs/reference/workflow-invariants.md` WF-2/WF-3 (файлы `workspace/*`, `os/Git.kt`, `atlas/Atlas.kt`, `store/BlobStore.kt`),
отчёты `plan2/reports/WP-WR2.md` (правка графа импортов, страж фикстуры T-03), `WP-W2.md`, `WP-W7.md` (канонизация каталога один раз
за захват). Живая база: `plan2/reports/SESSION-4B.md` таблица шлюза (`bench/wb2`: открытие 29 git / **3014 файлов** / 21,0 МБ при
1500 неотслеживаемых файлах + 20 МБ `bundle.bin`).

## Цель (в этом порядке)
1. **T-03 вживую — найти причину ×2.** Фикстура `DirtyRepoScenarioTest` (WF-2) после WR2 показывает один проход, а живой
   `real-dirty-repo` — 3014 файлов на открытие при 1500 файлах (байты = один проход большого файла, то есть мелкие файлы либо
   читаются дважды, либо считаются дважды). Разница между фикстурой и живым прогоном — состав дерева (`eval-live` `DirtSpec`: 1499
   мелких в подкаталогах `pkg-N` + `bundle.bin`; `.gitignore` нет), проверка пишет в дерево, реальный `python`. Найдите, где
   второй счёт/чтение возникает **только вживую** (кандидаты: атлас/пред-скан после первого штампа, второе `report(fresh = true)`,
   `hostNotes`-переоткрытие до T-12, фильтр import-графа по расширению `.py`/`.txt`, счётчик `filesRead` в двух фазах одного открытия).
   Метод: один живой прогон `real-dirty-repo` auto на `deepseek/deepseek-v4.1-flash` из вашего worktree
   (`./gradlew :eval-live:installDist -Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm -PbenchDir=C:/work.astrolab/bench/w11`,
   затем `C:/work.astrolab/bench/w11/bin/eval-live run --models deepseek/deepseek-v4.1-flash --tasks real-dirty-repo --mode auto --out C:/work.astrolab/bench/w11/results --credentials "$LOCALAPPDATA/AstrolabeStudio/credentials.json" --repeats 1 --seed 1`,
   `export JAVA_HOME=…` внутри команды; счётчики — `result.json` → `phases.byPhase`); **до** правки добавьте временную
   диагностику (журнал путей, читаемых дважды, или счётчик по фазам) — только в worktree, снять перед коммитом. Сделайте
   фикстуру WF-2 такой, чтобы она **воспроизводила** живой состав (подкаталоги, `.txt`, без `.gitignore`, проверка пишет), и
   упала до правки — это обязательное условие (правило 6 §7.2: живой сбой сначала становится сценарием). Затем правка и
   повтор живого прогона: ожидание — файлов на открытие ≈ 1500 (+ отслеживаемые), байты ≈ 21 МБ без изменений.
2. **T-22**: recovery-блоб `hash-object` — первое открытие читает 20 МБ дважды; объект git писать из байтов, уже прочитанных
   захватом (путь W2, один проход), без нарушения WF-2 (процессов git на открытие не больше, чем сейчас). Счётчик `blobsRead`/`bytesRead`.
3. **T-59**: пред-скан перечитывает разобранные исходники ради динамических импортов — переиспользовать уже прочитанный текст
   (тот же проход), либо показать измерением, что чтений нет, и закрыть.
4. **`canonicalise` измерен**: на фикстуре 1500 файлов замерить долю времени `WorkspacePath` канонизации в захвате (фазовый
   счётчик или `System.nanoTime` в тесте, не в продукте); W7 уже канонизирует каталог один раз за захват — если доля ниже ≈ 10 %,
   закрыть задачу измерением без мемоизации; иначе мемоизация на захват, **не** доверяющая метаданным (D-374).

## Границы и проверки
- Ваши файлы: `workspace/*`, `os/Git.kt`, `atlas/Atlas.kt`, `store/BlobStore.kt`, `telemetry/PhaseCounters.kt` (только новые счётчики),
  тесты `workflow/DirtyRepoScenarioTest.kt` и `DirtyRepo.kt` (состав фикстуры — **расширение**, стражи не ослабляются: пороги и
  условия WF-2/WF-3 остаются), `workspace.*`-тесты. `campaign/Controller.kt` — только если причина там и правка ≤ 10 строк
  (сейчас владельца нет; напишите в отчёте). Не трогать `cell/Cell.kt`, `docs/reference/workflow-invariants.md`, `TODO.md`,
  `CONTINUE-TASK.md`, `actual_state.md`, `audit/`.
- Живые прогоны: не больше **двух** (до и после), только `deepseek/deepseek-v4.1-flash`, auto; секреты не читать и не печатать.
- L1 (один раз): `./gradlew :core:test --tests 'io.astrolabe.workflow.DirtyRepoScenarioTest' --tests 'io.astrolabe.workspace.*' -q --console=plain`.
- L2 (один раз): `--tests 'io.astrolabe.workflow.*' --tests 'io.astrolabe.workspace.*' --tests 'io.astrolabe.atlas.*' --tests 'io.astrolabe.store.*' --tests 'io.astrolabe.campaign.*'` и
  `./gradlew assemble testClasses checkKotlinAbi -Pastrolabe.aiGateBuild=… -q --console=plain`. WF ≤ 180 с (замерьте без параллельной нагрузки, если можете).
- Не больше трёх циклов «правка → тест».

## Готово, когда
- Фикстура WF-2 воспроизводит живой ×2 до правки и зелёная после; живой прогон после правки: файлов на открытие ≈ 1500 (таблица
  до/после в отчёте по `phases.byPhase`); T-22 и T-59 закрыты измерением или правкой; `canonicalise` — число (доля) и решение;
  L1/L2 зелёные; ни один страж не ослаблен.
- Отказ: причина ×2 не найдена за два живых прогона → `БЛОКЕР` с собранной диагностикой (какие пути, в какой фазе).

## Отчёт
`C:\work.astrolab\plan2\reports\WP-W11.md` по COMMON.md · `Статус: …` и последний коммит. Оценка расхода: ≤ 450 тыс. токенов.
