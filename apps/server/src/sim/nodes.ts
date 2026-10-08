import { advanceResourceNode, type ResourceNode } from '@rift/domain/guild';

export interface NodeSeizure {
  nodeId: string;
  guildId: string;
  amount: number;
}

/**
 * One tick of every resource node. `advanceResourceNode` owns the plant,
 * the drop, and the chest seizure. This only supplies who is standing there.
 */
export function tickResourceNodes(input: {
  nodes: readonly ResourceNode[];
  present: readonly { nodeId: string; guildId: string }[];
  deltaMs: number;
}): { nodes: ResourceNode[]; seized: NodeSeizure[] } {
  const seized: NodeSeizure[] = [];
  const nodes = input.nodes.map((node) => {
    const advanced = advanceResourceNode({
      node,
      presentGuildIds: input.present
        .filter((row) => row.nodeId === node.nodeId)
        .map((row) => row.guildId),
      deltaMs: input.deltaMs,
    });
    if (advanced.seized !== null) {
      seized.push({ nodeId: node.nodeId, guildId: advanced.seized.guildId, amount: advanced.seized.amount });
    }
    return advanced.node;
  });
  return { nodes, seized };
}
