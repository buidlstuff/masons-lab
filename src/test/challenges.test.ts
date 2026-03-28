import { describe, expect, it } from 'vitest';
import {
  CHALLENGES,
  createChallengeScratchState,
  evaluateChallengeCompletion,
} from '../lib/challenges';
import { createEmptyManifest } from '../lib/seed-data';
import type { RuntimeSnapshot } from '../lib/simulation';

function createRuntimeSnapshot(overrides: Partial<RuntimeSnapshot> = {}): RuntimeSnapshot {
  return {
    time: 0,
    rotations: {},
    cargoProgress: {},
    hookY: 0,
    trainProgress: 0,
    trainDelivered: false,
    hopperFill: 0,
    throughput: 0,
    telemetry: {},
    cargoStates: {},
    beltPowered: false,
    lostCargoCount: 0,
    stableCargoSpawns: {},
    wagonLoads: {},
    wagonCargo: {},
    pistonExtensions: {},
    bucketContents: {},
    bucketStates: {},
    springCompressions: {},
    sandParticlePositions: [],
    bodyPositions: {},
    ...overrides,
  };
}

describe('challenge evaluation', () => {
  it('completes first-spin when a motor is placed', () => {
    const manifest = createEmptyManifest();
    manifest.primitives = [
      { id: 'motor-1', kind: 'motor', label: 'Motor', config: { x: 200, y: 200, rpm: 60, torque: 1, powerState: true } },
    ];
    const runtime = createRuntimeSnapshot();
    const challenge = CHALLENGES.find((item) => item.id === 'first-spin');

    expect(challenge).toBeDefined();
    expect(evaluateChallengeCompletion(challenge!, manifest, runtime, createChallengeScratchState(), 0.5)).toBe(true);
  });

  it('includes conveyor geometry in the compact-machine footprint', () => {
    const manifest = createEmptyManifest();
    manifest.primitives = [
      {
        id: 'conv-1',
        kind: 'conveyor',
        label: 'Conveyor',
        config: { path: [{ x: 100, y: 280 }, { x: 620, y: 280 }], speed: 45, direction: 'forward' },
      },
      {
        id: 'hopper-1',
        kind: 'hopper',
        label: 'Hopper',
        config: { x: 580, y: 380, capacity: 10, releaseRate: 1.5, fill: 0 },
      },
      {
        id: 'motor-1',
        kind: 'motor',
        label: 'Motor',
        config: { x: 160, y: 260, rpm: 90, torque: 1, powerState: true },
      },
    ];
    const runtime = createRuntimeSnapshot({ hopperFill: 3 });
    const challenge = CHALLENGES.find((item) => item.id === 'compact-machine');

    expect(challenge).toBeDefined();
    expect(evaluateChallengeCompletion(challenge!, manifest, runtime, createChallengeScratchState(), 0.5)).toBe(false);
  });

  it('requires 3 seconds of level crane time for counterbalance', () => {
    const manifest = createEmptyManifest();
    manifest.primitives = [
      { id: 'arm-1', kind: 'crane-arm', label: 'Arm', config: { x: 300, y: 220, length: 120 } },
    ];
    const challenge = CHALLENGES.find((item) => item.id === 'counterbalance');
    const scratch = createChallengeScratchState();
    const runtime = createRuntimeSnapshot({
      bodyPositions: { 'arm-1': { x: 360, y: 220, angle: 0.03 } },
    });

    expect(challenge).toBeDefined();
    for (let step = 0; step < 5; step += 1) {
      expect(evaluateChallengeCompletion(challenge!, manifest, runtime, scratch, 0.5)).toBe(false);
    }
    expect(evaluateChallengeCompletion(challenge!, manifest, runtime, scratch, 0.5)).toBe(true);
  });
});
