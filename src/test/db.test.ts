import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../lib/db';
import { ensureSeedData } from '../lib/seed';

describe('database seed', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('seeds honest showcase machines and starter projects', async () => {
    await ensureSeedData();
    const machines = await db.machines.toArray();
    const blueprints = await db.blueprints.toArray();
    const jobs = await db.jobs.toArray();

    expect(machines.length).toBe(3);
    expect(blueprints.length).toBe(0);
    expect(jobs.length).toBe(3);
    expect(machines.every((machine) => !machine.experiment.metadata.recipeId)).toBe(true);
    expect(jobs.every((job) => job.kind === 'starter-project')).toBe(true);
  });
});
