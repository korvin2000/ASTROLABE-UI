# Audit · 12 runs

Money shares are of each run's basis total: billed when every call with usage was billed, else the priced estimate;
`partial` marks a run some of whose calls have no usage, an unknown class or no charge.
Hit share = Σ cache_read / Σ input (F §6.1); q̂ = Σ min(c, b) / Σ b over unchanged-prefix steps (§10.4); the Beta posterior of q is E1's.

## Prices (per million tokens)

Fitted from the billed calls of each route (exact least squares). `*` pools a model's upstreams: an estimate, used only for a route whose own calls identify nothing.
Condition: of the design matrix with unit-norm columns. Sensitivity: largest move of a price if every charge moved by one unit of its last decimal.

| route | calls | agreement | uncached | cache read | cache write | output | max residual | max rel. | condition | sensitivity (u/c/o) |
|---|---|---|---|---|---|---|---|---|---|---|
| openrouter/deepseek/deepseek-v4.1-flash @ Relace | 74 | Exact | 0.0198 | 0.0198 | — | 0.594 | 0 | 0.00 | 2.13 | 1.63e-06 / 2.63e-07 / 5.08e-07 |
| openrouter/z-ai/glm-5.3-flash @ GMICloud | 38 | Exact | 0.0891 | 0.01782 | — | 0.297 | 0 | 0.00 | 2.35 | 6.93e-09 / 4.13e-09 / 9.51e-08 |
| openrouter/z-ai/glm-5.3-flash @ Wafer | 38 | Exact | 0.099 | 0.0594 | — | 0.495 | 0 | 0.00 | 2.45 | 1.14e-07 / 4.77e-08 / 1.52e-07 |
| openrouter/z-ai/glm-5.3-flash @ * | 76 | Approximate | 0.091548 | 0.031623 | — | 0.52147 | 0.00036248 | 0.625 | 1.95 | 2.91e-08 / 1.38e-08 / 1.32e-07 |

## Runs: anatomy and cache

| run | calls | basis | total | billed | estimate | uncached | cache read | cache write | output | of it reasoning | unexplained | hit share | q̂ (steps) | reliability |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| runs/api-currency/deepseek_deepseek-v4.1-flash/r1/events.jsonl | 8 | Billed | 0.0048181 | 0.0048181 | 0.0048181 | 10.4 % | 22.9 % | n/a | 66.6 % | 25.8 % | 0 | 68.8 % | 88.3 % (6) | 100.0 % |
| runs/api-currency/deepseek_deepseek-v4.1-flash/r2/events.jsonl | 17 | Billed | 0.0097729 | 0.0097729 | 0.0097729 | 9.7 % | 32.7 % | n/a | 57.6 % | 31.7 % | 0 | 77.1 % | 92.8 % (14) | 100.0 % |
| runs/bugfix-pagination/deepseek_deepseek-v4.1-flash/r1/events.jsonl | 17 | Billed | 0.005346 | 0.005346 | 0.005346 | 11.9 % | 45.9 % | n/a | 42.2 % | 14.6 % | 0 | 79.4 % | 93.9 % (15) | 100.0 % |
| runs/bugfix-pagination/deepseek_deepseek-v4.1-flash/r2/events.jsonl | 11 | Billed | 0.0035886 | 0.0035886 | 0.0035886 | 11.7 % | 37.6 % | n/a | 50.8 % | 18.6 % | 0 | 76.3 % | 92.1 % (10) | 100.0 % |
| runs/rest-todo/deepseek_deepseek-v4.1-flash/r1/events.jsonl | 10 | Billed | 0.015494 | 0.015494 | 0.015494 | 5.8 % | 15.2 % | n/a | 79.1 % | 54.6 % | 0 | 72.5 % | 86.3 % (8) | 100.0 % |
| runs/rest-todo/deepseek_deepseek-v4.1-flash/r2/events.jsonl | 11 | Billed | 0.015571 | 0.015571 | 0.015571 | 5.8 % | 18.2 % | n/a | 76.0 % | 49.0 % | 0 | 75.7 % | 89.6 % (10) | 100.0 % |
| runs/api-currency/z-ai_glm-5.3-flash/r1/events.jsonl | 17 | Billed | 0.008887 | 0.008887 | 0.008887 | 68.3 % | 17.7 % | n/a | 14.0 % | 3.6 % | 0 | 56.7 % | 73.9 % (13) | 76.9 % |
| runs/api-currency/z-ai_glm-5.3-flash/r2/events.jsonl | 15 | Billed | 0.0052941 | 0.0052941 | 0.0052941 | 44.1 % | 37.0 % | n/a | 18.9 % | 6.5 % | 0 | 80.7 % | 91.9 % (14) | 100.0 % |
| runs/bugfix-pagination/z-ai_glm-5.3-flash/r1/events.jsonl | 9 | Billed | 0.005362 | 0.005362 | 0.005362 | 37.3 % | 47.9 % | n/a | 14.8 % | 6.9 % | 0 | 68.2 % | 83.8 % (8) | 87.5 % |
| runs/bugfix-pagination/z-ai_glm-5.3-flash/r2/events.jsonl | 9 | Billed | 0.0048903 | 0.0048903 | 0.0048903 | 22.2 % | 64.1 % | n/a | 13.6 % | 3.8 % | 0 | 82.8 % | 92.9 % (8) | 100.0 % |
| runs/rest-todo/z-ai_glm-5.3-flash/r1/events.jsonl | 10 | Billed | 0.010517 | 0.010517 | 0.010517 | 36.4 % | 42.8 % | n/a | 20.8 % | 5.3 % | 0 | 66.3 % | 78.4 % (8) | 100.0 % |
| runs/rest-todo/z-ai_glm-5.3-flash/r2/events.jsonl | 16 | Billed | 0.015951 | 0.015951 | 0.015951 | 47.4 % | 33.5 % | n/a | 19.1 % | 5.0 % | 0 | 63.4 % | 74.8 % (13) | 100.0 % |

