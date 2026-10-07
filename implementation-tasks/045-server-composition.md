# Сборка сервера и точка входа

- id: `045`
- title: Сборка сервера и точка входа
- status: `pending`
- depends_on: `031`, `032`, `033`, `034`, `035`, `036`, `037`, `038`, `039`, `040`, `041`, `043`, `044`

## Цель

Собрать модули в одном процессе Fastify и поднять тик. HTTP: `/health` и `/metrics` без внешней Prometheus.

## Контекст

Артефакт 24, модульный монолит. Композиция — единственное место, где модули создаются вместе. Они по-прежнему не импортируют друг друга: только `compose.ts` знает все фабрики.

Флаги прототипа: auction, mail, guild, titles — stub. bcrypt cost 12 в этой сборке (`PRODUCTION_BCRYPT_COST`). Каталог грузится через `loadCatalog` от пути `RIFT_CONTENT` или дефолт `packages/content/data`.

`/health` → `{ ok: true, tick }`. `/metrics` → текст Prometheus: `rift_tick_total`, `rift_commands_rejected_total`, `rift_online_players`, `rift_online_bots`. Рендер чистой функцией `renderMetrics(snapshot): string`.

Тик: `setInterval(100)` только в `main.ts`. В тесте вызывать `app.tickOnce()`.

Порт из `PORT` или 8080. Тест не слушает: `buildApp()` возвращает Fastify без `listen`, инъекции через `app.inject`.

## Решение противоречий

Метрики — формат текста, не сервер Grafana. Это код, не инфраструктура.

## Файлы

- `apps/server/src/compose.ts`
- `apps/server/src/metrics.ts`
- `apps/server/src/main.ts`
- `apps/server/src/compose.test.ts`

`main.ts` только парсит env и вызывает `listen`. Вся сборка в `compose.ts`, чтобы тест не слушал порт.

## Интерфейсы

```ts
export function buildApp(options?: { nowMs?: number; catalog?: Catalog }): Promise<{
  app: FastifyInstance;
  tickOnce: () => void;
  close: () => Promise<void>;
}>;
export function renderMetrics(s: { ticks: number; rejected: number; players: number; bots: number }): string;
```

## Алгоритм

- Регистрация модулей в порядке: auth, character, inventory, world, dungeon, craft, economy, social, guild stub, quest, event, ai, затем gateway и sim.
- `POST /auth/register` и `/auth/login` — тонкие обёртки сервиса.
- `POST /characters` создаёт человека.
- После create тик не обязателен для теста здоровья.
- Ошибка модуля при старте пробрасывается, сервер не поднимается наполовину: `buildApp` при исключении закрывает созданное.

## Тесты

- inject GET `/health` → 200 и ok true.
- renderMetrics содержит четыре имени метрик.
- register и login через inject, затем create character, list inventory содержит золото 100. Каталог передать фикстурой минимальной, если полный каталог тяжёл: опция catalog. Фикстура должна удовлетворять стартовый набор id `rusty_sword` и `leather_jacket`.
- listAuction через сервис, добытый из замыкания, или через `POST /auction` → 409 и код `feature_stub`.
- bcrypt: экспорт константы 12, тест `expect(PRODUCTION_BCRYPT_COST).toBe(12)`.
- два tickOnce увеличивают счётчик метрики на 2.

## Definition of done

`pnpm --filter @rift/server test` зелёный без Docker и без порта listen. `main.ts` не импортируется тестом.

## Зона правок

`apps/server/src/compose.ts`, `metrics.ts`, `main.ts`, `compose.test.ts`. Не переписывать внутренности модулей.
