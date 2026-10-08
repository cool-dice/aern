# Сервис гильдий-заглушка

- id: `038`
- title: Сервис гильдий-заглушка
- status: `done`
- depends_on: `030`, `023`

## Цель

Подключить правила гильдии к серверу и в режиме прототипа не сохранять мутации.

## Контекст

Артефакт 30: гильдии — заглушка. Домен задачи 023 полный. Сервис:

- `previewCreate(input)` вызывает домен и возвращает результат проверки, ничего не пишет. Так тест показывает, что 3 игрока дают `size`, а валидные 4 — `ok` в поле `preview`.
- `create`, `declareWar`, `withdraw` при `mode: 'stub'` возвращают `feature_stub` и не меняют репозиторий.
- Конструктор принимает `mode: 'stub' | 'live'`. Прототип ставит stub. В `live` сервис пишет в memory-репозиторий. Тесты покрывают оба режима, чтобы альфа включила флаг без новой логики.

## Решение противоречий

Обзор, пункт 16. Live-путь не считается выходом за прототип: он выключен флагом.

## Файлы

`apps/server/src/modules/guild/**` и тест.

## Интерфейсы

```ts
export interface GuildService {
  previewCreate(members: { id: string; level: number }[], gold: number): Result<{ leaderReady: boolean }, string>;
  create(input: unknown): Result<never, 'feature_stub'> | Promise<Result<{ guildId: string }, string>>;
}
```

Упростить: оба метода async. В stub `create` всегда `{ok:false, code:'feature_stub'}`.

## Алгоритм

- preview не смотрит на mode.
- live create списывает 10_000 у инициатора через порт `GoldPort` и сохраняет гильдию.
- stub create не вызывает GoldPort. Тест ставит счётчик вызовов 0.

## Тесты

- preview 3 членов → size.
- stub create не трогает золото.
- live create с 4 членами уровня 5 и 10_000 золота пишет гильдию и списывает золото.
- live declareWar без 50_000 → gold, войны нет.

## Definition of done

По умолчанию фабрика `createGuildModule({ mode: 'stub' })`.

## Зона правок

`apps/server/src/modules/guild/**`.
