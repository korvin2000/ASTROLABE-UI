# Сквозное ревью сессии 5 (ядро `e778c9a`, Studio `52daf43`) — Codex gpt-6.1-sol, xhigh, только чтение

Вывод Codex передан без изменений (пересыльщик `codex:codex-rescue`); фактические HEAD на запуске `f921f63` / `1f5c1ba` —
отличаются от среза только TODO и отчётами. C17 (`62afbee`: `tool/verify`, `Look`, `TaskTool`, `ContractSlice`, `Db`, eval-live
`Arms`/`Results`) слита **после** старта ревью и в него не входила. Решения оркестратора — в конце файла.

## P1

1. **Сбой после завершения ячейки, но до `returned_handoff`, теряет обязательства завершения.**
   Доказательство: terminal checkpoint и packet сохраняются до `Cell.Ended` (`cell/Cell.kt:1483`); `CellPacket.of` не сохраняет флаги
   целостности и public-impact ledger (`cell/Checkpoints.kt:96`); долговечными они становятся только в `campaign/Handoffs.kt:117`
   (вызов `Controller.kt:2340`); без этой записи reopen применяет `Controller.kt:818` — `Lost` сохраняет только turns/touched
   (`campaign/Lifecycle.kt:439`); следующая ячейка получает обязательства только через `continues` (`Controller.kt:2734`, `:2749`).
   Сценарий: direct S0/S1 меняет публичную сигнатуру или ослабляет тест, уходит в handoff; процесс падает после `Cell.Ended`, до
   записи контроллера; после reopen новая ячейка ничего не правит и вызывает `task(finish)` — обязательство чтения refs / integrity
   review отсутствует; в Autonomous полный анализ изменённой поверхности gate-флаги не восстанавливает (`Controller.kt:2925`).
   Минимальная правка: сохранять типизированный handoff cause, integrity flags и unresolved public impact в атомарном terminal packet;
   при open восстанавливать возврат и обязательства из него до `Lost`. Уверенность высокая. D7 защищает только позднее окно.

2. **Host override роли может переключить retention на Structured, хотя ячейка исполнялась как Direct.**
   Доказательство: отсутствующий `Role.protocol` и старый конструктор дают Structured (`cell/Role.kt:67`, `:84`); проверки override
   не запрещают расхождение протоколов (`Config.kt:201`); исполнение переносит из override только текст и сохраняет протокол
   стандартной роли (`cell/RoleTexts.kt:105`); D7 retention читает сырой configured protocol (`context/FactRetention.kt:25`,
   подключение `Controller.kt:1716`); structured-правило удаляет не-referenced stale verified fact на второй границе
   (`context/FactCoherence.kt:71`). Сценарий: host меняет wording роли `direct` через старый конструктор или JSON без `protocol` —
   direct работает, но после двух эпох verified note исчезает из carry вопреки A-D.4.
   Минимальная правка: разрешать протокол retention тем же способом, что и runtime-роль. Уверенность высокая.

3. **Studio выдаёт direct-ячейке руководство для Structured с недоступной операцией.**
   Доказательство: D4 разрешает Direct (`bridge/ConfigSupport.kt:206`); запуск безусловно добавляет руководство (`StudioHost.kt:370`);
   руководство требует `state.patch` и завершения без tool call (`Guidance.kt:14`, `:21`); direct mask даёт `state.note`/`task.finish`,
   без patch (`cell/Role.kt:243`); patch отказывается (`Cell.kt:1108`), первый финальный ответ без вызова получает лишь nudge
   (`Cell.kt:1170`); eval-live добавляет аналогичное руководство (`evallive/StudioAttempt.kt:497`).
   Сценарий: пользователь выбирает direct либо auto→direct; модель следует guidance, заметки отказываются, знания не записываются.
   Минимальная правка: выбирать guidance по фактическому протоколу главной роли замороженной попытки, сохранив structured bytes.

4. **Direct arm eval-live остаётся заблокированной** (`Arms.kt:44`, `:75`, `:54`). — **Уже исправлено C17 `d6403b6`** (`Arm.spec`
   ставит `Config.protocol = Direct`, отказ снят, `ArmTest`); ревью шло по срезу до C17.

## P2

1. Ask/reopen eval-live может детерминированно делать два open: expected классифицирует сохранённые проверки по origin
   (`StudioAttempt.kt:162`), actual сравнивает команды со sniff (`:226`); для добавленного моделью goal run без sniffed suite — `declared`
   и `saved`, затем второй open (`:514`). Минимум: actual через `StudioPolicy.of(opened.contract)`.
2. Windows shim `rg.cmd`/`rg.bat` может выбрать незапускаемый backend: probe допускает расширения (`atlas/Host.kt:68`), Controller выбирает
   ripgrep (`Controller.kt:517`), backend запускает `rg` через `ProcessBuilder` без JVM fallback (`os/search/RipgrepSearch.kt:83`).
