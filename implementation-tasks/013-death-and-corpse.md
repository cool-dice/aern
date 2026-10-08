# Смерть, труп и привязка

- id: `013`
- title: Смерть, труп и привязка
- status: `done`
- depends_on: `002`, `007`, `010`

## Цель

Перевести персонажа в состояние «тяжёлый», снять лут на труп, поднять союзником или отправить на привязку.

## Контекст

Артефакты 5, 7, 11 и схема состояний артефакта 28.

При HP ≤ 0 персонаж `downed`: не атакует, ползёт (задача `012`). На труп копируется всё надетое и весь инвентарь, кроме предметов с `questItem: true` — они остаются на трупе, но подобрать их может только владелец квеста. Личное хранилище, опыт, уровни, титулы, пути и знания не падают.

Труп живёт 2 реальных часа (`7_200_000` мс) по часам мира, не по онлайну жертвы. После этого лут пропадает.

Подъём «споровым шокером» (`spore_shocker`): расходник или навык. Если труп ещё не обыскан до пустого инвентаря, лут возвращается. Если хотя бы один неквестовый предмет уже забрали, подъём всё равно оживляет, но недостающие вещи не восстанавливаются. HP после подъёма: 30% max HP, округление вниз, минимум 1. Состояние `online`.

Если не подняли до исчезновения трупа — возрождение на `bindNodeId` с пустым инвентарём и пустыми слотами, HP = max HP, ОД = лимит. Прочность надетого, которое осталось на трупе, уже не на персонаже.

Смерть снимает 10 прочности с каждой вещи, которая была надета в момент падения, до перемещения на труп. Это вызывает `wearFor('death')` из задачи 007. Вещи в сумке не теряют прочность от смерти.

Бот, чей носитель офлайн, в эту функцию не передаётся: он исчезает без трупа. Если бот умер, пока носитель онлайн, труп обычный.

Грейс выхода игрока не часть этой функции. Константа `LOGOUT_GRACE_MS = 600_000` экспортируется для задачи `033`. В бою грейс не даётся — флаг решит симулятор.

Опыт при смерти не снимается. Функция не трогает progression.

## Решение противоречий

«N часов» из v1 равно 2 часам артефактов 5 и 7. Квестовые предметы на трупе видны только владельцу (артефакт 15).

## Файлы

- `packages/domain/src/death.ts`
- `packages/domain/src/death.test.ts`

## Интерфейсы

```ts
export const CORPSE_MS = 7_200_000;
export const LOGOUT_GRACE_MS = 600_000;
export const REVIVE_HP_RATIO = 0.3;

export interface LootStack {
  itemId: string;
  questItem: boolean;
  questOwnerId?: string;
  durability: number;
  equipped: boolean;
}

export interface Corpse {
  victimId: string;
  createdAtMs: number;
  stacks: LootStack[];
  looted: boolean;
}

export interface LifeState {
  phase: 'online' | 'downed' | 'dead';
  hp: number;
  bindNodeId: string;
  inventory: LootStack[];
}

export function fallDown(input: {
  life: LifeState;
  nowMs: number;
  maxHp: number;
}): { life: LifeState; corpse: Corpse };

export function takeFromCorpse(corpse: Corpse, itemId: string, looterId: string, nowMs: number):
  Result<{ corpse: Corpse; stack: LootStack }, 'missing' | 'quest' | 'expired'>;

export function revive(corpse: Corpse, maxHp: number, nowMs: number):
  Result<{ life: LifeState; inventory: LootStack[] }, 'expired'>;

export function respawnAtBind(life: LifeState, maxHp: number, odLimit: number):
  { life: LifeState; od: number };
```

## Алгоритм

- `fallDown` требует hp ≤ 0 вызывающим; если hp > 0, бросить `RangeError`. Фаза становится `downed`. Инвентарь персонажа пустеет. На трупе копии стеков. Надетые стеки получают −10 прочности, не ниже 0.
- `looted` становится true, когда снят первый неквестовый предмет.
- Чужой `questItem` → `quest`. Свой квестовый снимается и не ставит `looted`.
- `now >= created + CORPSE_MS` → `expired`.
- `revive` ставит phase `online`, hp = `max(1, floor(maxHp * 0.3))`, инвентарь — оставшиеся стеки трупа, труп в результате не возвращается (вызывающий удаляет). Если срок вышел — ошибка, жизнь не меняется; вызывающий тогда делает `respawnAtBind`.
- `respawnAtBind` ставит phase `online`, hp = maxHp, inventory пуст, od = odLimit.

## Тесты

- падение переносит два предмета, надетый 100 → 90, сумочный 40 остаётся 40. Инвентарь жертвы пуст, фаза `downed`.
- чужой не берёт квестовый предмет. Владелец берёт.
- первый обычный предмет ставит `looted`.
- подъём до лута возвращает оба предмета и HP 30 при max 100. При max 10 → HP 3.
- после `CORPSE_MS` взять и поднять нельзя.
- respawn чистит инвентарь и ставит полный HP.
- прочность 5 у надетого становится 0, предмет остаётся стеком с прочностью 0 (уничтожение нулевых решает инвентарь отдельной чисткой; здесь не удалять).

## Definition of done

Функции не мутируют вход.

## Зона правок

`packages/domain/src/death.ts` и тест.
