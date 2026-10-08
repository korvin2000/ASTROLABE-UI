# D5 screening — 96 runs, 8 tasks, models ['deepseek-v4.1-flash', 'glm-5.3-flash'], arms ['default', 'direct', 'loop']

## Per task × model × arm (means over repeats; accepted = fraction)
| model | task | arm | n | accepted | requests | uncached in | cache read | output | $ bill | wall s | cells |
|---|---|---|---|---|---|---|---|---|---|---|---|
| deepseek-v4.1-flash | api-currency | default | 2 | 1.00 | 42.0 | 143295 | 457984 | 44487 | 0.0675 | 261 | 1.5 |
| deepseek-v4.1-flash | api-currency | direct | 2 | 0.50 | 25.5 | 110972 | 198528 | 41456 | 0.0578 | 398 | 1.0 |
| deepseek-v4.1-flash | api-currency | loop | 2 | 1.00 | 12.0 | 8286 | 28928 | 2704 | 0.0041 | 20 | 0.0 |
| deepseek-v4.1-flash | bugfix-pagination | default | 2 | 1.00 | 13.0 | 33402 | 60416 | 4034 | 0.0073 | 46 | 1.0 |
| deepseek-v4.1-flash | bugfix-pagination | direct | 2 | 1.00 | 9.5 | 26684 | 29184 | 2831 | 0.0050 | 40 | 1.0 |
| deepseek-v4.1-flash | bugfix-pagination | loop | 2 | 1.00 | 7.5 | 6348 | 6656 | 1280 | 0.0019 | 14 | 0.0 |
| deepseek-v4.1-flash | env-launcher | default | 2 | 1.00 | 11.5 | 21324 | 58240 | 4042 | 0.0065 | 37 | 1.0 |
| deepseek-v4.1-flash | env-launcher | direct | 2 | 1.00 | 9.5 | 15318 | 37632 | 3834 | 0.0057 | 37 | 1.0 |
| deepseek-v4.1-flash | env-launcher | loop | 2 | 1.00 | 16.0 | 10042 | 40704 | 3495 | 0.0052 | 30 | 0.0 |
| deepseek-v4.1-flash | interrupt-csv | default | 2 | 0.50 | 20.5 | 59794 | 100864 | 7810 | 0.0141 | 125 | 1.0 |
| deepseek-v4.1-flash | interrupt-csv | direct | 2 | 1.00 | 24.0 | 76286 | 109952 | 19246 | 0.0275 | 221 | 1.5 |
| deepseek-v4.1-flash | interrupt-csv | loop | 2 | 1.00 | 11.5 | 7882 | 18944 | 2363 | 0.0034 | 22 | 0.0 |
| deepseek-v4.1-flash | investigate-totals | default | 2 | 1.00 | 11.0 | 43216 | 62848 | 7248 | 0.0109 | 74 | 1.0 |
| deepseek-v4.1-flash | investigate-totals | direct | 2 | 1.00 | 10.0 | 28686 | 44928 | 5394 | 0.0080 | 54 | 1.0 |
| deepseek-v4.1-flash | investigate-totals | loop | 2 | 1.00 | 23.0 | 18684 | 130944 | 10211 | 0.0152 | 78 | 0.0 |
| deepseek-v4.1-flash | red-test | default | 2 | 1.00 | 7.0 | 13560 | 40832 | 1730 | 0.0032 | 20 | 1.0 |
| deepseek-v4.1-flash | red-test | direct | 2 | 1.00 | 5.5 | 11174 | 23424 | 1556 | 0.0026 | 22 | 1.0 |
| deepseek-v4.1-flash | red-test | loop | 2 | 1.00 | 7.5 | 4727 | 9088 | 956 | 0.0014 | 9 | 0.0 |
| deepseek-v4.1-flash | rest-todo | default | 2 | 1.00 | 13.0 | 37773 | 136960 | 14516 | 0.0213 | 143 | 1.0 |
| deepseek-v4.1-flash | rest-todo | direct | 2 | 1.00 | 6.0 | 20819 | 30720 | 10066 | 0.0133 | 70 | 1.0 |
| deepseek-v4.1-flash | rest-todo | loop | 2 | 1.00 | 15.0 | 15326 | 76544 | 9764 | 0.0136 | 61 | 0.0 |
| deepseek-v4.1-flash | ui-clear-done | default | 2 | 1.00 | 10.0 | 39594 | 66560 | 6180 | 0.0096 | 42 | 1.0 |
| deepseek-v4.1-flash | ui-clear-done | direct | 2 | 1.00 | 9.0 | 35353 | 40576 | 5456 | 0.0082 | 49 | 1.0 |
| deepseek-v4.1-flash | ui-clear-done | loop | 2 | 1.00 | 18.5 | 16706 | 115712 | 6632 | 0.0106 | 57 | 0.0 |
| glm-5.3-flash | api-currency | default | 2 | 0.00 | 7.0 | 16077 | 24320 | 688 | 0.0024 | 63 | 0.0 |
| glm-5.3-flash | api-currency | direct | 2 | 0.00 | 11.0 | 40362 | 31008 | 1854 | 0.0049 | 153 | 0.0 |
| glm-5.3-flash | api-currency | loop | 2 | 1.00 | 9.0 | 13193 | 3776 | 1276 | 0.0031 | 39 | 0.0 |
| glm-5.3-flash | bugfix-pagination | default | 2 | 1.00 | 17.5 | 94756 | 36096 | 5280 | 0.0135 | 762 | 1.0 |
| glm-5.3-flash | bugfix-pagination | direct | 2 | 1.00 | 11.5 | 50338 | 10880 | 2298 | 0.0069 | 171 | 1.0 |
| glm-5.3-flash | bugfix-pagination | loop | 2 | 1.00 | 8.0 | 9275 | 3584 | 766 | 0.0017 | 89 | 0.0 |
| glm-5.3-flash | env-launcher | default | 2 | 0.00 | 18.5 | 29442 | 115200 | 8011 | 0.0106 | 105 | 1.0 |
| glm-5.3-flash | env-launcher | direct | 2 | 0.50 | 10.5 | 12262 | 48512 | 2461 | 0.0040 | 54 | 1.0 |
| glm-5.3-flash | env-launcher | loop | 2 | 1.00 | 9.5 | 2952 | 12544 | 798 | 0.0011 | 10 | 0.0 |
| glm-5.3-flash | interrupt-csv | default | 2 | 0.00 | 33.0 | 73470 | 169152 | 6174 | 0.0146 | 128 | 0.0 |
| glm-5.3-flash | interrupt-csv | direct | 2 | 0.50 | 22.5 | 118984 | 44224 | 11524 | 0.0156 | 362 | 0.5 |
| glm-5.3-flash | interrupt-csv | loop | 2 | 1.00 | 11.5 | 6916 | 17152 | 904 | 0.0022 | 40 | 0.0 |
| glm-5.3-flash | investigate-totals | default | 2 | 0.50 | 21.5 | 57317 | 203904 | 9332 | 0.0167 | 74 | 1.0 |
| glm-5.3-flash | investigate-totals | direct | 2 | 0.50 | 140.5 | 258558 | 1598208 | 50960 | 0.1064 | 364 | 2.0 |
| glm-5.3-flash | investigate-totals | loop | 2 | 1.00 | 14.0 | 7418 | 55552 | 2630 | 0.0040 | 18 | 0.0 |
| glm-5.3-flash | red-test | default | 2 | 0.50 | 21.0 | 36424 | 145408 | 4938 | 0.0107 | 93 | 1.0 |
| glm-5.3-flash | red-test | direct | 2 | 0.00 | 27.0 | 40068 | 174080 | 4958 | 0.0121 | 49 | 1.0 |
| glm-5.3-flash | red-test | loop | 2 | 1.00 | 6.5 | 2392 | 7680 | 426 | 0.0007 | 5 | 0.0 |
| glm-5.3-flash | rest-todo | default | 2 | 1.00 | 11.0 | 37172 | 86912 | 11214 | 0.0120 | 407 | 1.0 |
| glm-5.3-flash | rest-todo | direct | 2 | 1.00 | 15.0 | 84007 | 50976 | 8788 | 0.0117 | 230 | 1.0 |
| glm-5.3-flash | rest-todo | loop | 2 | 1.00 | 16.0 | 24879 | 88000 | 6374 | 0.0067 | 126 | 0.0 |
| glm-5.3-flash | ui-clear-done | default | 2 | 0.00 | 16.0 | 71318 | 192896 | 18190 | 0.0216 | 156 | 1.0 |
| glm-5.3-flash | ui-clear-done | direct | 2 | 1.00 | 15.5 | 57935 | 114432 | 9850 | 0.0133 | 90 | 1.0 |
| glm-5.3-flash | ui-clear-done | loop | 2 | 1.00 | 11.5 | 4599 | 36864 | 2092 | 0.0028 | 16 | 0.0 |

