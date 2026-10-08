# Лут-таблицы

- id: `016`
- title: Лут-таблицы
- status: `done`
- depends_on: `002`

## Цель

По таблице шансов и сиду выдать золото и стеки добычи с монстра, сундука или босса.

## Контекст

Артефакт 11.

Золото: `floor(monsterLevel * roll(1..3) * coefficient)`, минимум 1.

Коэффициенты: pack 0.5, pair 1, solo 1, air 1, turret 1.5, anomaly 1, elite 3, boss 10.

`roll(1..3)` — `1 + rng.nextInt(3)`.

База всех монстров, независимые броски:

| Предмет | Шанс | Количество |
|---|---|---|
| gold | 1 | по формуле |
| metal | 0.30 | 1–3 |
| leather | 0.20 | 1–2 |
| cloth | 0.20 | 1–2 |
| wood | 0.15 | 1–2 |
| stone | 0.15 | 1–2 |

Редкий слой только элиты и боссы: crystals 0.15 (1–2), spores 0.15 (1–3), amino 0.10 (1–2), relic_shard 0.10 (1), energy_cell 0.10 (1).

Особый лут типа: pack bones 0.40 (1–2) и hides 0.25 (1); pair metal +0.20 и cloth +0.20 к базе (итог metal 0.50, cloth 0.40); solo weapon 0.10 и armor 0.10; air feathers 0.35 (1–2) и cloth +0.20; turret mechanisms 0.40 (1) и energy_cell 0.25 (1–2); anomaly spores +0.25 и crystals +0.15.

Региональные добавки передаются уже посчитанным списком записей, не зашиваются все биомы в код. Функция принимает `extra: LootEntry[]`.

Элита: HP/урон/броня не здесь. Лут элиты — три раза каждый выпавший стек количества (золото ×3 после формулы коэффициента elite, не умножать ещё раз). Плюс таблица элиты: crystals 0.20, spores 0.20, amino 0.15, relic_shard 0.15, energy_cell 0.15, echo grade 1 шанс 0.10, path grade 1 шанс 0.10. Модификатор добавляет свои шансы из артефакта 11 раздела 7.2 аргументом.

Уровень предмета: `clamp(monsterLevel + rng.nextInt(7) - 3, 1, 50)` то есть ±3.

Готовые unique вещи не падают. Запись с grade unique, если это не `unique_component` и не уникальный отголосок/путь, пропускается.

Сундуки:

| Тир | Веса грейда предмета |
|---|---|
| common | 70 / 25 / 5 / 0 |
| rare | 0 / 60 / 35 / 5 но unique как предмет запрещён → вес 5 переносится в epic |
| epic | 0 / 0 / 70 / 30, вес unique переносится в epic, плюс отдельный шанс уникального компонента 1.0 если тир epic (таблица «1 уникальный компонент» — гарантирован один компонент-заглушка id `unique_component`, конкретный босс подставит свой id вызывающий) |

Ключи: редкий сундук требует 1, эпический 2. Нет ключей → ошибка, сундук не меняется.

Уникальные компоненты боссов — отдельные записи таблиц контента, не зашивать всех боссов, кроме констант шансов по умолчанию: элитный босс 0.20, уникальный 0.30. Вызывающий передаёт запись явно.

PvP-лут игрока не генерируется здесь: это труп задачи 013.

## Решение противоречий

Уникальные отголоски и пути падают (обзор, пункт 9). Готовая уникальная экипировка — нет. Золото элиты использует коэффициент 3 и не умножается вторично. Фраза «в 3 раза больше лута» применяется к количеству незолотых стеков после успешного броска.

## Файлы

- `packages/domain/src/loot.ts`
- `packages/domain/src/loot.test.ts`

## Интерфейсы

```ts
export interface LootEntry {
  itemId: string;
  chance: number; // 0..1
  min: number;
  max: number;
  kind: 'resource' | 'gold' | 'gear' | 'echo' | 'path' | 'component';
}

export interface LootStack { itemId: string; qty: number; itemLevel?: number }

export function goldAmount(level: number, coefficient: number, rng: Rng): number;
export function rollLoot(input: {
  entries: LootEntry[];
  rng: Rng;
  eliteQuantityMultiplier: number;
  monsterLevel?: number;
}): LootStack[];

export function gearItemLevel(monsterLevel: number, rng: Rng): number;
export function openChest(input: {
  tier: 'common' | 'rare' | 'epic';
  keys: number;
  regionLevel: number;
  rng: Rng;
}): Result<LootStack[], 'keys'>;
```

## Алгоритм

- Шанс: `rng.nextUnit() < chance`. Количество: `min + rng.nextInt(max - min + 1)`.
- Золото всегда в результате, даже если формула дала бы 0: минимум 1.
- `eliteQuantityMultiplier` умножает qty незолотых и округляет вниз, минимум 1 если бросок успешен.
- gear не получает grade unique.
- Сундук common: золото `10 + rng.nextInt(41)` умножить на `regionLevel`? Документ: «10–50 × уровень региона». Значит `(10 + nextInt(41)) * regionLevel`. Редкий `(50 + nextInt(151)) * regionLevel`. Эпический `(200 + nextInt(601)) * regionLevel`.
- Предметов в сундуке: common 1–2, rare 2–3, epic 3–4. Грейд каждого по весам. id предмета не выбирается: вернуть стек `gear_${grade}` и itemLevel = regionLevel. Контент-сервис заменит id. Это стык, его нельзя молча поменять.

## Тесты

- крыса уровень 2, коэффициент 0.5, rng всегда даёт множитель 1 → gold 1. Множитель 3 → gold 3.
- босс 45, коэффициент 10, множитель золота 1 → 450; множитель 3 → 1350.
- шанс 0 не даёт стек. Шанс 1 даёт qty в пределах min..max.
- элитный множитель 3 утраивает металл.
- gear unique в записи kind gear игнорируется.
- сундук rare с 0 ключей → `keys`. С 1 ключом возвращает золото и 2–3 gear.
- уровень предмета при монстре 2 не ниже 1. При монстре 50 не выше 50.
- один и тот же seed → тот же список.

## Definition of done

Нет `Math.random`. Коэффициенты типов экспортированы константой `GOLD_COEFFICIENT`.

## Зона правок

`packages/domain/src/loot.ts` и тест.
