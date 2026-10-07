# Предметы, грейды, износ и слоты

- id: `007`
- title: Предметы, грейды, износ и слоты
- status: `pending`
- depends_on: `002`, `004`

## Цель

Описать экземпляр предмета: грейд, уровень, значение стата, прочность, мягкие требования, двуручность и слоты.

## Контекст

Артефакты 4 и 8.

Грейды:

| id | Статов | Активных | Пассивных | min | max | Коэффициент цены (задача 018) |
|---|---|---|---|---|---|---|
| `common` | 2 | 0 | 0–1 | 1 | 10 | 1 |
| `rare` | 3 | 0–1 | 1 | 2 | 15 | 3 |
| `epic` | 4 | 1 | 1–2 | 3 | 20 | 10 |
| `unique` | 6 | 2 | 2–3 | 5 | 30 | 30 |

Значение стата предмета: `floor(min + (max - min) * (level - 1) / 49)`. Уровень предмета 1..50.

Слоты экипировки: `head`, `torso`, `hands`, `legs`, `main_hand`, `off_hand`, `core`.

Имплант-слоты: `implant_head`, `implant_torso`, `implant_hands`, `implant_legs`.

Износ от действия (прочность стартует со 100):

| Событие | Потеря |
|---|---|
| Выстрел | 0.05 |
| Способность | 0.5 |
| Смерть, каждая надетая вещь | 10 |
| Час онлайн | 0.1 |

При прочности ≤ 0 предмет уничтожен.

Мягкие требования: если стат ниже требования, предмет надевается, бонусы статов предмета ×0.5 (пол после умножения каждого бонуса), и персонаж получает множитель скорости 0.8. Несколько таких предметов не перемножают скорость ниже 0.8: флаг один.

Двуручное оружие занимает `main_hand` и блокирует `off_hand`.

Тип урона один. Броня — сумма брони надетых вещей. Вес — сумма веса.

Патроны: `light` 0.01 кг, `heavy` 0.03 кг, `cell` 0.05 кг, `special` задаётся предметом (0.5..2). Перезарядка 1 ОД — в бою, не здесь.

## Решение противоречий

Прототипные «4 слота» не удаляют остальные из типа `EquipSlot`. Уникальные готовые предметы не создаются лутом; фабрика экземпляра это не проверяет, проверку делает лут и крафт.

Половина бонуса: `floor(bonus * 0.5)` для положительных. Отрицательные бонусы не описаны и не генерируются.

## Файлы

- `packages/domain/src/items.ts`
- `packages/domain/src/items.test.ts`

## Интерфейсы

```ts
export type GradeId = 'common' | 'rare' | 'epic' | 'unique';
export type EquipSlot =
  | 'head' | 'torso' | 'hands' | 'legs' | 'main_hand' | 'off_hand' | 'core';
export type ImplantSlot = 'implant_head' | 'implant_torso' | 'implant_hands' | 'implant_legs';

export interface GradeDef {
  id: GradeId;
  statCount: number;
  activeMin: number;
  activeMax: number;
  passiveMin: number;
  passiveMax: number;
  statMin: number;
  statMax: number;
  priceCoefficient: number;
}

export const GRADES: Record<GradeId, GradeDef>;

export function itemStatValue(grade: GradeId, itemLevel: number): number;
export function applyWear(durability: number, loss: number): number;
export function wearFor(kind: 'shot' | 'ability' | 'death' | 'hour', hours?: number): number;

export interface ItemBonus {
  stat: StatId;
  amount: number;
}

export function effectiveBonuses(bonuses: ItemBonus[], requirementMet: boolean): ItemBonus[];
export function speedMultiplier(anySoftFail: boolean): number;

export interface EquipAttempt {
  slot: EquipSlot;
  twoHanded: boolean;
  occupied: Partial<Record<EquipSlot, boolean>>;
}

export type EquipError = 'slot_blocked' | 'offhand_blocked' | 'destroyed';
export function canEquip(itemDurability: number, attempt: EquipAttempt): Result<EquipSlot[], EquipError>;
```

`canEquip` при успехе возвращает список слотов, которые займёт предмет: один слот либо `main_hand` и `off_hand` для двуручного.

## Алгоритм

- `itemStatValue('common', 1)` = 1. `itemStatValue('common', 50)` = 10. `itemStatValue('unique', 1)` = 5. `itemStatValue('unique', 50)` = 30.
- Уровень вне 1..50 — `RangeError`.
- `applyWear` не опускает ниже 0: `max(0, round2(durability - loss))`, где `round2` — округление до 0.01 через `Math.round(x * 100) / 100`.
- Час: `wearFor('hour', 2.5)` = 0.25. Дробные часы онлайн, не календарные.
- `canEquip` при прочности 0 → `destroyed`. Если слот занят → `slot_blocked`. Если двуручное и `off_hand` занят → `offhand_blocked`. Если в `off_hand` надевают предмет, а `main_hand` помечен как двуручный занятый слот — вызывающий передаёт `occupied.off_hand = true` сам. Функция не хранит инвентарь.

## Тесты

- четыре крайних значения стата из контекста.
- редкий уровень 1 → 2, уровень 50 → 15.
- износ выстрела 100 → 99.95. Смерть → 90. 2000 выстрелов формулой `100 - 2000 * 0.05` = 0.
- мягкое требование режет бонус +5 до +2 (`floor(2.5)`).
- скорость 1 или 0.8, не 0.64 при двух провалах: функция от булева флага.
- двуручное возвращает оба слота. Занятый off_hand → ошибка.
- прочность 0 не надевается.

## Definition of done

Константы грейдов экспортированы и совпадают с таблицей, включая коэффициенты цены.

## Зона правок

`packages/domain/src/items.ts` и тест.