3. Direct parent carry ограничивается по Structured-render: `CarryForward.kt:128` оценивает вариант без protocol (`:65`), Compiler выводит
   `role.protocol` (`Compiler.kt:168`). Минимум: cap по выводимому протоколу.
4. Eval-live завышает `cells` при продолжении того же work: сегмент возвращает накопленное `state.cells.size` (`StudioAttempt.kt:540`),
   Bench суммирует сегменты (`Bench.kt:267`). Минимум: считать новые CellId либо последнюю величину каждого work.
5. Продление гранта имеет отдельное окно сбоя: кампания сохраняется Resumed/LimitRaised до записи renewal (`Controller.kt:719`, `:733`);
   сбой между ними оставляет старый исчерпанный грант (`Handoffs.kt:185`) — ещё один budget stop. Минимум: атомарно сохранять resume и renewal.
6. Packet без STATUS не гарантирует восстановление STATUS; S0 не пишет обычную boundary-запись (`Controller.kt:1777`, `:1681`, `:1955`,
   `:1763`). Минимум: восстановление boundary по terminal packet с проверкой записанного cell id.
7. WF-4 неполон на самом первом capture: начальный `dirty.capture(0)` (`Controller.kt:641`) вне catch `UnreadableInput` (`:589`). (= T-35.)

## Держатся
WF-1 (`StudioHost.kt:267`, `StudioAttempt.kt:499`; исключение — P2 №1), WF-2 (`DirtyRepoScenarioTest.kt:55`, `:64`), WF-3
(`RoutingLog.kt:54`, `BindingPhysics.kt:348`; guard `:85`), WF-4 (`Controller.kt:931`, `:823`; первый capture — P2 №7), WF-5
(`Controller.kt:3104`, `Outputs.kt:83`), WF-6 (`:3115`, `:3172`), WF-7 (`:672`, `:781`), WF-8 (`TaskService.java:849`), WF-9
(`Cell.kt:436`, `:1759`), WF-10 (`CampaignService.java:466`, `TaskService.java:938`), WF-11 (`TaskService.java:1083`), WF-12
(`Resolution.kt:352`, `Controller.kt:3327`, `Answers.kt:37`), WF-13 (`TaskService.java:1374`, `Controller.kt:3500`), WF-14
(`Checkpoints.kt:171`, `Controller.kt:1788`; ограничения P1 №1–2, P2 №3, №6), WF-15 (`Cell.kt:948`; routing log/snapshot вне проекции).
Окна сбоя direct: `returned_handoff` записан / `Returned` нет — держится (`Controller.kt:700`); cell end → STATUS — **P1 №1**, P2 №6;
reopen с поправкой/unblock — держится (`:696`, `:761`); spend записан / successor не dispatched — держится (`:1031`); грант исчерпан —
держится (`:1034`, `:731`; renewal — P2 №5); reopen между эпохами — держится (`:1009`, `:1179`, `:1215`).
Стыки: единственная обёртка executor делегирует `defaultReadTokens` (`Cell.kt:1753`, `Dispatcher.kt:245`); схема `look` и парсер
согласованы, golden D4 по ролям (`ToolSchemas.kt:114`, `Args.kt:31`, `LayoutTest.kt:150`); `seedsMaxTokens` в оба пути
(`Controller.kt:1798`, `Cell.kt:1423`); routing/binding записи транзакционны, snapshot переиспользуется (`RoutingLog.kt:49`,
`BindingPhysics.kt:340`, `Db.kt:59`); v7 аддитивна (`Migrations.kt:325`); пара — один workspace и state, identity сохранена
(`Bench.kt:171`, `:189`, `RepoIdentity.kt:50`); Studio `auto` разрешается до RunSpec, Config в D-38 (`RunSpecs.kt:33`,
`AttemptConfig.kt:73`, `Controller.kt:620`).

## Не проверено
Выполнение тестов и живая модель; runtime-сценарий v6 → v7 с Running cell; паритет JVM/ripgrep по локалям; браузерное сохранение
настройки протокола; живое накопление физики связки (подписка не подключена в хостах; Router выбирает профиль до записи snapshot,
`Router.kt:183`).

## Решения оркестратора (2026-10-07)
- P1 №1, №2 + P2 №2, №3 → линия **WR5** (ядро, t4). P1 №3 + P2 №1, №4 → линия **WR5s** (Studio bridge + eval-live, t3). P1 №4 закрыт C17.
- P2 №5, №6 → новая задача P8.D.8 (сессия 6); P2 №7 = T-35 (P8.C.17). Второго ревью нет (правило владельца).
