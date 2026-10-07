# Конверт протокола

- id: `003`
- title: Конверт протокола
- status: `pending`
- depends_on: `001`

## Цель

Зафиксировать JSON-контракт клиента, бота и сервера так, чтобы шлюз и сайдкар сериализовали одни и те же поля.

## Контекст

Артефакт 23: WebSocket, JSON, без бинарного формата. Каналы State, Command, Chat, Market, Social, System. Команды подписываются HMAC-SHA256 сессионным ключом. Артефакт 22, формат действия бота: `action`, `target`, `params`, `timestamp`. Лаг-компенсация хранит момент выстрела. Дубликаты команд отсекаются (критерий 77 артефакта 30).

## Решение противоречий

Поле `timestamp` в команде — миллисекунды UTC, число, не секунды. `action` — каталожный id из задачи `026`, не свободный русский текст.

## Файлы

- `packages/protocol/src/channels.ts`
- `packages/protocol/src/commands.ts`
- `packages/protocol/src/envelope.ts`
- `packages/protocol/src/index.ts` — этот пакет маленький, barrel создаётся здесь и больше никем не дополняется без правки этой задачи. Новые сообщения добавлять только сюда.
- тесты `envelope.test.ts`

Зависимость `@rift/domain` не подключать: протокол не знает формул. Идентификаторы — `string`.

## Интерфейсы

```ts
export const CHANNELS = ['state', 'command', 'chat', 'market', 'social', 'system'] as const;
export type Channel = (typeof CHANNELS)[number];

export interface ClientCommand {
  commandId: string; // UUID
  seq: number; // монотонный на сессию, с 1
  issuedAtMs: number;
  action: string;
  targetId?: string;
  params: Record<string, string | number | boolean | null>;
}

export interface SignedEnvelope {
  channel: 'command';
  command: ClientCommand;
  signature: string; // hex HMAC-SHA256
}

export interface ServerMessage {
  channel: Channel;
  serverTick: number;
  sentAtMs: number;
  payload: unknown;
}

export interface RejectedCommand {
  channel: 'system';
  commandId: string;
  code:
    | 'bad_signature'
    | 'duplicate'
    | 'stale'
    | 'rate_limited'
    | 'invalid'
    | 'feature_stub';
}

export function canonicalCommand(command: ClientCommand): string;
export function parseClientCommand(input: unknown): ClientCommand | null;
```

`canonicalCommand` — JSON с ключами в порядке `commandId`, `seq`, `issuedAtMs`, `action`, `targetId`, `params`. Ключи `params` сортируются лексикографически. Без пробелов. `targetId` опускается, если поля нет.

## Алгоритм

- `parseClientCommand` возвращает `null`, если нет `commandId`, `seq` не целое `>= 1`, `issuedAtMs` не число, `action` пустой или не `[a-z0-9_]{1,64}`, `params` не плоский объект скаляров.
- Подпись считает сервер и клиент одинаково: HMAC-SHA256 от UTF-8 `canonicalCommand`, ключ — сырые байты сессионного секрета. В этом пакете функции подписи нет, чтобы не тащить crypto-политику. Только каноническая строка. Подпись — в задаче `043`.
- Команда старше 5000 мс относительно сервера получает `stale` (решение этой задачи: окно шире лага 500 мс, чтобы реконнект не убивал клики, но не бесконечное).
- Лимит 30 команд за 1000 мс на сессию — константа `COMMAND_RATE_LIMIT = 30`, `COMMAND_RATE_WINDOW_MS = 1000`. Проверка живёт в шлюзе, константы экспортируются здесь.

## Тесты

- каноническая строка стабильна при другом порядке ключей во входном объекте.
- `params` `{b:1,a:2}` канонизируется как `"a"` раньше `"b"`.
- `parseClientCommand` отвергает вложенный объект в `params`, дробный `seq`, пустой `action`.
- принимает минимальную команду без `targetId`.

## Definition of done

`pnpm --filter @rift/protocol test` зелёный. Поля конверта не переименовываются последующими задачами.

## Зона правок

Только `packages/protocol/**`.
