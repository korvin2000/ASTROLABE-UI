# WP-BL — отчёт по baseline-бенчмарку ASTROLABE 2.0

## Что прогнано
- Код: ASTROLABE `eada1c0` (= v2/BL `a245ac7` + A2a `e911bb4`, `a550e9d` + A0 `a445ea3`); llm-transport-sdk `dba7ab7`.
- Модели (OpenRouter): `deepseek/deepseek-v4.1-flash`, `z-ai/glm-5.3-flash`. Задачи: bugfix-pagination, rest-todo, api-currency.
- 3 задачи × 2 модели × 2 повтора = 12 прогонов; seed 1; effort Medium; maxCells 12. Харнесс eval-live 0.1.0.
- Даты: 2026-10-02, 15:54–16:13 UTC. Результаты: `bench/baseline/results-deepseek`, `results-glm`.
- Сокращения: t — wall-время попытки, N — запросы к модели, яч — ячейки, reas — reasoning-токены (входят в out),
  оценка — по ценовой таблице профиля, billed — сумма `usage.billed` из `cell.model_responded`, lat — средняя задержка запроса, 1-й вывод — средний firstOutputMillis.

## Итоги
Приёмка: 12/12 прошли (outcome=completed, acceptance passed, failure=null во всех).

### По прогонам
| задача | мод | r | допуск | t, с | N | яч | uncached | cache r | out | reas | оценка $ | billed $ | cache% | lat, с | 1-й вывод, с | upstream | политика |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| api-currency | deepseek | 1 | да | 84 | 8 | 1 | 25351 | 55808 | 5406 | 2095 | 0.0144 | 0.0048 | 69 | 7.0 | 0.9 | Relace×8 | — |
| api-currency | deepseek | 2 | да | 198 | 17 | 1 | 47946 | 161536 | 9470 | 5216 | 0.0267 | 0.0098 | 77 | 9.5 | 1.0 | Relace×17 | — |
| bugfix-pagination | deepseek | 1 | да | 107 | 17 | 2 | 32186 | 123904 | 3797 | 1312 | 0.0150 | 0.0053 | 79 | 4.0 | 0.9 | Relace×17 | accept-unverified |
| bugfix-pagination | deepseek | 2 | да | 69 | 11 | 2 | 21134 | 68096 | 3067 | 1121 | 0.0104 | 0.0036 | 76 | 3.7 | 0.8 | Relace×11 | accept-unverified |
| rest-todo | deepseek | 1 | да | 324 | 10 | 2 | 45094 | 118784 | 20622 | 14241 | 0.0390 | 0.0155 | 72 | 27.8 | 1.1 | Relace×10 | accept-unverified |
| rest-todo | deepseek | 2 | да | 279 | 11 | 2 | 45970 | 143104 | 19911 | 12835 | 0.0385 | 0.0156 | 76 | 19.7 | 1.1 | Relace×11 | accept-unverified |
| api-currency | glm | 1 | да | 250 | 17 | 1 | 67347 | 88064 | 4184 | 1076 | 0.0148 | 0.0089 | 57 | 12.7 | 8.0 | GMICloud×16+Wafer×1 | — |
| api-currency | glm | 2 | да | 199 | 15 | 1 | 26206 | 109824 | 3374 | 1163 | 0.0089 | 0.0053 | 81 | 10.8 | 6.8 | GMICloud×15 | — |
| bugfix-pagination | glm | 1 | да | 66 | 9 | 2 | 20208 | 43264 | 1599 | 743 | 0.0051 | 0.0054 | 68 | 4.3 | 1.5 | Wafer×9 | accept-unverified |
| bugfix-pagination | glm | 2 | да | 55 | 9 | 2 | 10987 | 52800 | 1346 | 378 | 0.0039 | 0.0049 | 83 | 3.6 | 1.4 | Wafer×9 | accept-unverified |
| rest-todo | glm | 1 | да | 140 | 10 | 1 | 38620 | 75840 | 4421 | 1122 | 0.0103 | 0.0105 | 66 | 10.4 | 1.3 | Wafer×10 | — |
| rest-todo | glm | 2 | да | 391 | 16 | 1 | 81503 | 141312 | 6940 | 2015 | 0.0199 | 0.0160 | 63 | 21.0 | 11.4 | Wafer×9+GMICloud×7 | — |

### Задача × модель: медиана (min–max) по 2 повторам
| задача | мод | t, с | N | out | оценка $ | billed $ | cache% |
|---|---|---|---|---|---|---|---|
| bugfix-pagination | deepseek | 88.42 (69.42–107.4) | 14 (11–17) | 3432 (3067–3797) | 0.01269 (0.01043–0.01496) | 0.004467 (0.003589–0.005346) | 77.5 (76–79) |
| bugfix-pagination | glm | 60.88 (55.39–66.37) | 9 (9–9) | 1472 (1346–1599) | 0.004517 (0.003905–0.005129) | 0.005126 (0.00489–0.005362) | 75.5 (68–83) |
| rest-todo | deepseek | 301.4 (278.9–323.9) | 10.5 (10–11) | 2.027e+04 (1.991e+04–2.062e+04) | 0.03877 (0.03854–0.03899) | 0.01553 (0.01549–0.01557) | 74 (72–76) |
| rest-todo | glm | 265.6 (139.8–391.5) | 13 (10–16) | 5680 (4421–6940) | 0.01511 (0.01028–0.01993) | 0.01323 (0.01052–0.01595) | 64.5 (63–66) |
| api-currency | deepseek | 141.1 (84.06–198.2) | 12.5 (8–17) | 7438 (5406–9470) | 0.02057 (0.01443–0.02672) | 0.007296 (0.004818–0.009773) | 73 (69–77) |
| api-currency | glm | 224.4 (199–249.9) | 16 (15–17) | 3779 (3374–4184) | 0.01187 (0.008913–0.01484) | 0.007091 (0.005294–0.008887) | 69 (57–81) |

