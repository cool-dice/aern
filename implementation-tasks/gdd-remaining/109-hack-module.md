# 109. Модуль взлома Хранителя

status: pending

## Правило GDD

Артефакт 19 и домен `hack.ts`. Нужна колода (`hasDeck`). Пароль — 4 символа из `ABCDEFGH`. Три попытки. Локаут `LOCKOUT_MS` (6000 тиков × 100 мс). Сложность `hackDifficulty(kind, technique)`. Без колоды взлом не стартует.

## Файлы

- `apps/server/src/modules/hack/**`
- регистрация в `compose.ts`

## Приёмка

- `start` без колоды → `deck`.
- `start` возвращает попытки 3 и не отдаёт пароль клиенту.
- Верный пароль → `opened`. Третья ошибка → `lockout` до `now + LOCKOUT_MS`.
- Пока локаут не истёк, новый `start` → `lockout`.

## Тесты

`pnpm --filter @rift/server test` — `modules/hack/service.test.ts`. Детерминированный `Rng`.
