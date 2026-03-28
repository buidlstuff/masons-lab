import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { WinkyDog } from '../components/WinkyDog';
import { useAppBoot } from '../lib/app-boot';
import { FEATURED_CHALLENGE_LAUNCHER_CARDS } from '../lib/challenge-launcher';
import { db } from '../lib/db';
import { ENGINEERING_HANDBOOK_ENTRIES } from '../lib/engineering-handbook';
import { markPerformance, measurePerformance } from '../lib/perf';
import { scheduleBuildPrefetch } from '../lib/route-preload';
import { SILLY_SCENE_LAUNCHER_CARDS } from '../lib/silly-scene-launcher';
import type { ChallengeProgressRecord, DraftRecord, JobProgressRecord, SavedExperimentRecord, SettingRecord, SiteJobDefinition } from '../lib/types';
import { TIER_NAMES, tierForXp } from '../lib/xp';

type HomeMode = 'guided' | 'workbook' | 'challenges' | 'scenes' | 'free';

interface HomeSnapshot {
  challengeProgress: ChallengeProgressRecord[];
  completedProgress: JobProgressRecord[];
  draftCandidates: DraftRecord[];
  jobs: SiteJobDefinition[];
  machineCandidates: SavedExperimentRecord[];
  xpRecord?: SettingRecord;
}

const MODE_ICONS: Record<HomeMode, string> = {
  guided: '★',
  workbook: '📘',
  challenges: '🏅',
  scenes: '🎈',
  free: '∞',
};

const WINKY_HINTS: Record<HomeMode, string> = {
  guided: 'Winky says: start with the guided builds first and the whole yard makes more sense.',
  workbook: 'Winky says: recipes are the fastest way to learn what a weird part can actually do.',
  challenges: 'Winky says: medals pop when your machine really works, not when it only looks busy.',
  scenes: 'Winky says: silly scenes are best when you remix them instead of leaving them alone.',
  free: 'Winky says: free build is where the giant ridiculous inventions happen.',
};

