/** Screen x = (dx - dy) * ISO_X_STEP. Screen y = (dx + dy) * ISO_Y_STEP - z. */
export const ISO_X_STEP = 32;
export const ISO_Y_STEP = 16;

/** Floor and wall tiles sit on the ground. Actors stand one sprite height above it. */
export const FLOOR_Z = 0;
export const SPRITE_Z = 16;

export interface ScreenPoint {
  x: number;
  y: number;
}

export function projectIso(dx: number, dy: number, z: number): ScreenPoint {
  return {
    x: (dx - dy) * ISO_X_STEP,
    y: (dx + dy) * ISO_Y_STEP - z,
  };
}
