# Audit · 3 runs

Money shares are of each run's basis total: billed when every call with usage was billed, else the priced estimate;
`partial` marks a run some of whose calls have no usage, an unknown class or no charge.
Hit share = Σ cache_read / Σ input (F §6.1); q̂ = Σ min(c, b) / Σ b over unchanged-prefix steps (§10.4); the Beta posterior of q is E1's.

## Prices (per million tokens)

Fitted from the billed calls of each route (exact least squares). `*` pools a model's upstreams: an estimate, used only for a route whose own calls identify nothing.
Condition: of the design matrix with unit-norm columns. Sensitivity: largest move of a price if every charge moved by one unit of its last decimal.

| route | calls | agreement | uncached | cache read | cache write | output | max residual | max rel. | condition | sensitivity (u/c/o) |
|---|---|---|---|---|---|---|---|---|---|---|
| openrouter/deepseek/deepseek-v4.1-flash | 91 | Exact | 0.13959 | 0.013959 | — | 0.55836 | 0 | 0.00 | 1.52 | 9.44e-10 / 2.71e-10 / 7.14e-10 |
| openrouter/z-ai/glm-5.3-flash | 16 | Approximate | 0.14658 | 0.030238 | — | 0.47958 | 0.00046141 | 1.29 | 1.71 | 2.68e-08 / 2.26e-08 / 4.92e-07 |

## Runs: anatomy and cache

| run | calls | basis | total | billed | estimate | uncached | cache read | cache write | output | of it reasoning | unexplained | hit share | q̂ (steps) | reliability |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| live1/W-c4cu4k32w73xhitzquka.jsonl | 24 | Billed | 0.040891 | 0.040891 | 0.040891 | 28.0 % | 23.5 % | n/a | 48.5 % | 20.3 % | 0 | 89.3 % | 100.0 % (21) | 100.0 % |
| live1/W-letk4bjzwkvaxowjlz6a.jsonl | 67 | Billed | 0.14938 | 0.14938 | 0.14938 | 34.0 % | 22.2 % | n/a | 43.8 % | 31.8 % | 0 | 86.7 % | 99.6 % (53) | 100.0 % |
| live2/W-z2lubqszswievmhxlb4q.jsonl | 17 (1 no usage) | Billed · partial · est. prices | 0.019591 | 0.019591 | 0.019858 | 71.6 % | 16.7 % | n/a | 13.1 % | 2.3 % | -0.00026706 | 53.1 % | 59.6 % (15) | 60.0 % |

## Runs: losses (share of run money; overlapping)

| run | W1 | W2 | W3 | W4 | W5 | W6 | W7 |
|---|---|---|---|---|---|---|---|
| live1/W-c4cu4k32w73xhitzquka.jsonl | 40.2 % | 2.4 % | 6.8 % | 0.0 % | 11.1 % | 4.8 % | 0.0 % |
| live1/W-letk4bjzwkvaxowjlz6a.jsonl | 33.7 % | 9.3 % | 8.9 % | 4.2 % | 9.2 % | 6.5 % | 2.4 % |
| live2/W-z2lubqszswievmhxlb4q.jsonl | — | 7.7 % | 0.0 % | 0.0 % | 7.6 % | 4.8 % | 0.0 % |

## Runs: Residency what-if

Conditional estimates on this log with the model's trajectory held fixed — not bounds; the calibration error is the replay of the observed cadence minus the observed cost.
Batches: turn (stubbed/losses); the journal's own batches beside them.

| run | observed (priced) | calibration error | scenarios | logged batches |
|---|---|---|---|---|
| live1/W-c4cu4k32w73xhitzquka.jsonl | 0.040891 | -0.000084424 | k=8: 0.040807 · batches 16 (9/2) · re-paid 20668<br>k=17: 0.040292 · batches none · re-paid 0<br>off: 0.040292 · batches none · re-paid 0 | 16 (9/2), 24 (11/4) |
| live1/W-letk4bjzwkvaxowjlz6a.jsonl | 0.14938 | 0.00049624 | k=8: 0.14987 · batches 16 (17/7), 24 (20/2), 32 (15/3), 40 (10/5), 48 (13/3), 56 (14/10), 64 (9/5) · re-paid 125795<br>k=17: 0.16754 · batches 31b (34/8), 34 (4/1), 51 (28/9) · re-paid 166904<br>off: 0.27548 · batches 31b (3/0), 33b (4/0), 34b (3/0), 35b (3/0), 38b (1/0), 39b (1/0), 40b (2/0), 42b (1/0), 46b (1/0), 47b (2/0), 49b (4/0), 53b (1/0), 55b (1/0), 56b (1/0), 58b (3/0), 61b (1/0), 63b (1/0) · re-paid 907664 | 16 (19/4), 24 (20/2), 32 (15/3), 40 (10/5), 48 (13/3), 56 (14/5), 64 (10/1) |
| live2/W-z2lubqszswievmhxlb4q.jsonl | 0.019858 | 0 | k=8: 0.019858 · batches none · re-paid 0<br>k=17: 0.019858 · batches none · re-paid 0<br>off: 0.019858 · batches none · re-paid 0 | 16 (8/1) |

