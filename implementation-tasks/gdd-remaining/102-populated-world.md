# 102. Тик содержит игрока и монстров

status: done

## Правило GDD

Артефакт 30 и бестиарий: вход в мир ставит персонажа на сетку рядом с монстрами прототипа (`spore_rat`, `bandit`, `cyborg_dog`, `scout_drone`, `keeper_patrol`). Пустой `emptyWorld` не является игровым состоянием после входа. Обзор: полный хранитель 50 уровня в прототипной встрече не спавнится; шаблон остаётся в каталоге.

## Файлы

- `apps/server/src/sim/population.ts`
- `apps/server/src/sim/population.test.ts`
- `apps/server/src/compose.ts` — `enterWorld(characterId)` добавляет игрока и встречу

## Приёмка

- До входа снимок может быть пустым (никто не вошёл).
- После `enterWorld` в `simWorld.entities` есть игрок `phase: online` и пять прототипных монстров с `monsterId`.
- `tickOnce` двигает этого игрока по `step_*`.

## Тесты

`pnpm --filter @rift/server test` — `population.test.ts` и сценарий compose.
