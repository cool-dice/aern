# Сервис квестов

- id: `039`
- title: Сервис квестов
- status: `done`
- depends_on: `030`, `019`, `029`

## Цель

Выдать пять прототипных квестов и туториал, двигать цели, сдавать награду.

## Контекст

Каталог квестов из задачи 029. Лимиты домена. Награда через порт `RewardSink` (золото и xp), не импорт character-модуля. Событие `quest.completed`.

Туториал story не занимает слот лимита.

Язык NPC стартового города — язык стороны, УПЯ 100 у своего языка, так что туториал не garbled.

## Решение противоречий

Нет второй таблицы прогресса.

## Файлы

`apps/server/src/modules/quest/**` и тест.

## Интерфейсы

```ts
export interface QuestService {
  accept(characterId: string, questId: string, nowMs: number): Promise<Result<void, string>>;
  report(characterId: string, questId: string, objectiveId: string, amount: number): Promise<void>;
  turnIn(characterId: string, questId: string): Promise<Result<{ gold: number; xp: number }, string>>;
}
```

## Алгоритм

- Неизвестный questId → `missing`.
- report по невзятому квесту ничего не создаёт.
- turnIn вызывает домен и sink один раз. Повтор → `inactive`.

## Тесты

- accept tutorial и kill_rats оба успешны.
- 20 обычных заполняют лимит, tutorial всё ещё берётся (если уже есть 20 — подготовить фикстуру).
- kill 5 крыс по report, turnIn normal уровня 1 → 100 золота и 100 xp (`50*2*1`).
- повтор turnIn → ошибка, sink вызван один раз.

## Definition of done

Сервис читает квесты из переданного массива, не из ФС. Тест собирает массив сам, без `loadCatalog`, чтобы не зависеть от пути. Допускается второй тест с loadCatalog, если content уже собран; не обязателен.

## Зона правок

`apps/server/src/modules/quest/**`.
