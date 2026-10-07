# WebSocket-шлюз

- id: `043`
- title: WebSocket-шлюз
- status: `pending`
- depends_on: `003`, `031`, `042`

## Цель

Принять JSON-конверт, проверить JWT и HMAC, отсечь дубликат и stale, отдать команду в очередь. Без живого сокета в тестах.

## Контекст

Артефакт 23. Каналы из пакета protocol. Подпись HMAC-SHA256 от `canonicalCommand`, ключ sessionKey hex-байты. Окно stale 5000 мс. Rate limit 30 команд за 1000 мс.

Сокет не поднимать в юнит-тесте. Функция `handleMessage(raw, ctx)` возвращает `ServerMessage | RejectedCommand`.

Рассылка состояния — функция `broadcastState(tick, payload)` собирает объект, не пишет в сеть. Адаптер `ws` в `attach(server)` допустим, но тест его не слушает.

Реконнект: тот же refresh не здесь. `resume(sessionId)` возвращает последние 50 сообщений из кольцевого буфера памяти. Если сессии нет → `session`.

## Решение противоречий

TLS на сокете не эмулировать. Комментарий в `attach`: TLS терминирует внешний прокси, в стартовом коде сокет без TLS на localhost. Это не отменяет требование продакшена, просто не входит в старт.

## Файлы

- `apps/server/src/infra/ws/gateway.ts`
- `apps/server/src/infra/ws/gateway.test.ts`
- `apps/server/src/infra/ws/hmac.ts`

## Интерфейсы

```ts
export function signCommand(command: ClientCommand, sessionKeyHex: string): string;
export function handleMessage(raw: string, ctx: GatewayCtx): { ok: true; command: ClientCommand } | { ok: false; reject: RejectedCommand };
```

`GatewayCtx`: nowMs, verifyAccess, sessionKey по accountId, seen set, rate timestamps, enqueue.

## Алгоритм

- Не-JSON → reject `invalid`.
- Подпись не совпала → `bad_signature`, очередь не растёт.
- Повтор commandId → `duplicate`.
- issuedAt старше 5000 мс или новее now+2000 мс → `stale`.
- 31-я команда за секунду → `rate_limited`.
- Иначе enqueue и remember.

## Тесты

- подпись, посчитанная `signCommand`, принимается.
- изменённый seq ломает подпись.
- дубликат, stale, 31-я команда.
- битый JSON → invalid.
- буфер resume отдаёт записанные state-сообщения в порядке, 51-е вытесняет первое.

## Definition of done

Тест не делает `listen`. Импорт `ws` только внутри `attach`, чтобы тест gateway не открывал порт. Если импорт мешает, вынести attach в `attach.ts` и не импортировать его из теста.

## Зона правок

`apps/server/src/infra/ws/**`.
