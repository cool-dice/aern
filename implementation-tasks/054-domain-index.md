# Публичный barrel домена

- id: `054`
- title: Публичный barrel домена
- status: `done`
- depends_on: `004`, `005`, `006`, `007`, `008`, `009`, `010`, `011`, `012`, `013`, `014`, `015`, `016`, `017`, `018`, `019`, `020`, `021`, `022`, `023`, `024`, `025`, `026`, `027`, `028`

## Цель

Собрать единственный вход `@rift/domain`, чтобы сервер и клиент импортировали формулы из одного модуля.

## Контекст

Задача `001` оставила `export {}`. Модули домена нарочно не правили barrel, чтобы не конфликтовать.

## Решение противоречий

Нет. Реэкспорт не меняет сигнатуры.

## Файлы

Только `packages/domain/src/index.ts`.

## Интерфейсы

Реэкспортировать все публичные функции и типы из:

`result`, `ids`, `rng`, `time`, `stats`, `character`, `language`, `items`, `relics`, `build`, `combat`, `status`, `movement`, `death`, `progression`, `craft`, `loot`, `gathering`, `economy`, `quests`, `dungeon`, `world`, `social`, `wiki`, `guild`, `hack`, `events`, `ai`, `moderation`, `ancient`.

Не реэкспортировать тестовые хелперы. Если имена `clamp` столкнутся, оставить префиксы как в модулях; коллизий в задачах нет. Если обнаружена коллизия `side` или `ok`, не переименовывать модули: экспортировать конфликт через `export { x as y }` и описать алиас в коммите. Ожидаемых коллизий нет.

## Алгоритм

Файл состоит только из export-from. Добавить тест `index.test.ts`, который импортирует `derive`, `ACTION_IDS`, `prototypeWorld`, `seasonAt` и проверяет: `ACTION_IDS.length === 64`, `prototypeWorld().nodes.length >= 10`, `derive` на базе всех статов 5 и уровне 1 даёт hp 55.

## Тесты

Один импортный тест выше. Прогон всего пакета domain остаётся зелёным.

## Definition of done

`import { derive } from '@rift/domain'` резолвится. Другие файлы пакета этой задачей не меняются.

## Зона правок

`packages/domain/src/index.ts` и `packages/domain/src/index.test.ts`.
