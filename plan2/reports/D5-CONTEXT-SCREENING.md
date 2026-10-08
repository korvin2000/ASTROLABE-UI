# D5: рост контекста по запросам (скрининг)

Источник: `C:/work.astrolab/bench/d5a`; ранов: 96. Вход запроса = uncached_input + cache_read. Пик (макс) — максимум пика по ранам.

## 1. Модель × рука

| модель | рука | ранов | n запросов | первый вход | средний вход | пик | пик (макс) | последний вход | некэш. на запрос | доля кэша | наклон, ток/запрос |
|---|---|---|---|---|---|---|---|---|---|---|---|
| deepseek/deepseek-v4.1-flash | default | 16 | 16.0 | 5 224 | 9 494 | 13 626 | 24 308 | 10 657 | 2 859 | 69% | 397 |
| deepseek/deepseek-v4.1-flash | direct | 16 | 12.4 | 4 339 | 7 585 | 11 226 | 24 068 | 8 692 | 3 019 | 60% | 478 |
| deepseek/deepseek-v4.1-flash | loop | 16 | 13.9 | 902 | 3 944 | 6 551 | 12 816 | 6 551 | 782 | 75% | 409 |
| z-ai/glm-5.3-flash | default | 16 | 18.2 | 4 974 | 9 133 | 12 726 | 32 168 | 12 157 | 2 942 | 66% | 528 |
| z-ai/glm-5.3-flash | direct | 16 | 31.7 | 4 128 | 8 216 | 11 550 | 23 548 | 8 708 | 3 469 | 53% | 260 |
| z-ai/glm-5.3-flash | loop | 16 | 10.8 | 768 | 2 795 | 4 199 | 13 548 | 4 090 | 759 | 67% | 316 |

## 2. Модель × рука × задача

