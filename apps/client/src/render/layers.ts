/** Equal-distance paint order: ground, then walls, then actors. */
export const DRAW_LAYER_ORDER = ['floor', 'wall', 'sprite'] as const;

export type DrawLayer = (typeof DRAW_LAYER_ORDER)[number];

export function layerRank(layer: DrawLayer): number {
  return DRAW_LAYER_ORDER.indexOf(layer);
}

/**
 * zIndex derived from Chebyshev distance.
 * A nearer cell has a higher zIndex and is drawn later.
 */
export function distanceZIndex(distance: number): number {
  if (distance === 0) {
    return 0;
  }
  return -distance;
}

/**
 * Far cells first. At the same distance, follow `DRAW_LAYER_ORDER`, then id,
 * so the same scene always yields the same array.
 */
export function compareDrawOrder(
  a: { zIndex: number; layer: DrawLayer; id: string },
  b: { zIndex: number; layer: DrawLayer; id: string },
): number {
  if (a.zIndex !== b.zIndex) {
    return a.zIndex - b.zIndex;
  }
  const byLayer = layerRank(a.layer) - layerRank(b.layer);
  if (byLayer !== 0) {
    return byLayer;
  }
  if (a.id < b.id) {
    return -1;
  }
  if (a.id > b.id) {
    return 1;
  }
  return 0;
}
