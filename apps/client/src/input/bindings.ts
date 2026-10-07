/**
 * Client key map and pointer facing.
 *
 * The record is action → key code (`move_forward` → `KeyW`). Object keys cannot
 * repeat, so a shared key shows up as a duplicated value. `conflicts` reads
 * those values. `rebind` copies the map, drops every action that already uses
 * the new key, and assigns the action. One action keeps one key, so moving
 * `map` onto `KeyE` unbinds `KeyM`.
 *
 * `Dir` matches the domain movement union. It lives here because this task
 * cannot depend on the movement module.
 */

const FACINGS = ['e', 'ne', 'n', 'nw', 'w', 'sw', 's', 'se'] as const;

export type Dir = (typeof FACINGS)[number];

export interface PointerStep {
  degrees: number;
  facing: Dir | null;
}

/** KeyboardEvent.code values, plus MouseLeft / MouseRight. Arrows are unbound. */
export const DEFAULT_BINDINGS: Record<string, string> = Object.freeze({
  move_forward: 'KeyW',
  move_left: 'KeyA',
  move_back: 'KeyS',
  move_right: 'KeyD',
  interact: 'KeyE',
  attack: 'MouseLeft',
  aim: 'MouseRight',
  ability_1: 'Digit1',
  ability_2: 'Digit2',
  ability_3: 'Digit3',
  target: 'Tab',
  inventory: 'KeyI',
  assembly: 'KeyP',
  craft: 'KeyC',
  quests: 'KeyQ',
  guild: 'KeyG',
  map: 'KeyM',
  chat: 'Enter',
  menu: 'Escape',
});

export function resetBindings(): Record<string, string> {
  return { ...DEFAULT_BINDINGS };
}

export function rebind(
  map: Record<string, string>,
  action: string,
  key: string,
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [existingAction, existingKey] of Object.entries(map)) {
    if (existingKey === key || existingAction === action) continue;
    next[existingAction] = existingKey;
  }
  next[action] = key;
  return next;
}

export function actionFor(map: Record<string, string>, key: string): string | null {
  for (const [action, boundKey] of Object.entries(map)) {
    if (boundKey === key) return action;
  }
  return null;
}

/** Key codes that belong to two or more actions, in order of first appearance. */
export function conflicts(map: Record<string, string>): string[] {
  const counts = new Map<string, number>();
  for (const key of Object.values(map)) {
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const shared: string[] = [];
  for (const [key, count] of counts) {
    if (count >= 2) shared.push(key);
  }
  return shared;
}

/**
 * Pointer angle in degrees to an 8-way facing.
 * 0° is east and increases counterclockwise (atan2): 90° is north.
 * Absolute angles under 15° are a deadzone, except exact 0°, which stays east.
 */
export function facingFromDelta(degrees: number): Dir | null {
  if (!Number.isFinite(degrees)) return null;
  if (degrees === 0) return 'e';
  if (Math.abs(degrees) < 15) return null;

  const normalized = ((degrees % 360) + 360) % 360;
  const index = Math.floor((normalized + 22.5) / 45) % 8;
  return FACINGS[index] ?? null;
}

/** Adds pointer yaw in degrees. A facing is reported only after the 15° threshold. */
export function pointerDelta(accumulatedDegrees: number, deltaDegrees: number): PointerStep {
  const degrees = accumulatedDegrees + deltaDegrees;
  if (!Number.isFinite(degrees) || Math.abs(degrees) < 15) {
    return { degrees, facing: null };
  }
  return { degrees, facing: facingFromDelta(degrees) };
}
