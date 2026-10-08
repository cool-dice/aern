import {
  equipCore,
  installEcho,
  learnPath,
  neuroshock,
  type BuildState,
  type CoreRef,
  type Program,
} from '@rift/domain/build';
import { advanceRelic, startInstall, type RelicState, type RelicSubtype } from '@rift/domain/relics';
import { err, ok, type Result } from '@rift/domain/result';
import type { Bus } from '../../shared/bus';

export interface BuildService {
  installRelic(input: {
    characterId: string;
    clean: boolean;
    inCombat: boolean;
    inCityOrHub: boolean;
    gold: number;
    subtype: RelicSubtype;
    nowMs: number;
    relic: RelicState;
  }): Result<{ gold: number; readyAtMs: number; relic: RelicState }, string>;
  installEcho(input: {
    characterId: string;
    state: BuildState;
    program: Program;
  }): Result<{ state: BuildState; neuroshock: boolean }, string>;
  learnPath(input: {
    characterId: string;
    state: BuildState;
    program: Program;
    gold: number;
    nowMs: number;
  }): Result<{ state: BuildState; gold: number; readyAtMs: number }, string>;
  equipCore(input: {
    characterId: string;
    state: BuildState;
    core: CoreRef;
    gold: number;
  }): Result<BuildState, string>;
}

export function createBuildService(bus: Bus): BuildService {
  return {
    installRelic(input) {
      const started = startInstall({
        clean: input.clean,
        inCombat: input.inCombat,
        inCityOrHub: input.inCityOrHub,
        gold: input.gold,
        subtype: input.subtype,
        nowMs: input.nowMs,
      });
      if (!started.ok) {
        return err(started.code);
      }
      const advanced = advanceRelic({
        relic: input.relic,
        onlineDeltaMs: 0,
        amino: 0,
        cells: 0,
        nowMs: input.nowMs,
        rng: { nextInt: () => 0, nextUnit: () => 0 },
      });
      bus.emit('build.installed', { characterId: input.characterId, kind: 'relic', subject: input.subtype });
      return ok({
        gold: started.value.gold,
        readyAtMs: started.value.readyAtMs,
        relic: advanced.relic,
      });
    },
    installEcho(input) {
      const installed = installEcho(input.state, input.program);
      if (!installed.ok) {
        return err(installed.code);
      }
      bus.emit('build.installed', { characterId: input.characterId, kind: 'echo', subject: input.program.templateId });
      return ok({ state: installed.value, neuroshock: neuroshock(installed.value) });
    },
    learnPath(input) {
      const learned = learnPath(input.state, input.program, input.gold, input.nowMs);
      if (!learned.ok) {
        return err(learned.code);
      }
      bus.emit('build.installed', { characterId: input.characterId, kind: 'path', subject: input.program.templateId });
      return ok(learned.value);
    },
    equipCore(input) {
      const equipped = equipCore(input.state, input.core, input.gold);
      if (!equipped.ok) {
        return err(equipped.code);
      }
      bus.emit('build.installed', { characterId: input.characterId, kind: 'core', subject: input.core.templateId });
      return ok(equipped.value);
    },
  };
}