## Per model × arm totals (sum over tasks and repeats; $ per accepted task = total $ / accepted runs)
| model | arm | runs | accepted | requests | uncached in | cache read | output | $ bill | $ / accepted | wall s |
|---|---|---|---|---|---|---|---|---|---|---|
| deepseek-v4.1-flash | default | 16 | 15 | 256 | 783915 | 1969408 | 180095 | 0.2809 | 0.0187 | 1496 |
| deepseek-v4.1-flash | direct | 16 | 15 | 198 | 650582 | 1029888 | 179681 | 0.2559 | 0.0171 | 1779 |
| deepseek-v4.1-flash | loop | 16 | 16 | 222 | 176005 | 855040 | 74810 | 0.1109 | 0.0069 | 585 |
| glm-5.3-flash | default | 16 | 6 | 291 | 831953 | 1947776 | 127650 | 0.2042 | 0.0340 | 3575 |
| glm-5.3-flash | direct | 16 | 9 | 507 | 1325029 | 4144640 | 185387 | 0.3498 | 0.0389 | 2946 |
| glm-5.3-flash | loop | 16 | 16 | 172 | 143247 | 450304 | 30530 | 0.0445 | 0.0028 | 683 |

## Paired contrasts per model (per-task log-ratio B/A of task totals over repeats; negative = B cheaper; 95 % t-interval over tasks)
| model | contrast | axis | n tasks | median ratio | mean ratio | 95 % interval (ratio) | tasks where B worse |
|---|---|---|---|---|---|---|---|
| deepseek-v4.1-flash | direct vs default | $ per accepted task (bill) | 8 | 0.83 | 0.86 | [0.67, 1.12] | 1/8 |
| deepseek-v4.1-flash | direct vs default | requests | 8 | 0.81 | 0.77 | [0.61, 0.98] | 1/8 |
| deepseek-v4.1-flash | direct vs default | uncached input | 8 | 0.79 | 0.79 | [0.65, 0.97] | 1/8 |
| deepseek-v4.1-flash | direct vs default | output | 8 | 0.89 | 0.94 | [0.67, 1.33] | 1/8 |
| deepseek-v4.1-flash | direct vs default | wall s | 8 | 1.04 | 1.00 | [0.71, 1.41] | 4/8 |
| deepseek-v4.1-flash | loop vs default | $ per accepted task (bill) | 8 | 0.53 | 0.40 | [0.16, 1.00] | 2/8 |
| deepseek-v4.1-flash | loop vs default | requests | 8 | 1.11 | 0.94 | [0.53, 1.66] | 5/8 |
| deepseek-v4.1-flash | loop vs default | uncached input | 8 | 0.38 | 0.25 | [0.14, 0.48] | 0/8 |
| deepseek-v4.1-flash | loop vs default | output | 8 | 0.61 | 0.48 | [0.21, 1.10] | 2/8 |
| deepseek-v4.1-flash | loop vs default | wall s | 8 | 0.44 | 0.42 | [0.19, 0.93] | 2/8 |
| deepseek-v4.1-flash | direct vs loop | $ per accepted task (bill) | 8 | 1.40 | 2.15 | [0.71, 6.57] | 5/8 |
| deepseek-v4.1-flash | direct vs loop | requests | 8 | 0.66 | 0.82 | [0.46, 1.45] | 3/8 |
| deepseek-v4.1-flash | direct vs loop | uncached input | 8 | 2.24 | 3.11 | [1.49, 6.48] | 8/8 |
| deepseek-v4.1-flash | direct vs loop | output | 8 | 1.34 | 1.96 | [0.74, 5.20] | 6/8 |
| deepseek-v4.1-flash | direct vs loop | wall s | 8 | 1.69 | 2.40 | [0.88, 6.57] | 6/8 |
| glm-5.3-flash | direct vs default | $ per accepted task (bill) | 3 | 0.97 | 1.47 | [0.06, 38.24] | 1/3 |
| glm-5.3-flash | direct vs default | requests | 8 | 1.12 | 1.20 | [0.63, 2.31] | 4/8 |
| glm-5.3-flash | direct vs default | uncached input | 8 | 1.33 | 1.30 | [0.66, 2.57] | 5/8 |
| glm-5.3-flash | direct vs default | output | 8 | 0.89 | 1.06 | [0.47, 2.40] | 4/8 |
| glm-5.3-flash | direct vs default | wall s | 8 | 0.57 | 0.95 | [0.39, 2.34] | 3/8 |
| glm-5.3-flash | loop vs default | $ per accepted task (bill) | 4 | 0.12 | 0.13 | [0.02, 0.82] | 0/4 |
| glm-5.3-flash | loop vs default | requests | 8 | 0.58 | 0.62 | [0.39, 0.99] | 2/8 |
| glm-5.3-flash | loop vs default | uncached input | 8 | 0.10 | 0.15 | [0.07, 0.35] | 0/8 |
| glm-5.3-flash | loop vs default | output | 8 | 0.15 | 0.22 | [0.09, 0.54] | 1/8 |
| glm-5.3-flash | loop vs default | wall s | 8 | 0.17 | 0.17 | [0.09, 0.34] | 0/8 |
| glm-5.3-flash | direct vs loop | $ per accepted task (bill) | 6 | 5.87 | 7.57 | [2.19, 26.13] | 6/6 |
| glm-5.3-flash | direct vs loop | requests | 8 | 1.39 | 1.94 | [0.99, 3.80] | 7/8 |
| glm-5.3-flash | direct vs loop | uncached input | 8 | 8.27 | 8.58 | [4.04, 18.24] | 8/8 |
| glm-5.3-flash | direct vs loop | output | 8 | 3.81 | 4.73 | [2.04, 10.95] | 8/8 |
| glm-5.3-flash | direct vs loop | wall s | 8 | 5.58 | 5.54 | [2.75, 11.14] | 8/8 |

