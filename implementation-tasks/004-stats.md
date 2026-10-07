# Статы и производные величины

- id: `004`
- title: Статы и производные величины
- status: `pending`
- depends_on: `002`

## Цель

Реализовать шесть базовых статов, капы и все производные формулы так, чтобы бой, крафт и инвентарь вызывали одни функции.

## Контекст

Источник формул: `docs/gdd.v2/Артефакт 1. Таблица статов и формул.md` и уточнение регена в `Артефакт 14. Прогрессия.md` (Реакция 13 → 3.6). Пример урона и ОД: артефакт 5.

База каждого стата 5. Стартовые очки распределения 20. Не больше 10 очков в один стат до расовых модификаторов. Расовый модификатор применяется после очков. Кап обычного персонажа 20, чистого 25, с временными бонусами 30. Максимальный уровень персонажа в формуле HP — до 50.

Формулы:

| Производная | Формула |
|---|---|
| HP | `body * 10 + level * 5` |
| Лимит ОД | `will` |
| Реген ОД в секунду | `1 + reaction / 5` (вещественное деление) |
| Штраф перегруза | `max(0, floor((totalWeightKg - carryKg) / 10))` |
| Переносимый вес | `body * 5 + 10` кг |
| Уклонение | `reaction + perception - overloadPenalty` |
| Точность | `accuracy + floor(perception / 2)` |
| Инициатива | `reaction` |
| Лимит НН | `will * 2` |
| Сопротивление | `will + floor(body / 2)` |
| Взлом | `technique + perception` |
| Крафт | `technique` |
| Ремонт | `technique` |
| Радиус обзора | `5 + floor(perception / 2)` клеток |
| Шаг | 1 клетка за 1 ОД; при Реакции ≥ 15 — 2 клетки; при ≥ 25 — 3 |
| Бег | 3 ОД на 4 клетки; при ≥ 15 — 6 клеток; при ≥ 25 — 8 |

Имена статов в коде: `body`, `reaction`, `accuracy`, `will`, `perception`, `technique`. Русские имена только в каталоге локализации.

## Решение противоречий

Смотри обзор, пункты 3, 4 и 7. Таблица билдов артефакта 1 не является спецификацией. Функция урона в этот модуль не входит: модификатор урона `1 + accuracy / 20` живёт в задаче `010`, но константа `damageMultiplier(accuracy)` экспортируется отсюда, чтобы не разойтись.

Вход в бой выставляет текущие ОД в 1 (артефакт 5). Вне боя ОД копятся до лимита и на движение не тратятся. Это состояние хранит симулятор; здесь только функции от статов.

## Файлы

- `packages/domain/src/stats.ts`
- `packages/domain/src/stats.test.ts`

## Интерфейсы

```ts
export const STAT_IDS = ['body', 'reaction', 'accuracy', 'will', 'perception', 'technique'] as const;
export type StatId = (typeof STAT_IDS)[number];
export type StatBlock = Record<StatId, number>;

export const STAT_BASE = 5;
export const CREATION_STAT_POINTS = 20;
export const MAX_POINTS_PER_STAT = 10;
export const CAP_NORMAL = 20;
export const CAP_CLEAN = 25;
export const CAP_TEMPORARY = 30;
export const MAX_LEVEL = 50;

export interface DerivedInput {
  stats: StatBlock;
  level: number;
  totalWeightKg: number;
}

export interface DerivedStats {
  hp: number;
  odLimit: number;
  odRegenPerSecond: number;
  carryKg: number;
  overloadPenalty: number;
  evasion: number;
  accuracyScore: number;
  initiative: number;
  nnLimit: number;
  effectResist: number;
  hack: number;
  craft: number;
  repair: number;
  visionRadius: number;
  cellsPerStep: number;
  cellsPerRun: number;
  runOdCost: 3;
}

export function emptyPoints(): StatBlock;
export function derive(input: DerivedInput): DerivedStats;
export function damageMultiplier(accuracyStat: number): number;
export function applyCap(value: number, clean: boolean, temporaryBonus: number): number;
export function cellsPerOd(reaction: number): number;
```

`applyCap`: `min(CAP_TEMPORARY, min(clean ? CAP_CLEAN : CAP_NORMAL, value) + temporaryBonus)` нет. Временный бонус прибавляется к уже ограниченному базовому итогу, затем весь результат ограничивается 30: `min(CAP_TEMPORARY, min(lifestyleCap, baseValue) + temporaryBonus)`. Отрицательный бонус допускается и может опустить стат ниже капа, но не проверяется на минимум 1 в этой функции. Минимум итогового стата после расы — без искусственного пола, дварф может иметь Реакцию 3 (пример артефакта 14).

`cellsPerOd`: `< 15 → 1`, `< 25 → 2`, иначе `3`. `cellsPerRun`: `< 15 → 4`, `< 25 → 6`, иначе `8`.

## Алгоритм

`derive` не проверяет кап: на вход приходят уже итоговые статы. Отрицательный вес трактуется как 0. `level` вне 1..50 — бросать `RangeError` (программная ошибка). `odRegenPerSecond` не округлять.

`damageMultiplier` = `1 + accuracyStat / 20`.

## Тесты

- человек не нужен: `body 10, level 1` → HP 105. `body 18, level 50` → HP 430 (пример чистого дварфа).
- `will 10` → odLimit 10, nnLimit 20. `will 16` → nn 32, od 16.
- `reaction 10` → regen 3. `reaction 13` → regen 3.6. `reaction 14` → 3.8. `reaction 15` → 4 и `cellsPerOd` 2. `reaction 25` → `cellsPerOd` 3, `cellsPerRun` 8, regen 6.
- `reaction 0` не встречается, но формула `1 + 0/5 = 1`.
- вес 40 при переносе 30 → штраф `floor(10/10) = 1`. Вес 39 при переносе 30 → штраф 0. Вес меньше переноса → 0.
- уклонение: reaction 10, perception 8, штраф 1 → 17.
- точность: accuracy 10, perception 7 → `10 + 3 = 13`.
- сопротивление: will 10, body 11 → `10 + 5 = 15`.
- обзор: perception 7 → `5 + 3 = 8`.
- `applyCap(22, false, 0)` → 20. `applyCap(22, true, 0)` → 22. `applyCap(25, true, 10)` → 30. `applyCap(18, false, 0)` → 18.
- `damageMultiplier(10)` === 1.5.
- `carryKg` для body 5 → 35, для body 10 → 60.

## Definition of done

Все числа тестов совпадают. Модуль не импортирует бой и предметы.

## Зона правок

`packages/domain/src/stats.ts` и тест.
