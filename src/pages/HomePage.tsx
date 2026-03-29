import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { WinkyDog } from '../components/WinkyDog';
import { useAppBoot } from '../lib/app-boot';
import {
  ACTIVE_SANDBOX_CHALLENGE_LIMIT,
  SANDBOX_CHALLENGE_CATALOG,
  getActiveSandboxChallengeIds,
} from '../lib/challenge-launcher';
import { db } from '../lib/db';
import { ENGINEERING_HANDBOOK_ENTRIES } from '../lib/engineering-handbook';
import { markPerformance, measurePerformance } from '../lib/perf';
import { VISIBLE_PUZZLE_CHALLENGE_LAUNCHER_CARDS } from '../lib/puzzle-challenge-launcher';
import { scheduleBuildPrefetch } from '../lib/route-preload';
import { VISIBLE_SILLY_SCENE_LAUNCHER_CARDS } from '../lib/silly-scene-launcher';
import type {
  ChallengeProgressRecord,
  DraftRecord,
  JobProgressRecord,
  PuzzleChallengeProgressRecord,
  SavedExperimentRecord,
  SettingRecord,
  SiteJobDefinition,
} from '../lib/types';
import { TIER_NAMES, tierForXp } from '../lib/xp';

type HomeMode = 'guided' | 'workbook' | 'challenges' | 'scenes' | 'free';
type HomeChallengeCategory = (typeof SANDBOX_CHALLENGE_CATALOG)[number]['category'];

interface HomeSnapshot {
  challengeProgress: ChallengeProgressRecord[];
  completedProgress: JobProgressRecord[];
  draftCandidates: DraftRecord[];
  jobs: SiteJobDefinition[];
  machineCandidates: SavedExperimentRecord[];
  puzzleChallengeProgress: PuzzleChallengeProgressRecord[];
  xpRecord?: SettingRecord;
}

const MODE_ICONS: Record<HomeMode, string> = {
  guided: '⚙️',
  workbook: '📖',
  challenges: '🏆',
  scenes: '🎉',
  free: '🛠️',
};

const WINKY_HINTS: Record<HomeMode, string> = {
  guided: 'Winky says: start with the guided builds first and the whole yard makes more sense. Dad would probably still try the giant motor first.',
  workbook: 'Winky says: recipes are the fastest way to learn what a weird part can actually do, and Mom would appreciate being able to read the cards now.',
  challenges: 'Winky says: puzzle levels are for focused tinkering, and the medal board below tracks the real sandbox wins.',
  scenes: 'Winky says: silly scenes are best when you remix them instead of leaving them alone.',
  free: 'Winky says: free build is where the giant ridiculous inventions happen. Rose-grade chaos is absolutely allowed.',
};

const HOME_CHALLENGE_CATEGORY_ORDER: HomeChallengeCategory[] = [
  'discovery',
  'engineering',
  'speed',
  'efficiency',
  'creative',
];

const HOME_CHALLENGE_CATEGORY_LABELS: Record<HomeChallengeCategory, string> = {
  discovery: 'Discovery',
  engineering: 'Engineering',
  speed: 'Speed',
  efficiency: 'Efficiency',
  creative: 'Creative',
};

