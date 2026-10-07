# Аудио-шина

- id: `052`
- title: Аудио-шина
- status: `pending`
- depends_on: `001`

## Цель

Выбрать музыкальный слой и уровни громкости каналов без воспроизведения звука в тестах.

## Контекст

`docs/gdd.v2/Артефакт 34. Звук и музыка.md` (не файл «копия», это другой документ). Каналы: music, effects, ambient, voice, ui. Громкость 0..1. Музыка слоями: base всегда, rhythm в бою, melody в городе, atmosphere в данже, tension при hp/max < 0.3 или босс, victory 30 секунд после боя, затем снять.

Формат файлов OGG, 44.1 кГц — константы манифеста, не декодер. Файлов звука в репозитории нет: id клипов строковые, плеер — порт `AudioSink` с методами `play`, `stop`. В тесте память.

Субтитры: событие `subtitle` с текстом ключа локализации, если настройки subtitles true. Сам перевод не здесь.

Боты не имеют отдельного набора звуков: те же id, что у игрока.

День и ночь меняют ambient id: `ambient_day` / `ambient_night`, механик не меняют.

## Решение противоречий

Файл «Артефакт 34 — копия» игнорировать (обзор, пункт 23).

## Файлы

- `apps/client/src/audio/bus.ts`
- `apps/client/src/audio/bus.test.ts`

## Интерфейсы

```ts
export function layersFor(situation: { inCombat: boolean; city: boolean; dungeon: boolean; hpRatio: number; boss: boolean; victoryMsLeft: number }): string[];
export function mix(volumes: Record<string, number>, clipGain: number): number;
```

`mix` перемножает и клипает 0..1. Нечисло → 0.

## Алгоритм

- victoryMsLeft > 0 добавляет `victory` и не добавляет `rhythm`, даже в бою: победа приоритетнее. Если и victory и бой, оставить base+victory.
- tension и rhythm вместе допустимы, если бой и низкое hp и нет victory.

## Тесты

- город вне боя → base и melody, без rhythm.
- бой → base и rhythm.
- hp 0.2 в бою → есть tension.
- victory 1000 → есть victory, нет rhythm.
- mix 2 и 2 → 1. mix −1 → 0.
- ambient ночью `ambient_night`.

## Definition of done

Нет импорта Web Audio API в `bus.ts`.

## Зона правок

`apps/client/src/audio/**`.