## Re-pricing what-if (plan §9.1, D-421): total $ per accepted task by profile (flows of this model; other models' flows differ)
| model | arm | bill | deepseek-flash (0.003/0.003/2.4) | MiMo-V2.6-Pro (0.43/0.43/0.87) | MiMo cache 10% (0.43/0.043/0.87) | Qwen3.8 Max (2/0.25/6) | Grok 4.7 (2/0.5/6) | Fable 5 (10/1/50) |
|---|---|---|---|---|---|---|---|---|
| deepseek-v4.1-flash | default | 0.0187 | 0.0294 | 0.0894 | 0.0386 | 0.2094 | 0.2422 | 1.2542 |
| deepseek-v4.1-flash | direct | 0.0171 | 0.0291 | 0.0586 | 0.0320 | 0.1758 | 0.1929 | 1.1013 |
| deepseek-v4.1-flash | loop | 0.0069 | 0.0114 | 0.0318 | 0.0111 | 0.0634 | 0.0768 | 0.3972 |
| glm-5.3-flash | default | 0.0340 | 0.0524 | 0.2177 | 0.0921 | 0.4861 | 0.5673 | 2.7750 |
| glm-5.3-flash | direct | 0.0389 | 0.0513 | 0.2792 | 0.1010 | 0.5332 | 0.6483 | 2.9627 |
| glm-5.3-flash | loop | 0.0028 | 0.0047 | 0.0176 | 0.0067 | 0.0364 | 0.0434 | 0.2131 |

