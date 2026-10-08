# 114. Почта и титулы

status: done

## Правило GDD

Артефакт 16. Письмо: тема до 80, тело 1…2000 (`sendMail`). Канал `mail` доставляет адресату и пишется в хранилище. Канал `guild` доставляет согильдейцам в том же узле через `deliverChat` (гильдия обходит УПЯ). Титул уникален на персонажа: повтор — `duplicate`, неизвестный персонаж — `missing`. Титул сохраняется.

## Файлы

- `apps/server/src/modules/social/service.ts`
- `apps/server/src/modules/social/repository.ts`
- `apps/server/src/modules/social/types.ts`

## Приёмка

- `say` на `mail` с темой в `params` не отвечает `feature_stub`.
- Длинная тема → `subject`. Пустое тело → `body`.
- `grantTitle` второй раз с тем же id → `duplicate`, первая запись остаётся.
- Инбокс адресата содержит письмо.

## Тесты

`pnpm --filter @rift/server test` — обновить бывший тест заглушки, не удаляя проверки доставки локального и группового чата.
