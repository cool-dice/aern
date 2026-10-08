# 115. Репозитории Prisma

status: done

## Правило GDD

Артефакт 25. Колонки `side` у персонажа нет. Прогресс квеста — `quest_progress`. Членство — `guild_members`. Юнит-тесты не поднимают Docker. Боевой путь при `DATABASE_URL` пишет через сгенерированный клиент, а не бросает «unavailable until prisma generate».

Городская война в домене не имеет гильдии-защитника, а `guild_wars.defender_id` обязателен. Запись повторяет атакующую гильдию и кладёт город в `city_node_id`. Золото и ресурсы лежат в `status` как JSON.

## Файлы

- `apps/server/src/infra/db/prisma.ts`
- `apps/server/src/infra/db/prisma.test.ts` — двойник клиента в памяти
- `prisma generate` в `apps/server`

## Приёмка

- `createPrismaRepositories` вызывает методы Prisma `account`, `character`, `inventorySlot` / `item`, `questProgress`, `guildMember` (и остальные репозитории, которые сервисы реально зовут).
- Тест передаёт объект-двойник и проверяет `create`/`upsert` без сети.
- Пустой `DATABASE_URL` по-прежнему `NotConfiguredError` до выбора памяти в `compose`.

## Тесты

`pnpm --filter @rift/server test`. Не требовать живой Postgres.
