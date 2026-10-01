# Почему «проверь, что проект рабочий» сожгло 80 ходов и ничего не запустило

Разбор задачи `W-tgxiilat7og6a33vtwva` (экспорт `diags/`), 2026-09-30. Цель — не «модель глупая / промпт плохой», а
точные механизмы, по которым harness сделал провал неизбежным, и что менять. Проверено по коду
(`ASTROLABE/core`, `ASTROUI/backend`) и по событиям `journal.call` / `journal.result` / `cell.gate_fired`.
Независимая проверка: Opus 5.5 и Codex, параллельно (см. §5).

## 0. Вердикт

1. **Провал был предопределён до первого хода модели.** Запрос «прогони тесты и почини» на дереве из 1131 файла
   получил форму S1, а первая ячейка S1 — всегда `plan`-ячейка. У роли `plan` нет `run`, `verify.tests` и `edit`.
   Единственный выход из неё — `task.propose(plan)`, формат которого модели нигде не показан.
2. **Harness не остановил цикл.** Отказ «`run.run` is masked in this turn» читается как временный; модель
   повторила один и тот же вызов в 22 ходах из 40 (прогон 3) и в 21 из 40 (прогон 4). Loop-гейт видит только *исполненные* вызовы,
   отказы в него не попадают; Stall-гейт срабатывает один раз и молчит.
3. **Схема предложения плана скрыта, а отказы ей не учат.** `proposal: {type: object}`; текст отказа —
   первая строка исключения kotlinx («unknown key 'check' at path: $»). Модель угадывала ключи 10 ходов подряд
   и угадала на 40-м. Persona-строка роли при этом подсказывает *неверные* ключи.
4. **Первый прогон — ложный зелёный.** Gradle и npm не были в PATH, модель решила «проверю чтением», Studio
   подставила критерий «The change fulfils the request», reviewer одобрил, режим auto принял. 1165 файлов,
   ни разу не собранных, помечены «finished and verified» — и именно так это было передано модели в следующем
   запросе.
5. Это не «модели не понимают нестандартные инструменты». Обе модели понимали инструменты и *правильно*
   диагностировали ситуацию (см. цитаты рассуждений в §2). Их подвели три вещи harness'а: неверный выбор роли,
   неинформативные отказы и отсутствие тормоза на повтор отказа. Всё три чинятся локально, без смены концепции.

## 1. Что произошло (четыре прогона)

| Прогон | Модель | Форма/роль | Ходы | Исход |
|---|---|---|---|---|
| 1 `W-tgx…` создать приложение | deepseek-v4.1-flash | S0 / implementing | 37 | «completed», verified: none. `gradle -v`, `npm -v` → unavailable; решение «verify by structure/reading (no build)». 1165 файлов |
| 2 `W-4naw…` проверить с devtools | glm-5.3-flash | S1 / plan | 0 | отменён пользователем «while planning» |
| 3 `W-36hy…` то же | glm-5.3-flash | S1 / plan | 40 | budget_exhausted; 22 хода — замаскированный `run`; 10 отказов `task.propose` |
| 4 `W-c37p…` Continue | glm-5.3-flash | S1 / plan | 40 | budget_exhausted; 21 ход — замаскированный `run`; 10 отказов `task.propose`; план принят на 38-м ходу, exit refused: `MissingProduction` |

Итого по задаче: 4,93 млн токенов, 0,58 USD, 34 минуты — и ни одна команда сборки не была выполнена ни разу.

## 2. Механизмы (с местами в коде)

### M1. Форма S1 → plan-ячейка без права исполнять
- `campaign/ShapeSelector.kt` `selectInitial`: S0 только при ≤3 файлах и одном пакете; здесь files=1131,
  crossPackage=true → S1 (событие `campaign.shape_selected`).
- `campaign/Controller.kt` `runS1`: «§4.2: the first cell of S1 is the plan cell» — план запускается всегда,
  независимо от смысла запроса.
- `cell/Role.kt` `Roles.plan.toolMask`: `look.*`, `kb.*` (без propose), `state.*`, `task.ask|delegate|collect|propose`,
  `verify.baseline`. Нет `run`, нет `verify.tests`, нет `edit`. Роль `probe` при этом имеет `run.run` (R-класс).
