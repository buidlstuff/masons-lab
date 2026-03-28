import Dexie, { type Table } from 'dexie';
import type {
  ChallengeProgressRecord,
  DraftRecord,
  PuzzleChallengeProgressRecord,
  JobProgressRecord,
  SavedBlueprintRecord,
  SavedExperimentRecord,
  SettingRecord,
  SiteJobDefinition,
} from './types';

export class MasonLabDatabase extends Dexie {
  machines!: Table<SavedExperimentRecord, string>;
  blueprints!: Table<SavedBlueprintRecord, string>;
  drafts!: Table<DraftRecord, string>;
  jobs!: Table<SiteJobDefinition, string>;
  jobProgress!: Table<JobProgressRecord, string>;
  challengeProgress!: Table<ChallengeProgressRecord, string>;
  puzzleChallengeProgress!: Table<PuzzleChallengeProgressRecord, string>;
  settings!: Table<SettingRecord, string>;

  constructor() {
    super('masons-construction-sandbox');
    this.version(1).stores({
      machines: 'recordId, featured, updatedAt',
      blueprints: 'recordId, blueprint.category, updatedAt',
      drafts: 'draftId, sourceMachineId, updatedAt',
      jobs: 'jobId, tier',
      jobProgress: 'id, jobId, completed',
      settings: 'key',
    });
    this.version(2).stores({
      machines: 'recordId, featured, updatedAt',
      blueprints: 'recordId, blueprint.category, updatedAt',
      drafts: 'draftId, sourceMachineId, updatedAt',
      jobs: 'jobId, tier',
      jobProgress: 'id, jobId, completed',
      challengeProgress: '&challengeId, completed, completedAt',
      settings: 'key',
    });
    this.version(3).stores({
      machines: 'recordId, featured, updatedAt',
      blueprints: 'recordId, blueprint.category, updatedAt',
      drafts: 'draftId, sourceMachineId, updatedAt',
      jobs: 'jobId, tier',
      jobProgress: 'id, jobId, completed',
      challengeProgress: '&challengeId, completed, completedAt',
      puzzleChallengeProgress: '&puzzleChallengeId, completed, completedAt',
      settings: 'key',
    });
  }
}

export const db = new MasonLabDatabase();
