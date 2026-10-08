# 113. Аукцион пишет ставки

status: done

## Правило GDD

Артефакт 13 и `placeBid` / `sellerProceeds` / `auctionTaxSink`. Стартовая ставка не ниже `startPrice`. Следующая — не ниже ceil(текущая × 1.05). Выкуп закрывает лот. Налог  уходит в гильдию города или в пустоту. `listAuction` не возвращает `feature_stub`.

## Файлы

- `apps/server/src/modules/economy/service.ts`
- `apps/server/src/modules/economy/repository.ts` — лоты
- `apps/server/src/compose.ts` — `POST /auction` создаёт или показывает лот

## Приёмка

- Выставление лота списывает предмет у продавца и сохраняет лот.
- Низкая ставка → `low` или `step`.
- Ставка с выкупом переводит предмет покупателю и золото продавцу за вычетом налога.
- `GET` списка возвращает живые лоты.

## Тесты

`pnpm --filter @rift/server test`. Налоговую формулу домена не дублировать своими процентами.