## Quality floor (№9a screening: accepted not fewer by more than 1 of 8 vs default) and limits (№22: time ≤ 2×, requests and uncached input ≤ +20 %)
- deepseek-v4.1-flash direct: accepted per 8 tasks ≈ 7.5 vs default 7.5 → floor OK
- deepseek-v4.1-flash loop: accepted per 8 tasks ≈ 8.0 vs default 7.5 → floor OK
- glm-5.3-flash direct: accepted per 8 tasks ≈ 4.5 vs default 3.0 → floor OK
- glm-5.3-flash loop: accepted per 8 tasks ≈ 8.0 vs default 3.0 → floor OK


## Аудитор B1 (bench/d5a/audit)

Источник: `bench/d5a/audit/results-<model>-<arm>/audit.md`, разделы «Groups (model × arm)», «Groups: provenance class», «Groups: re-pricing what-if (D-421)». Группа = 16 прогонов (8 задач × 2). Токены взяты из строки потоков what-if (requests / uncached / cache read / output / reasoning). Столбцы uncached / cache read / output в таблице групп аудитора — доли ДЕНЕГ счёта, не токенов; доля кэша по токенам = его «hit share». Итог входа и доли в токенах (input = uncached + cache read) — деление чисел самого отчёта. Контекст на запрос (первый / средний / пик) в отчётах аудитора отсутствует — нет в отчёте.

### (1) Анатомия

