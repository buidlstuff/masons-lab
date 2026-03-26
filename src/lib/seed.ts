import { db } from './db';
import { getFeaturedMachines, getStarterBlueprints, getStarterJobs } from './seed-data';

export async function ensureSeedData() {
  const contentEpoch = 'relaunch-3-projects-v1';
  const seeded = await db.settings.get('content-epoch');
  if (seeded?.value === contentEpoch) {
    return;
  }

  const machines = getFeaturedMachines();
  const blueprints = getStarterBlueprints();
  const jobs = getStarterJobs();
  const existingMachines = await db.machines.toArray();
  const existingBlueprints = await db.blueprints.toArray();
  const existingDrafts = await db.drafts.toArray();

  const machineIdsToDelete = existingMachines
    .filter((machine) => machine.featured || Boolean(machine.experiment.metadata.recipeId))
    .map((machine) => machine.recordId);
  const blueprintIdsToDelete = existingBlueprints
    .filter((blueprint) => blueprint.starter)
    .map((blueprint) => blueprint.recordId);
  const draftIdsToDelete = existingDrafts
    .filter((draft) => Boolean(draft.manifest.metadata.recipeId))
    .map((draft) => draft.draftId);

  await db.transaction('rw', [db.machines, db.blueprints, db.drafts, db.jobs, db.jobProgress, db.settings], async () => {
    if (machineIdsToDelete.length > 0) {
      await db.machines.bulkDelete(machineIdsToDelete);
    }
    if (blueprintIdsToDelete.length > 0) {
      await db.blueprints.bulkDelete(blueprintIdsToDelete);
    }
    if (draftIdsToDelete.length > 0) {
      await db.drafts.bulkDelete(draftIdsToDelete);
    }
    await db.jobs.clear();
    await db.jobProgress.clear();
    await db.machines.bulkPut(machines);
    if (blueprints.length > 0) {
      await db.blueprints.bulkPut(blueprints);
    }
    await db.jobs.bulkPut(jobs);
    await db.settings.put({ key: 'content-epoch', value: contentEpoch });
    await db.settings.put({ key: 'seed-version', value: contentEpoch });
  });
}
