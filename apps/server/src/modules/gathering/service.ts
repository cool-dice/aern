import {
  advanceRespawn,
  respawnDurationMs,
  rollGather,
  wearTool,
  type NodeId,
  type ToolId,
  type ToolKind,
} from '@rift/domain/gathering';
import type { Rng } from '@rift/domain/rng';
import { err, ok, type Result } from '@rift/domain/result';
import type { Bus } from '../../shared/bus';

export interface GatherInput {
  characterId: string;
  nodeId: NodeId;
  nowMs: number;
  technique: number;
  tool: ToolId;
  toolKind: ToolKind;
  durability: number;
  overloaded?: boolean;
  inCombat?: boolean;
  seasonBonus?: boolean;
}

export interface GatheringService {
  gather(input: GatherInput): Result<
    {
      qty: number;
      playerQty: number;
      quality: string;
      seconds: number;
      durability: number;
      destroyed: boolean;
      respawnAtMs: number;
    },
    string
  >;
  /** Elapse online time against a node's respawn. */
  tickRespawn(characterId: string, nodeId: NodeId, deltaMs: number, online: boolean): number;
}

export function createGatheringService(rng: Rng, bus: Bus): GatheringService {
  const respawnAt = new Map<string, number>();

  return {
    gather(input) {
      const key = `${input.characterId}:${input.nodeId}`;
      const readyAt = respawnAt.get(key) ?? 0;
      if (input.nowMs < readyAt) {
        return err('respawn');
      }
      const rolled = rollGather({
        nodeId: input.nodeId,
        technique: input.technique,
        tool: input.tool,
        toolKind: input.toolKind,
        overloaded: input.overloaded === true,
        inCombat: input.inCombat === true,
        interrupted: false,
        occupiedByOther: false,
        taxRate: 0,
        seasonBonus: input.seasonBonus === true,
        rng,
      });
      if (!rolled.ok) {
        return err(rolled.code);
      }
      const worn = wearTool(input.durability);
      const respawn = input.nowMs + respawnDurationMs(input.nodeId);
      respawnAt.set(key, respawn);
      bus.emit('gather.completed', { characterId: input.characterId, nodeId: input.nodeId });
      return ok({
        qty: rolled.value.qty,
        playerQty: rolled.value.playerQty,
        quality: rolled.value.quality,
        seconds: rolled.value.seconds,
        durability: worn.durability,
        destroyed: worn.destroyed,
        respawnAtMs: respawn,
      });
    },
    tickRespawn(characterId, nodeId, deltaMs, online) {
      const key = `${characterId}:${nodeId}`;
      const next = advanceRespawn(respawnAt.get(key) ?? 0, online, deltaMs);
      respawnAt.set(key, next);
      return next;
    },
  };
}