- Контракт прогонов 3–4 состоял из трёх `Acceptance.Run` (`./gradlew.bat test`, `npm test` в client,
  `../gradlew.bat test` в server), которые ядро само вывело из sniffed-команд (`contract/Contracts.kt`
  `derive`, origin Harness; Studio их только показывает через `StudioHost.verificationOf`). То есть [K] говорил
  модели «приёмка — запусти эти команды», а маска говорила «нельзя».
- Штатный выход из plan-ячейки существует: принятый план → implementing-ячейка с `run`. Но он требует формата,
  который модели не показан (M4), поэтому на практике ячейка была тупиком.

Рассуждение модели, ход 1 прогона 3: *«I'm the plan role… Plan, do not implement… But the contract asks to run
tests… There's tension.»* Модель увидела противоречие сразу.

### M2. Отказ по маске — тупик без указателя
- `cell/Cell.kt` `validateCalls`: `"${it.name} is masked in this turn; no call of this turn executed"`.
  Формулировка «in this turn» подразумевает, что в следующем ходу может быть иначе — модель так и читала:
  ход 5 *«Turn 5 — maybe run is unmasked now. Try again»*, ход 6, 9, 10, 19, 23, 27 — то же.
- Список разрешённого — одна строка `enabled this turn:` в кэшированном [S]; в отказе его нет, причины
  («роль plan никогда не исполняет») нет, выхода («предложи план через task.propose(plan) в форме …») нет.
- Единственная попытка выйти правильно — `state.blocked` на ходу 4 — упала на схеме (ключ
  `blocked<arg_key>evidence` — утечка нативного формата tool-call GLM через OpenRouter; SDK такое не чинит).

### M3. Тормоза не сработали
- `Cell.kt`: в ветке `Validated.Refused` для каждого вызова пишется результат-ошибка, но `signatures` не
  пополняется; `CallSignature.of(call, outcome)` добавляется только исполненным вызовам.
- `cell/Gates.kt` `Loop`: считает только `state.signatures` → 22 одинаковых отказа не дали ни nudge,
  ни «turn ended; a state op is required». Строка error policy «identical call and result twice → loop nudge;
  the third ends the turn» для отказов ложна.
- `Stall`: `GateKey(name, "since-$lastProgressTurn")` — срабатывает один раз (ход 3) и больше не повторяется,
  потому что `lastProgressTurn` двигается только по изменениям регистра.
- В итоге ограничитель — только `turnsPerCell = 40`.

### M4. Схема `task.propose(plan)` невидима, отказы не обучают
- `tool/ToolSchemas.kt`: `"proposal" to {type: object}`; описание семейства — `propose(plan|increment_split|amendment)`.
- Реальный формат — `campaign/Proposals.kt` `PlanWire`: `increments[{id, requirements, accept, write_scope,
  expected_files, title, depends_on, produces: "artifact"|"resolves:<q>", evidence_kinds, red_ok_until}]`,
  `acceptance[{id, requirement, run|check|review, cwd}]`, `ownership`, `con`, `adr`, `shape`, `con_refs`,
  `refactor_checklist`; декодер `ignoreUnknownKeys = false`; в отказ уходит первая строка исключения.
- Persona-строка роли (`Role.kt`): «each with a run: or a check: naming its evidence kind» — `run`/`check`
  живут в `acceptance`, а не в increment; модель послушно клала их в increment и получала отказ
  (прогон 3, ходы 30–39: `changes`, `check`, `goal`, `steps`, `run`, `evidence`, `why`, `how`, строки…).
- Даже принятый план (прогон 4, ход 38) не прошёл exit: `graph/RequirementGraph.validate` требует `produces`
  («needs an artifact or named uncertainty») и исполняемую приёмку — об этом в промпте нет ни слова.
- Для `state.patch` эта же проблема (finding F-9) уже была решена: `PatchParser.FORMS` в тексте отказа и
  словарь в заметке Studio (`bridge/Guidance.kt`). Для `task.propose` аналог не сделан.

### M5. Ложный зелёный первого прогона и ложный контекст второго
- Прогон 1: дерево было пустым, sniffed-команд не было → Studio выбрала `VerificationSetup("review","none")` →
  AC = Check «The change fulfils the request» (`Verification.REVIEW_TEXT`). Reviewer вердикта **не дал**
  (seq 410: «the reviewer gave no verdict … the result is unverified»). Дальше `DecisionService` в режиме auto
  принимает любую приёмку без статуса Failed: запись «accept by studio:policy(auto): not verified» (seq 453).
  То есть auto-политика принимает явно непроверенную работу — это и есть дыра, а не «reviewer одобрил».