## Runs: losses (share of run money; overlapping)

| run | W1 | W2 | W3 | W4 | W5 | W6 | W7 |
|---|---|---|---|---|---|---|---|
| runs/api-currency/deepseek_deepseek-v4.1-flash/r1/events.jsonl | 19.0 % | 0.0 % | 0.0 % | 0.0 % | — | 2.1 % | 0.0 % |
| runs/api-currency/deepseek_deepseek-v4.1-flash/r2/events.jsonl | 40.1 % | 0.0 % | 0.0 % | 0.0 % | — | 2.4 % | 0.0 % |
| runs/bugfix-pagination/deepseek_deepseek-v4.1-flash/r1/events.jsonl | 55.5 % | 0.0 % | 0.0 % | 0.0 % | — | 2.9 % | 0.0 % |
| runs/bugfix-pagination/deepseek_deepseek-v4.1-flash/r2/events.jsonl | 32.2 % | 0.0 % | 0.0 % | 0.0 % | — | 2.9 % | 0.0 % |
| runs/rest-todo/deepseek_deepseek-v4.1-flash/r1/events.jsonl | 56.5 % | 0.0 % | 0.0 % | 0.0 % | — | 0.9 % | 0.0 % |
| runs/rest-todo/deepseek_deepseek-v4.1-flash/r2/events.jsonl | 55.5 % | 0.0 % | 0.0 % | 0.0 % | — | 1.0 % | 0.0 % |
| runs/api-currency/z-ai_glm-5.3-flash/r1/events.jsonl | 11.7 % | 0.0 % | 8.0 % | 0.0 % | — | 9.5 % | 0.0 % |
| runs/api-currency/z-ai_glm-5.3-flash/r2/events.jsonl | 30.0 % | 0.0 % | 0.0 % | 0.0 % | — | 14.0 % | 0.0 % |
| runs/bugfix-pagination/z-ai_glm-5.3-flash/r1/events.jsonl | 37.9 % | 0.0 % | 0.0 % | 0.0 % | — | 6.7 % | 0.0 % |
| runs/bugfix-pagination/z-ai_glm-5.3-flash/r2/events.jsonl | 40.5 % | 0.0 % | 0.0 % | 0.0 % | — | 7.6 % | 0.0 % |
| runs/rest-todo/z-ai_glm-5.3-flash/r1/events.jsonl | 73.5 % | 0.0 % | 0.0 % | 0.0 % | — | 6.2 % | 0.0 % |
| runs/rest-todo/z-ai_glm-5.3-flash/r2/events.jsonl | 12.3 % | 0.0 % | 0.0 % | 0.0 % | — | 6.5 % | 0.0 % |

## Runs: Residency what-if

Conditional estimates on this log with the model's trajectory held fixed — not bounds; the calibration error is the replay of the observed cadence minus the observed cost.
Batches: turn (stubbed/losses); the journal's own batches beside them.

