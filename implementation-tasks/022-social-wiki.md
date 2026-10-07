# Чат, группа, вики и репутация NPC

- id: `022`
- title: Чат, группа, вики и репутация NPC
- status: `pending`
- depends_on: `002`, `006`

## Цель

Правила группы до 4, доставки чата с УПЯ, голоса вики и личной репутации NPC.

## Контекст

Артефакты 3, 15, 16.

Каналы: `local`, `party`, `guild`, `trade`, `system`, `mail`.

УПЯ нужен local, trade, mail. Party и guild и system — без УПЯ (`bypass`).

Группа: максимум 4, лидер — создатель. Роли `tank`, `damage`, `support`, `flex`. Автоподбор: кандидаты с уровнем в пределах ±5 и свободной ролью, которую запросили; если роль не важна, любой. Функция выбирает до заполнения группы детерминированно по порядку списка, не случайно.

Опыт группы делится снаружи (`splitXp`). Здесь только членство.

Репутация NPC 0..100.

| Событие | Δ |
|---|---|
| Квест сдан | +5 |
| Квест провален | −2 |
| Атака NPC | −10 |
| Подарок | +3 |

Пороги доступа: 0–20 нет квестов, 21–40 базовые, 41–60 все и скидка 5%, 61–80 скидка 10% и редкие, 81–100 скидка 15% и уникальные.

Вики: сторона `light` или `dark` или `primordial`. Primordial нельзя редактировать. Чужую сторону не читать и не писать. Голос +1 или −1, повторный голос заменяет прошлый. Рейтинг — сумма голосов. Бот пишет структурированную запись `{action, from, result, tags, confidence, author}` без проверки УПЯ. Человек пишет prose.

Почта как канал существует, но прототипный сервис её глушит. Домен проверяет длину тела 1..2000 и тему 0..80.

Мьют не здесь (задача 027): на вход флаг `muted`.

## Решение противоречий

Шесть каналов UI — это пять игровых плюс почта. Системный канал не принимает текст игрока.

## Файлы

- `packages/domain/src/social.ts`
- `packages/domain/src/wiki.ts`
- тесты обоих

## Интерфейсы

```ts
export type ChatChannel = 'local' | 'party' | 'guild' | 'trade' | 'system' | 'mail';
export function deliverChat(input: {
  channel: ChatChannel;
  text: string;
  language: LanguageId;
  listenerUpy: number;
  translated: string;
  sameLocation: boolean;
  sameParty: boolean;
  sameGuild: boolean;
  muted: boolean;
  rng: Rng;
}): Result<{ text: string; mode: string }, 'muted' | 'empty' | 'system' | 'scope'>;

export interface Party { leaderId: string; members: { id: string; role: 'tank' | 'damage' | 'support' | 'flex' }[] }
export function invite(party: Party, id: string, role: Party['members'][number]['role']): Result<Party, 'full' | 'duplicate'>;
export function leave(party: Party, id: string): Party | null;
export function matchmake(candidates: { id: string; level: number; role: Party['members'][number]['role'] }[], wantLevel: number, wantRole: Party['members'][number]['role'] | null, seats: number): string[];

export function bumpReputation(value: number, event: 'quest' | 'fail' | 'attack' | 'gift'): number;
export function reputationTier(value: number): { quests: 'none' | 'basic' | 'all' | 'rare' | 'unique'; discount: number };

export function vote(articleSide: 'light' | 'dark' | 'primordial', readerSide: 'light' | 'dark', previous: number | null, value: 1 | -1):
  Result<{ ratingDelta: number; vote: 1 | -1 }, 'side' | 'sealed'>;
```

## Алгоритм

- local требует `sameLocation`, иначе `scope`. Party — sameParty. Guild — sameGuild. Trade — sameLocation (город или хаб решает вызывающий, передавая sameLocation). Mail не проверяет локацию.
- Текст пустой или длиннее 500 для чата → `empty`. Почта использует отдельную проверку длины в `sendMail` в том же файле: тема до 80, тело 1..2000.
- `leave` лидера передаёт лидерство первому оставшемуся. Пустая группа → null.
- Репутация clamp 0..100.
- Голос: если previous null, delta = value. Если был +1 и стал −1, delta = −2.

## Тесты

- local при УПЯ 0 возвращает исходный текст mode raw.
- party при УПЯ 0 не искажает (bypass): mode `raw` без garble даже для букв. Реализовать bypass как возврат исходного текста без вызова garble.
- system от игрока → `system`.
- пятый участник → `full`.
- matchmake уровня 10 берёт 8 и 14, не берёт 16, уважает роль, стабильный порядок.
- репутация 20 + квест = 25, тир basic, скидка 0. 41 → discount 0.05. 100 + квест остаётся 100. Атака с 0 остаётся 0.
- вики primordial → `sealed`. Чужая сторона → `side`. Смена голоса с 1 на −1 даёт delta −2.

## Definition of done

Два файла не импортируют сервер.

## Зона правок

`packages/domain/src/social.ts`, `wiki.ts` и их тесты.