export function HomePage() {
  const boot = useAppBoot();
  const summaryMeasuredRef = useRef(false);
  const [selectedMode, setSelectedMode] = useState<HomeMode>('guided');
  const [homeSnapshot, setHomeSnapshot] = useState<HomeSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (boot.status === 'pending') {
      setHomeSnapshot(null);
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      const [draftCandidates, machineCandidates, jobs, completedProgress, xpRecord, challengeProgress] = await Promise.all([
        db.drafts.orderBy('updatedAt').reverse().limit(6).toArray(),
        db.machines.orderBy('updatedAt').reverse().limit(12).toArray(),
        db.jobs.orderBy('tier').limit(8).toArray(),
        db.jobProgress.toCollection().filter((progress) => progress.completed).limit(12).toArray(),
        db.settings.get('xp'),
        db.challengeProgress.toArray(),
      ]);

      if (cancelled) {
        return;
      }

      setHomeSnapshot({
        challengeProgress,
        completedProgress,
        draftCandidates,
        jobs,
        machineCandidates,
        xpRecord: xpRecord ?? undefined,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [boot.status]);

  const challengeProgress = homeSnapshot?.challengeProgress;
  const completedProgress = homeSnapshot?.completedProgress;
  const draftCandidates = homeSnapshot?.draftCandidates;
  const jobs = homeSnapshot?.jobs;
  const machineCandidates = homeSnapshot?.machineCandidates;
  const xpRecord = homeSnapshot?.xpRecord;

  const completedJobIds = useMemo(
    () => new Set((completedProgress ?? []).map((item) => item.jobId)),
    [completedProgress],
  );
  const projects = useMemo(
    () => (jobs ?? [])
      .filter((job) => job.kind === 'starter-project' || job.playable !== false)
      .map((job) => ({
        ...job,
        completed: completedJobIds.has(job.jobId),
      })),
    [completedJobIds, jobs],
  );
  const latestDraft = useMemo(
    () => draftCandidates?.find((draft) => !draft.manifest.metadata.recipeId) ?? null,
    [draftCandidates],
  );
  const honestMachines = useMemo(
    () => (machineCandidates ?? [])
      .filter((machine) => !machine.featured && !machine.experiment.metadata.recipeId)
      .slice(0, 4),
    [machineCandidates],
  );
  const nextProject = projects.find((project) => !project.completed) ?? projects[0];
  const orderedProjects = useMemo(
    () => (nextProject
      ? [nextProject, ...projects.filter((project) => project.jobId !== nextProject.jobId)]
      : projects),
    [nextProject, projects],
  );

  const challengeProgressCount = useMemo(() => {
    const featuredIds = new Set(FEATURED_CHALLENGE_LAUNCHER_CARDS.map((challenge) => challenge.id));
    return (challengeProgress ?? []).filter((entry) => entry.completed && featuredIds.has(entry.challengeId)).length;
  }, [challengeProgress]);

  const xp = xpRecord ? Number(xpRecord.value) : 0;
  const tier = tierForXp(xp);
  const tierName = TIER_NAMES[tier];
  const completedProjects = projects.filter((project) => project.completed).length;
  const featuredRecipes = ENGINEERING_HANDBOOK_ENTRIES.slice(0, 4);
  const featuredScenes = SILLY_SCENE_LAUNCHER_CARDS.slice(0, 4);
  const homeLoading = boot.status === 'pending' || homeSnapshot === null;
  const homeDegraded = boot.status === 'degraded';
  const freeBuildTarget = latestDraft ? `/build/${latestDraft.draftId}` : '/build';

  useEffect(() => {
    if (boot.status === 'pending') {
      return;
    }

    const cancelPrefetch = scheduleBuildPrefetch();
    return cancelPrefetch;
  }, [boot.status]);

  useEffect(() => {
    if (homeLoading || summaryMeasuredRef.current) {
      return;
    }

    markPerformance('home-summary-ready');
    measurePerformance('home-summary-duration', 'app-mounted', 'home-summary-ready');
    summaryMeasuredRef.current = true;
  }, [homeLoading]);

  const guidedAction = latestDraft
    ? {
        label: 'Resume Guided Build',
        to: `/build/${latestDraft.draftId}`,
        title: latestDraft.manifest.metadata.title,
        detail: 'Jump back into the last draft you touched.',
      }
    : nextProject
      ? {
          label: nextProject.completed ? 'Replay Guided Build' : 'Start Guided Build',
          to: `/build?job=${nextProject.jobId}`,
          title: nextProject.title,
          detail: nextProject.summary,
        }
      : {
          label: 'Open Free Build',
          to: '/build',
          title: 'Open the workyard',
          detail: 'Start building directly in the sandbox.',
        };

  const modeButtons: Array<{
    id: HomeMode;
    label: string;
    hint: string;
    badge: string;
  }> = [
    {
      id: 'guided',
      label: 'Guided Build',
      hint: 'Start with the three core machines.',
      badge: homeLoading ? 'Loading…' : `${completedProjects}/${projects.length || 3} cleared`,
    },
    {
      id: 'workbook',
      label: 'Engineering Workbook',
      hint: 'Mount a real recipe and take it apart.',
      badge: `${ENGINEERING_HANDBOOK_ENTRIES.length} recipes`,
    },
    {
      id: 'challenges',
      label: 'Challenges',
      hint: 'Earn medals for honest machine behavior.',
      badge: `${challengeProgressCount ?? 0}/${FEATURED_CHALLENGE_LAUNCHER_CARDS.length} featured`,
    },
    {
      id: 'scenes',
      label: 'Silly Scenes',
      hint: 'Load a goofy setup and remix the physics.',
      badge: `${SILLY_SCENE_LAUNCHER_CARDS.length} scenes`,
    },
    {
      id: 'free',
      label: 'Free Build',
      hint: 'Open the yard and invent your own contraption.',
      badge: latestDraft ? 'Resume draft' : 'Blank yard',
    },
  ];

  function renderModePreview() {
    switch (selectedMode) {
      case 'guided':
        return (
          <>
            <div className="home-preview-head">
              <p className="eyebrow">Guided Build</p>
              <h2>{guidedAction.title}</h2>
              <p>{guidedAction.detail}</p>
            </div>
            <div className="home-preview-actions">
              <Link to={guidedAction.to} className="home-preview-primary">
                {guidedAction.label}
              </Link>
            </div>
            <div className="home-preview-grid home-preview-grid-guided">
              {orderedProjects.slice(0, 3).map((project) => (
                <Link
                  key={project.jobId}
                  to={`/build?job=${project.jobId}`}
                  className={`home-preview-card${project.completed ? ' is-complete' : ''}${nextProject?.jobId === project.jobId ? ' is-featured' : ''}`}
                >
                  <div className="home-preview-card-top">
                    <span className={`home-preview-badge challenge-tier-${project.completed ? 'bronze' : 'silver'}`}>
                      {project.completed ? 'Done' : 'Starter'}
                    </span>
                    <strong>{project.title}</strong>
                  </div>
                  <p>{project.summary}</p>
                  <span>{project.completed ? 'Replay Build' : 'Start Build'}</span>
                </Link>
              ))}
            </div>
          </>
        );
      case 'workbook':
        return (
          <>
            <div className="home-preview-head">
              <p className="eyebrow">Engineering Workbook</p>
              <h2>Working machines you can study instantly</h2>
              <p>These are real buildable contraptions, not fake examples. Mount one, run it, then remix it.</p>
            </div>
            <div className="home-preview-grid home-preview-grid-recipes">
              {featuredRecipes.map((recipe) => (
                <Link key={recipe.id} to={`/build?blueprint=${recipe.blueprintId}`} className="home-preview-card">
                  <div className="home-preview-card-top">
                    <span className="home-preview-badge home-preview-badge-blue">Recipe</span>
                    <strong>{recipe.title}</strong>
                  </div>
                  <p>{recipe.summary}</p>
                  <small>{recipe.partList.join(' · ')}</small>
                  <span>Mount Recipe</span>
                </Link>
              ))}
            </div>
          </>
        );
      case 'challenges':
        return (
          <>
            <div className="home-preview-head">
              <p className="eyebrow">Challenges</p>
              <h2>Ten featured medals to chase right now</h2>
              <p>Challenges unlock automatically while you build. Nothing is scripted. The machine has to really do the thing.</p>
            </div>
            <div className="home-preview-actions">
              <Link to={freeBuildTarget} className="home-preview-primary">
                Open Build and Earn Medals
              </Link>
            </div>
            <div className="home-preview-grid home-preview-grid-challenges">
              {FEATURED_CHALLENGE_LAUNCHER_CARDS.map((challenge) => (
                <article key={challenge.id} className="home-preview-card home-challenge-card">
                  <div className="home-preview-card-top">
                    <span className={`home-preview-badge challenge-tier-${challenge.tier}`}>{challenge.tier}</span>
                    <strong>{challenge.title}</strong>
                  </div>
                  <p>{challenge.description}</p>
                  <small>{challenge.category}</small>
                </article>
              ))}
            </div>
          </>
        );
      case 'scenes':
        return (
          <>
            <div className="home-preview-head">
              <p className="eyebrow">Silly Scenes</p>
              <h2>Start from a playful setup</h2>
              <p>These load as fresh drafts so Mason can experiment immediately instead of building from zero.</p>
            </div>
            <div className="home-preview-grid home-preview-grid-scenes">
              {featuredScenes.map((scene) => (
                <Link key={scene.id} to={`/build?scene=${scene.id}`} className="home-preview-card">
                  <div className="home-preview-card-top">
                    <span className="home-preview-scene-emoji" aria-hidden="true">{scene.emoji}</span>
                    <strong>{scene.title}</strong>
                  </div>
                  <p>{scene.description}</p>
                  <span>Load Scene</span>
                </Link>
              ))}
            </div>
          </>
        );
      case 'free':
      default:
        return (
          <>
            <div className="home-preview-head">
              <p className="eyebrow">Free Build</p>
              <h2>{latestDraft ? latestDraft.manifest.metadata.title : 'Open the blank workyard'}</h2>
              <p>
                {latestDraft
                  ? latestDraft.manifest.metadata.shortDescription
                  : 'Start with parts, connections, and the whole sandbox ready to go.'}
              </p>
            </div>
            <div className="home-preview-actions">
              <Link to={freeBuildTarget} className="home-preview-primary">
                {latestDraft ? 'Resume Free Build' : 'Start Free Build'}
              </Link>
              <Link to="/build" className="home-preview-secondary">
                Open Fresh Yard
              </Link>
            </div>
            <div className="home-preview-grid home-preview-grid-free">
              <article className="home-preview-card">
                <div className="home-preview-card-top">
                  <span className="home-preview-badge home-preview-badge-green">Sandbox</span>
                  <strong>Full part drawer</strong>
                </div>
                <p>Motors, ropes, hinges, rails, pistons, buckets, springs, and the rest of the yard are ready.</p>
              </article>
              <article className="home-preview-card">
                <div className="home-preview-card-top">
                  <span className="home-preview-badge home-preview-badge-blue">Workbench</span>
                  <strong>{honestMachines.length} saved machine{honestMachines.length === 1 ? '' : 's'} nearby</strong>
                </div>
                <p>Save the machines that actually taught Mason something, then come back and keep iterating.</p>
              </article>
            </div>
          </>
        );
    }
  }

  return (
    <div className="page page-home">
      <section className={`home-launcher-screen mode-${selectedMode}`}>
        <div className="home-launcher-hud" aria-label="Lab progress">
          <div className="home-hud-pill">
            <span>Projects</span>
            <strong>{homeLoading ? '…' : `${completedProjects}/${projects.length || 3}`}</strong>
          </div>
          <div className="home-hud-pill">
            <span>Medals</span>
            <strong>{homeLoading ? '…' : `${challengeProgressCount ?? 0}/${FEATURED_CHALLENGE_LAUNCHER_CARDS.length}`}</strong>
          </div>
          <div className="home-hud-pill">
            <span>XP</span>
            <strong>{homeLoading ? '…' : `${xp} · ${tierName}`}</strong>
          </div>
        </div>

        <div className="home-launcher-hero">
          <div className="home-launcher-title-wrap">
            <p className="eyebrow">Workshop Mode Select</p>
            <div className="home-launcher-title">
              <h1 className="home-launcher-heading">
                <span>Mason&apos;s</span>
                <strong>Engineering Lab</strong>
              </h1>
            </div>
            <p className="home-launcher-tagline">
              Build ridiculous machines, earn medals, and learn how every real part behaves.
            </p>
            {homeDegraded ? (
              <p className="builder-status builder-status-warning home-boot-status">
                {boot.message ?? 'Storage is limited, so the yard is running in reduced mode.'}
              </p>
            ) : null}
          </div>

          <div className="home-launcher-mascot">
            <div className="home-winky-bubble">
              <strong>Winky</strong>
              <p>{WINKY_HINTS[selectedMode]}</p>
            </div>
            <WinkyDog className="home-winky-dog" />
          </div>
        </div>

        <div className="home-launcher-stage">
          <aside className="home-mode-menu" aria-label="Game modes">
            {modeButtons.map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={`home-mode-button${selectedMode === mode.id ? ' is-selected' : ''}`}
                onClick={() => setSelectedMode(mode.id)}
              >
                <span className="home-mode-icon" aria-hidden="true">{MODE_ICONS[mode.id]}</span>
                <span className="home-mode-copy">
                  <strong>{mode.label}</strong>
                  <small>{mode.hint}</small>
                </span>
                <span className="home-mode-badge">{mode.badge}</span>
              </button>
            ))}
          </aside>

          <section className="home-mode-preview" data-mode={selectedMode}>
            {renderModePreview()}
          </section>
        </div>
      </section>
    </div>
  );
}
