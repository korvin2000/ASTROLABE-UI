# WP-C2 — ось происхождения в итоговом объекте и метриках

**Исполнитель:** задача (spawn task), тир t4. **cwd:** `C:\work.astrolab\ASTROLABE`. **Ветка:** `v2/C2`. **TODO:** P8.C.3.
**Общие правила:** `C:\work.astrolab\plan2\COMMON.md` (обязательны). **План:** §4.4 (C2), §6 (C2), §1 строка 16,
§11 №3 (принята рекомендация: `completed` + поле происхождения; метрики раздельно). Студийные ярлыки «проверено
независимо / тестом агента / не проверено» — **в C4 (S3)**, вместе с остальными ярлыками исхода (см. §17 плана).

## Цель
Итог задачи честно говорит, **кем** проверен результат: кто задал требование → кто создал проверку → что запущено →
на каком дереве → результат → кто принял остаточный риск. Сейчас `ItemProvenance` не знает происхождения критерия:
любой успешный Run → `Tested` (`K/verify/Resolution.kt:167-174,325`).

## Что сделать
1. `ItemProvenance` (`K/verify/Resolution.kt`) + происхождение критерия: автор требования (пользователь / хост /
   модель — `Origin`), автор проверки (объявлена хостом/пользователем / `Origin.Model` / нет), запуск (команда,
   квитанция), дерево (штамп), результат, кто принял остаточный риск (runtime-приёмка / пользователь /
   accept-unverified).
2. Итоговый объект: `FinishReceipt` (`K/campaign/FinishReceipt.kt`) и исход кампании получают сводный класс
   происхождения `independent` (проверка хоста/пользователя прошла на финальном дереве) / `agentTest` (только проверки
   модели) / `unverified`; исход остаётся `completed` (решение №3). Событие завершения несёт поле, чтобы его читал
   аудитор. Java-фасад (`io.astrolabe.java`) — зеркало без `suspend`/`Flow`.
3. Метрики аудитора: когда B1 (`v2/B1`, офлайн-аудитор в `eval/`) влит в `main` — влить `main` и добавить в его
   сводку происхождения новое поле (доли трёх классов по прогонам). Если B1 ещё не влит к концу ядра — оставить
   хвостом в отчёте.
4. C1a (параллельная линия) вводит виды свидетельств и автоматические проверки `Origin.Model`: перед L2 влить `main`
   (после слияния C1a) и сопоставить новые `Origin`/виды классам происхождения.

## Границы
`verify/Resolution.kt`, `campaign/CampaignFinish.kt`, `campaign/FinishReceipt.kt`, событие завершения, `java/` и их
тесты; `eval/` — только метрика. **Не трогать:** `campaign/Controller.kt` (C8), `cell/Gates.kt` (C1b), `tool/run`,
`verify/Scheduler.kt`, `tool/verify/Verify.kt` (C1a). Studio не трогать.

## Проверки
- L1: `./gradlew :core:test --tests 'io.astrolabe.campaign.AcceptanceDecisionTest' --tests 'io.astrolabe.campaign.AcceptanceEvidenceTest' --tests 'io.astrolabe.campaign.LifecycleTest' -q --console=plain`
  + новый `ProvenanceTest` (три класса; требование пользователя + проверка модели → `agentTest`; объявленная проверка
  на финальном дереве → `independent`; accept-unverified → `unverified`; несколько требований → наихудший класс).
- L2 (в конце, один раз, после `git merge main`): `--tests 'io.astrolabe.verify.*' --tests 'io.astrolabe.campaign.*' --tests 'io.astrolabe.java.*' --tests 'io.astrolabe.event.*'`,
  `:eval:test` (если трогали аудитор), `:core:checkKotlinAbi` → `updateKotlinAbi`.

## Готово, когда
Итоговый объект и событие завершения несут ось происхождения и сводный класс; три класса покрыты тестами; исход
`completed` сохраняется; L1/L2 зелёные. При слиянии оркестратор отдаёт дифф на ревью Fable.

## Отчёт
`C:\work.astrolab\plan2\reports\WP-C2.md` по формату COMMON.md; в «Решениях» — правило свёртки нескольких требований
в класс.
