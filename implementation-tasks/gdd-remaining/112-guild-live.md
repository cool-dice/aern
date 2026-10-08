# 112. Гильдия в живом режиме

status: done

## Правило GDD

Артефакт 17. Создание: 4 основателя, уровень ≥ 5, 10_000 золота. Война и снятие — правила `declareWar` и `withdraw`. Обзор больше не оставляет сервис в `mode: 'stub'`. `compose` создаёт модуль с `mode: 'live'`.

## Файлы

- `apps/server/src/compose.ts`
- `apps/server/src/compose.test.ts` — ожидание `feature_stub` заменяется проверкой доменного отказа и успешной записи
- золотой порт списывает `GUILD_CREATE_GOLD`

## Приёмка

- `create` с валидными четырьмя членами пишет гильдию в репозиторий и списывает золото.
- Пустой ввод — код домена (`member` или иной отказ `createGuild`), не `feature_stub`.
- `declareWar` и `withdraw` в собранном сервере ходят в репозиторий.

## Тесты

`pnpm --filter @rift/server test`. Формулы `guild.ts` не менять.
