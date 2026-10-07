# Взлом Хранителя

- id: `024`
- title: Взлом Хранителя
- status: `pending`
- depends_on: `002`

## Цель

Мини-игра пароля 4×4: подсказка «символы на своих местах», три попытки, сложность от типа Хранителя и техники.

## Контекст

Артефакт 19. Сетка 4×4, алфавит из 8 символов `ABCDEFGH` (решение: в GDD алфавит не назван). Пароль — 4 символа, каждый выбирается rng, повторы разрешены. Попытка — строка длины 4 из алфавита.

Подсказка: число позиций, где символ совпал (как быки без коров). Совпавший символ не раскрывается.

Базовая сложность: patrol 10, guard 20, destroyer 30, unique 40. Итог `max(1, base - floor(technique / 2))`. Сложность не меняет длину, она нужна UI и боту как число. На механику попыток не влияет, кроме требования кибердека: без `hasDeck` взлом не начинается.

Успех: patrol молчит 60 с, guard 30, destroyer 15, unique 10. Провал после третьей неверной попытки: атака, дверь закрыта на 10 минут.

Три попытки на сессию взлома. Верный пароль на любой попытке — успех, сессия закрыта.

## Решение противоречий

Взлом не навык крафта. Кибердек — флаг ядра, не проверка имени ядра: любое внешнее или имплант-ядро с тегом `deck` передаётся как `hasDeck`.

## Файлы

- `packages/domain/src/hack.ts`
- `packages/domain/src/hack.test.ts`

## Интерфейсы

```ts
export type KeeperKind = 'patrol' | 'guard' | 'destroyer' | 'unique';
export function hackDifficulty(kind: KeeperKind, technique: number): number;
export function silenceMs(kind: KeeperKind): number;
export function newHack(kind: KeeperKind, rng: Rng): { password: string; attemptsLeft: 3 };
export function guess(password: string, attempt: string, attemptsLeft: number):
  Result<{ correct: boolean; bulls: number; attemptsLeft: number }, 'format' | 'exhausted'>;
export const LOCKOUT_MS = 600_000;
```

## Алгоритм

- Пароль ровно 4 символа. `newHack` вызывает `nextInt(8)` четыре раза.
- `bulls` — число индексов 0..3 с равенством символов.
- Неверная попытка уменьшает attemptsLeft. На нуле и неверном пароле `correct: false` и attemptsLeft 0, это не ошибка `exhausted`. Следующий вызов при attemptsLeft 0 → `exhausted`.
- Успех не уменьшает ниже нуля и ставит correct true, attemptsLeft не тратится дополнительно сверх этой попытки: 3→2 даже при успехе, чтобы лог видел расход. Зафиксировать: успех тоже тратит попытку.

## Тесты

- technique 0 patrol → 10. technique 10 patrol → 5. technique 100 unique → 1, не отрицательное.
- silence patrol 60_000 мс, unique 10_000.
- пароль `ABCD`, попытка `ABXX` → bulls 2, correct false.
- попытка `ABCD` → correct true.
- три промаха, четвёртый → `exhausted`.
- попытка длины 3 → `format`, попытки не уменьшаются.
- один seed → один пароль.

## Definition of done

Алфавит экспортирован `HACK_ALPHABET`.

## Зона правок

`packages/domain/src/hack.ts` и тест.
