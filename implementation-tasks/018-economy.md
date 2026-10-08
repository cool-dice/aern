# Экономика: цены, ремонт, аукцион, обмен

- id: `018`
- title: Экономика: цены, ремонт, аукцион, обмен
- status: `done`
- depends_on: `002`, `007`

## Цель

Чистые денежные формулы: NPC, ремонт, портал, аукцион, кошелёк, прямой обмен.

## Контекст

Артефакт 13.

Базовая цена = `itemLevel * coefficient(grade)`. Продажа NPC = 50% базы, пол вниз. Покупка = 150% базы, пол вверх (`ceil`). Уникальные предметы и уникальные компоненты NPC не покупает и не продаёт.

Ремонт = `base * 0.1 * (1 + wear / 100)`, где wear — процент потерянной прочности (`100 - durability`). Пример: база 200, износ 50 → 30. Округлить до целого золота вверх, минимум 1, если предмет повреждён. Целый предмет (durability 100) чинить нельзя (`intact`). Прочность 0 — `destroyed`.

Портал: 5 золота внутри стороны, кулдаун 5 минут; 10 золота между сторонами после падения барьера, кулдаун 10 минут. Городской сбор 1..5 добавляется. Враждебная гильдия блокирует (`blocked`). Непосещённый город нельзя выбрать.

Аукцион: налог продавца 5%. Продавец получает 95% цены сделки, пол вниз. Шаг ставки ≥ 5% от стартовой цены, пол вверх. Лот 24 часа. Лимит 5 активных лотов. Выкуп мгновенный по `buyout`. Ставка ниже текущей + шаг → отказ. В нейтральном городе налог исчезает (системный сток). В городе гильдии налог идёт гильдбанку — функция возвращает `taxSink: 'void' | 'guild'`.

Кошелёк личный максимум 1_000_000. Всё сверх при попытке положить теряется и возвращается как `overflow`. Гильдбанк 10_000_000 — в задаче гильдий, здесь константа `GUILD_BANK_CAP`.

Прямой обмен: комиссия 0. Обе стороны подтверждают. Предметы и золото списываются атомарно в результате структуры, не здесь с БД. Отказ, если золото или стек не сходится.

Стартовый капитал константы: 100 золота. Предметы выдаёт инвентарь.

Расширение хранилища: 1000 золота за 50 слотов, базовый лимит 200, потолок 1000 слотов (решение: 16 покупок максимум, в GDD потолка нет; зафиксировать 1000).

Очистка ресурсов золотом живёт в задаче 017.

## Решение противоречий

Аукцион в прототипе не вызывается сервисом (заглушка), но формулы обязательны и тестируются. Премиум-валюты нет.

## Файлы

- `packages/domain/src/economy.ts`
- `packages/domain/src/economy.test.ts`

## Интерфейсы

```ts
export const WALLET_CAP = 1_000_000;
export const GUILD_BANK_CAP = 10_000_000;
export const AUCTION_TAX = 0.05;
export const AUCTION_LOT_MS = 86_400_000;
export const AUCTION_LOT_LIMIT = 5;
export const STARTER_GOLD = 100;

export function basePrice(level: number, grade: GradeId): number;
export function sellToNpc(level: number, grade: GradeId, unique: boolean): Result<number, 'unique'>;
export function buyFromNpc(level: number, grade: GradeId, unique: boolean): Result<number, 'unique'>;
export function repairCost(level: number, grade: GradeId, durability: number): Result<number, 'intact' | 'destroyed'>;
export function deposit(wallet: number, amount: number): { wallet: number; overflow: number };
export function portalFee(input: {
  sameSide: boolean;
  barrierDown: boolean;
  cityFee: number;
  visited: boolean;
  hostile: boolean;
}): Result<{ gold: number; cooldownMs: number }, 'barrier' | 'unknown' | 'blocked' | 'fee'>;
export function placeBid(input: {
  startPrice: number;
  currentBid: number;
  bid: number;
  buyout: number | null;
}): Result<{ price: number; buyout: boolean }, 'step' | 'low'>;
export function sellerProceeds(price: number): { seller: number; tax: number };
export function trade(input: {
  aGold: number; bGold: number;
  aOfferGold: number; bOfferGold: number;
  aStacks: Record<string, number>; bStacks: Record<string, number>;
  aOffer: Record<string, number>; bOffer: Record<string, number>;
  aAccept: boolean; bAccept: boolean;
}): Result<{ aGold: number; bGold: number; aStacks: Record<string, number>; bStacks: Record<string, number> }, 'gold' | 'items' | 'accept'>;
export function materialGold(unitPrices: Record<string, number>, need: Record<string, number>): number;
```

`materialGold` — сумма `price * qty` для ускорения крафта.

## Алгоритм

- Пример epic 20 → база 200. Продажа 100. Покупка 300.
- repair пример 30.
- `cityFee` вне 0..5 → `fee`.
- Между сторонами при живом барьере → `barrier`.
- Ставка: минимум `ceil(current * 1.05)` если current > 0, иначе `startPrice`. Если bid ≥ buyout и buyout не null — выкуп по buyout, не по bid.
- Обмен без обоих accept → `accept`, состояния не менять.
- Стеки не уходят в минус.

## Тесты

- пример меча и ремонта.
- unique sell → ошибка.
- deposit 999_999 + 5 → wallet 1_000_000, overflow 4.
- портал своей стороны → 5 золота и 300_000 мс. Чужой стороны с барьером → ошибка. С падением барьера и сбором 3 → 13 золота и 600_000 мс.
- шаг от 100: ставка 104 → отказ, 105 → успех. Выкуп 200 при ставке 500 → цена 200.
- proceeds 100 → seller 95, tax 5. proceeds 10 → seller 9, tax 1 (floor).
- обмен 10 золота на стек при нехватке → `gold`, кошельки прежние.
- materialGold металла по 2 за 5 штук → 10.

## Definition of done

Все денежные результаты целые.

## Зона правок

`packages/domain/src/economy.ts` и тест.
