# 111. Установка реликтов и сборка отголосков, путей, ядер

status: pending

## Правило GDD

Артефакты 4 и 6, домен `relics.ts` и `build.ts`. Гнёзда 1/2/3/3. Установка зовёт `startInstall` / `advanceRelic`. Отголосок — `installEcho`, путь — `learnPath`, ядро — `equipCore`. Нейрошок не запрещает установку. Золото установки — `installGold`. Чистый персонаж не ставит био и отголоски (`clean` / `incompatible`).

## Файлы

- `apps/server/src/modules/build/**`
- регистрация в `compose.ts`

## Приёмка

- Установка споры в городе списывает 0 золота и завершается сразу (`installMs` 0) после `advanceRelic`.
- Культура требует 100 золота и 30 минут; без золота — `gold`.
- `installEcho` на перегрузе возвращает состояние с `neuroshock === true`.
- Бой блокирует установку (`combat`).

## Тесты

`pnpm --filter @rift/server test` — `modules/build/service.test.ts`.