| run | observed (priced) | calibration error | scenarios | logged batches |
|---|---|---|---|---|
| runs/api-currency/deepseek_deepseek-v4.1-flash/r1/events.jsonl | 0.0048181 | 0 | k=8: 0.0048181 · batches none · re-paid 0<br>k=17: 0.0048181 · batches none · re-paid 0<br>off: 0.0048181 · batches none · re-paid 0 | not logged |
| runs/api-currency/deepseek_deepseek-v4.1-flash/r2/events.jsonl | 0.0097729 | 0 | k=8: 0.0097729 · batches 16 (18/0) · re-paid 5961<br>k=17: 0.0098803 · batches none · re-paid 0<br>off: 0.0098803 · batches none · re-paid 0 | not logged |
| runs/bugfix-pagination/deepseek_deepseek-v4.1-flash/r1/events.jsonl | 0.005346 | 0 | k=8: 0.005346 · batches 16 (17/5) · re-paid 4095<br>k=17: 0.0054016 · batches none · re-paid 0<br>off: 0.0054016 · batches none · re-paid 0 | not logged |
| runs/bugfix-pagination/deepseek_deepseek-v4.1-flash/r2/events.jsonl | 0.0035886 | 0 | k=8: 0.0035886 · batches none · re-paid 0<br>k=17: 0.0035886 · batches none · re-paid 0<br>off: 0.0035886 · batches none · re-paid 0 | not logged |
| runs/rest-todo/deepseek_deepseek-v4.1-flash/r1/events.jsonl | 0.015494 | 0 | k=8: 0.015494 · batches none · re-paid 0<br>k=17: 0.015494 · batches none · re-paid 0<br>off: 0.015494 · batches none · re-paid 0 | not logged |
| runs/rest-todo/deepseek_deepseek-v4.1-flash/r2/events.jsonl | 0.015571 | 0 | k=8: 0.015571 · batches none · re-paid 0<br>k=17: 0.015571 · batches none · re-paid 0<br>off: 0.015571 · batches none · re-paid 0 | not logged |
| runs/api-currency/z-ai_glm-5.3-flash/r1/events.jsonl | 0.008887 | -0.00026203 | k=8: 0.008625 · batches 16 (13/3) · re-paid 6024<br>k=17: 0.0083332 · batches none · re-paid 1298<br>off: 0.0083332 · batches none · re-paid 1298 | not logged |
| runs/api-currency/z-ai_glm-5.3-flash/r2/events.jsonl | 0.0052941 | 0 | k=8: 0.0052941 · batches none · re-paid 0<br>k=17: 0.0052941 · batches none · re-paid 0<br>off: 0.0052941 · batches none · re-paid 0 | not logged |
| runs/bugfix-pagination/z-ai_glm-5.3-flash/r1/events.jsonl | 0.005362 | 0 | k=8: 0.005362 · batches none · re-paid 0<br>k=17: 0.005362 · batches none · re-paid 0<br>off: 0.005362 · batches none · re-paid 0 | not logged |
| runs/bugfix-pagination/z-ai_glm-5.3-flash/r2/events.jsonl | 0.0048903 | 0 | k=8: 0.0048903 · batches none · re-paid 0<br>k=17: 0.0048903 · batches none · re-paid 0<br>off: 0.0048903 · batches none · re-paid 0 | not logged |
| runs/rest-todo/z-ai_glm-5.3-flash/r1/events.jsonl | 0.010517 | 0 | k=8: 0.010517 · batches none · re-paid 0<br>k=17: 0.010517 · batches none · re-paid 0<br>off: 0.010517 · batches none · re-paid 0 | not logged |
| runs/rest-todo/z-ai_glm-5.3-flash/r2/events.jsonl | 0.015951 | 0 | k=8: 0.015951 · batches none · re-paid 0<br>k=17: 0.015951 · batches none · re-paid 0<br>off: 0.015951 · batches none · re-paid 0 | not logged |

## Runs: provenance

