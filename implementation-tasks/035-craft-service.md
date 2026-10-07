# Сервис крафта

- id: `035`
- title: Сервис крафта
- status: `pending`
- depends_on: `030`, `015`, `029`

## Цель

Принять заказ крафта в городе, используя доменную `startCraft` и каталог рецептов.

## Контекст

Крафт только в городе или хабе, не в бою. Прототипные рецепты те, у которых `prototype: true`, плюс любые, если флаг сервиса `fullRecipes: false` по умолчанию в прототипе. При `fullRecipes: false` рецепт без флага → `not_in_prototype`. Домен при этом умеет всё; фильтр в сервисе.

Ускорение вызывается один раз. Готово, когда `now >= readyAt`. `complete` создаёт предмет в инвентаре через порт `ItemSink`, не импортируя модуль inventory.

Событие `item.crafted`.

## Решение противоречий

Восемь рецептов — фильтр сервиса, не домена.

## Файлы

`apps/server/src/modules/craft/**` и тест.

## Интерфейсы

```ts
export interface CraftService {
  start(input: { characterId: string; recipeId: string; itemLevel: number; accelerate: boolean; nowMs: number }): Promise<Result<{ readyAtMs: number }, string>>;
  complete(characterId: string, jobId: string, nowMs: number): Promise<Result<{ itemId: string }, 'early'>>;
}
```

## Алгоритм

- Персонаж не в `city|hub` → `zone`.
- Материалы списывает порт `MaterialBank`. Нехватка → `materials`, банк не меняется (порт обязан быть атомарным; в тесте память).
- complete раньше срока → `early`, предмет не создан.

## Тесты

- прототипный `rusty_sword` стартует в форте.
- непрототипный `rift_blade` при fullRecipes false → `not_in_prototype`.
- ускорение уменьшает readyAt ровно вдвое относительно не ускоренного (два прогона с одним rng seed).
- complete рано отказывает. complete вовремя кладёт один предмет в sink.
- событие шины одно.

## Definition of done

Нет импорта `modules/inventory`.

## Зона правок

`apps/server/src/modules/craft/**`.
