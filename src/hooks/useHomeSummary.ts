import { useEffect, useState } from 'react';
import { db } from '../lib/db';
import type { DraftRecord, SavedExperimentRecord, SiteJobDefinition } from '../lib/types';

type HomeProjectSummary = SiteJobDefinition & {
  completed: boolean;
};

export interface HomeSummary {
  latestDraft: DraftRecord | null;
  savedMachinesPreview: SavedExperimentRecord[];
  projects: HomeProjectSummary[];
  completedCount: number;
  nextProjectId?: string;
  xp: number;
}

export function useHomeSummary(enabled = true) {
  const [summary, setSummary] = useState<HomeSummary | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!enabled) {
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      const [draftCandidates, machineCandidates, projects, completedProgress, xpRecord] = await Promise.all([
        db.drafts.orderBy('updatedAt').reverse().limit(6).toArray(),
        db.machines.orderBy('updatedAt').reverse().limit(12).toArray(),
        db.jobs.orderBy('tier').limit(8).toArray(),
        db.jobProgress.toCollection().filter((progress) => progress.completed).limit(12).toArray(),
        db.settings.get('xp'),
      ]);

      if (cancelled) {
        return;
      }

      const latestDraft = draftCandidates.find((draft) => !draft.manifest.metadata.recipeId) ?? null;
      const completedJobIds = new Set(completedProgress.map((item) => item.jobId));
      const playableProjects = projects
        .filter((job) => job.kind === 'starter-project' || job.playable !== false)
        .map((project) => ({
          ...project,
          completed: completedJobIds.has(project.jobId),
        }));
      const nextProjectId = playableProjects.find((project) => !project.completed)?.jobId;

      setSummary({
        latestDraft,
        savedMachinesPreview: machineCandidates
          .filter((machine) => !machine.featured && !machine.experiment.metadata.recipeId)
          .slice(0, 4),
        projects: playableProjects,
        completedCount: playableProjects.filter((project) => project.completed).length,
        nextProjectId,
        xp: xpRecord ? Number(xpRecord.value) : 0,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return enabled ? summary : null;
}
