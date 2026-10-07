import { chebyshev, type Cell } from '@rift/domain/movement';

/** Chebyshev square: a cell is visible when its distance from the camera is <= vision. */
export function withinVision(origin: Cell, cell: Cell, vision: number): boolean {
  if (!Number.isFinite(vision) || vision < 0) {
    return false;
  }
  return chebyshev(origin, cell) <= vision;
}

/** Integer cells inside the Chebyshev square, scanned row by row from north to south. */
export function visionCells(origin: Cell, vision: number): Cell[] {
  if (!Number.isFinite(vision) || vision < 0) {
    return [];
  }
  const radius = Math.floor(vision);
  const cells: Cell[] = [];
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      cells.push({ x: origin.x + dx, y: origin.y + dy });
    }
  }
  return cells;
}
