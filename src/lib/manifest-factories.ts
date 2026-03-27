import { nanoid } from 'nanoid';
import type { ExperimentFamily, ExperimentManifest } from './types';

function baseWorld() {
  return {
    stage: {
      width: 1280 as const,
      height: 720 as const,
      background: 'lab-dark' as const,
      grid: 'engineering' as const,
      boundaryMode: 'contain' as const,
    },
    camera: {
      mode: 'fixed' as const,
      zoom: 1,
      minZoom: 0.75,
      maxZoom: 1.5,
      panX: 0,
      panY: 0,
    },
    timeline: {
      paused: false,
      timeScale: 1,
      allowPause: true,
      allowStep: false,
      allowReset: true,
    },
    randomSeed: 42,
  };
}

export function baseManifest(partial: Partial<ExperimentManifest>): ExperimentManifest {
  return {
    schemaVersion: '1.0.0',
    experimentId: nanoid(),
    slug: 'draft-machine',
    family: 'machine-combos',
    status: 'validated',
    metadata: {
      title: 'Untitled Machine',
      shortDescription: 'A machine waiting for its first useful job.',
      teachingGoal: 'Learn by changing the machine and watching the result.',
      difficulty: 'easy',
      tags: [],
      starter: false,
      thumbnailPreset: 'machine-card',
      createdBy: { source: 'human' },
    },
    world: baseWorld(),
    primitives: [],
    behaviors: [],
    controls: [],
    hud: [],
    goals: [],
    blueprints: [],
    assemblies: [],
    explanation: {
      whatIsHappening: 'This machine only does what its parts can honestly cause.',
      whatToTryNext: ['Place one useful part.', 'Test it right away.', 'Only trust what visibly changes.'],
      vocabulary: [],
    },
    validation: {
      engineMode: 'production',
      schemaPassed: true,
      referenceChecksPassed: true,
      runtimeSmokePassed: true,
      fpsBudgetPassed: true,
      bannedApiScanPassed: true,
      portBindingsPassed: true,
      warnings: [],
    },
    saveHints: {
      saveMode: 'experiment-only',
    },
    ...partial,
  };
}

export function createEmptyManifest(): ExperimentManifest {
  return baseManifest({
    slug: 'yard-draft',
    family: 'machine-combos',
    status: 'draft',
    metadata: {
      title: 'New Yard Draft',
      subtitle: 'Build one honest machine part by part',
      shortDescription: 'A blank yard where every visible part must actually matter.',
      teachingGoal: 'Start simple, prove cause and effect, then grow the machine.',
      difficulty: 'easy',
      tags: ['draft', 'yard', 'honest-sandbox'],
      starter: false,
      thumbnailPreset: 'yard-draft',
      createdBy: { source: 'human' },
    },
    explanation: {
      whatIsHappening: 'Nothing is running yet because the yard is empty.',
      whatToTryNext: ['Place a motor.', 'Add a gear inside the motor ring.', 'Try a conveyor and cargo.'],
      vocabulary: [{ term: 'draft', kidFriendlyMeaning: 'A machine you are still building and testing.' }],
    },
  });
}

export function buildStarterDraft(
  title: string,
  summary: string,
  teachingGoal: string,
  family: ExperimentFamily,
): ExperimentManifest {
  const baseDraft = createEmptyManifest();
  return {
    ...baseDraft,
    slug: title.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-'),
    family,
    metadata: {
      ...baseDraft.metadata,
      title,
      subtitle: 'Starter Project',
      shortDescription: summary,
      teachingGoal,
      tags: ['starter-project', family],
      starter: true,
      thumbnailPreset: 'yard-draft',
    },
    explanation: {
      whatIsHappening: 'This starter project begins empty so your own placements cause the result.',
      whatToTryNext: ['Follow the current step.', 'Test the machine after every part.', 'Ask why it is stuck if nothing changes.'],
      vocabulary: [{ term: 'cause and effect', kidFriendlyMeaning: 'When one change in your machine clearly makes something else happen.' }],
    },
  };
}
