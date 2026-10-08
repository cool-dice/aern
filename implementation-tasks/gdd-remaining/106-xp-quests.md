# 106. Опыт и квесты от убийства, добычи, крафта и визита

status: done

## Правило GDD

Артефакты 14 и 15. Убийство даёт `monsterXp` и двигает цель `kill`. Добыча — `gather`. Крафт — `craft`. Вход в узел — `visit`. Награда сдачи — `questReward` / `turnIn`. Прогресс хранится как `QuestProgress`, не `character_quests`.

## Файлы

- `apps/server/src/sim/progress.ts`
- `apps/server/src/sim/progress.test.ts`
- вызовы из тика, модуля добычи и крафта

## Приёмка

- Убийство `spore_rat` увеличивает `current` цели kill и опыт через `grantXp`.
- Сбор, крафт и визит двигают свои kind и не трогают чужие цели.
- Лимит активных квестов остаётся 20. Контракт гильдии слот не занимает (домен).

## Тесты

`pnpm --filter @rift/server test` — `progress.test.ts`.