| run | requirements | verification | checks | outcome | acceptance | accept-unverified | acceptance surface | test edits | external |
|---|---|---|---|---|---|---|---|---|---|
| runs/api-currency/deepseek_deepseek-v4.1-flash/r1/events.jsonl | task api-currency (api-change) | tests (declared): python -m unittest discover -s tests | run tests (model): failed×1, passed×1<br>verify (declared checks): passed×1 | completed | — | false | 0 | — | passed (exit 0) |
| runs/api-currency/deepseek_deepseek-v4.1-flash/r2/events.jsonl | task api-currency (api-change) | tests (declared): python -m unittest discover -s tests | run tests (model): failed×1, passed×1<br>verify (declared checks): passed×3, unavailable×1 | completed | — | false | 0 | — | passed (exit 0) |
| runs/bugfix-pagination/deepseek_deepseek-v4.1-flash/r1/events.jsonl | task bugfix-pagination (bugfix) | tests (declared): python -m unittest discover -s tests | run tests (model): passed×1<br>verify (declared checks): denied×2, passed×2 | completed | review no reviewer; acceptance accepted | true | 1 | tests/test_paging.py | passed (exit 0) |
| runs/bugfix-pagination/deepseek_deepseek-v4.1-flash/r2/events.jsonl | task bugfix-pagination (bugfix) | tests (declared): python -m unittest discover -s tests | run tests (model): failed×1<br>verify (declared checks): passed×3 | completed | review no reviewer; acceptance accepted | true | 1 | tests/test_paging.py | passed (exit 0) |
| runs/rest-todo/deepseek_deepseek-v4.1-flash/r1/events.jsonl | task rest-todo (greenfield) | tests (declared): python -m unittest discover -s tests | run tests (model): passed×3<br>verify (declared checks): passed×1, unavailable×1 | completed | review no reviewer; acceptance accepted | true | 1 | tests/test_todos.py, tests/api_checks.py | passed (exit 0) |
| runs/rest-todo/deepseek_deepseek-v4.1-flash/r2/events.jsonl | task rest-todo (greenfield) | tests (declared): python -m unittest discover -s tests | run tests (model): passed×3<br>verify (declared checks): passed×1 | completed | review no reviewer; acceptance accepted | true | 1 | tests/test_todos.py | passed (exit 0) |
| runs/api-currency/z-ai_glm-5.3-flash/r1/events.jsonl | task api-currency (api-change) | tests (declared): python -m unittest discover -s tests | verify (declared checks): denied×1, passed×1, unavailable×1<br>run tests (model): failed×2, passed×1 | completed | — | false | 0 | — | passed (exit 0) |
| runs/api-currency/z-ai_glm-5.3-flash/r2/events.jsonl | task api-currency (api-change) | tests (declared): python -m unittest discover -s tests | run tests (model): passed×1<br>verify (declared checks): passed×2 | completed | — | false | 0 | — | passed (exit 0) |
| runs/bugfix-pagination/z-ai_glm-5.3-flash/r1/events.jsonl | task bugfix-pagination (bugfix) | tests (declared): python -m unittest discover -s tests | run tests (model): passed×1<br>verify (declared checks): passed×1 | completed | review no reviewer; acceptance accepted | true | 1 | tests/test_paging.py | passed (exit 0) |
| runs/bugfix-pagination/z-ai_glm-5.3-flash/r2/events.jsonl | task bugfix-pagination (bugfix) | tests (declared): python -m unittest discover -s tests | run tests (model): passed×1<br>verify (declared checks): passed×1 | completed | review no reviewer; acceptance accepted | true | 1 | tests/test_paging.py | passed (exit 0) |
| runs/rest-todo/z-ai_glm-5.3-flash/r1/events.jsonl | task rest-todo (greenfield) | tests (declared): python -m unittest discover -s tests | verify (declared checks): passed×1<br>run tests (model): failed×1 | completed | — | false | 0 | — | passed (exit 0) |
| runs/rest-todo/z-ai_glm-5.3-flash/r2/events.jsonl | task rest-todo (greenfield) | tests (declared): python -m unittest discover -s tests | run tests (model): failed×2, passed×2<br>verify (declared checks): passed×1 | completed | — | false | 0 | — | passed (exit 0) |

## Groups (model × arm)

| group | runs | calls | accepted | accept-unverified | billed | estimate | uncached | cache read | output | reasoning | hit share | q̂ | W1 | W2 | W3 | W4 | W5 | W6 | W7 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| results-deepseek · openrouter/deepseek/deepseek-v4.1-flash | 6 | 74 | 6 | 4 | 0.054591 | 0.054591 | 7.9 % | 24.3 % | 67.8 % | 40.1 % | 75.5 % | 90.7 % | 48.3 % | 0.0 % | 0.0 % | 0.0 % | — | 1.6 % | 0.0 % |
| results-glm · openrouter/z-ai/glm-5.3-flash | 6 | 76 | 6 | 2 | 0.050901 | 0.050901 | 44.9 % | 37.5 % | 17.6 % | 5.1 % | 67.6 % | 81.1 % | 32.1 % | 0.0 % | 1.4 % | 0.0 % | — | 7.9 % | 0.0 % |

## Details

