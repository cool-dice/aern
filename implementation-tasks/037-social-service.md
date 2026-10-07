# Сервис чата и группы

- id: `037`
- title: Сервис чата и группы
- status: `pending`
- depends_on: `030`, `022`, `027`

## Цель

Доставить локальный и групповой чат, собрать группу до 4. Почта и титулы возвращают `feature_stub`.

## Контекст

Артефакт 30: локальный чат, групповой чат, группа до 4 — полностью. Почта и титулы — заглушки. УПЯ через `deliverChat`. Мьют через `classifyMessage` до доставки: если санкция не `none`, сообщение не доставляется, санкция пишется на персонажа.

Событие `chat.message` для каждого получателя не плодить: одно событие на принятое сообщение.

## Решение противоречий

Обзор, пункт 16 и 21.

## Файлы

`apps/server/src/modules/social/**` и тест.

## Интерфейсы

```ts
export interface SocialService {
  say(input: { senderId: string; channel: 'local' | 'party' | 'guild' | 'trade' | 'mail'; text: string; nowMs: number }): Promise<Result<{ delivered: number }, string>>;
  invite(partyLeaderId: string, targetId: string, role: string): Promise<Result<void, string>>;
  grantTitle(): Result<never, 'feature_stub'>;
}
```

Канал mail → `feature_stub` без записи. Guild-канал в прототипе тоже `feature_stub`, потому что гильдии заглушены: даже технический канал некуда писать. Зафиксировать это. Локальный и party работают.

## Алгоритм

- Получатели local — персонажи с тем же `nodeId`, кроме отправителя, плюс отправитель видит свой текст.
- party — члены группы.
- Текст прогоняется для каждого слушателя отдельно (разный УПЯ).
- Группа 5-й → `full`.

## Тесты

- два персонажа в одном узле, УПЯ слушателя 0, язык отправителя другой: слушатель получает mode raw, текст исходный.
- party доставляет при УПЯ 0 без порчи (сравнить строку).
- mail → feature_stub.
- спам пятым одинаковым не увеличивает delivered.
- invite до 4 успешен, пятый нет.

## Definition of done

Нет модульного импорта guild.

## Зона правок

`apps/server/src/modules/social/**`.