- `TaskService.java` (recap для follow-up): исход `completed` переводится в **«Outcome: finished and verified»**
  и отправляется модели в следующем запросе, хотя `verified: "none"`. Модель прогона 3 получила ложную
  предпосылку и запрос «проверь», противоречащий ей.
- `RunArgs` не имеет `env`; процесс получает только переменные из `redaction.envAllowlist`
  (`tool/run/Run.kt`, `EnvPolicy`). Задать `JAVA_HOME` для `gradlew.bat` из модели нельзя (обход
  `-Dorg.gradle.java.home` не влияет на JVM самого wrapper'а).
- Continue (`TaskService.java`) создаёт новую кампанию с новым work id: прогон 4 заново прошёл S1 → plan,
  план прогона 3 не унаследован.
- Пакетный отказ: если в одном ходу один вызов невалиден, отклоняются все (`Cell.kt` `validateCalls`).
  Прогон 3, ход 8: попытка `task.ask` (правильный выход) отброшена из-за соседнего кривого `state`.

### M6. Ритуал регистра (известно как RC6)
Отказы `register` в прогонах: «line ≤ 240 chars», «v needs an existing evidence id: op:16 names no run…»,
«tick needs an open step», «cursor on an open step», «String literal … should be quoted». Каждый — потерянный ход.

## 3. Ответ на вопрос «модели не понимают нестандартные инструменты?»

Частично. Схемы tool'ов действительно нетипичны (семь семейств с `op`/`what`-диспетчером, типизированный регистр),
и дешёвые модели теряют на них 8–10 % ходов. Но в этой задаче доминировали не ошибки понимания, а три
**детерминированных** свойства harness'а: неверная роль для запроса, отказ без пути выхода, отсутствие тормоза.
Любая модель, включая фронтирную, в plan-ячейке с этим контрактом сделала бы то же самое — только быстрее
сдалась бы и попросила пользователя запустить тесты (что GLM и сделала на 40-м ходу прогона 4).

## 4. Что менять (в порядке эффекта на цену; после критики Opus и Codex)

| # | Изменение | Где | Размер | Что даёт |
|---|---|---|---|---|
| F1 | **Тормоз на повтор отказа.** Отказы (`Validated.Refused`, `Disposition.NotExecuted`) получают сигнатуру `(tool, args, reason)` и считаются Loop-гейтом; второй одинаковый отказ — nudge с причиной, третий — конец ячейки со статусом «blocked: <причина>», видимым пользователю (не `requiredOp=state`: запись в регистр здесь не выход). Stall переоткрывается каждые `stallTurns` | `cell/Cell.kt`, `cell/Gates.kt` | S | 40 ходов → ≤ 4; выполняет уже обещанную error policy |
| F2 | **Отказ по маске говорит правду и путь.** «`run` недоступен роли plan в этой ячейке (в любом ходу). Доступно: … Чтобы команды выполнились, предложи план `task.propose(plan)` в форме …; если план невозможен — `state.blocked` или `task.ask`». Плюс: терминальные вызовы (`task.ask`, `state.blocked`, `task.answer`) не отклоняются вместе с кривым соседом по ходу | `cell/Cell.kt` `validateCalls` | XS–S | убирает 20 повторов; спасает правильный выход (прогон 3, ход 8) |
| F3 | **Форма плана опубликована там, где её видит plan-роль:** persona-строка с реальными ключами и минимальным примером (`increments[{id, requirements, accept, produces:"artifact"}]`, `acceptance[{id, requirement, run|check|review}]`); в отказе `CampaignProposals.plan` — допустимые ключи и настоящий путь (`increments[0].check`), обязательные `produces` и исполняемая приёмка; заметка Studio для plan-роли по образцу `Guidance.NOTES`. Полную вложенную JSON-схему в `Request.tools` не добавлять: она уходит всем ролям в кэшируемый префикс | `cell/Role.kt`, `campaign/Proposals.kt`, `bridge/Guidance.kt` | S | 10 ходов угадывания → 1 |
| F4 | **Тривиальный план строит контроллер, а не модель.** Когда вся приёмка контракта — `Acceptance.Run` от harness'а (sniffed-команды), `runS1` создаёт граф сам: один increment на все требования, `produces=artifact`, приёмка — эти Run; plan-ячейка не запускается. Это ровно тот план, который модель родила на 38-м ходу прогона 4. Более общий вариант — R8(в) `Flags.lazyPlan` из `FABLE_ANALYZE_AND_IDEAS.md` §7.3. **Не** давать plan-роли `run`: R-класс не соберёт Gradle (пишет `build/`), а W-класс ломает разделение plan/implement (§4.2) | `campaign/Controller.kt` `runS1` | S–M | вся цепочка M1→M4 исчезает для «проверь/почини»; нужно решение владельца (меняет §4.2) |
| F5 | **Auto-политика не принимает `Unverified`.** `DecisionService` в auto: `Passed` → accept, `Failed` → reject, `Unverified` → карточка пользователю или ярлык «finished, not verified» без слова «verified». Recap для follow-up не пишет «finished and verified», если ни одна приёмка не `Passed`. Приёмка перевыводится после того, как в пустом дереве появились build-файлы (сейчас `Verification.choose` считается один раз при открытии) | `decisions/DecisionService.java`, `tasks/TaskService.java`, `bridge/Verification.kt`, `StudioHost.kt` | S | исчезает ложный зелёный прогона 1 и ложная предпосылка прогона 3 |
| F6 | **Toolchain хоста.** Настройка проекта «пути инструментов» → `PATH`/`JAVA_HOME` в `EnvPolicy` спавна (или `env` в `RunArgs` с allowlist). Когда sniffed-команда есть, а её программа не находится — карточка «toolchain не найден», а не review-приёмка | `tool/run/Run.kt`, `Config.redaction.envAllowlist`, Studio settings | S | devtools без обходов |
| F7 | Continue не создаёт новую кампанию с нуля при `limit_reached`, если план/регистр прошлого прогона есть: подхватить его (G1 из `final_analyze.md`) | `TaskService.java` | S | прогон 4 не повторяет прогон 3 |
| F8 | Транспорт для GLM-класса (см. §7): предпочтения upstream OpenRouter в профиле (исключить Together для GLM); ремонт `X<arg_key>Y` в адаптере; `op` из присутствующего ключа; настоящая ошибка JSON для битой строки `patch` | `provider-ai-gate`, SDK `CompletionsCodec`, `tool/Args.kt` | S | ~1/3 вызовов `state.blocked` на GLM через Together перестают теряться |

Порядок: F1+F2 (день, без решений владельца), F3, F5, затем F4 (решение владельца), F6, F7, F8.

Проверка: фикстура «plan-ячейка + три Run-приёмки + scripted-модель, бьющая в `run`»: после F1/F2 — ≤ 3 хода до
`task.propose`/`state.blocked`; после F4 — plan-ячейки нет. Фикстура «пустое дерево → review/none → Unverified»:
после F5 задача не помечается completed. Затем живой прогон этой же задачи на GLM ×3 (разброс между прогонами до 3×,
одного прогона недостаточно).

## 5. Независимая проверка (Opus 5.5 и Codex, параллельно, только чтение)

Оба подтвердили H2 (текст отказа), H3 (Loop-гейт слеп к отказам, Stall один раз), H4 (схема плана скрыта,
persona-строка вводит в заблуждение, `at path: $` для вложенного ключа). Оба поправили меня в одном и том же:

- **Приёмки Run вывело ядро** (`Contracts.kt` `derive`, origin Harness), а не Studio. Исправлено в M1.
- **Reviewer ничего не одобрял.** Его ответ был «не вердикт» → AC-1 `Unverified` → auto-политика приняла с
  пометкой «not verified». Исправлено в M5; фикс перенесён в `DecisionService` (F5).
- **«Тупик по построению» — преувеличение:** `task.ask`, `state.blocked` и валидный план были доступны; тупиком
  ячейку сделала невидимая форма плана плюс пакетный отказ, убивший `task.ask` на ходу 8.
- **Регистр (H7) — второстепенно:** 4/0/2/1 отказов по прогонам, ~7 ходов из 117.
- **H6:** оба рецензента сочли источник порчи недоказуемым по экспорту. Живой эксперимент (§7) закрыл вопрос: это
  GLM-разметка `<arg_key>`, недоразобранная upstream-провайдером Together; SDK чист.

Что они нашли сверх моего: recap «finished and verified» при `verified: none`; Continue = новая кампания с
нуля; пакетный отказ всего хода; заметка Studio «the result is checked with …» показывается plan-роли и противоречит
ей; `Verification.choose` считается один раз на пустом дереве; `task.delegate` в маске plan, но в S1 не работает;
prescan использовал список файлов из «фонового» контекста для выбора формы.

Где я не согласился: Codex считает «all Run» недостаточным признаком простой работы для пропуска плана — верно,
поэтому F4 строит тривиальный граф только для harness-приёмок, а общий случай оставляет R8(в).

## 7. Эксперимент: откуда мусор в аргументах tool-call (воспроизведено вживую)

Инструменты (в репозитории ASTROLABE, не закоммичены):
- `provider-ai-gate/src/test/kotlin/io/astrolabe/provider/aigate/GlmToolCallProbeTest.kt` — live-зонд через тот же путь,
  что у Studio (AI Gate → openai-completions, стрим, `AiGateAdapter`), с настоящим `[S]` роли plan
  (`Layout.system`), настоящими схемами семи tool'ов и реконструированными `[K]`/`[T]`/`[A]` прогона 3
  (`./gradlew :provider-ai-gate:liveTest --tests '*GlmToolCallProbeTest*'`, ключ в `OPENROUTER_API_KEY`;
  `liveTest` в `provider-ai-gate/build.gradle.kts` теперь включает этот класс). Пишет `build/probe/probe.jsonl`
  и `build/probe/wire.log` (тела запросов, `WireLog.BODIES`, заголовки редактированы).
- `scripts/probe/or_raw_capture.py` — повтор тех же тел запросов напрямую в OpenRouter, мимо SDK, с сохранением
  каждого сырого SSE-кадра (`build/probe/raw/*.sse.txt`, `summary.jsonl`).

Три сценария × 6 вызовов, `z-ai/glm-5.3-flash`, effort high, 2026-09-30 (≈ 0,03 USD за всё; вместе с DeepSeek-контролем ≈ 0,1 USD):

| Сценарий | Путь | Upstream | Порченые аргументы | Другие аномалии |
|---|---|---|---|---|
| `blocked-explicit` (ход 4, анкор просит записать блокер через `state.blocked`) | SDK | Together | **2/6** — ключ `blocked<arg_key>evidence`, нет `op`, поля `reason`/`question` вывалены наверх | — |
| то же | сырой HTTP | Together | **1/6** — тот же самый ключ уже в SSE-кадре провайдера (2 фрагмента: `{` и весь остаток) | 1/6 без `op` |
| то же, `provider.order=["Z.AI"]` | сырой HTTP | Z.AI | **0/6** | 1/6 без `op` |
| `masked-run` (ход 4 после отказа `run`) | SDK | Together | 0/6 | 2/6 снова `run`, 2/6 `verify.baseline`, 1/6 `task.propose(plan)` с ключами `scope/text/verify` (все неверные), 1/6 `state` |
| `first-turn` (ход 1 прогона 4) | SDK | Together | 0/6 | **2/6 `patch` строкой с невалидным JSON** (пропущены скобки — то же, что прогон 4, ход 2; терпимость D-347 не спасает) |

Контроль на `deepseek/deepseek-v4.1-flash` (те же три сценария × 6, SDK-путь + сырой HTTP, upstream AtlasCloud, 36 вызовов):

| Сценарий | Порченые аргументы | Что модель делала |
|---|---|---|
| `blocked-explicit` | 0/12 | 12/12 проигнорировала прямую инструкцию анкора «запиши блокер» и продолжила читать файлы (`look`), 2/12 `verify.baseline` |
| `masked-run` | 0/12 | 0/12 повторила `run`; читает build-файлы и `devtools`, 4/12 `verify.baseline`; ни одного `task.propose`/`state.blocked` |
| `first-turn` | 0/12 | чтение дерева и build-файлов; 1/12 сразу `run` |

DeepSeek всегда отдаёт корректный JSON (порча — свойство связки GLM+Together, не транспорта), но и он за 36 вызовов ни разу
не вышел из plan-ячейки штатно: ни плана, ни блокера. Инструкция в `[A]` для него слабее привычки «сначала посмотреть».

Выводы:
1. **SDK и адаптер не виноваты.** Один и тот же мусор приходит в сырых кадрах провайдера; `CompletionsCodec`/`Accumulator`
   склеивают фрагменты по `index` корректно, `ResponseTranslator` передаёт `arguments` как есть.
2. **Источник — связка «GLM + парсер tool-call у upstream Together».** GLM пишет вызовы в собственном XML-диалекте
   `<tool_call>NAME<arg_key>K</arg_key><arg_value>V</arg_value>…` ([llama.cpp PR 15186](https://github.com/ggml-org/llama.cpp/pull/15186),
   [SGLang GLM-5.3](https://docs.sglang.io/cookbook/autoregressive/GLM/GLM-5.3)); вложенный объект `blocked{reason, evidence, question}`
   в этот плоский диалект ложится плохо, и парсер Together отдаёт ключ `blocked<arg_key>evidence`. Официальный endpoint Z.AI
   тот же запрос разбирает чисто. Значит, в прогоне 3 (ход 4) модель, скорее всего, обслуживалась Together — OpenRouter
   не пишет upstream в `model-requests.json` (ещё один аргумент за G2).
3. **Вложенные объекты в аргументах — системный риск для GLM-класса** независимо от парсера: `patch` строкой с битым JSON
   (2/6), `op` пропущен (1/6 на обоих upstream). Схемы ASTROLABE вложены глубоко (`state.blocked.*`, `edit.ops[].hunks[]`,
   `task.proposal.increments[]`), и именно там модель теряется.
4. **Даже без порчи `masked-run` подтверждает M2–M4:** ни один из шести вызовов не сделал того, чего ждала роль
   (валидный `task.propose(plan)`); единственная попытка плана — с выдуманными ключами.

Что из этого следует для плана (§4):
- F8 повышается до S и уточняется: (а) в `provider-ai-gate`/SDK — предпочтения upstream для OpenRouter (`provider.order` /
  `ignore`) как опция профиля; для GLM по умолчанию исключать Together, пока парсер не починят; (б) ремонт ключей вида
  `X<arg_key>Y` → вложенный объект в адаптере (детерминированный, только этот паттерн); (в) `op` выводится из присутствующего
  ключа (`blocked`/`patch`/`retrieval_miss`); (г) для битой строки `patch` — показать модели место ошибки, а не «Expected JsonArray».
- Обходной путь для пользователя уже сейчас: Z.AI как custom endpoint Studio (OpenAI-совместимый API) с ключом Z.AI, либо
  другая модель для этой задачи.

## 8. Что реализовано (2026-10-01, ветка `ASTROLABE` `fix/plan-handoff`, не слита в `main`, не запушена)

| # | Решение | Что сделано | Где |
|---|---|---|---|
| F1 | D-358 | Отказы валидатора (маска, схема, partition) и policy-denial `run` (read-only роль, ceiling, режим, D-класс без intent) получают `RefusalSignature`; гейт `refusal-loop`: 2-й одинаковый отказ — nudge с выходами, 3-й — ячейка завершается `blocked` с причиной отказа. История отказов живёт всю ячейку (сбрасывается только при смене версии контракта: в живом прогоне повторы шли вперемежку с другими вызовами). Stall re-fire каждые 3 холостых хода. `error-policy/2` | `cell/Cell.kt`, `cell/Gates.kt`, `cell/Layout.kt` |
| F2 | D-357 | Текст отказа по маске: причина (роль / форма / ceiling), список доступного, выход роли (`cell/Refusals.kt`). Терминальные вызовы (`task.ask`, `task.answer`, `state(blocked)`) исполняются в одиночку, даже если сосед по ходу невалиден | `cell/Cell.kt`, `cell/Refusals.kt` |
| F3 | D-359 | Форма плана видна: persona-строка `roles/4` с примером, описание `proposal` в схеме `task`, константа `PLAN_FORM` в каждом отказе; неизвестные ключи игнорируются и называются с настоящими путями; пропорциональные дефолты только для одного increment (многошаговый план по-прежнему требует `produces`, чтобы не ослабить S3); принятый план без пробелов говорит модели завершить ход | `campaign/Proposals.kt`, `cell/Role.kt`, `tool/ToolSchemas.kt`, `tool/task/TaskTool.kt`, `graph/RequirementGraph.kt` |
| F4 | D-360 | `ShapePolicy.planCell = WhenNeeded` (по умолчанию): в S1 без `review:`-пунктов, без затронутых контрактов и с проходящим пакетным валидатором граф `G_single(C)` ставится контроллером без plan-ячейки (запись в журнал). Роль plan получает `run` R-класса; R-only теперь **enforce'ится** для plan и probe (раньше у probe была только «обязанность») | `Defaults.kt`, `campaign/PlanNeed.kt`, `campaign/Controller.kt`, `cell/Role.kt`, `tool/run/Run.kt`, docs |
| F5 | Studio | Recap для follow-up говорит «finished and verified» только при пройденной проверке; шапка задачи и сайдбар показывают «Done · not verified» | `ASTROUI` `TaskService.java`, `acceptance.ts`, `state-mark.ts`, каталоги i18n (не закоммичено) |
| F8 | D-361 | `InputTolerance`: вывод `op`, разбор склеенного ключа `X<arg_key>Y` в вложенную форму, настоящая ошибка JSON для битой строки `patch`, подсказка про markup | `tool/Args.kt`, `tool/ToolCall.kt` |
| E | D-362 | `gate.body` — vendor pass-through в тело запроса; Studio для `openrouter/z-ai/*` исключает upstream Together | `provider-ai-gate/ProfileBinding.kt`, `ASTROUI` `AutoProfiles.kt` |

Не сделано (осознанно): F6 (env для `run` — `PATH`/`JAVA_HOME` и так наследуются из allowlist; отдельная настройка toolchain
проекта не добавлена), F7 (Continue с наследованием плана — после F4 plan-ячейка для этого сценария не запускается вовсе),
изменение auto-политики приёмки `Unverified` (решение владельца D-337/D-340 — оставлено, исправлены только ярлыки).

Остаточные риски: план, уже записанный через `task.propose`, теряется, если ячейка потом завершается `blocked`
(`Controller.plan` возвращается раньше чтения предложения); implementing-ячейка тоже завершится `blocked` после трёх
одинаковых policy-denial `run` — намеренно, но это шире прежнего поведения; в `CellTesting` `f.run` больше не тот
исполнитель, что у plan/probe-ячейки.

## 9. Живой повтор сценария на исправленном ядре (2026-10-01)

Изолированная Studio (свой `STUDIO_DATA_DIR`, ветка `fix/plan-handoff`, JDK/Gradle из `devtools` в окружении процесса),
тот же проект `C:\temp\play3`, та же формулировка задачи, `openrouter/z-ai/glm-5.3-flash`, effort high, режим auto.

| | Было (прогоны 3–4) | Стало |
|---|---|---|
| Форма / первая ячейка | S1 → plan-ячейка | S1 → `plan cell skipped: acceptance is executable (AC-1, AC-2, AC-3)…` → implementing-ячейка на `inc-1` |
| Команды сборки выполнены | 0 | `./gradlew.bat test` на 1-м ходу (падение: нет репозиториев), ещё дважды после правок, `../gradlew.bat test` в `server`, `verify tests` |
| Исправления | — | `settings.gradle.kts` (dependencyResolutionManagement + Maven Central); нечестный тест превью (размер картинки 400×200 → 1600×800) |
| Результат | budget_exhausted ×2, 80 ходов, ~4,9 млн токенов за задачу | `completed`, 34 хода, 442 тыс. токенов, 0,04 USD, 31 минута; 28 серверных тестов зелёные |
| Ярлык | «finished and verified» при `verified: none` | `verified: unverified` — честно: AC-2 (`npm test`) не выполнен, потому что `npm` в системе нет, а `npm install` запрещён политикой |

Модель сама назвала оговорку в итоге («для полной проверки фронтенда нужно один раз выполнить `npm install`»).
Что видно как следующая боль (не в этой задаче): Stall-гейт после F1b срабатывает каждые 3 хода даже при реальной
работе (правки и запуски не считаются прогрессом — R3b из `FABLE_ANALYZE_AND_IDEAS.md`); `look` отказывал на `range`
и `budget` (R4c); `npm install` — карточка разрешения вместо отказа (R12).

## 6. Что не проверено
- Кто был upstream в самом прогоне 3 — экспорт не хранит; воспроизведение (§7) показывает Together, но это вывод по аналогии.
- Откуда в дереве пакет `play3/` и входят ли в 1165 файлов чужие файлы.
- Почему `verify.baseline` вернул `unavailable` в прогонах 3 и 4.
- Работает ли `./gradlew.bat test` в проекте вообще (проект не собирался ни разу; возможно, там и компиляция не проходит).
- Поведение фронтирной модели в той же plan-ячейке (гипотеза «сдалась бы быстрее» не измерена).
