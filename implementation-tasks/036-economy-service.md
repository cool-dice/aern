# Сервис экономики

- id: `036`
- title: Сервис экономики
- status: `done`
- depends_on: `030`, `018`

## Цель

Провести продажу NPC, ремонт, портальную оплату и прямой обмен. Аукцион в прототипе вернуть `feature_stub`.

## Контекст

Артефакт 30: золото, прямой обмен, ремонт, ускорение — полностью; аукцион — заглушка. Формулы задачи 018.

Портал списывает золото и ставит кулдаун на персонаже. Враждебный город не в прототипе (гильдии — заглушка), флаг hostile всегда false, пока `guild === 'stub'`.

Обмен: оба вызова `offer` и оба `accept`. Пока оба не приняли, вещи не двигаются. Отмена чистит предложение.

## Решение противоречий

Обзор, пункт 16. `placeBid` остаётся в домене и покрыт тестами домена. Сервис `listAuction` сразу возвращает `feature_stub`, не вызывая домен.

## Файлы

`apps/server/src/modules/economy/**` и тест.

## Интерфейсы

```ts
export interface EconomyService {
  sell(characterId: string, itemId: string): Promise<Result<{ gold: number }, string>>;
  repair(characterId: string, itemId: string): Promise<Result<{ gold: number; durability: number }, string>>;
  portal(characterId: string, toNodeId: string, nowMs: number): Promise<Result<{ cooldownUntilMs: number }, string>>;
  offerTrade(...): Promise<Result<{ tradeId: string }, string>>;
  acceptTrade(tradeId: string, characterId: string): Promise<Result<'pending' | 'done', string>>;
  listAuction(): Result<never, 'feature_stub'>;
}
```

## Алгоритм

- Продажа unique → код `unique`, золото не растёт.
- Ремонт списывает `repairCost` и ставит durability 100.
- Повторный портал до кулдауна → `cooldown`.
- Обмен 10 золота на предмет: после двух accept золото и предмет поменялись. Один accept → `pending`.

## Тесты

- числа продажи epic 20: +100 золота при базе 200, если durability не влияет на продажу. Продажа не смотрит износ.
- ремонт примера 30 золота, durability было 50, база 200.
- listAuction → feature_stub.
- обмен не проходит при нехватке золота, состояние обоих то же.

## Definition of done

Сервис не открывает WebSocket.

## Зона правок

`apps/server/src/modules/economy/**`.
