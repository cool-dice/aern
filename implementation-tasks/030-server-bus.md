# Шина событий и контракт модуля

- id: `030`
- title: Шина событий и контракт модуля
- status: `pending`
- depends_on: `001`, `002`, `003`

## Цель

Дать серверным модулям способ общаться, не импортируя друг друга, и общие часы.

## Контекст

Артефакт 24: модуль — папка с index, service, repository, types. Прямые вызовы запрещены. EventEmitter. Тик 10 Гц живёт в симуляторе, шина только доставляет факты после применения.

## Решение противоречий

Не использовать Node `EventEmitter` как публичный API модулей: свой синхронный bus, чтобы тесты не зависели от порядка `process.nextTick`. Внутри можно держать массив подписчиков.

## Файлы

- `apps/server/src/shared/bus.ts`
- `apps/server/src/shared/module.ts`
- `apps/server/src/shared/clock.ts`
- `apps/server/src/shared/bus.test.ts`
- удалить `apps/server/src/empty.ts`, если больше ничто его не импортирует.

## Интерфейсы

```ts
export interface DomainEventMap {
  'character.created': { characterId: string };
  'combat.hit': { attackerId: string; targetId: string; damage: number };
  'character.downed': { characterId: string };
  'item.crafted': { characterId: string; itemId: string };
  'chat.message': { channel: string; senderId: string };
  'quest.completed': { characterId: string; questId: string };
  'ai.rejected': { characterId: string; code: string };
}

export interface Bus {
  emit<K extends keyof DomainEventMap>(type: K, payload: DomainEventMap[K]): void;
  on<K extends keyof DomainEventMap>(type: K, handler: (payload: DomainEventMap[K]) => void): () => void;
}

export interface GameModule {
  name: string;
  start(ctx: { bus: Bus; now: () => number }): void;
}

export interface Clock { now(): number; advance(ms: number): void }
export function manualClock(startMs: number): Clock;
```

## Алгоритм

- `emit` вызывает подписчиков синхронно в порядке подписки. Ошибка подписчика не глотается.
- `on` возвращает отписку.
- Модуль не получает ссылку на другой модуль.
- `manualClock` не читает `Date.now` после создания. `advance` прибавляет мс.

## Тесты

- подписчик получает payload. Отписка прекращает вызовы.
- два модуля, зарегистрированные через `start`, обмениваются только событием: тест создаёт оба, один emit, второй считает.
- часы 1000 + advance 100 → 1100.

## Definition of done

В `shared` нет импорта Fastify и Prisma.

## Зона правок

`apps/server/src/shared/**` и удаление `empty.ts`.