## Runs: provenance

| run | requirements | verification | checks | outcome | acceptance | accept-unverified | acceptance surface | test edits | external |
|---|---|---|---|---|---|---|---|---|---|
| live1/W-c4cu4k32w73xhitzquka.jsonl | user request<br>amended v2 by host: verification setup (review) | review (none) | run `node scripts/smoke.js` (model): completed×1, failed×2 | completed | accept by studio:policy(auto) (policy) (not verified) | true | 0 | — | — |
| live1/W-letk4bjzwkvaxowjlz6a.jsonl | user follow_up<br>amended v2 by host: verification setup (review) | review (none) | run `node scripts/smoke.js` (model): completed×3, failed×3<br>verify (declared checks): unavailable×1<br>run `set PLAYWRIGHT_BROWSERS_PATH=%CD%\.tools\browsers && node .tools/browser-check.js` (model): completed×1, failed×1 | completed | accept by studio:policy(auto) (policy) (not verified) | true | 0 | client/src/app/app.spec.ts | — |
| live2/W-z2lubqszswievmhxlb4q.jsonl | user request<br>amended v2 by host: verification setup (review) | review (none) | run `node test-api.js` (model): completed×1, failed×1 | failed | — | — | 0 | — | — |

## Groups (model × arm)

| group | runs | calls | accepted | accept-unverified | billed | estimate | uncached | cache read | output | reasoning | hit share | q̂ | W1 | W2 | W3 | W4 | W5 | W6 | W7 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| live-2026-10-01 · openrouter/deepseek/deepseek-v4.1-flash | 2 | 91 | — | 2 | 0.19027 | 0.19027 | 32.7 % | 22.4 % | 44.8 % | 29.3 % | 87.3 % | 99.7 % | 35.1 % | 7.8 % | 8.4 % | 3.3 % | 9.6 % | 6.1 % | 1.9 % |
| live-2026-10-01 · openrouter/z-ai/glm-5.3-flash · partial | 1 | 17 | — | 0 | 0.019591 | 0.019858 | 71.6 % | 16.7 % | 13.1 % | 2.3 % | 53.1 % | 59.6 % | — | 7.7 % | 0.0 % | 0.0 % | 7.6 % | 4.8 % | 0.0 % |

## Details

### live1/W-c4cu4k32w73xhitzquka.jsonl
- tokens: uncached 82046 · cache read 686976 · cache write n/a · output 35549 · reasoning 14854
- money: uncached 0.011453 · cache read 0.0095895 · output 0.019849 (reasoning 0.0082939) · billed upstream 0.041304
- prices: fitted openrouter/deepseek/deepseek-v4.1-flash (Exact, 91 calls)
- break at turn 17 (Eviction): b 26371, cached 4096, re-paid 22275, cost 0.0027984
- W1 TailAfterResult: 0.016435 (40.2 %), calls 15, tokens —; after call 8 (run `node scripts/smoke.js` green at turn 9); later 3 calls changed the workspace and 0 verdicts came out green; after the last change (call 22): 1 calls, 0.0011123 (2.7 %)
- W2 BackgroundPolls: 0.00098361 (2.4 %), calls 1, tokens —; turns 15
- W3 CadenceEviction: 0.0027984 (6.8 %), calls 1, tokens 22275; re-paid tokens by turn: 17: 22275
- W4 PrefixMiss: 0 (0.0 %), calls 0, tokens 0
- W5 WrittenBodies: 0.0045293 (11.1 %), calls 6, tokens 16147; edit arguments 16147 tok in 6 calls; carried 0.0045293, regenerated 0 tok 0
- W6 AnchorTail: 0.0019822 (4.8 %), calls 24, tokens 14200; harness-estimated tokens
- W7 ImmediateStubs: 0 (0.0 %), calls 0, tokens 0

