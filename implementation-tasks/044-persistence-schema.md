# Схема Prisma и адаптеры

- id: `044`
- title: Схема Prisma и адаптеры
- status: `pending`
- depends_on: `031`, `032`, `034`, `035`, `036`, `037`, `038`, `039`, `040`, `041`

## Цель

Описать PostgreSQL-схему по артефакту 25 и in-memory адаптеры, которыми тесты заменяют Prisma. Prisma-клиент в юнит-тестах не подключается.

## Контекст

Артефакт 25. UUID, timestamptz, золото `Int` в схеме вместо numeric, потому что домен хранит целое золото (решение обзора). Прочность `Decimal(5,2)` или `Int` сотых: выбрать `Int` «сантипроценты» 0..10000, чтобы не тащить Decimal в домен. В комментарии схемы указать перевод.

Не создавать таблицу `character_quests`. Прогресс только `quest_progress`.

`characters` без колонки side. Индекс по controller, account_id, guild_id, current_node.

`memories.embedding` — `Unsupported("vector(768)")` в Prisma. Индекс IVFFlat описать сырым SQL в `prisma/sql/ivfflat.sql`, не применять в тестах.

Партиции damage_log, chats, action_logs описать комментарием в SQL-файле `prisma/sql/partitions.sql` как месячные/дневные. В Prisma-моделях таблицы без партиций, чтобы клиент генерировался. Это сознательное упрощение старта.

Redis-ключи константами:

| Ключ | TTL сек |
|---|---|
| `session:{accountId}` | 86400 |
| `state:character:{id}` | 3600 |
| `state:node:{id}` | 3600 |
| `instance:{id}` | 600 |
| `lock:{resource}` | 30 |
| `cache:wiki:{id}` | 300 |
| `cache:auction:{city}` | 60 |

`online:characters` и `online:bots` — множества без TTL.

`docker-compose.yml` в корне: сервисы `postgres` (образ `pgvector/pgvector:pg16`) и `redis` (`redis:7-alpine`), порты 5432 и 6379, volume, без сервиса приложения. Файл `.env.example` с `DATABASE_URL` и `REDIS_URL`. Секреты не коммитить.

Репозитории модулей остаются интерфейсами. Эта задача добавляет `apps/server/src/infra/db/memory.ts`, который реализует все интерфейсы одной памятью для compose тестов, и `prisma.ts` с фабриками, которые бросают `not_configured`, если нет `DATABASE_URL`. Не вызывать Prisma в тестах.

## Решение противоречий

Обзор: Prisma, не Knex; character_quests не создавать; side не хранить. Партиции не блокируют старт.

## Файлы

- `apps/server/prisma/schema.prisma`
- `apps/server/prisma/sql/ivfflat.sql`
- `apps/server/prisma/sql/partitions.sql`
- `apps/server/src/infra/db/keys.ts`
- `apps/server/src/infra/db/memory.ts`
- `apps/server/src/infra/db/memory.test.ts`
- `docker-compose.yml`
- `.env.example`

## Интерфейсы

Схема содержит модели: Account, Character, CharacterStat, CharacterLanguage, CharacterSkill, CharacterTitle, CharacterReputationNpc, Quest, QuestProgress, CharacterJournal, ItemTemplate, Item, InventorySlot, Relic, RelicTemplate, EchoTemplate, Echo, PathTemplate, Path, CoreTemplate, Core, Region, Node, Edge, ResourceNode, GuildNodeControl, InstanceRecord, Combat, DamageLog, StatusEffect, Auction, Trade, GuildBank, Storage, Guild, GuildMember, GuildWar, GuildDiplomacy, ChatMessage, Mail, Contract, Report, Mute, Npc, Bot, Memory, KnowledgeNode, KnowledgeEdge, ActionLog, WikiArticle, WikiVersion, WikiVote, WorldEvent, Season, Weather, Side, Biome, Race, RaceStatModifier, RaceLanguage, Stat, Language, CraftSkill, TitleTemplate, ItemGrade, ItemType, ItemSubtype, DamageType, StatusTemplate, NodeType, EdgeType, ResourceType, EventTemplate, WeatherTemplate, Meta.

Имена Prisma-моделей PascalCase, `@@map` на snake_case таблицы из артефакта 25.

`MemoryWorld` реализует сохранение персонажа, сессии и инстанса так, чтобы тест create→get вернул то же имя.

## Алгоритм

- Генерацию клиента `prisma generate` выполнить при наличии сети у имплементатора. Тесты от этого не зависят: не импортировать `@prisma/client` из `memory.test.ts`.
- Если generate падает без сети, схема всё равно должна быть валидным prisma schema. Definition of done не требует живой БД.

## Тесты

- memory сохраняет персонажа и читает его.
- TTL сессии: manual clock, после 86400 секунд `getSession` пустой. Реализовать проверку TTL в memory-адаптере ключей, не в Redis.
- ключ instance равен `instance:{id}`.
- в schema.prisma нет модели CharacterQuest и нет поля side у Character. Тест читает файл схемы как текст и ищет отсутствие `model CharacterQuest` и отсутствие строки `side` в блоке model Character. Это файловый тест, он детерминирован.

## Definition of done

`docker compose up` не запускается в тестах. Схема покрывает список моделей.

## Зона правок

`apps/server/prisma/**`, `apps/server/src/infra/db/**`, `docker-compose.yml`, `.env.example`. Не править сервисы модулей, только если интерфейс репозитория не хватает метода: тогда добавить метод в интерфейс минимально. Предпочтительно не трогать модули, а адаптировать memory под уже объявленные методы. Если метода нет, тест memory проверяет только Character и Session, которые есть после 031 и 032.