### Суммы
| группа | принято | billed $ | оценка $ | t, с | N | uncached | cache read | out | reas | cache% |
|---|---|---|---|---|---|---|---|---|---|---|
| deepseek | 6/6 | 0.0546 | 0.1441 | 1062 | 74 | 217681 | 671232 | 62273 | 36820 | 76 |
| glm | 6/6 | 0.0509 | 0.0630 | 1102 | 76 | 244871 | 511104 | 21864 | 6497 | 68 |
| ВСЕГО | 12/12 | 0.1055 | 0.2071 | 2164 | 150 | 462552 | 1182336 | 84137 | 43317 | 72 |

Оценка/billed: deepseek 2.64×, glm 1.24×, всего 1.96×. Средний billed на прогон: deepseek $0.0091, glm $0.0085.

## Качество данных
- Присутствуют во всех 150 `cell.model_responded`: `usage.billed` (unknown=false, USD), `billedUpstream`, `reasoningTokens`, `facts.latencyMillis`, `facts.firstOutputMillis`, `facts.upstream`, `facts.responseModel`. Billed/reasoning/timing/upstream: покрытие 100%.
- Пусто: `cacheWriteTokens` = null во всех прогонах (провайдеры не сообщают; cache write не измерен, а не 0). `facts.priceTierInputTokensAbove` = null.
- `eventsDropped` = 0, `failure` = null, ошибок/ретраев/отказов в bench.log и событиях нет. N запросов = N ответов во всех прогонах.
- `result.json.totals.cost` = оценка по прайсу профиля, не billed; billed в итоговых totals отсутствует — считается только из событий. Рекомендация: добавить billed в totals.
- `cell.ended` не несёт outcome/reason/stop (поля пустые); итог только в result.json.
- Кодировка: в `gate_fired.text` встречается mojibake (UTF-8, прочитанный как cp1251: «вЂ”»). Косметика, но портит сравнение текстов.
- bench.log по 6 строк-пар на модель, без метрик; summary.csv содержит оценку, но не billed.

## Аномалии и наблюдения
1. Расхождение цены deepseek: оценка в 2.6× выше billed. Все 74 запроса deepseek обслужил апстрим Relace (необычный для deepseek-v4.1-flash), прайс профиля, видимо, не соответствует фактическому тарифу. У glm оценка ≈ billed (на bugfix billed даже выше оценки на 5–25%). Для B4 сравнивать по billed.
2. Приёмка с «Integrity Unverified»: 6 из 12 прогонов (bugfix ×4, rest-todo deepseek ×2) закрыты решением acceptance=accepted при `no reviewer`; gate `acceptance-surface` сработал на правки tests/test_paging.py / tests/test_todos.py (в т.ч. «deleted-test» в rest-todo deepseek r1). Скрытая приёмка при этом прошла, но агент правил тесты-поверхность приёмки.
3. rest-todo deepseek: ~20 тыс. output-токенов (из них 12.8–14.2 тыс. reasoning), ~5 мин; glm на той же задаче 4.4–6.9 тыс. out, но r2 — 391 с (самый долгий прогон) с 16 запросами.
4. Большие разбросы между повторами: glm rest-todo 140 vs 391 с (2.8×); deepseek api-currency N 8 vs 17, 84 vs 198 с. Остальные пары в пределах ~1.5×.
5. glm: firstOutputMillis на api-currency 6.8–8.0 с и rest-todo r2 11.4 с против ~1–1.5 с на прочем; апстрим меняется внутри прогона (GMICloud ↔ Wafer: api-currency r1 16+1, rest-todo r2 9+7) — высокая задержка связана с GMICloud (по средним в этих прогонах).
6. Срабатывания gate: stall (deepseek bugfix r1; glm api-currency ×2), register patch rejected (glm: api-currency r1, rest-todo r2), impact/stale-fact/exit refused (deepseek api-currency r2 получил «exit refused»). Частичных ячеек и ошибок завершения нет.
7. Доля кэша 57–83%; ниже всего у glm api-currency r1 (57%, 67 тыс. uncached при 17 запросах).
8. Число ячеек отличается по задачам: bugfix и rest-todo(deepseek) — 2 ячейки, api-currency и rest-todo(glm) — 1.

## Для B4
- Сравнивать по billed, а не по оценке; сохранить оба и расхождение. Зафиксировать апстрим (Relace/Wafer/GMICloud) — он влияет и на цену, и на задержку; по возможности пинить провайдера.
- Метрики: приёмка, billed $, wall, N, out (+reas), cache%, lat/1-й вывод; медианы и размах — при n=2 разброс велик, нужен больший n или те же seed/порядок.
- Следить за долей accept-unverified и срабатываниями acceptance-surface (правки тестов): рост — регресс целостности, даже при прошедшей приёмке.
- Добавить в сравнение cache write (сейчас null), число gate-срабатываний/отказов выхода и число ячеек на задачу.
- Те же задачи/seed/effort/maxCells, тот же коммит SDK `dba7ab7`, различие только в коде под тестом (поля событий A2a — для сопоставимости).

Статус: ГОТОВО