### live1/W-letk4bjzwkvaxowjlz6a.jsonl
- tokens: uncached 364004 · cache read 2372480 · cache write n/a · output 117216 · reasoning 84988
- money: uncached 0.050811 · cache read 0.033117 · output 0.065449 (reasoning 0.047454) · billed upstream 0.15089
- prices: fitted openrouter/deepseek/deepseek-v4.1-flash (Exact, 91 calls)
- break at turn 13 (ImmediateStub): b 28400, cached 10368, re-paid 18032, cost 0.0022654
- break at turn 17 (Eviction): b 31373, cached 5760, re-paid 25613, cost 0.0032178
- break at turn 25 (Eviction): b 43450, cached 8192, re-paid 35258, cost 0.0044295
- break at turn 33 (Eviction): b 32978, cached 20992, re-paid 11986, cost 0.0015058
- break at turn 41 (Eviction): b 38235, cached 27008, re-paid 11227, cost 0.0014105
- break at turn 49 (Eviction): b 37038, cached 30080, re-paid 6958, cost 0.00087414
- break at turn 57 (Eviction): b 46939, cached 32512, re-paid 14427, cost 0.0018125
- break at turn 61 (ImmediateStub): b 49710, cached 38656, re-paid 11054, cost 0.0013887
- break at turn 65 (Mask): b 49872, cached 0, re-paid 49872, cost 0.0062655
- W1 TailAfterResult: 0.050412 (33.7 %), calls 28, tokens —; after call 38 (run `node scripts/smoke.js` green at turn 39); later 6 calls changed the workspace and 2 verdicts came out green; after the last change (call 59): 7 calls, 0.019053 (12.8 %)
- W2 BackgroundPolls: 0.013876 (9.3 %), calls 12, tokens —; turns 5, 7, 9, 45, 46, 47, 48, 49, 50, 51, 52, 53
- W3 CadenceEviction: 0.01325 (8.9 %), calls 6, tokens 105469; re-paid tokens by turn: 17: 25613, 25: 35258, 33: 11986, 41: 11227, 49: 6958, 57: 14427
- W4 PrefixMiss: 0.0062655 (4.2 %), calls 1, tokens 49872; re-paid tokens by turn: 65: 49872
- W5 WrittenBodies: 0.013701 (9.2 %), calls 20, tokens 19692; edit arguments 19692 tok in 20 calls; carried 0.011785, regenerated 3431 tok 0.0019157; created again: client/src/app/app.html ×4
- W6 AnchorTail: 0.0096968 (6.5 %), calls 67, tokens 69466; harness-estimated tokens
- W7 ImmediateStubs: 0.0036541 (2.4 %), calls 2, tokens 29086; re-paid tokens by turn: 13: 18032, 61: 11054

### live2/W-z2lubqszswievmhxlb4q.jsonl
- tokens: uncached 95689 · cache read 108288 · cache write n/a · output 5332 · reasoning 938
- money: uncached 0.014026 · cache read 0.0032744 · output 0.0025571 (reasoning 0.00044985) · billed upstream 0.019789
- prices: fitted openrouter/z-ai/glm-5.3-flash (Approximate, 16 calls)
- break at turn 2 (Provider): b 4467, cached 0, re-paid 4467, cost 0.00051971
- break at turn 3 (Provider): b 4472, cached 0, re-paid 4472, cost 0.00052029
- break at turn 4 (Provider): b 7796, cached 0, re-paid 7796, cost 0.00090701
- break at turn 5 (Provider): b 11457, cached 7808, re-paid 3649, cost 0.00042454
- break at turn 6 (Provider): b 11641, cached 7808, re-paid 3833, cost 0.00044594
- break at turn 7 (Provider): b 11781, cached 0, re-paid 11781, cost 0.0013706
- break at turn 10 (Provider): b 14048, cached 11648, re-paid 2400, cost 0.00027922
- break at turn 11 (Provider): b 14442, cached 0, re-paid 14442, cost 0.0016802
- break at turn 14 (Provider): b 14928, cached 0, re-paid 14928, cost 0.0017368
- W1 TailAfterResult: unmeasured: 1 of its 4 calls have no cost: no usage or charge reported; after call 12 (run `node test-api.js` green at turn 13); later 1 calls changed the workspace and 0 verdicts came out green; after the last change (call 13): 3 calls, — (—)
- W2 BackgroundPolls: 0.0015155 (7.7 %), calls 2, tokens —; turns 5, 12
- W3 CadenceEviction: 0 (0.0 %), calls 0, tokens 0
- W4 PrefixMiss: 0 (0.0 %), calls 0, tokens 0
- W5 WrittenBodies: 0.0014865 (7.6 %), calls 4, tokens 3616; edit arguments 3616 tok in 4 calls; carried 0.0014865, regenerated 0 tok 0
- W6 AnchorTail: 0.00094867 (4.8 %), calls 16, tokens 6472; harness-estimated tokens
- W7 ImmediateStubs: 0 (0.0 %), calls 0, tokens 0
