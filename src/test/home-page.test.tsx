import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppBootProvider } from '../lib/app-boot';
import { db } from '../lib/db';
import { HomePage } from '../pages/HomePage';
import type { SiteJobDefinition } from '../lib/types';

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

describe('HomePage launcher', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('shows the five game modes and swaps challenge content into view', async () => {
    await db.jobs.bulkPut([
      makeJob('spin-the-gears', 1, 'Spin the Gears'),
      makeJob('feed-the-hopper', 1, 'Feed the Hopper'),
      makeJob('build-the-loader', 2, 'Build the Loader'),
    ]);

    render(
      <MemoryRouter>
        <AppBootProvider bootTask={async () => undefined}>
          <HomePage />
        </AppBootProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /Mason's.*Engineering Lab/i })).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /Guided Build/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Engineering Workbook/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Challenges/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Silly Scenes/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Free Build/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Challenges/i }));

    expect(screen.getByRole('heading', { name: /Ten featured medals to chase right now/i })).toBeInTheDocument();
    expect(screen.getByText('First Spin')).toBeInTheDocument();
    expect(screen.getByText('The Full Monty')).toBeInTheDocument();
  });
});