| модель | arm | запросов | input всего | uncached | доля кэша по токенам (hit share) | output | из него reasoning | контекст на запрос first / mean / peak | счёт, $ |
|---|---|---|---|---|---|---|---|---|---|
| deepseek-v4.1-flash | default | 256 | 2 753 323 | 783 915 | 71.5 % | 180 095 | 114 279 | нет в отчёте | 0.28087 |
| deepseek-v4.1-flash | direct | 198 | 1 680 470 | 650 582 | 61.3 % | 179 681 | 132 001 | нет в отчёте | 0.25593 |
| deepseek-v4.1-flash | loop | 222 | 1 031 045 | 176 005 | 82.9 % | 74 810 | 35 960 | нет в отчёте | 0.11091 |
| glm-5.3-flash | default | 291 | 2 779 729 | 831 953 | 70.1 % | 127 650 | 45 851 | нет в отчёте | 0.20421 |
| glm-5.3-flash | direct | 507 | 5 469 669 | 1 325 029 | 75.8 % | 185 387 | 112 937 | нет в отчёте | 0.34975 |
| glm-5.3-flash | loop | 172 | 593 551 | 143 247 | 75.9 % | 30 530 | 5 424 | нет в отчёте | 0.044507 |

Доли денег счёта (uncached / cache read / output), как печатает аудитор: ds default 9.1 / 14.8 / 76.2 %; ds direct 8.9 / 7.8 / 83.6 %; ds loop 4.8 / 15.0 / 80.2 %; glm default 32.1 / 37.2 / 30.0 %; glm direct 30.2 / 45.6 / 24.2 %; glm loop 34.0 / 33.8 / 31.1 %. Cache write везде 0 (n/a). Принятых прогонов (accepted / accept-unverified): ds default 15 / 9; ds direct 15 / 10; ds loop 16 / 0; glm default 6 / 2; glm direct 9 / 6; glm loop 16 / 0. q̂ группы: ds 84.3 / 76.4 / —; glm 83.1 / 84.9 / —.

### (2) Потери W1–W7 (доля денег прогона; столбцы аудитора)

W1 TailAfterResult, W2 BackgroundPolls, W3 CadenceEviction, W4 PrefixMiss, W5 WrittenBodies, W6 AnchorTail, W7 ImmediateStubs.

| модель | arm | W1 | W2 | W3 | W4 | W5 | W6 | W7 |
|---|---|---|---|---|---|---|---|---|
| deepseek-v4.1-flash | default | — | 0.0 % | 0.2 % | 0.0 % | — | 1.6 % | 0.0 % |
| deepseek-v4.1-flash | direct | — | 0.0 % | 0.2 % | 0.0 % | — | 1.0 % | 0.0 % |
| deepseek-v4.1-flash | loop | — | 0.0 % | 0.0 % | 0.0 % | — | — | 0.0 % |
| glm-5.3-flash | default | — | 0.0 % | 1.6 % | 0.0 % | — | 4.4 % | 0.1 % |
| glm-5.3-flash | direct | — | 0.0 % | 1.3 % | 0.0 % | — | 3.6 % | 0.1 % |
| glm-5.3-flash | loop | — | 0.0 % | 0.0 % | 0.0 % | — | — | 0.0 % |

«—» = не измерено (в групповой строке W1 и W5 не измерены нигде; W6 не измерен у loop, у него и класс провенанса неизвестен).

### (3) Re-pricing what-if аудитора (D-421): $ за ГРУППУ из 16 прогонов (не за прогон) по потокам группы

| группа | by the bill | MiMo-V2.6-Pro (0.43/—/—/0.87, кэш по цене input) | MiMo cache 10 % (0.43/0.043/—/0.87) | Qwen3.8 Max (2/0.25/—/6) | Grok 4.7 (2/0.5/—/6) | Fable 5 (10/1/—/50) | deepseek-flash (0.003/0.003/—/2.4) |
|---|---|---|---|---|---|---|---|
| ds default | 0.28087 | 1.3406 | 0.57845 | 3.1408 | 3.6331 | 18.813 | 0.44049 |
| ds direct | 0.25593 | 0.87892 | 0.48036 | 2.6367 | 2.8942 | 16.52 | 0.43628 |
| ds loop | 0.11091 | 0.50843 | 0.17753 | 1.0146 | 1.2284 | 6.3556 | 0.18264 |
| glm default | 0.20421 | 1.3063 | 0.55255 | 2.9168 | 3.4037 | 16.65 | 0.3147 |
| glm direct | 0.34975 | 2.5132 | 0.90927 | 4.7985 | 5.8347 | 26.664 | 0.46134 |
| glm loop | 0.044507 | 0.28179 | 0.10752 | 0.58225 | 0.69483 | 3.4093 | 0.075053 |

