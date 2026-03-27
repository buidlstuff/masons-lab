import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useHomeSummary } from '../hooks/useHomeSummary';
import { db } from '../lib/db';
import { createEmptyDraft, createEmptyManifest } from '../lib/seed-data';
import type { SiteJobDefinition } from '../lib/types';

function HomeSummaryProbe() {
  const summary = useHomeSummary(true);

  if (!summary) {
    return <div data-testid="home-summary">loading</div>;
  }

  return (
    <div data-testid="home-summary">
      {JSON.stringify({
        latestDraftId: summary.latestDraft?.draftId ?? null,
        savedMachineCount: summary.savedMachinesPreview.length,
        completedCount: summary.completedCount,
        nextProjectId: summary.nextProjectId ?? null,
        xp: summary.xp,
      })}
    </div>
  );
}

function makeJob(jobId: string, tier: 1 | 2 | 3 | 4, title: string): SiteJobDefinition {
  return {
    jobId,
    tier,
    title,
    summary: `${title} summary`,
    teachingGoal: `${title} goal`,
    startingRecipeIds: [],
    recommendedMachineIds: [],
    goalType: 'feed-the-hopper',
    hints: [`${title} hint`],
    objective: `${title} objective`,
    kind: 'starter-project',
    initialDraft: 'empty',
    steps: [],
  };
}

describe('useHomeSummary', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('returns limited records and next project summary', async () => {
    const honestDraft = createEmptyDraft();
    honestDraft.updatedAt = '2026-03-27T10:00:00.000Z';

    const newerRecipeDraft = createEmptyDraft();
    newerRecipeDraft.draftId = 'recipe-draft';
    newerRecipeDraft.updatedAt = '2026-03-27T12:00:00.000Z';
    newerRecipeDraft.manifest = {
      ...newerRecipeDraft.manifest,
      metadata: {
        ...newerRecipeDraft.manifest.metadata,
        recipeId: 'demo-recipe',
      },
    };

    const machineManifest = createEmptyManifest();
    machineManifest.metadata.title = 'Saved Machine';
    await db.drafts.bulkPut([honestDraft, newerRecipeDraft]);
    await db.machines.bulkPut(
      Array.from({ length: 6 }).map((_, index) => ({
        recordId: `machine-${index}`,
        experiment: {
          ...machineManifest,
          experimentId: `machine-exp-${index}`,
          metadata: {
            ...machineManifest.metadata,
            title: `Saved Machine ${index}`,
          },
        },
        labEntry: {},
        featured: false,
        createdAt: `2026-03-27T0${index}:00:00.000Z`,
        updatedAt: `2026-03-27T0${index}:00:00.000Z`,
      })),
    );
    await db.jobs.bulkPut([
      makeJob('job-a', 1, 'Feed the Hopper'),
      makeJob('job-b', 1, 'Spin the Gears'),
      makeJob('job-c', 2, 'Build the Loader'),
    ]);
    await db.jobProgress.put({
      id: 'job-a',
      jobId: 'job-a',
      completed: true,
    });
    await db.settings.put({ key: 'xp', value: '300' });

    render(<HomeSummaryProbe />);

    await waitFor(() => {
      const payload = JSON.parse(screen.getByTestId('home-summary').textContent ?? '{}') as {
        latestDraftId: string | null;
        savedMachineCount: number;
        completedCount: number;
        nextProjectId: string | null;
        xp: number;
      };

      expect(payload.latestDraftId).toBe(honestDraft.draftId);
      expect(payload.savedMachineCount).toBe(4);
      expect(payload.completedCount).toBe(1);
      expect(payload.nextProjectId).toBe('job-b');
      expect(payload.xp).toBe(300);
    });
  });
});
