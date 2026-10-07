import { randomUUID } from 'node:crypto';
import type { ClientCommand, CommandScalar, SignedEnvelope } from '@rift/protocol';
import type { Cell } from '@rift/domain/movement';
import type { ClientStore } from '../state/store';
import { projectMoves, noteLocal, type PendingStep } from './predict';
import { createOutboundQueue, sendEnvelope, type CommandSocket, type OutboundQueue } from './queue';
import { createReconnectAttempts, type ReconnectAttempts } from './reconnect';

export interface ClientNet {
  readonly queue: OutboundQueue;
  readonly reconnect: ReconnectAttempts;
  /**
   * Signs and sends a command. `step_*` / `run_*` are predicted through
   * `setPredicted` only. Attacks do not change `self.hp` or `self.cell`.
   * `movement` on the constructor is read on each prediction, so the caller
   * can update reaction and combat in place.
   */
  send(
    action: string,
    issuedAtMs: number,
    fields?: { targetId?: string; params?: Record<string, CommandScalar> },
  ): SignedEnvelope;
  /** Applies `{ self, entities, inventory }` and reconciles fresh pending steps. */
  ingest(snapshot: unknown, nowMs: number): void;
  close(): void;
}

/**
 * Binds a store and an in-memory (or any `{ send, close }`) socket.
 * The store is passed in; this module does not keep a singleton.
 */
export function createClientNet(input: {
  store: ClientStore;
  sessionKeyHex: string;
  socket: CommandSocket;
  movement: { reaction: number; inCombat: boolean };
  commandId?: () => string;
}): ClientNet {
  const queue = createOutboundQueue(input.sessionKeyHex);
  const reconnect = createReconnectAttempts();
  const ids = input.commandId ?? (() => randomUUID());
  let pending: PendingStep[] = [];
  const cells = new Map<number, Cell>();
  let base: Cell | null = null;

  function republish(nowMs: number): void {
    const self = input.store.getState().self;
    if (!self) {
      return;
    }
    const played = projectMoves({
      serverCell: self.cell,
      pending,
      nowMs,
      reaction: input.movement.reaction,
      inCombat: input.movement.inCombat,
      od: self.od,
    });
    cells.clear();
    const steps = played.steps.map((step) => {
      const cell = { x: step.cell.x, y: step.cell.y };
      cells.set(step.seq, cell);
      return {
        seq: step.seq,
        dir: step.dir,
        atMs: step.atMs,
        cell,
      };
    });
    pending = played.pending;
    input.store.getState().setPredicted({
      cell: steps.length > 0 ? { x: played.cell.x, y: played.cell.y } : null,
      steps,
    });
  }

  function dropConfirmed(serverCell: Cell): void {
    const unchanged = base !== null && base.x === serverCell.x && base.y === serverCell.y;
    if (!unchanged) {
      let matched = -1;
      for (let index = 0; index < pending.length; index += 1) {
        const step = pending[index];
        if (!step) {
          continue;
        }
        const cell = cells.get(step.seq);
        if (cell && cell.x === serverCell.x && cell.y === serverCell.y) {
          matched = index;
        }
      }
      if (matched >= 0) {
        pending = pending.slice(matched + 1);
        const live = new Set(pending.map((step) => step.seq));
        for (const seq of cells.keys()) {
          if (!live.has(seq)) {
            cells.delete(seq);
          }
        }
      }
    }
    base = { x: serverCell.x, y: serverCell.y };
  }

  return {
    queue,
    reconnect,
    send(action, issuedAtMs, fields) {
      const draft: Omit<ClientCommand, 'seq'> = {
        commandId: ids(),
        issuedAtMs,
        action,
        params: fields?.params ?? {},
      };
      if (fields?.targetId !== undefined) {
        draft.targetId = fields.targetId;
      }
      const envelope = queue.issue(draft);
      sendEnvelope(input.socket, envelope);
      const noted = noteLocal(pending, action, {
        seq: envelope.command.seq,
        atMs: issuedAtMs,
      });
      if (noted !== pending) {
        pending = noted;
        republish(issuedAtMs);
      }
      return envelope;
    },
    ingest(snapshot, nowMs) {
      input.store.getState().applySnapshot(snapshot);
      const self = input.store.getState().self;
      if (!self) {
        pending = [];
        cells.clear();
        base = null;
        input.store.getState().setPredicted({ cell: null, steps: [] });
        return;
      }
      dropConfirmed(self.cell);
      republish(nowMs);
    },
    close() {
      input.socket.close();
      input.store.getState().setConnected(false);
    },
  };
}
