import { describe, expect, it } from 'vitest';
import { createEmptyManifest } from '../lib/seed-data';
import { createDraftPlayState, replaceStartCheckpoint, START_CHECKPOINT_ID } from '../lib/play-state';

describe('play state baselines', () => {
  it('overwrites the start checkpoint without mutating the previous baseline', () => {
    const originalManifest = createEmptyManifest();
    originalManifest.metadata.title = 'Original';
    const playState = createDraftPlayState(undefined, originalManifest);

    const nextManifest = createEmptyManifest();
    nextManifest.metadata.title = 'Reset Target';
    nextManifest.primitives = [
      { id: 'motor-1', kind: 'motor', label: 'Motor', config: { x: 180, y: 220, rpm: 60, torque: 1, powerState: true } },
    ];

    const updated = replaceStartCheckpoint(playState, nextManifest);

    expect(updated.stepCheckpointManifest[START_CHECKPOINT_ID].metadata.title).toBe('Reset Target');
    expect(updated.stepCheckpointManifest[START_CHECKPOINT_ID].primitives).toHaveLength(1);
    expect(playState.stepCheckpointManifest[START_CHECKPOINT_ID].metadata.title).toBe('Original');
    expect(playState.stepCheckpointManifest[START_CHECKPOINT_ID].primitives).toHaveLength(0);
  });
});
