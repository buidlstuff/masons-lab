import type { DraftPlayState, ExperimentManifest, SiteJobDefinition } from './types';

const START_CHECKPOINT_ID = '__start__';

export function createDraftPlayState(
  jobId?: string,
  manifest?: ExperimentManifest,
): DraftPlayState {
  return {
    jobId,
    latchedStepIds: [],
    stepCheckpointManifest: manifest
      ? { [START_CHECKPOINT_ID]: structuredClone(manifest) }
      : {},
    lastStableCargoSpawns: {},
    diagnosticsEnabled: false,
  };
}

export function ensureDraftPlayState(
  playState: DraftPlayState | undefined,
  jobId?: string,
  manifest?: ExperimentManifest,
): DraftPlayState {
  const nextJobId = jobId ?? playState?.jobId;
  if (!playState || playState.jobId !== nextJobId) {
    return createDraftPlayState(nextJobId, manifest);
  }

  return {
    jobId: nextJobId,
    latchedStepIds: [...playState.latchedStepIds],
    stepCheckpointManifest: { ...playState.stepCheckpointManifest },
    lastStableCargoSpawns: { ...playState.lastStableCargoSpawns },
    diagnosticsEnabled: playState.diagnosticsEnabled ?? false,
  };
}

export function latestCheckpointForJob(
  playState: DraftPlayState | undefined,
  job: SiteJobDefinition | undefined,
): ExperimentManifest | null {
  if (!job || !playState || !job.steps?.length) {
    return playState?.stepCheckpointManifest?.[START_CHECKPOINT_ID] ?? null;
  }

  for (let index = job.steps.length - 1; index >= 0; index -= 1) {
    const stepId = job.steps[index]?.stepId;
    if (stepId && playState.stepCheckpointManifest[stepId]) {
      return structuredClone(playState.stepCheckpointManifest[stepId]);
    }
  }

  return playState.stepCheckpointManifest[START_CHECKPOINT_ID]
    ? structuredClone(playState.stepCheckpointManifest[START_CHECKPOINT_ID])
    : null;
}

export function latchProjectSteps(
  playState: DraftPlayState,
  stepIds: string[],
  manifest: ExperimentManifest,
): DraftPlayState {
  if (stepIds.length === 0) {
    return playState;
  }

  const next = ensureDraftPlayState(playState, playState.jobId, manifest);
  const seen = new Set(next.latchedStepIds);
  for (const stepId of stepIds) {
    if (!seen.has(stepId)) {
      next.latchedStepIds.push(stepId);
      seen.add(stepId);
    }
    next.stepCheckpointManifest[stepId] = structuredClone(manifest);
  }
  return next;
}

export function updateStableCargoSpawns(
  playState: DraftPlayState,
  stableSpawns: Record<string, { x: number; y: number }>,
): DraftPlayState {
  return {
    ...playState,
    lastStableCargoSpawns: {
      ...playState.lastStableCargoSpawns,
      ...stableSpawns,
    },
  };
}

export function replaceStartCheckpoint(
  playState: DraftPlayState,
  manifest: ExperimentManifest,
): DraftPlayState {
  return {
    ...playState,
    stepCheckpointManifest: {
      ...playState.stepCheckpointManifest,
      [START_CHECKPOINT_ID]: structuredClone(manifest),
    },
  };
}

export function toggleDiagnostics(playState: DraftPlayState): DraftPlayState {
  return {
    ...playState,
    diagnosticsEnabled: !playState.diagnosticsEnabled,
  };
}

export { START_CHECKPOINT_ID };
