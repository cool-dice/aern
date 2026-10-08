import { advanceResourceNode, type ResourceNode } from '@rift/domain/guild';

/**
 * One tick of every resource node. `advanceResourceNode` owns the 60-second
 * plant and the 30-minute drop. This only supplies who is standing there.
 */
export function tickResourceNodes(input: {
  nodes: readonly ResourceNode[];
  present: readonly { nodeId: string; guildId: string }[];
  deltaMs: number;
}): ResourceNode[] {
  return input.nodes.map((node) =>
    advanceResourceNode({
      node,
      presentGuildIds: input.present
        .filter((row) => row.nodeId === node.nodeId)
        .map((row) => row.guildId),
      deltaMs: input.deltaMs,
    }),
  );
}
