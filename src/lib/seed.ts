import { db } from './db';
import { getFeaturedMachines, getStarterBlueprints, getStarterJobs } from './seed-data';

export async function ensureSeedData() {
  const seedVersion = 'stage-2b';
  const seeded = await db.settings.get('seed-version');
  if (seeded?.value === seedVersion) {
    return;
  }

  const machines = getFeaturedMachines();
  const blueprints = getStarterBlueprints();
  const jobs = getStarterJobs(machines, blueprints);

  await db.transaction('rw', db.machines, db.blueprints, db.jobs, db.settings, async () => {
    await db.machines.bulkPut(machines);
    await db.blueprints.bulkPut(blueprints);
    await db.jobs.bulkPut(jobs);
    await db.settings.put({ key: 'seed-version', value: seedVersion });
  });
}