| модель | рука | задача | ранов | n | первый | средний | пик | последний | некэш. | кэш | наклон |
|---|---|---|---|---|---|---|---|---|---|---|---|
| deepseek/deepseek-v4.1-flash | default | api-currency | 2 | 42.0 | 4 515 | 12 800 | 20 526 | 19 819 | 3 081 | 76% | 431 |
| deepseek/deepseek-v4.1-flash | default | bugfix-pagination | 2 | 13.0 | 5 404 | 7 178 | 10 290 | 5 784 | 2 527 | 65% | 32 |
| deepseek/deepseek-v4.1-flash | default | env-launcher | 2 | 11.5 | 5 194 | 7 049 | 9 443 | 7 200 | 1 867 | 73% | 286 |
| deepseek/deepseek-v4.1-flash | default | interrupt-csv | 2 | 20.5 | 4 398 | 7 670 | 11 157 | 11 136 | 2 528 | 68% | 389 |
| deepseek/deepseek-v4.1-flash | default | investigate-totals | 2 | 11.0 | 5 272 | 9 642 | 15 096 | 7 144 | 3 929 | 59% | 187 |
| deepseek/deepseek-v4.1-flash | default | red-test | 2 | 7.0 | 5 221 | 7 715 | 9 462 | 9 462 | 1 955 | 75% | 708 |
| deepseek/deepseek-v4.1-flash | default | rest-todo | 2 | 13.0 | 6 086 | 13 229 | 17 356 | 17 356 | 2 960 | 77% | 959 |
| deepseek/deepseek-v4.1-flash | default | ui-clear-done | 2 | 10.0 | 5 706 | 10 667 | 15 682 | 7 359 | 4 026 | 62% | 187 |
| deepseek/deepseek-v4.1-flash | direct | api-currency | 2 | 25.5 | 4 515 | 10 861 | 18 600 | 15 708 | 4 376 | 57% | 382 |
| deepseek/deepseek-v4.1-flash | direct | bugfix-pagination | 2 | 9.5 | 4 264 | 5 872 | 8 141 | 5 612 | 2 809 | 52% | 159 |
| deepseek/deepseek-v4.1-flash | direct | env-launcher | 2 | 9.5 | 4 106 | 5 608 | 7 528 | 6 565 | 1 507 | 73% | 402 |
| deepseek/deepseek-v4.1-flash | direct | interrupt-csv | 2 | 24.0 | 4 354 | 7 678 | 11 634 | 9 684 | 3 215 | 57% | 223 |
| deepseek/deepseek-v4.1-flash | direct | investigate-totals | 2 | 10.0 | 4 174 | 7 361 | 11 705 | 6 533 | 2 869 | 61% | 262 |
| deepseek/deepseek-v4.1-flash | direct | red-test | 2 | 5.5 | 4 128 | 6 271 | 7 923 | 7 923 | 1 974 | 69% | 851 |
| deepseek/deepseek-v4.1-flash | direct | rest-todo | 2 | 6.0 | 4 710 | 8 590 | 11 373 | 11 373 | 3 470 | 60% | 1332 |
| deepseek/deepseek-v4.1-flash | direct | ui-clear-done | 2 | 9.0 | 4 464 | 8 437 | 12 904 | 6 138 | 3 928 | 53% | 209 |
| deepseek/deepseek-v4.1-flash | loop | api-currency | 2 | 12.0 | 958 | 3 013 | 4 826 | 4 826 | 714 | 76% | 373 |
| deepseek/deepseek-v4.1-flash | loop | bugfix-pagination | 2 | 7.5 | 865 | 1 730 | 2 570 | 2 570 | 848 | 51% | 263 |
| deepseek/deepseek-v4.1-flash | loop | env-launcher | 2 | 16.0 | 815 | 3 123 | 4 958 | 4 958 | 626 | 80% | 276 |
| deepseek/deepseek-v4.1-flash | loop | interrupt-csv | 2 | 11.5 | 878 | 2 333 | 3 918 | 3 918 | 688 | 71% | 290 |
| deepseek/deepseek-v4.1-flash | loop | investigate-totals | 2 | 23.0 | 821 | 6 461 | 11 578 | 11 578 | 815 | 87% | 491 |
| deepseek/deepseek-v4.1-flash | loop | red-test | 2 | 7.5 | 816 | 1 839 | 2 754 | 2 754 | 629 | 66% | 300 |
| deepseek/deepseek-v4.1-flash | loop | rest-todo | 2 | 15.0 | 1 100 | 5 914 | 10 628 | 10 628 | 1 033 | 82% | 692 |
| deepseek/deepseek-v4.1-flash | loop | ui-clear-done | 2 | 18.5 | 967 | 7 143 | 11 177 | 11 177 | 905 | 87% | 584 |
| z-ai/glm-5.3-flash | default | api-currency | 2 | 7.0 | 4 272 | 5 743 | 6 849 | 6 849 | 2 330 | 59% | 431 |
| z-ai/glm-5.3-flash | default | bugfix-pagination | 2 | 17.5 | 5 171 | 7 251 | 9 772 | 5 224 | 5 284 | 27% | -0 |
| z-ai/glm-5.3-flash | default | env-launcher | 2 | 18.5 | 4 952 | 7 386 | 9 104 | 9 104 | 1 421 | 81% | 316 |
| z-ai/glm-5.3-flash | default | interrupt-csv | 2 | 33.0 | 4 102 | 7 335 | 9 354 | 9 354 | 2 835 | 61% | 219 |
| z-ai/glm-5.3-flash | default | investigate-totals | 2 | 21.5 | 5 028 | 11 729 | 15 860 | 15 860 | 2 631 | 77% | 594 |
| z-ai/glm-5.3-flash | default | red-test | 2 | 21.0 | 4 971 | 8 448 | 10 589 | 10 589 | 1 746 | 79% | 295 |
| z-ai/glm-5.3-flash | default | rest-todo | 2 | 11.0 | 5 842 | 10 865 | 16 512 | 16 512 | 3 309 | 69% | 985 |
| z-ai/glm-5.3-flash | default | ui-clear-done | 2 | 16.0 | 5 456 | 14 306 | 23 766 | 23 766 | 3 984 | 72% | 1382 |
| z-ai/glm-5.3-flash | direct | api-currency | 2 | 11.0 | 4 271 | 6 352 | 7 792 | 7 792 | 3 513 | 45% | 362 |
| z-ai/glm-5.3-flash | direct | bugfix-pagination | 2 | 11.5 | 4 066 | 5 317 | 7 362 | 5 060 | 4 328 | 19% | 96 |
| z-ai/glm-5.3-flash | direct | env-launcher | 2 | 10.5 | 3 908 | 5 708 | 7 125 | 7 125 | 1 210 | 78% | 328 |
| z-ai/glm-5.3-flash | direct | interrupt-csv | 2 | 22.5 | 4 109 | 7 300 | 10 816 | 8 700 | 5 397 | 26% | 246 |
| z-ai/glm-5.3-flash | direct | investigate-totals | 2 | 140.5 | 3 974 | 14 511 | 20 904 | 14 662 | 1 999 | 86% | 129 |
| z-ai/glm-5.3-flash | direct | red-test | 2 | 27.0 | 3 926 | 7 337 | 9 556 | 9 556 | 1 404 | 81% | 228 |
| z-ai/glm-5.3-flash | direct | rest-todo | 2 | 15.0 | 4 513 | 9 017 | 12 407 | 9 196 | 5 753 | 36% | 399 |
| z-ai/glm-5.3-flash | direct | ui-clear-done | 2 | 15.5 | 4 260 | 10 186 | 16 438 | 7 575 | 4 144 | 55% | 293 |
| z-ai/glm-5.3-flash | loop | api-currency | 2 | 9.0 | 824 | 1 895 | 2 931 | 2 931 | 1 454 | 23% | 268 |
| z-ai/glm-5.3-flash | loop | bugfix-pagination | 2 | 8.0 | 732 | 1 611 | 2 282 | 2 282 | 1 172 | 27% | 226 |
| z-ai/glm-5.3-flash | loop | env-launcher | 2 | 9.5 | 681 | 1 636 | 2 159 | 2 159 | 309 | 81% | 175 |
| z-ai/glm-5.3-flash | loop | interrupt-csv | 2 | 11.5 | 739 | 2 086 | 3 687 | 2 808 | 598 | 71% | 197 |
| z-ai/glm-5.3-flash | loop | investigate-totals | 2 | 14.0 | 688 | 4 229 | 6 428 | 6 428 | 579 | 85% | 479 |
| z-ai/glm-5.3-flash | loop | red-test | 2 | 6.5 | 680 | 1 542 | 2 100 | 2 100 | 365 | 76% | 258 |
| z-ai/glm-5.3-flash | loop | rest-todo | 2 | 16.0 | 965 | 5 747 | 9 030 | 9 030 | 1 195 | 81% | 527 |
| z-ai/glm-5.3-flash | loop | ui-clear-done | 2 | 11.5 | 831 | 3 612 | 4 980 | 4 980 | 401 | 89% | 398 |

## Чтение

- deepseek/deepseek-v4.1-flash: loop vs default: пик 6 551 vs 13 626, последний 6 551 vs 10 657, наклон 409 vs 397 ток/запрос, константа (первый запрос) 902 vs 5 224.
- deepseek/deepseek-v4.1-flash: loop vs direct: пик 6 551 vs 11 226, последний 6 551 vs 8 692, наклон 409 vs 478 ток/запрос, константа (первый запрос) 902 vs 4 339.
- z-ai/glm-5.3-flash: loop vs default: пик 4 199 vs 12 726, последний 4 090 vs 12 157, наклон 316 vs 528 ток/запрос, константа (первый запрос) 768 vs 4 974.
- z-ai/glm-5.3-flash: loop vs direct: пик 4 199 vs 11 550, последний 4 090 vs 8 708, наклон 316 vs 260 ток/запрос, константа (первый запрос) 768 vs 4 128.
- Если у loop последний вход ≈ пику и наклон заметно положителен, контекст растёт линейно без сжатия; если у остальных рук последний вход ниже пика или наклон мал, ядро сжимает контекст (компакция).
- Разница первых запросов показывает постоянную часть (системный промпт + схемы инструментов) каждой руки.
