import { inCitySafeRadius, pvpAllowed, type WorldNode } from '@rift/domain/world';
import type { Geography } from './travel';

const INVASION_COMBAT = new Set(['wave1', 'wave2', 'climax']);

/**
 * Server-owned safe zone and PvP flag.
 * Returns null when the world has no geography, so grid tests keep the command flags.
 * A city stays safe. War on that city, or an invasion wave, sets `pvpOpen`.
 * The prototype encounter and a dungeon are open ground.
 */
export function combatZone(input: {
  geography?: Geography;
  nodeId?: string;
  inEncounter?: boolean;
  inDungeon?: boolean;
  warCities?: readonly string[];
  invasion?: string | null;
}): { safeZone: boolean; pvpOpen: boolean } | null {
  if (input.geography === undefined) {
    return null;
  }
  if (input.inEncounter === true || input.inDungeon === true) {
    return { safeZone: false, pvpOpen: true };
  }
  const node = input.geography.nodes.find((candidate) => candidate.id === input.nodeId);
  if (node === undefined) {
    return { safeZone: false, pvpOpen: true };
  }
  if (
    inCitySafeRadius({
      nodes: input.geography.nodes,
      edges: input.geography.edges,
      nodeId: node.id,
    })
  ) {
    return { safeZone: true, pvpOpen: false };
  }
  const warOpen =
    (input.warCities ?? []).includes(node.id) ||
    (input.invasion !== undefined && input.invasion !== null && INVASION_COMBAT.has(input.invasion));
  return {
    safeZone: node.safe,
    pvpOpen: pvpAllowed(asNode(node), warOpen),
  };
}

function asNode(node: Geography['nodes'][number]): WorldNode {
  return {
    id: node.id,
    kind: node.kind,
    safe: node.safe,
    side: node.side,
    regionId: node.regionId,
  };
}
