import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../lib/db';
import { ensureSeedData } from '../lib/seed';

describe('database seed', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('seeds featured machines, blueprints, and jobs', async () => {
    await ensureSeedData();
    const machines = await db.machines.toArray();
    const blueprints = await db.blueprints.toArray();
    const jobs = await db.jobs.toArray();

    expect(machines.length).toBe(4);
    expect(blueprints.length).toBe(10);
    expect(jobs.length).toBe(12);
  });
});