### runs/api-currency/deepseek_deepseek-v4.1-flash/r1/events.jsonl
- tokens: uncached 25351 · cache read 55808 · cache write n/a · output 5406 · reasoning 2095
- money: uncached 0.00050195 · cache read 0.001105 · output 0.0032112 (reasoning 0.0012444) · billed upstream 0.0048668
- prices: fitted openrouter/deepseek/deepseek-v4.1-flash @ Relace (Exact, 74 calls)
- break at turn 5 (Provider): b 9837, cached 7424, re-paid 2413, cost 0
- W1 TailAfterResult: 0.00091696 (19.0 %), calls 2, tokens —; after call 5 (verify green at turn 6); later 0 calls changed the workspace and 0 verdicts came out green; after the last change (call 5): 2 calls, 0.00091696 (19.0 %)
- W2 BackgroundPolls: 0 (0.0 %), calls 0, tokens —
- W3 CadenceEviction: 0 (0.0 %), calls 0, tokens 0; batches inferred from the k=8 cadence
- W4 PrefixMiss: 0 (0.0 %), calls 0, tokens 0
- W5 WrittenBodies: unmeasured: the log keeps no tool arguments (Studio's journal.call does)
- W6 AnchorTail: 0.00010167 (2.1 %), calls 8, tokens 5135; harness-estimated tokens
- W7 ImmediateStubs: 0 (0.0 %), calls 0, tokens 0

### runs/api-currency/deepseek_deepseek-v4.1-flash/r2/events.jsonl
- tokens: uncached 47946 · cache read 161536 · cache write n/a · output 9470 · reasoning 5216
- money: uncached 0.00094933 · cache read 0.0031984 · output 0.0056252 (reasoning 0.0030983) · billed upstream 0.0098716
- prices: fitted openrouter/deepseek/deepseek-v4.1-flash @ Relace (Exact, 74 calls)
- break at turn 17 (Eviction): b 12504, cached 5120, re-paid 7384, cost 0
- W1 TailAfterResult: 0.0039143 (40.1 %), calls 7, tokens —; after call 9 (verify green at turn 10); later 0 calls changed the workspace and 1 verdicts came out green; after the last change (call 9): 7 calls, 0.0039143 (40.1 %)
- W2 BackgroundPolls: 0 (0.0 %), calls 0, tokens —
- W3 CadenceEviction: 0 (0.0 %), calls 1, tokens 7384; re-paid tokens by turn: 17: 7384; batches inferred from the k=8 cadence
- W4 PrefixMiss: 0 (0.0 %), calls 0, tokens 0
- W5 WrittenBodies: unmeasured: the log keeps no tool arguments (Studio's journal.call does)
- W6 AnchorTail: 0.00023299 (2.4 %), calls 17, tokens 11767; harness-estimated tokens
- W7 ImmediateStubs: 0 (0.0 %), calls 0, tokens 0

### runs/bugfix-pagination/deepseek_deepseek-v4.1-flash/r1/events.jsonl
- tokens: uncached 32186 · cache read 123904 · cache write n/a · output 3797 · reasoning 1312
- money: uncached 0.00063728 · cache read 0.0024533 · output 0.0022554 (reasoning 0.00077933) · billed upstream 0.0054
- prices: fitted openrouter/deepseek/deepseek-v4.1-flash @ Relace (Exact, 74 calls)
- break at turn 17 (Eviction): b 9561, cached 4864, re-paid 4697, cost 0
- W1 TailAfterResult: 0.0029697 (55.5 %), calls 8, tokens —; after call 8 (run tests green at turn 9); later 1 calls changed the workspace and 2 verdicts came out green; after the last change (call 12): 4 calls, 0.0013966 (26.1 %)
- W2 BackgroundPolls: 0 (0.0 %), calls 0, tokens —
- W3 CadenceEviction: 0 (0.0 %), calls 1, tokens 4697; re-paid tokens by turn: 17: 4697; batches inferred from the k=8 cadence
- W4 PrefixMiss: 0 (0.0 %), calls 0, tokens 0
- W5 WrittenBodies: unmeasured: the log keeps no tool arguments (Studio's journal.call does)
- W6 AnchorTail: 0.0001546 (2.9 %), calls 17, tokens 7808; harness-estimated tokens
- W7 ImmediateStubs: 0 (0.0 %), calls 0, tokens 0
- acceptance surface: acceptance surface: tests/test_paging.py · unclassified-weakening-risk — justify it in the packet; a weakened required check needs review

### runs/bugfix-pagination/deepseek_deepseek-v4.1-flash/r2/events.jsonl
- tokens: uncached 21134 · cache read 68096 · cache write n/a · output 3067 · reasoning 1121
- money: uncached 0.00041845 · cache read 0.0013483 · output 0.0018218 (reasoning 0.00066587) · billed upstream 0.0036248
- prices: fitted openrouter/deepseek/deepseek-v4.1-flash @ Relace (Exact, 74 calls)
- W1 TailAfterResult: 0.0011564 (32.2 %), calls 3, tokens —; after call 7 (verify green at turn 8); later 0 calls changed the workspace and 1 verdicts came out green; after the last change (call 7): 3 calls, 0.0011564 (32.2 %)
- W2 BackgroundPolls: 0 (0.0 %), calls 0, tokens —
- W3 CadenceEviction: 0 (0.0 %), calls 0, tokens 0; batches inferred from the k=8 cadence
- W4 PrefixMiss: 0 (0.0 %), calls 0, tokens 0
- W5 WrittenBodies: unmeasured: the log keeps no tool arguments (Studio's journal.call does)
- W6 AnchorTail: 0.00010565 (2.9 %), calls 11, tokens 5336; harness-estimated tokens
- W7 ImmediateStubs: 0 (0.0 %), calls 0, tokens 0
- acceptance surface: acceptance surface: tests/test_paging.py · unclassified-weakening-risk — justify it in the packet; a weakened required check needs review

### runs/rest-todo/deepseek_deepseek-v4.1-flash/r1/events.jsonl
- tokens: uncached 45094 · cache read 118784 · cache write n/a · output 20622 · reasoning 14241
- money: uncached 0.00089286 · cache read 0.0023519 · output 0.012249 (reasoning 0.0084592) · billed upstream 0.015651
- prices: fitted openrouter/deepseek/deepseek-v4.1-flash @ Relace (Exact, 74 calls)
- break at turn 4 (Provider): b 12269, cached 6144, re-paid 6125, cost 0
- break at turn 6 (Provider): b 18177, cached 12800, re-paid 5377, cost 0
- W1 TailAfterResult: 0.0087586 (56.5 %), calls 7, tokens —; after call 2 (run tests green at turn 3); later 2 calls changed the workspace and 3 verdicts came out green; after the last change (call 5): 4 calls, 0.0029761 (19.2 %)
- W2 BackgroundPolls: 0 (0.0 %), calls 0, tokens —
- W3 CadenceEviction: 0 (0.0 %), calls 0, tokens 0; batches inferred from the k=8 cadence
- W4 PrefixMiss: 0 (0.0 %), calls 0, tokens 0
- W5 WrittenBodies: unmeasured: the log keeps no tool arguments (Studio's journal.call does)
- W6 AnchorTail: 0.00013575 (0.9 %), calls 10, tokens 6856; harness-estimated tokens
- W7 ImmediateStubs: 0 (0.0 %), calls 0, tokens 0
- acceptance surface: acceptance surface: tests/test_todos.py · deleted-test — justify it in the packet; a weakened required check needs review

### runs/rest-todo/deepseek_deepseek-v4.1-flash/r2/events.jsonl
- tokens: uncached 45970 · cache read 143104 · cache write n/a · output 19911 · reasoning 12835
- money: uncached 0.00091021 · cache read 0.0028335 · output 0.011827 (reasoning 0.007624) · billed upstream 0.015728
- prices: fitted openrouter/deepseek/deepseek-v4.1-flash @ Relace (Exact, 74 calls)
- break at turn 4 (Provider): b 16120, cached 6144, re-paid 9976, cost 0
- break at turn 9 (Provider): b 20759, cached 17664, re-paid 3095, cost 0
- W1 TailAfterResult: 0.0086483 (55.5 %), calls 7, tokens —; after call 3 (run tests green at turn 4); later 2 calls changed the workspace and 3 verdicts came out green; after the last change (call 6): 4 calls, 0.002475 (15.9 %)
- W2 BackgroundPolls: 0 (0.0 %), calls 0, tokens —
- W3 CadenceEviction: 0 (0.0 %), calls 0, tokens 0; batches inferred from the k=8 cadence
- W4 PrefixMiss: 0 (0.0 %), calls 0, tokens 0
- W5 WrittenBodies: unmeasured: the log keeps no tool arguments (Studio's journal.call does)
- W6 AnchorTail: 0.00015375 (1.0 %), calls 11, tokens 7765; harness-estimated tokens
- W7 ImmediateStubs: 0 (0.0 %), calls 0, tokens 0
- acceptance surface: acceptance surface: tests/test_todos.py · unclassified-weakening-risk — justify it in the packet; a weakened required check needs review

### runs/api-currency/z-ai_glm-5.3-flash/r1/events.jsonl
- tokens: uncached 67347 · cache read 88064 · cache write n/a · output 4184 · reasoning 1076
- money: uncached 0.0060711 · cache read 0.0015693 · output 0.0012466 (reasoning 0.00031977) · billed upstream 0.0089768
- prices: fitted openrouter/z-ai/glm-5.3-flash @ GMICloud (Exact, 38 calls); fitted openrouter/z-ai/glm-5.3-flash @ Wafer (Exact, 38 calls)
- break at turn 2 (Provider): b 4874, cached 0, re-paid 4874, cost 0.00034742
- break at turn 5 (Upstream): b 6435, cached 0, re-paid 6435, cost 0.00025483
- break at turn 9 (Provider): b 7061, cached 0, re-paid 7061, cost 0.00050331
- break at turn 10 (Provider): b 8805, cached 0, re-paid 8805, cost 0.00062762
- break at turn 17 (Eviction): b 10017, cached 0, re-paid 10017, cost 0.00071401
- W1 TailAfterResult: 0.0010412 (11.7 %), calls 1, tokens —; after call 15 (verify green at turn 16); later 0 calls changed the workspace and 0 verdicts came out green; after the last change (call 15): 1 calls, 0.0010412 (11.7 %)
- W2 BackgroundPolls: 0 (0.0 %), calls 0, tokens —
- W3 CadenceEviction: 0.00071401 (8.0 %), calls 1, tokens 10017; re-paid tokens by turn: 17: 10017; batches inferred from the k=8 cadence
- W4 PrefixMiss: 0 (0.0 %), calls 0, tokens 0
- W5 WrittenBodies: unmeasured: the log keeps no tool arguments (Studio's journal.call does)
- W6 AnchorTail: 0.00084241 (9.5 %), calls 17, tokens 9399; harness-estimated tokens
- W7 ImmediateStubs: 0 (0.0 %), calls 0, tokens 0

### runs/api-currency/z-ai_glm-5.3-flash/r2/events.jsonl
- tokens: uncached 26206 · cache read 109824 · cache write n/a · output 3374 · reasoning 1163
- money: uncached 0.002335 · cache read 0.0019571 · output 0.0010021 (reasoning 0.00034541) · billed upstream 0.0053476
- prices: fitted openrouter/z-ai/glm-5.3-flash @ GMICloud (Exact, 38 calls)
- break at turn 9 (Provider): b 9335, cached 7040, re-paid 2295, cost 0.00016359
- W1 TailAfterResult: 0.0015898 (30.0 %), calls 4, tokens —; after call 10 (run tests green at turn 11); later 0 calls changed the workspace and 2 verdicts came out green; after the last change (call 10): 4 calls, 0.0015898 (30.0 %)
- W2 BackgroundPolls: 0 (0.0 %), calls 0, tokens —
- W3 CadenceEviction: 0 (0.0 %), calls 0, tokens 0; batches inferred from the k=8 cadence
- W4 PrefixMiss: 0 (0.0 %), calls 0, tokens 0
- W5 WrittenBodies: unmeasured: the log keeps no tool arguments (Studio's journal.call does)
- W6 AnchorTail: 0.00074087 (14.0 %), calls 15, tokens 8315; harness-estimated tokens
- W7 ImmediateStubs: 0 (0.0 %), calls 0, tokens 0

### runs/bugfix-pagination/z-ai_glm-5.3-flash/r1/events.jsonl
- tokens: uncached 20208 · cache read 43264 · cache write n/a · output 1599 · reasoning 743
- money: uncached 0.0020006 · cache read 0.0025699 · output 0.00079151 (reasoning 0.00036779) · billed upstream 0.0054161
- prices: fitted openrouter/z-ai/glm-5.3-flash @ Wafer (Exact, 38 calls)
- break at turn 2 (Provider): b 4774, cached 0, re-paid 4774, cost 0.00018905
- W1 TailAfterResult: 0.0020332 (37.9 %), calls 3, tokens —; after call 5 (run tests green at turn 6); later 0 calls changed the workspace and 1 verdicts came out green; after the last change (call 5): 3 calls, 0.0020332 (37.9 %)
- W2 BackgroundPolls: 0 (0.0 %), calls 0, tokens —
- W3 CadenceEviction: 0 (0.0 %), calls 0, tokens 0; batches inferred from the k=8 cadence
- W4 PrefixMiss: 0 (0.0 %), calls 0, tokens 0
- W5 WrittenBodies: unmeasured: the log keeps no tool arguments (Studio's journal.call does)
- W6 AnchorTail: 0.00035878 (6.7 %), calls 9, tokens 3624; harness-estimated tokens
- W7 ImmediateStubs: 0 (0.0 %), calls 0, tokens 0
- acceptance surface: acceptance surface: tests/test_paging.py · unclassified-weakening-risk — justify it in the packet; a weakened required check needs review

### runs/bugfix-pagination/z-ai_glm-5.3-flash/r2/events.jsonl
- tokens: uncached 10987 · cache read 52800 · cache write n/a · output 1346 · reasoning 378
- money: uncached 0.0010877 · cache read 0.0031363 · output 0.00066627 (reasoning 0.00018711) · billed upstream 0.0049397
- prices: fitted openrouter/z-ai/glm-5.3-flash @ Wafer (Exact, 38 calls)
- W1 TailAfterResult: 0.0019827 (40.5 %), calls 3, tokens —; after call 5 (run tests green at turn 6); later 0 calls changed the workspace and 1 verdicts came out green; after the last change (call 5): 3 calls, 0.0019827 (40.5 %)
- W2 BackgroundPolls: 0 (0.0 %), calls 0, tokens —
- W3 CadenceEviction: 0 (0.0 %), calls 0, tokens 0; batches inferred from the k=8 cadence
- W4 PrefixMiss: 0 (0.0 %), calls 0, tokens 0
- W5 WrittenBodies: unmeasured: the log keeps no tool arguments (Studio's journal.call does)
- W6 AnchorTail: 0.00037066 (7.6 %), calls 9, tokens 3744; harness-estimated tokens
- W7 ImmediateStubs: 0 (0.0 %), calls 0, tokens 0
- acceptance surface: acceptance surface: tests/test_paging.py · unclassified-weakening-risk — justify it in the packet; a weakened required check needs review

### runs/rest-todo/z-ai_glm-5.3-flash/r1/events.jsonl
- tokens: uncached 38620 · cache read 75840 · cache write n/a · output 4421 · reasoning 1122
- money: uncached 0.0038234 · cache read 0.0045049 · output 0.0021884 (reasoning 0.00055539) · billed upstream 0.010623
- prices: fitted openrouter/z-ai/glm-5.3-flash @ Wafer (Exact, 38 calls)
- break at turn 3 (Provider): b 5918, cached 3776, re-paid 2142, cost 0.000084823
- break at turn 4 (Provider): b 9161, cached 5888, re-paid 3273, cost 0.00012961
- break at turn 5 (Provider): b 9372, cached 5888, re-paid 3484, cost 0.00013797
- break at turn 6 (Provider): b 12253, cached 9344, re-paid 2909, cost 0.0001152
- break at turn 7 (Provider): b 12375, cached 9344, re-paid 3031, cost 0.00012003
- W1 TailAfterResult: 0.0077249 (73.5 %), calls 7, tokens —; after call 2 (verify green at turn 3); later 3 calls changed the workspace and 0 verdicts came out green; after the last change (call 8): 1 calls, 0.001171 (11.1 %)
- W2 BackgroundPolls: 0 (0.0 %), calls 0, tokens —
- W3 CadenceEviction: 0 (0.0 %), calls 0, tokens 0; batches inferred from the k=8 cadence
- W4 PrefixMiss: 0 (0.0 %), calls 0, tokens 0
- W5 WrittenBodies: unmeasured: the log keeps no tool arguments (Studio's journal.call does)
- W6 AnchorTail: 0.00065518 (6.2 %), calls 10, tokens 6618; harness-estimated tokens
- W7 ImmediateStubs: 0 (0.0 %), calls 0, tokens 0

### runs/rest-todo/z-ai_glm-5.3-flash/r2/events.jsonl
- tokens: uncached 81503 · cache read 141312 · cache write n/a · output 6940 · reasoning 2015
- money: uncached 0.0075613 · cache read 0.0053443 · output 0.0030458 (reasoning 0.00080042) · billed upstream 0.016113
- prices: fitted openrouter/z-ai/glm-5.3-flash @ Wafer (Exact, 38 calls); fitted openrouter/z-ai/glm-5.3-flash @ GMICloud (Exact, 38 calls)
- break at turn 4 (Provider): b 9124, cached 5888, re-paid 3236, cost 0.00012815
- break at turn 8 (Provider): b 13472, cached 9984, re-paid 3488, cost 0.00013812
- break at turn 9 (Provider): b 13900, cached 9984, re-paid 3916, cost 0.00015507
- break at turn 10 (Upstream): b 15314, cached 0, re-paid 15314, cost 0.0010916
- break at turn 11 (Provider): b 16070, cached 3072, re-paid 12998, cost 0.0009265
- break at turn 12 (Provider): b 16449, cached 3072, re-paid 13377, cost 0.00095351
- W1 TailAfterResult: 0.0019564 (12.3 %), calls 4, tokens —; after call 11 (run tests green at turn 12); later 0 calls changed the workspace and 1 verdicts came out green; after the last change (call 11): 4 calls, 0.0019564 (12.3 %)
- W2 BackgroundPolls: 0 (0.0 %), calls 0, tokens —
- W3 CadenceEviction: 0 (0.0 %), calls 0, tokens 0; batches inferred from the k=8 cadence
- W4 PrefixMiss: 0 (0.0 %), calls 0, tokens 0
- W5 WrittenBodies: unmeasured: the log keeps no tool arguments (Studio's journal.call does)
- W6 AnchorTail: 0.0010413 (6.5 %), calls 16, tokens 11046; harness-estimated tokens
- W7 ImmediateStubs: 0 (0.0 %), calls 0, tokens 0
