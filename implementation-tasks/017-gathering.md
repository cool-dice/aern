# Добыча ресурсов

- id: `017`
- title: Добыча ресурсов
- status: `done`
- depends_on: `002`, `004`

## Цель

Посчитать время добычи, количество, качество, налог гильдии и респавн узла.

## Контекст

Артефакт 12. Время: `max(5, floor(baseSeconds / (1 + technique / 20) / toolMultiplier))` секунд. Без инструмента множитель 0.5, базовый 1, продвинутый 1.5 (нужна техника ≥ 6), мастерский 2 (техника ≥ 10). Неверный инструмент для узла считается как отсутствие инструмента.

Узлы и база секунд, респавн минут, количество min–max:

| Узел | Ресурс | сек | респавн мин | qty |
|---|---|---|---|---|
| `mine_metal` | metal | 30 | 30 | 3–5 |
| `mine_stone` | stone | 20 | 30 | 3–5 |
| `deep_mine` | titanium | 90 | 60 | 1–2 |
| `shaft_crystal` | crystals | 60 | 45 | 2–3 |
| `shaft_alloy` | alloys | 120 | 60 | 1–2 |
| `grove` | wood | 20 | 30 | 4–6 |
| `hunt_leather` | leather | 30 | 30 | 2–4 |
| `hunt_bone` | bone | 30 | 30 | 2–4 |
| `fungus` | spores | 45 | 45 | 3–5 |
| `bioreactor_amino` | amino | 60 | 60 | 2–3 |
| `bioreactor_matrix` | organic_matrix | 180 | 120 | 1–1 |
| `scrap_shard` | relic_shard | 90 | 60 | 1–2 |
| `scrap_cell` | energy_cell | 60 | 45 | 1–2 |
| `spring` | water | 15 | 20 | 5–10 |
| `dungeon_small` | задаёт узел | 10 | 15 | 1–2 |

Инструменты: кирка на рудники и шахты, топор на рощу, нож на охоту, скальпель на грибницу и биореактор, манипулятор на свалку, фляга на источник.

Качество: без инструмента и базовый — 90/9/1 обычный/очищенный/чистый. Продвинутый 70/25/5. Мастерский 50/35/15. Вода не имеет качества (`none`). Уникальные ресурсы на узлах не добываются.

Перегруз, бой или получение урона (флаг `interrupted`) не завершают добычу. Один игрок — один узел: если `occupiedBy` чужой, отказ.

Налог 0..30% от количества, `floor(qty * rate / 100)`, не меньше 0. Налог уходит в сундук узла, игроку остаток. Если остаток 0, игрок всё равно завершил добычу.

Сезонная добавка +1 к количеству до налога передаётся флагом `seasonBonus`.

Респавн замирает, когда `playersOnline === 0`: сервис не двигает `respawnAt`. Функция `advanceRespawn` принимает `online: boolean` и delta.

Прочность инструмента −1 за успешную добычу. На 0 инструмент уничтожен.

Очистка: 3 обычных → 1 очищенный, 10 золота, не здесь целиком — функция `refine(qty, gold)` в этом файле.

## Решение противоречий

Голод и жажда отсутствуют. Вода — ресурс, не выживание. Респавн мира замирает без игроков онлайн, в отличие от личных таймеров: это правило узла из артефакта 12.

## Файлы

- `packages/domain/src/gathering.ts`
- `packages/domain/src/gathering.test.ts`

## Интерфейсы

```ts
export type ToolId = 'none' | 'basic' | 'advanced' | 'master';
export type ToolKind = 'pick' | 'axe' | 'knife' | 'scalpel' | 'manipulator' | 'flask';
export type Quality = 'normal' | 'cleaned' | 'pure' | 'none';

export function gatherSeconds(baseSeconds: number, technique: number, tool: ToolId, techniqueGateOk: boolean): number;
export function rollGather(input: {
  nodeId: string;
  technique: number;
  tool: ToolId;
  toolKind: ToolKind;
  overloaded: boolean;
  inCombat: boolean;
  interrupted: boolean;
  occupiedByOther: boolean;
  taxRate: number;
  seasonBonus: boolean;
  rng: Rng;
}): Result<{ qty: number; tax: number; playerQty: number; quality: Quality; seconds: number }, 'combat' | 'overweight' | 'busy' | 'interrupted'>;

export function refine(normalQty: number, gold: number): Result<{ normalLeft: number; cleanedGained: number; gold: number }, 'qty' | 'gold'>;
```

Каталог узлов — константа `NODES` в файле.

## Алгоритм

- Пример: металл 30 сек, техника 10, базовый инструмент → `floor(30 / 1.5) = 20`.
- Техника 0, без инструмента: делитель `(1+0) * 0.5 = 0.5`, время `floor(30 / 0.5) = 60`, но формула документа — деление на `(1 + technique/20)` и отдельно множитель скорости инструмента. Итог: `base / ((1 + technique/20) * toolMultiplier)`, минимум 5. Для примера множитель 1 → 20. Для отсутствия инструмента множитель 0.5 → время дольше: `floor(30 / 0.5) = 60` при технике 0? При технике 0 и множителе 1: `floor(30/1)=30`. При множителе 0.5: `floor(30/0.5)=60`. Минимум 5 срабатывает на малом узле с мастерским инструментом и высокой техникой.
- Продвинутый инструмент при технике 5 считается `none` по множителю (ворота не пройдены), качество тоже как у none.
- `taxRate` вне 0..30 → RangeError.
- `refine` тратит `floor(normalQty / 3) * 3` предметы и `10` золота за партию, партий сколько хватает золота и ресурсов. Если ни одной — ошибка.

## Тесты

- пример 20 секунд.
- минимум 5: base 10, technique 20, master → делитель `(1+1)*2 = 4`, floor(10/4)=2, поднять до 5.
- бой и перегруз отказывают.
- налог 30% от 5 → tax 1, player 4. Налог 0 → player 5.
- сезон +1 до налога: qty база 3 плюс 1.
- качество воды `none` даже с мастерским инструментом.
- мастерский rng `nextUnit` 0 → pure, 0.1 → cleaned, 0.9 → normal. Пороги: pure < 0.15, cleaned < 0.50, иначе normal. Для базового: pure < 0.01, cleaned < 0.10.
- refine 7 обычных и 25 золота → 1 очищенный, 4 обычных, золото 15. 2 обычных → `qty`.

## Definition of done

Список узлов полный, id стабильны.

## Зона правок

`packages/domain/src/gathering.ts` и тест.
