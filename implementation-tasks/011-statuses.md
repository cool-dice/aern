# Статусы и сопротивление

- id: `011`
- title: Статусы и сопротивление
- status: `done`
- depends_on: `002`, `004`

## Цель

Наложить статус или отклонить его сопротивлением и посчитать урон статуса за секунду.

## Контекст

Артефакт 5, раздел статусов. Сопротивление = воля + floor(телосложение / 2). Если сопротивление > сложности, статус не накладывается.

| id | Эффект | Длительность, с | Сложность (решение, в GDD нет числа) |
|---|---|---|---|
| `bleed` | −1 HP/с | 10 | 8 |
| `stun` | нельзя действовать | 3 | 12 |
| `burn` | −2 HP/с | 5 | 10 |
| `slow` | скорость ×0.5 | 5 | 6 |
| `poison` | −1 HP/с и −1 к точности попадания | 10 | 10 |
| `mutation` | маркер, конкретный эффект выбирает контент | 60 | 14 |

Повторное наложение того же id обновляет срок до максимума из оставшегося и нового, не суммирует стаки. Урон статусов суммируется, если висят bleed и burn вместе.

Нейрошок сюда не входит.

## Решение противоречий

Сложности назначены в этой задаче (обзор, пункт 26). Сравнение строгое: равенство сопротивления и сложности вешает статус.

## Файлы

- `packages/domain/src/status.ts`
- `packages/domain/src/status.test.ts`

## Интерфейсы

```ts
export type StatusId = 'bleed' | 'stun' | 'burn' | 'slow' | 'poison' | 'mutation';

export interface StatusInstance {
  id: StatusId;
  expiresAtMs: number;
  sourceId: string;
}

export function statusDifficulty(id: StatusId): number;
export function tryApplyStatus(input: {
  resist: number;
  id: StatusId;
  nowMs: number;
  sourceId: string;
  existing: StatusInstance[];
}): { applied: boolean; statuses: StatusInstance[] };

export function tickStatuses(statuses: StatusInstance[], nowMs: number): {
  active: StatusInstance[];
  hpLoss: number;
  accuracyPenalty: number;
  speedMultiplier: number;
  stunned: boolean;
};
```

`tickStatuses` считает урон за одну реальную секунду, не за 100 мс. Симулятор вызывает её раз в 1000 мс, либо передаёт долю. Добавить параметр `seconds: number` и умножать hpLoss на seconds. Стан и скорость не зависят от доли: если статус активен на `nowMs`, флаг true.

## Алгоритм

- Длительность из таблицы × 1000 мс, `expiresAtMs = nowMs + duration`.
- Если существующий тот же id, заменить экземпляр, если новый срок позже.
- `tick` отбрасывает `expiresAtMs <= nowMs`.
- `hpLoss` = (1 если bleed) + (2 если burn) + (1 если poison), умножить на `seconds`.
- poison даёт `accuracyPenalty` 1, иначе 0. Несколько poison не бывает из-за запрета стаков.
- slow → speedMultiplier 0.5, иначе 1. Нейрошок перемножает снаружи.
- mutation в этой функции не меняет числа, только остаётся в `active`.

## Тесты

- resist 8 против bleed (8) применяет. resist 9 не применяет, список не растёт.
- burn 5 секунд от now 0 истекает на 5000 и на такте `nowMs = 5000` уже не активен.
- повторный bleed с большим сроком удлиняет, с меньшим не укорачивает.
- bleed+burn за 1 секунду снимают 3 HP. За 0.5 секунды — 1.5.
- poison ставит accuracyPenalty 1.
- stun активен → `stunned` true.
- slow → 0.5, без slow → 1.

## Definition of done

Таблица сложностей экспортируется и покрыта тестом на каждое id.

## Зона правок

`packages/domain/src/status.ts` и тест.
