import { nanoid } from 'nanoid';
import { mountBlueprintToManifest } from './blueprints';
import { buildStarterDraft, createEmptyManifest } from './manifest-factories';
import { createDraftPlayState } from './play-state';
import type {
  DraftRecord,
  SavedBlueprintRecord,
  SavedExperimentRecord,
  SiteJobDefinition,
} from './types';

export { createEmptyManifest } from './manifest-factories';

export function createDraftFromMachine(machine: SavedExperimentRecord): DraftRecord {
  return {
    draftId: nanoid(),
    sourceMachineId: machine.recordId,
    manifest: structuredClone(machine.experiment),
    playState: createDraftPlayState(undefined, machine.experiment),
    updatedAt: new Date().toISOString(),
  };
}

export function createDraftFromBlueprint(blueprint: SavedBlueprintRecord): DraftRecord {
  const mounted = mountBlueprintToManifest(createEmptyManifest(), blueprint.blueprint);

  return {
    draftId: nanoid(),
    sourceBlueprintId: blueprint.recordId,
    manifest: {
      ...mounted,
      metadata: {
        ...mounted.metadata,
        title: `${blueprint.blueprint.title} Draft`,
        shortDescription: blueprint.blueprint.summary,
        tags: Array.from(new Set([...mounted.metadata.tags, ...blueprint.blueprint.tags])),
      },
    },
    playState: createDraftPlayState(undefined, mounted),
    updatedAt: new Date().toISOString(),
  };
}

export function createDraftFromProject(project: SiteJobDefinition): DraftRecord {
  const projectFamily = project.goalType === 'spin-gear-train'
    ? 'power-and-drivetrain'
    : project.goalType === 'feed-the-hopper'
      ? 'flow-and-processing'
      : 'machine-combos';
  const manifest = buildStarterDraft(project.title, project.summary, project.teachingGoal, projectFamily);

  return {
    draftId: nanoid(),
    manifest,
    playState: createDraftPlayState(project.jobId, manifest),
    updatedAt: new Date().toISOString(),
  };
}

export function createEmptyDraft(): DraftRecord {
  const manifest = createEmptyManifest();
  return {
    draftId: nanoid(),
    manifest,
    playState: createDraftPlayState(undefined, manifest),
    updatedAt: new Date().toISOString(),
  };
}
