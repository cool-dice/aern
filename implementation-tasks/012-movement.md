# Движение по сетке

- id: `012`
- title: Движение по сетке
- status: `done`
- depends_on: `002`, `004`

## Цель

Посчитать шаг и бег по восьми направлениям, цену в ОД внутри боя и бесплатное движение снаружи, включая перегруз и покалеченные ноги.

## Контекст

Артефакты 5 и 27. WASD — шаг в сторону взгляда. Клик по клетке — путь. Восемь направлений, соседство Чебышёва. Вне боя ОД не тратятся. В бою шаг стоит 1 ОД и проходит `cellsPerOd(reaction)` клеток, бег стоит 3 ОД и проходит `cellsPerRun`. Перегруз запрещает бег (артефакт 12). Одна нога на 0 HP: пройденные клетки ×0.5, округление вниз, минимум 1, если базовая дистанция была ≥ 1 и множитель не ноль от двух ног. Обе ноги на 0: шаг недоступен.

Побег из боя: дистанция Чебышёва до каждого врага ≥ 10 и выход из круга радиуса 15 от точки начала боя. Функция только проверяет условие, не двигает сама.

Тяжёлый персонаж ползёт на 1 клетку за 3 секунды и не бежит. Это флаг `downed`.

## Решение противоречий

Клик и WASD используют одну функцию пути. Клиент предсказывает те же числа (задача `047`).

## Файлы

- `packages/domain/src/movement.ts`
- `packages/domain/src/movement.test.ts`

## Интерфейсы

```ts
export interface Cell { x: number; y: number }
export type Dir = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

export function step(from: Cell, dir: Dir): Cell;
export function chebyshev(a: Cell, b: Cell): number;
export function cellsFor(input: {
  reaction: number;
  running: boolean;
  overloaded: boolean;
  legsDestroyed: 0 | 1 | 2;
  downed: boolean;
}): number;

export type MoveError = 'od' | 'blocked' | 'legs' | 'overload_run' | 'downed';

export function move(input: {
  from: Cell;
  dir: Dir;
  inCombat: boolean;
  od: number;
  reaction: number;
  running: boolean;
  overloaded: boolean;
  legsDestroyed: 0 | 1 | 2;
  downed: boolean;
  blocked: (cell: Cell) => boolean;
}): Result<{ cell: Cell; od: number; cells: number }, MoveError>;

export function shortestPath(from: Cell, to: Cell, blocked: (cell: Cell) => boolean, limit: number): Cell[] | null;

export function escaped(input: {
  origin: Cell;
  position: Cell;
  enemies: Cell[];
}): boolean;
```

## Алгоритм

- `cellsFor`: база из `cellsPerOd` или `cellsPerRun`. Бег при перегрузе не вызывается: `move` вернёт `overload_run` до расчёта. Обе ноги → `legs` для обычного шага. Одна нога: `Math.max(1, Math.floor(base * 0.5))`. Downed: всегда 1 клетка и `running` запрещён (`downed`).
- В бою стоимость 1 или 3. Не хватает ОД → `od`, позиция прежняя. Вне боя стоимость 0, даже если ОД 0.
- Идти клетка за клеткой. Если следующая занята `blocked`, остановиться на последней свободной. Если не пройдена ни одна — `blocked`. ОД списывается целиком, если пройдена хотя бы одна клетка. Если бег упёрся в стену на середине, ОД всё равно 3: действие совершено.
- `shortestPath` — BFS по 8 соседям, не длиннее `limit` узлов. `null`, если пути нет. Не ходит через blocked. Первый элемент — старт, последний — цель.
- `escaped`: каждый враг на расстоянии ≥ 10 и `chebyshev(origin, position) > 15`.

## Тесты

- реакция 10, шаг на север: y уменьшается на 1, в бою ОД −1. Принять соглашение: север уменьшает y. Зафиксировать в тесте.
- реакция 15, шаг: 2 клетки за 1 ОД.
- реакция 25, бег: 8 клеток, ОД −3.
- вне боя ОД не меняется.
- перегруз и бег → ошибка, ОД целы.
- две ноги уничтожены → `legs`.
- одна нога и реакция 10: 1 клетка (`max(1, floor(0.5))`). Реакция 15: `floor(1.0)` = 1.
- стена на второй клетке длинного шага оставляет персонажа на первой, ОД списано.
- BFS обходит препятствие и детерминирован (при равенстве длины предпочитать направление в порядке n, ne, e, se, s, sw, w, nw).
- побег: враг на 10, сам на 16 от origin → true. Враг на 9 → false. Сам на 15 → false, нужно строго больше 15.

## Definition of done

Поиск пути не использует случайность.

## Зона правок

`packages/domain/src/movement.ts` и тест.
