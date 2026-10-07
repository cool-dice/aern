# Сервисы мира и данжей

- id: `034`
- title: Сервисы мира и данжей
- status: `pending`
- depends_on: `030`, `020`, `021`

## Цель

Отдать граф прототипа, проверить шаг между узлами и создать инстанс данжа по сиду окна.

## Контекст

Задачи 020 и 021. Инстанс живёт в памяти сервиса. TTL 10 минут после ухода последнего игрока. Пока в инстансе кто-то есть, TTL не тикает. Возврат сбрасывает таймер. Офлайн всех игроков мира замораживает TTL (флаг `worldOnline`).

Общий сид: игроки с одним `floor(now/300000)`, одним `nodeId` и одним направлением `edgeId` получают тот же layout, пока в инстансе < 8 человек. Группа до 4 передаётся одним `groupId` и занимает один слот-пачку, но каждый человек считается в лимите 8.

Повторный вход того же персонажа в тот же инстанс после выхода запрещён 24 часа, если инстанс уже удалён. Если инстанс жив — можно вернуться.

## Решение противоречий

Хранилище инстанса в Redis опишет задача 044 как адаптер. Этот сервис зависит от интерфейса `InstanceRepository` с памятью в тестах.

## Файлы

`apps/server/src/modules/world/**`, `apps/server/src/modules/dungeon/**` и тесты.

## Интерфейсы

```ts
export interface WorldService {
  graph(): { nodes: WorldNode[]; edges: WorldEdge[] };
  walk(from: string, to: string, barrierDown: boolean): Result<'ok', 'no_edge' | 'barrier'>;
}

export interface DungeonService {
  enter(input: { characterId: string; nodeId: string; edgeId: string; groupId: string; nowMs: number; partySize: number }): Result<{ instanceId: string; layout: DungeonLayout }, 'full' | 'locked'>;
  leave(instanceId: string, characterId: string, nowMs: number): void;
  tickTtl(nowMs: number, worldOnline: boolean): void;
}
```

## Алгоритм

- `enter` ищет живой инстанс с тем же ключом окна. Нет — `generateDungeon`.
- Лимит 8: отказ `full`.
- `leave` последнего ставит `expireAt = now+TTL`.
- `tickTtl` при worldOnline false не удаляет. При true и now>=expireAt удаляет.
- Замок 24 часа пишется при удалении инстанса на каждого, кто входил.

## Тесты

- два игрока в одном окне получают один instanceId и одинаковый entrance.
- девятый → full. Для скорости наполнить 8 без генерации лишних утверждений: лимит проверяется до генерации.
- leave и tick через 10 минут удаляет. tick при worldOnline false не удаляет.
- walk форт → несуществующий узел → no_edge. На барьер при закрытом флаге → barrier.
- повтор после удаления → locked. Пока жив — enter того же id возвращает тот же инстанс.

## Definition of done

Сервис не слушает порт.

## Зона правок

Папки `modules/world` и `modules/dungeon`.
