# Симулятор тика 10 Гц

- id: `033`
- title: Симулятор тика 10 Гц
- status: `pending`
- depends_on: `030`, `004`, `010`, `011`, `012`

## Цель

Продвинуть мир на 100 мс: реген ОД, статусы раз в секунду, очередь команд движения и атак, грейс выхода.

## Контекст

Артефакты 23 и 24: 10 тиков в секунду. Дизайн-секунда артефактов 5 и 7 накопляется за 10 тиков. Реген `odRegenPerSecond / 10` добавляется в дробный аккумулятор каждый тик. Целые ОД = floor(аккумулятор), не выше лимита. Аккумулятор хранит и целую часть (решение: хранить дробное число ОД целиком, тратить целые, не обнулять дробь).

Вход в бой (первая атака или получение агро) ставит ОД в 1 и сбрасывает дробь в 1.

Статусы: раз в 10 тиков (`tickIndex % 10 === 0`) вызвать `tickStatuses` с seconds=1. На промежуточных тиках только проверять стан.

Движение и атака берутся из очереди этого тика в порядке `orderByInitiative`.

Грейс выхода: если `logoutRequested` и не в бою, персонаж ещё в мире `LOGOUT_GRACE_MS`, затем phase offline и таймеры личные замирают (флаг `frozen`). В бою грейс не ставится, персонаж остаётся. Бот при `carrierOffline` удаляется из списка сущностей без трупа.

Снимок для лага: хранить последние 6 состояний (0, 100, … 500 мс). `stateAt(nowMs - delay)` выбирает ближайший снимок не новее запрошенного момента. Если delay > 500, использовать самый старый из буфера.

## Решение противоречий

Обзор, пункт 2. Не делать цикл `setInterval` внутри доменной функции. `stepTick(world)` чистая относительно таймера: часы снаружи. Обёртка `startLoop` может быть в файле, но тест вызывает `stepTick` вручную.

## Файлы

- `apps/server/src/sim/tick.ts`
- `apps/server/src/sim/tick.test.ts`

## Интерфейсы

```ts
export interface SimEntity {
  id: string;
  reaction: number;
  accuracyStat: number;
  accuracyScore: number;
  evasion: number;
  armor: number;
  will: number;
  od: number;
  odFrac: number;
  hp: number;
  maxHp: number;
  cell: { x: number; y: number };
  inCombat: boolean;
  stunned: boolean;
  statuses: StatusInstance[];
  phase: 'online' | 'offline' | 'downed';
  isBot: boolean;
}

export function stepTick(world: SimWorld, commands: SimCommand[], rng: Rng): SimWorld;
export function snapshotLag(history: SimWorld[], delayMs: number): SimWorld;
```

`SimWorld` содержит `tick`, `nowMs`, `entities`, `corpses`.

## Алгоритм

- Команда `move` вызывает `move` домена. `attack` вызывает `resolveAttack`. Ошибки кладутся в `world.rejections[]` и не меняют сущность.
- 10 тиков при reaction 10 и will 10 вне боя: старт odFrac 0, каждый тик +0.3, после 10 тиков +3, od = 3 если начинали с 0. Тест задаёт старт 0 вне боя.
- В бою старт 1. После 10 тиков без трат: 1 + 3 = 4, как пример артефакта 5 «через 1 секунду ОД = 4» при старте 1 и регене 3.
- HP статуса bleed за 10 тиков −1.

## Тесты

- пример ОД 1 → 4 за секунду в бою.
- вне боя 0 → 3 за секунду при регене 3.
- атака без ОД отклоняется, hp цели прежний.
- лаг 0 возвращает последний снимок. Лаг 500 мс при 6 снимках возвращает самый старый.
- бот с carrierOffline пропадает. Игрок с logout вне боя остаётся, пока now не прошёл grace; тест advance 600_000 через 6000 тиков слишком тяжёл — передать `graceMs` уже накопленный в сущности и вычитать 100 каждый тик. Поле `logoutLeftMs`. После 0 phase offline.
- logout в бою не ставит leftMs.

## Definition of done

Нет `setInterval` в тесте. 10 вызовов stepTick детерминированы.

## Зона правок

`apps/server/src/sim/tick.ts` и тест.
