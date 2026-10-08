# D5 screening — 8 runs, 2 tasks, models ['deepseek-v4.1-flash'], arms ['default', 'direct', 'loop']

> **Предварительно (остановлено владельцем 2026-10-08 02:55):** длинная страта исполнена частично — `scenario-1004` ×3 плеча ×2 повтора и `api-callers` только `loop` ×2 на deepseek; остальные 11 вызовов deepseek и вся glm-страта не запускались. Возобновление — `plan2/bench/D5-RESUME.md` (eval-live продолжает стенд, готовые прогоны не повторяет).

## Per task × model × arm (means over repeats; accepted = fraction)
| model | task | arm | n | accepted | requests | uncached in | cache read | output | $ bill | wall s | cells |
|---|---|---|---|---|---|---|---|---|---|---|---|
| deepseek-v4.1-flash | api-callers | loop | 2 | 1.00 | 39.0 | 28837 | 296192 | 13535 | 0.0193 | 83 | 0.0 |
| deepseek-v4.1-flash | scenario-1004 | default | 2 | 1.00 | 109.5 | 505997 | 1533696 | 125658 | 0.1340 | 1506 | 4.5 |
| deepseek-v4.1-flash | scenario-1004 | direct | 2 | 0.50 | 61.0 | 303310 | 852224 | 93468 | 0.1240 | 758 | 2.0 |
| deepseek-v4.1-flash | scenario-1004 | loop | 2 | 1.00 | 37.5 | 22618 | 297856 | 7419 | 0.0125 | 100 | 0.0 |

## Per model × arm totals (sum over tasks and repeats; $ per accepted task = total $ / accepted runs)
| model | arm | runs | accepted | requests | uncached in | cache read | output | $ bill | $ / accepted | wall s |
|---|---|---|---|---|---|---|---|---|---|---|
| deepseek-v4.1-flash | default | 2 | 2 | 219 | 1011994 | 3067392 | 251316 | 0.2681 | 0.1340 | 3012 |
| deepseek-v4.1-flash | direct | 2 | 1 | 122 | 606620 | 1704448 | 186936 | 0.2481 | 0.2481 | 1516 |
| deepseek-v4.1-flash | loop | 4 | 4 | 153 | 102911 | 1188096 | 41908 | 0.0636 | 0.0159 | 366 |

## Paired contrasts per model (per-task log-ratio B/A of task totals over repeats; negative = B cheaper; 95 % t-interval over tasks)
| model | contrast | axis | n tasks | median ratio | mean ratio | 95 % interval (ratio) | tasks where B worse |
|---|---|---|---|---|---|---|---|
| deepseek-v4.1-flash | direct vs default | $ per accepted task (bill) | 1 | 1.85 | 1.85 | [nan, nan] | 1/1 |
| deepseek-v4.1-flash | direct vs default | requests | 1 | 0.56 | 0.56 | [nan, nan] | 0/1 |
| deepseek-v4.1-flash | direct vs default | uncached input | 1 | 0.60 | 0.60 | [nan, nan] | 0/1 |
| deepseek-v4.1-flash | direct vs default | output | 1 | 0.74 | 0.74 | [nan, nan] | 0/1 |
| deepseek-v4.1-flash | direct vs default | wall s | 1 | 0.50 | 0.50 | [nan, nan] | 0/1 |
| deepseek-v4.1-flash | loop vs default | $ per accepted task (bill) | 1 | 0.09 | 0.09 | [nan, nan] | 0/1 |
| deepseek-v4.1-flash | loop vs default | requests | 1 | 0.34 | 0.34 | [nan, nan] | 0/1 |
| deepseek-v4.1-flash | loop vs default | uncached input | 1 | 0.04 | 0.04 | [nan, nan] | 0/1 |
| deepseek-v4.1-flash | loop vs default | output | 1 | 0.06 | 0.06 | [nan, nan] | 0/1 |
| deepseek-v4.1-flash | loop vs default | wall s | 1 | 0.07 | 0.07 | [nan, nan] | 0/1 |
| deepseek-v4.1-flash | direct vs loop | $ per accepted task (bill) | 1 | 19.92 | 19.92 | [nan, nan] | 1/1 |
| deepseek-v4.1-flash | direct vs loop | requests | 1 | 1.63 | 1.63 | [nan, nan] | 1/1 |
| deepseek-v4.1-flash | direct vs loop | uncached input | 1 | 13.41 | 13.41 | [nan, nan] | 1/1 |
| deepseek-v4.1-flash | direct vs loop | output | 1 | 12.60 | 12.60 | [nan, nan] | 1/1 |
| deepseek-v4.1-flash | direct vs loop | wall s | 1 | 7.55 | 7.55 | [nan, nan] | 1/1 |

## Re-pricing what-if (plan §9.1, D-421): total $ per accepted task by profile (flows of this model; other models' flows differ)
| model | arm | bill | deepseek-flash (0.003/0.003/2.4) | MiMo-V2.6-Pro (0.43/0.43/0.87) | MiMo cache 10% (0.43/0.043/0.87) | Qwen3.8 Max (2/0.25/6) | Grok 4.7 (2/0.5/6) | Fable 5 (10/1/50) |
|---|---|---|---|---|---|---|---|---|
| deepseek-v4.1-flash | default | 0.1340 | 0.3077 | 0.9864 | 0.3929 | 2.1494 | 2.5328 | 12.8766 |
| deepseek-v4.1-flash | direct | 0.2481 | 0.4556 | 1.1564 | 0.4968 | 2.7610 | 3.1871 | 17.1174 |
| deepseek-v4.1-flash | loop | 0.0159 | 0.0261 | 0.1479 | 0.0329 | 0.1886 | 0.2628 | 1.0782 |

## Quality floor (№9a screening: accepted not fewer by more than 1 of 8 vs default) and limits (№22: time ≤ 2×, requests and uncached input ≤ +20 %)
- deepseek-v4.1-flash direct: accepted per 8 tasks ≈ 1.0 vs default 2.0 → floor OK
- deepseek-v4.1-flash loop: accepted per 8 tasks ≈ 2.0 vs default 2.0 → floor OK
