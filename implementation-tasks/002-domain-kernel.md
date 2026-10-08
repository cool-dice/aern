# Время, ГПСЧ, идентификаторы и ошибки

- id: `002`
- title: Время, ГПСЧ, идентификаторы и ошибки
- status: `done`
- depends_on: `001`

## Цель

Дать всем доменным модулям одинаковые часы, детерминированный генератор и тип результата, чтобы формулы не вызывали `Math.random` и `Date.now`.

## Контекст

Артефакт 7: только реальное время, сервер на UTC, офлайн замораживает личные таймеры персонажа, игровые сутки = 2 реальных часа (1 час день, 1 час ночь), без влияния на механики. Артефакт 18: сид данжа детерминирован. Артефакт 25: UUID v4 для строк БД, `timestamptz` в UTC.

## Решение противоречий

Дизайн-«тик» в 1 секунду не кодируется как шаг симуляции. Здесь только перевод миллисекунд в секунды и косметический цикл дня. Шаг 100 мс появится в задаче `033`.

## Файлы

- `packages/domain/src/result.ts`
- `packages/domain/src/ids.ts`
- `packages/domain/src/rng.ts`
- `packages/domain/src/time.ts`
- тесты рядом: `result.test.ts`, `ids.test.ts`, `rng.test.ts`, `time.test.ts`
- не править `index.ts`

## Интерфейсы

```ts
export type Result<T, E extends string> =
  | { ok: true; value: T }
  | { ok: false; code: E };

export function ok<T>(value: T): Result<T, never>;
export function err<E extends string>(code: E): Result<never, E>;

export type EntityId = string; // UUID v4
export type CatalogId = string; // snake_case [a-z0-9_]{1,64}

export function createEntityId(rng: Rng): EntityId;
export function assertCatalogId(value: string): CatalogId;

export interface Rng {
  /** целое в диапазоне [0, maxExclusive) */
  nextInt(maxExclusive: number): number;
  /** [0, 1) */
  nextUnit(): number;
}

export function mulberry32(seed: number): Rng;
export function hashSeed(text: string): number;

export const SIM_TICK_MS = 100;
export const REAL_SECOND_MS = 1000;
export const GAME_DAY_MS = 2 * 60 * 60 * 1000;

export type DayPhase = 'day' | 'night';

export function dayPhase(nowMs: number): DayPhase;
export function addMs(startMs: number, durationMs: number): number;
export function elapsedMs(startMs: number, nowMs: number, frozenMs: number): number;
```

`frozenMs` — сколько миллисекунд персонаж был офлайн после `startMs`. Личный прогресс считает только онлайн-время: `max(0, nowMs - startMs - frozenMs)`.

## Алгоритм

- `mulberry32`: состояние uint32. Шаг: `t = state + 0x6D2B79F5`, затем стандартный mulberry32, вернуть `t >>> 0` / 2^32. `nextInt` отклоняет смещение через остаток от 2^32, пока значение не попало в полный набор корзин (rejection sampling), чтобы остаток не перекашивал шансы лута.
- `hashSeed`: FNV-1a 32-bit от UTF-8 строки.
- `createEntityId`: 16 байт из `nextInt(256)`, версия 4 и вариант RFC 4122.
- `dayPhase`: `Math.floor(nowMs / GAME_DAY_MS)` не нужен для фазы. Внутри суток `position = nowMs % GAME_DAY_MS`. Если `position < GAME_DAY_MS / 2` — `day`, иначе `night`. На механику урона не влияет.
- `assertCatalogId` возвращает ошибку не через Result, а бросает `Error` только если строка не проходит шаблон: это ошибка контента, не игровой отказ.

## Тесты

`packages/domain/src/rng.test.ts`

- один и тот же seed даёт одну и ту же последовательность из 5 `nextInt(100)`.
- разные seed расходятся на первом числе.
- `nextInt(1)` всегда 0.
- `nextInt(0)` и отрицательное бросают `RangeError`.
- 10_000 вызовов `nextInt(10)` дают каждую цифру хотя бы раз (детерминированный seed `1`).

`time.test.ts`

- `nowMs = 0` → `day`; `nowMs = GAME_DAY_MS / 2` → `night`; `nowMs = GAME_DAY_MS` → `day`.
- `elapsedMs(0, 10_000, 4_000)` === 6_000.
- `elapsedMs(0, 3_000, 9_000)` === 0.
- `SIM_TICK_MS` === 100.

`ids.test.ts`

- `createEntityId(mulberry32(1))` стабилен и матчит UUID v4.
- `assertCatalogId('rusty_sword')` возвращает ту же строку.
- `assertCatalogId('Ржавый')` бросает.

## Definition of done

Тесты пакета domain зелёные. Экспорты совпадают с сигнатурами выше. `Math.random` в новых файлах отсутствует.

## Зона правок

`packages/domain/src/{result,ids,rng,time}.ts` и их тесты.
