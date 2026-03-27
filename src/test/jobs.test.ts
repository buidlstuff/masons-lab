import { describe, expect, it } from 'vitest';
import { evaluateProject } from '../lib/jobs';
import { createDraftPlayState } from '../lib/play-state';
import { createEmptyManifest } from '../lib/seed-data';
import { getStarterJobs } from '../lib/starter-catalog';
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
    bodyPositions: {},
    ...overrides,
  };
}

describe('guided job latching', () => {
  it('keeps the loader on the motor step after cargo was honestly placed once', () => {
    const job = getStarterJobs().find((item) => item.jobId === 'build-the-loader');
    expect(job).toBeDefined();

    const manifest = createEmptyManifest();
    manifest.primitives = [
      {
        id: 'conv-1',
        kind: 'conveyor',
        label: 'Conveyor',
        config: { path: [{ x: 200, y: 300 }, { x: 560, y: 300 }], speed: 45, direction: 'forward' },
      },
      {
        id: 'hopper-1',
        kind: 'hopper',
        label: 'Hopper',
        config: { x: 580, y: 390, capacity: 10, releaseRate: 1.5, fill: 0 },
      },
      {
        id: 'cargo-1',
        kind: 'cargo-block',
        label: 'Cargo',
        config: { x: 280, y: 300, weight: 1 },
      },
    ];

    const liveRuntime = createRuntimeSnapshot({
      bodyPositions: {
        'cargo-1': { x: 280, y: 300, angle: 0 },
      },
    });

    const initial = evaluateProject(job, manifest, liveRuntime, createDraftPlayState(job?.jobId, manifest));
    expect(initial?.currentStep?.stepId).toBe('power-the-belt');

    const regressedRuntime = createRuntimeSnapshot({
      bodyPositions: {
        'cargo-1': { x: 120, y: 520, angle: 0 },
      },
    });
    const playState = createDraftPlayState(job?.jobId, manifest);
    playState.latchedStepIds = ['place-conveyor', 'place-hopper', 'add-cargo'];

    const evaluation = evaluateProject(job, manifest, regressedRuntime, playState);
    expect(evaluation?.currentStep?.stepId).toBe('power-the-belt');
    expect(evaluation?.steps.find((step) => step.stepId === 'add-cargo')?.completed).toBe(true);
    expect(evaluation?.steps.find((step) => step.stepId === 'add-cargo')?.liveCompleted).toBe(false);
  });
});
