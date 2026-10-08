# 108. Модуль добычи

status: done

## Правило GDD

Артефакт 12. Добыча идёт через `rollGather`, время через `gatherSeconds`, респавн узла через `advanceRespawn` и `respawnDurationMs`. Инструмент теряет прочность `wearTool`. Сервер не импортирует репозиторий чужого модуля: свой `modules/gathering`.

## Файлы

- `apps/server/src/modules/gathering/**`
- регистрация в `apps/server/src/compose.ts`

## Приёмка

- `gather` на живом узле возвращает стаки домена и ставит респавн.
- Повтор до респавна — отказ `respawn`.
- Успех публикует событие шины `gather.completed` с `characterId` и `nodeId`, чтобы квест мог сдвинуться.

## Тесты

`pnpm --filter @rift/server test` — `modules/gathering/service.test.ts`.