export function HomePage() {
  const boot = useAppBoot();
  const summaryMeasuredRef = useRef(false);
  const previewRef = useRef<HTMLElement | null>(null);
  const [selectedMode, setSelectedMode] = useState<HomeMode>('guided');
  const [homeSnapshot, setHomeSnapshot] = useState<HomeSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (boot.status === 'pending') {
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      const [
        draftCandidates,
        machineCandidates,
        jobs,
        completedProgress,
        xpRecord,
        challengeProgress,
        puzzleChallengeProgress,
      ] = await Promise.all([
        db.drafts.orderBy('updatedAt').reverse().limit(6).toArray(),
        db.machines.orderBy('updatedAt').reverse().limit(12).toArray(),
        db.jobs.orderBy('tier').limit(8).toArray(),
        db.jobProgress.toCollection().filter((progress) => progress.completed).limit(12).toArray(),
        db.settings.get('xp'),
        db.challengeProgress.toArray(),
        db.puzzleChallengeProgress.toArray(),
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
        puzzleChallengeProgress,
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
  const puzzleChallengeProgress = homeSnapshot?.puzzleChallengeProgress;
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

  const puzzleProgressCount = useMemo(
    () => {
      const visiblePuzzleIds = new Set(VISIBLE_PUZZLE_CHALLENGE_LAUNCHER_CARDS.map((challenge) => challenge.id));
      return (puzzleChallengeProgress ?? [])
        .filter((entry) => visiblePuzzleIds.has(entry.puzzleChallengeId))
        .filter((entry) => entry.completed)
        .length;
    },
    [puzzleChallengeProgress],
  );
  const medalProgressCount = useMemo(
    () => {
      const visibleChallengeIds = new Set(SANDBOX_CHALLENGE_CATALOG.map((challenge) => challenge.id));
      return (challengeProgress ?? [])
        .filter((entry) => visibleChallengeIds.has(entry.challengeId))
        .filter((entry) => entry.completed)
        .length;
    },
    [challengeProgress],
  );
  const completedChallengeIds = useMemo(
    () => (challengeProgress ?? [])
      .filter((entry) => SANDBOX_CHALLENGE_CATALOG.some((challenge) => challenge.id === entry.challengeId))
      .filter((entry) => entry.completed)
      .map((entry) => entry.challengeId),
    [challengeProgress],
  );
  const activeChallengeIds = useMemo(
    () => getActiveSandboxChallengeIds(completedChallengeIds, ACTIVE_SANDBOX_CHALLENGE_LIMIT),
    [completedChallengeIds],
  );
  const completedChallengeIdSet = useMemo(
    () => new Set(completedChallengeIds),
    [completedChallengeIds],
  );
  const activeChallengeIdSet = useMemo(
    () => new Set(activeChallengeIds),
    [activeChallengeIds],
  );
  const nextMedalChallenge = useMemo(
    () => SANDBOX_CHALLENGE_CATALOG.find((challenge) => !completedChallengeIdSet.has(challenge.id)) ?? null,
    [completedChallengeIdSet],
  );
  const groupedMedalChallenges = useMemo(() => {
    const map = new Map<HomeChallengeCategory, typeof SANDBOX_CHALLENGE_CATALOG>();
    HOME_CHALLENGE_CATEGORY_ORDER.forEach((category) => map.set(category, []));
    SANDBOX_CHALLENGE_CATALOG.forEach((challenge) => {
      map.get(challenge.category)?.push(challenge);
    });
    return map;
  }, []);

  const xp = xpRecord ? Number(xpRecord.value) : 0;
  const tier = tierForXp(xp);
  const tierName = TIER_NAMES[tier];
  const completedProjects = projects.filter((project) => project.completed).length;
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

  const handleModeSelect = useCallback((mode: HomeMode) => {
    setSelectedMode(mode);

    if (
      typeof window === 'undefined'
      || typeof window.matchMedia !== 'function'
      || !window.matchMedia('(max-width: 1200px)').matches
    ) {
      return;
    }

    const behavior: ScrollBehavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth';
    const scheduleScroll = typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame.bind(window)
      : (callback: FrameRequestCallback) => window.setTimeout(callback, 0);

    scheduleScroll(() => {
      if (typeof previewRef.current?.scrollIntoView === 'function') {
        previewRef.current.scrollIntoView({ behavior, block: 'start' });
      }
    });
  }, []);

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
      hint: 'Solve authored puzzle levels, then keep earning medals in free build.',
      badge: `${puzzleProgressCount}/${VISIBLE_PUZZLE_CHALLENGE_LAUNCHER_CARDS.length} cleared`,
    },
    {
      id: 'scenes',
      label: 'Silly Scenes',
      hint: 'Load a goofy setup and remix the physics.',
      badge: `${VISIBLE_SILLY_SCENE_LAUNCHER_CARDS.length} scenes`,
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
              {ENGINEERING_HANDBOOK_ENTRIES.map((recipe) => (
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
              <h2>{VISIBLE_PUZZLE_CHALLENGE_LAUNCHER_CARDS.length} puzzle levels to solve right now</h2>
              <p>These open as fresh drafts with a focused goal and a curated part shelf. Medal challenges still unlock quietly in the normal yard while you build.</p>
            </div>
            <div className="home-preview-actions">
              <Link to={`/build?challengeLevel=${VISIBLE_PUZZLE_CHALLENGE_LAUNCHER_CARDS[0]?.id ?? ''}`} className="home-preview-primary">
                Open First Puzzle
              </Link>
            </div>
            <div className="home-preview-grid home-preview-grid-challenges">
              {VISIBLE_PUZZLE_CHALLENGE_LAUNCHER_CARDS.map((challenge) => {
                const completed = (puzzleChallengeProgress ?? []).some(
                  (entry) => entry.puzzleChallengeId === challenge.id && entry.completed,
                );
                return (
                  <Link key={challenge.id} to={`/build?challengeLevel=${challenge.id}`} className="home-preview-card home-challenge-card">
                  <div className="home-preview-card-top">
                    <span className="home-preview-scene-emoji" aria-hidden="true">{challenge.emoji}</span>
                    <span className={`home-preview-badge ${completed ? 'home-preview-badge-green' : 'home-preview-badge-blue'}`}>
                      {completed ? 'Solved' : 'Puzzle'}
                    </span>
                    <strong>{challenge.title}</strong>
                  </div>
                  <p>{challenge.description}</p>
                  <small>{challenge.objective}</small>
                  <span>{completed ? 'Replay Puzzle' : 'Load Puzzle'}</span>
                  </Link>
                );
              })}
            </div>
            <div className="home-preview-actions">
              <span className="home-preview-badge">
                {medalProgressCount}/{SANDBOX_CHALLENGE_CATALOG.length} medals earned in free build
              </span>
            </div>
            <div className="challenge-panel">
              <div className="challenge-panel-summary">
                <p className="eyebrow">Sandbox Medal Board</p>
                <h3>{completedChallengeIds.length} of {SANDBOX_CHALLENGE_CATALOG.length} complete</h3>
                {nextMedalChallenge ? (
                  <p className="muted">
                    Next up: <strong>{nextMedalChallenge.title}</strong>. {nextMedalChallenge.hint}
                  </p>
                ) : (
                  <p className="muted">Every current medal is complete on this machine account.</p>
                )}
              </div>
              {HOME_CHALLENGE_CATEGORY_ORDER.map((category) => {
                const items = groupedMedalChallenges.get(category) ?? [];
                if (items.length === 0) {
                  return null;
                }
                return (
                  <section key={category} className="challenge-group">
                    <h4>{HOME_CHALLENGE_CATEGORY_LABELS[category]}</h4>
                    <div className="challenge-card-list">
                      {items.map((challenge) => {
                        const completed = completedChallengeIdSet.has(challenge.id);
                        const active = activeChallengeIdSet.has(challenge.id) && !completed;
                        return (
                          <article
                            key={challenge.id}
                            className={`challenge-card${completed ? ' complete' : ''}${active ? ' active' : ''}`}
                          >
                            <div className="challenge-card-header">
                              <strong>{challenge.title}</strong>
                              <span className={`challenge-tier challenge-tier-${challenge.tier}`}>{challenge.tier}</span>
                            </div>
                            <p>{challenge.description}</p>
                            <p className="muted">{completed ? 'Completed' : challenge.hint}</p>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
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
              {VISIBLE_SILLY_SCENE_LAUNCHER_CARDS.map((scene) => (
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
                <p>Motors, ropes, hinges, pistons, buckets, springs, and the rest of the yard are ready.</p>
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
            <span>Puzzles</span>
            <strong>{homeLoading ? '…' : `${puzzleProgressCount}/${VISIBLE_PUZZLE_CHALLENGE_LAUNCHER_CARDS.length}`}</strong>
          </div>
          <div className="home-hud-pill">
            <span>XP</span>
            <strong>{homeLoading ? '…' : `${xp} · ${tierName}`}</strong>
          </div>
        </div>

        <div className="home-launcher-hero">
            <div className="home-launcher-title-wrap">
            <p className="eyebrow">Welcome to the Yard</p>
            <div className="home-launcher-title">
              <h1 className="home-launcher-heading">
                <span>Mason&apos;s</span>
                <strong>Engineering Lab</strong>
              </h1>
            </div>
            <p className="home-launcher-tagline">
              Build ridiculous machines, solve focused puzzles, and learn how every real part behaves.
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
                onClick={() => handleModeSelect(mode.id)}
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

          <section ref={previewRef} className="home-mode-preview" data-mode={selectedMode}>
            {renderModePreview()}
          </section>
        </div>
      </section>
    </div>
  );
}
