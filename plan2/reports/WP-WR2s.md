# WP-WR2s — Studio half of the 4B review fix line

## Сделано
- **P1 #8 (WF-10):** `CampaignService.stopCodeOf` returns `cell_failure` for a core state with `failedResumably`. Before, a refresh overwrote it with null. `onRunEnded` keeps `cell_failure` for `failed`, where it used to write null. Test: `CampaignWorkflowScenarioTest.aCellFailureKeepsItsStopCodeThroughTheRunEndAndEveryRefresh`.
- **P1 #9 (WF-13):** Send to agent now acts in every run state. A live run gets the note at once (`host.message`), an opening run queues it, a stopped run continues with it. The send's identity is `card-<cardId>-<max acceptance_note.seq>`, built from durable rows. A retried send stays one message, and a send after a new note is a new message. Test: `TaskWorkflowScenarioTest.sendToAgentWhileTheRunWorksDeliversEachSendUnderItsOwnIdentity`.
- **P1 #10:** the opening queue now stores `Queued(text, kind, hostRef)` and `deliverQueued` passes all three. "Change the task" stays an `amendment`, and `msg-<uuid>` is assigned when the message is queued. Test: `whatIsQueuedWhileTheRunOpensKeepsItsKindAndIdentity`. It also covers a card send while the run opens (#9).
- **T-33:** a campaign-scope Rework from the card no longer starts a follow-up. Its words (or the attached note, or the default reason) go to the same work as an `amendment` (`card-<id>-rework`), and then the work reopens (task-workflow §2.1). Test changed: `aCampaignScopeReworkOnTheCardStartsTheFollowUp` → `aCampaignScopeReworkOnTheCardAmendsTheSameWork`.
- **T-46:** `scratchJson` lists `prefixes ∪ outputs` in `roots`. `StudioHost.scratchPolicy` now reads the effective attempt policy: the live attempt's, else the last stored one (`Attempts.all`), else the one in the contract. `contract.scratch` is written only at v1 and never contains declared outputs. Test: `TaskScratchTest.theScratchListShowsTheDeclaredOutputs`.
- **P2, recap duplicates (`TaskService.userWords`):** core requests whose `hostRef` starts with `card-` are skipped. The card's note and Rework rows already list those words at their own time. Covered by the extended `everyRunsRequestCarriesEveryUserMessageWordForWord`.
- **P2 WF-1 (`StudioHost.kt:295`):** when the preflight guessed different notes than the open found, the second open now emits an `AgentEvent.Warning("preflight-diverged")` and is no longer silent. The cause of the divergence is not fixed (see tails).
- Commit `f3dd222` (+197 −30, 6 files): StudioHost.kt, CampaignService.java, TaskService.java and 3 tests.

## Решения
- Identity of a card send → the max `acceptance_note.seq` of the card. Why: it is durable and needs no migration, and a retry stays idempotent. Safe alternative: a separate `note_sent_seq` column that would let a send carry only the new notes. Today a repeat send carries the whole accumulated note.
- Queue identity → `msg-<uuid>` at enqueue. The queue is still in memory: after a server restart an undelivered queued message is lost, as before.
- T-33 without the user's words → the amendment carries the default reason, as the follow-up used to. The recap does not count it as the user's words.

## Тесты
- Repro before the fix: 7 new or changed tests red (#8, #9 ×2, #10, T-33, T-46, recap).
- Cycle 1: `:backend:server:test --tests '*CampaignWorkflowScenarioTest' '*TaskWorkflowScenarioTest' '*TaskScratchTest'` → 1/1, 20/20, 2/2.
- L2: `:backend:bridge:test` 25/0 and `:backend:server:test` 100/0, `*WorkflowScenario*` 25/0. Built against studio-core `238c6d7` + aiGate SDK. Frontend was not touched, so its tests were not run.
- 1 edit→test cycle + L2. Token spend is not visible.

## Отклонения от карточки
- Changed tests that asserted the defect: `sendToAgentSendsTheCardsNoteAsSteering` expected the hostRef `card-<id>`, one key per card (#9). `aCampaignScopeReworkOnTheCardStartsTheFollowUp` expected a follow-up (T-33).

## Хвосты и риски
- P2: WF-1 root cause — the preflight (`Sniff` over `git ls-files`) and the open (atlas, W8 `Contracts.declared`) can still disagree. Now it is visible as a warning but still costs an open. A fix needs a counted scenario with a diverging repository.
- P3: a campaign-scope Rework while the run is live or opening still goes through the decision SPI, so the core stops at c16. The Studio does not record an amendment then.
- P3: Continue without text after a c16 stop (a pre-T-33 run, or the campaign API) still starts a follow-up (`aCampaignScopeReworkGoesOnAsAFollowUp`, unchanged).
- P3: the in-memory queue is lost on restart, and in `deliverQueued` a failure mid-list drops the rest (pre-existing).

Статус: ГОТОВО К СЛИЯНИЮ — `f3dd222` (v2/WR2s, pushed)
