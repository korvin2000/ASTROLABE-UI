# WP-C11 — `IntegrityApproval.Human` требует вердикт человека

**Исполнитель:** суб-агент t4 в worktree ядра (cwd `C:\work.astrolab\ASTROLABE`). **Ветка:** `v2/C11` от `main`.
**TODO:** P8.C.11. **Решение владельца 2026-10-03:** делать (меняет решение о приёмке и поток Studio — одобрено).
**Общие правила:** `C:\work.astrolab\plan2\COMMON.md` (обязательны). **Читать с:** D-320 (режим `Human`), D-396, D-397,
D-400 — `rg -n '^\| D-(320|396|397|400) ' TODO.md`; отчёт `C:\work.astrolab\plan2\reports\WP-C1b.md` («Хвосты» (б)).
K = core/src/main/kotlin/io/astrolabe.

## Цель
В режиме `IntegrityApproval.Human` (`K/Mode.kt`) блокирующий флаг test-integrity (агент изменил поверхность
обязательной проверки) снимает **только человек**. Сейчас «человеческий» путь определяется маршрутом, а не рецензентом:
`K/delegate/ReviewCell.kt:171` всегда добавляет путь `"human"` при обращении к хосту; фильтр
`K/campaign/Controller.kt` ≈ 2202 смотрит только на метку пути; применимое одобрение становится `Passed`
(`K/verify/Resolution.kt` ≈ 351). Хост может ответить на `Authority.review` своей моделью (Studio:
`ASTROUI/backend/server/.../tasks/ReviewPass.java`) — и завершение проходит без человека. C1b уже добавила
`Verdict.reviewer: ReviewerKind` (model | human, по умолчанию model) и понижает класс происхождения, но решение о
приёмке не меняла; тест `ProvenanceTest` (≈ 392) прямо фиксирует: режим `Human` + одобрение модели → завершение.

## Что сделать (правило из консультации Codex)
1. Под `IntegrityApproval.Human` блокирующее обязательство integrity снимает только применимый одобряющий вердикт,
   полученный через доверенный путь ревью хоста, с `reviewer == Human`. Вердикт без признака или с `model` оставляет
   обязательство ожидающим человека (`Await` с понятной причиной: «integrity change needs a human review»).
2. Обычная политика приёмки (accept-unverified и т. п.) это обязательство не покрывает: убрав вердикт модели, нельзя
   получить `Unverified`, который закроет политика (`K/verify/Resolution.kt` ≈ 424).
3. То же требование — во всех трёх местах: живое разрешение, повторное использование сохранённого ревью
   (`K/delegate/ReviewCell.kt` ≈ 158 — условия пригодности кэша) и возобновление pending-завершения
   (`K/campaign/Controller.kt` ≈ 1519).
4. Режим `Autonomous` не меняется: там судья-модель снимает флаг, как сейчас (класс не выше `agent_test`, D-397/D-400).
   Хост, которому нужно одобрение моделью, выбирает `Autonomous` — записать в KDoc `IntegrityApproval` и в docs.
5. Отклоняющий вердикт модели под `Human` — как и раньше, сведение для человека, а не решение (не должен сам отправлять
   на rework вместо человека, если сегодня так не было; сверь с кодом и сохрани существующую семантику отклонений).
6. Тесты: модель хоста отвечает на `Authority.review` под `Human` → флаг ждёт человека, кампания не завершается; затем
   вердикт человека → завершается, класс `independent` по правилам C2/C1b; сохранённое ревью модели не переиспользуется
   как человеческое; resume pending-завершения с вердиктом модели не завершает; `Autonomous` — прежнее поведение.
   Существующий тест `ProvenanceTest` (≈ 392) меняется осознанно — объясни в отчёте.
7. Данные для Studio (сама Studio — отдельным шагом после слияния линии C4): хост должен из события/состояния понять,
   что ожидается именно человек по integrity (причина, пути, чьё сведение-вердикт модели приложено). Проверь, что
   текущие `Await`/pending-структуры это несут; добавь только недостающее (с Java-формой).

## Границы
`campaign/Controller.kt` — только ветка integrity (≈ 2145–2210) и resume pending (≈ 1519): файл параллельно правит
линия C3r (лимиты) — не трогай остальное; `delegate/ReviewCell.kt`, `verify/Resolution.kt` (только обязательство
integrity и его покрытие политикой — правило обязательных/красных проверок правит линия C10), `Mode.kt` (KDoc), их
тесты; docs `verification/acceptance-review.md`, `runtime/gates-termination.md`. **Не трогать:** `verify/Scheduler.kt`,
`verify/Baseline.kt`, `cell/Gates.kt`, `budget/`, `campaign/Limits.kt`, `context/`, `register/`, Studio.

## Проверки
- L1: `./gradlew :core:test --tests 'io.astrolabe.campaign.ProvenanceTest' --tests 'io.astrolabe.campaign.AcceptanceDecisionTest' --tests 'io.astrolabe.verify.TestIntegrityTest' --tests 'io.astrolabe.campaign.ResumeTest' -q --console=plain`
  + тесты пакета `delegate` на ReviewCell, новые случаи.
- L2 один раз в конце, после `git merge main`: `--tests 'io.astrolabe.verify.*' --tests 'io.astrolabe.campaign.*' --tests 'io.astrolabe.delegate.*' --tests 'io.astrolabe.java.*'`,
  `:eval:compileTestKotlin`, `:core:checkKotlinAbi` → `updateKotlinAbi` при изменении публичного API.

## Готово, когда
Под `Human` модель хоста не может снять integrity-флаг ни на одном из трёх путей; `Autonomous` без изменений; L1/L2
зелёные; ветка запушена. При слиянии — ревью Fable (поток приёмки).

## Отчёт
`C:\work.astrolab\plan2\reports\WP-C11.md` по формату COMMON.md; в «Решениях» — что именно видит хост, когда ждётся
человек (поля), и что должна сделать Studio.
