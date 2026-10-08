import { advanceResourceNode, settleNodeDrop, type ResourceNode } from '@rift/domain/guild';

export interface NodeSeizure {
  nodeId: string;
  guildId: string;
  amount: number;
}

/**
 * One tick of every resource node. `advanceResourceNode` owns the 60-second
 * plant and the 30-minute drop. `settleNodeDrop` moves the chest onto the
 * guild that held the flag. This only supplies who is standing there.
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
    const settled = settleNodeDrop(node, advanced);
    if (settled.seized !== null) {
      seized.push({ nodeId: node.nodeId, guildId: settled.seized.guildId, amount: settled.seized.amount });
    }
    return settled.node;
  });
  return { nodes, seized };
}