Аудитор предупреждает: потоки чужой модели были бы другими. Цены глубже: в отчётах ds-флеш по счёту ≈ 0.033 / 0.019–0.020 / 1.19 $/M (uncached / cache read / output), glm ≈ 0.07–0.08 / 0.039 / 0.44–0.50 (маршруты разные, часть «Approximate»).

### (4) Класс провенанса (кто проверил результат, C2), прогонов из 16

| модель | arm | independent | agent_test | unverified | unknown |
|---|---|---|---|---|---|
| deepseek-v4.1-flash | default | 0 | 4 (25.0 %) | 12 (75.0 %) | 0 |
| deepseek-v4.1-flash | direct | 0 | 3 (18.8 %) | 13 (81.3 %) | 0 |
| deepseek-v4.1-flash | loop | 0 | 0 | 0 | 16 |
| glm-5.3-flash | default | 0 | 0 | 16 (100 %) | 0 |
| glm-5.3-flash | direct | 0 | 0 | 16 (100 %) | 0 |
| glm-5.3-flash | loop | 0 | 0 | 0 | 16 |

### Чтение

- ds, direct к default: запросов 198 против 256 (0.77), uncached 650 582 против 783 915 (0.83), доля кэша 61.3 % против 71.5 %, счёт $0.256 против $0.281 (0.91); output почти равен (179 681 против 180 095), reasoning больше у direct (132 001 против 114 279).
- glm, direct к default: запросов 507 против 291 (1.74), uncached 1 325 029 против 831 953 (1.59), доля кэша 75.8 % против 70.1 %, счёт $0.350 против $0.204 (1.71); принято 9/16 против 6/16.
- Контекст на запрос в отчётах нет; по потокам input на запрос (input/запросы, моё деление): ds default 10 755, direct 8 487, loop 4 644; glm default 9 552, direct 10 788, loop 3 451.
- core к loop, ds: uncached на запрос 3 062 (default) и 3 286 (direct) против 793 у loop, т. е. ×3.9 и ×4.1; запросов 256/198 против 222; output 180 095/179 681 против 74 810 (×2.4), reasoning 114 279/132 001 против 35 960; счёт ×2.5 / ×2.3.
- core к loop, glm: uncached на запрос 2 859 (default) и 2 613 (direct) против 833, т. е. ×3.4 и ×3.1; запросов 291/507 против 172; output 127 650/185 387 против 30 530 (×4.2/×6.1), reasoning 45 851/112 937 против 5 424; счёт ×4.6 / ×7.9.
- Разрыв core–loop лежит в uncached на запрос и в output/reasoning, а не в числе запросов (у ds 222 против 256/198). Постоянная часть первого запроса — нет в отчёте.
- Доля кэша по токенам у loop не ниже, чем у core, у ds 82.9 % (выше 71.5 / 61.3 %), у glm 75.9 % (на уровне 70.1 / 75.8 %): дешевизна loop идёт от малого uncached и output, а не от кэша.
- Потери: W3 CadenceEviction и W6 AnchorTail ненулевые только у core (ds 0.2 % и 1.0–1.6 %; glm 1.3–1.6 % и 3.6–4.4 %); W2, W4 везде 0.0 %; W1, W5 не измерены.
- Приёмка loop 16/16 у обеих моделей против ds 15 и 15, glm 6 и 9 у core. У glm принято у core только 6/16 (default) и 9/16 (direct), при loop 16/16.
- glm core 6/16 и 9/16 — отказ-зацикливание (refusal loop), расследуется линией GLM; это не свойство протокола, и сравнение стоимости glm core к loop им искажено (больше запросов и output на неудачных прогонах).
- Провенанс: independent = 0 во всех шести группах; у ds default/direct agent_test 4 и 3 из 16, остальные unverified; у glm core все 16 unverified; у loop класс неизвестен (16 unknown), поэтому accept-unverified там 0, а «accepted» несравним по провенансу.
- Цены в аудитах оценочные («Approximate»): расхождение счёта и оценки по группам ≤ 1.2 % (напр. glm loop 0.044507 против 0.04398), так что порядок величин безопасен.
