import { useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { JobCard } from '../components/JobCard';
import { MachineCard } from '../components/MachineCard';
import { useHomeSummary } from '../hooks/useHomeSummary';
import { useAppBoot } from '../lib/app-boot';
import { ENGINEERING_HANDBOOK_ENTRIES } from '../lib/engineering-handbook';
import { markPerformance, measurePerformance } from '../lib/perf';
import { scheduleBuildPrefetch } from '../lib/route-preload';
import { TIER_NAMES, TIER_THRESHOLDS, tierForXp } from '../lib/xp';

export function HomePage() {
  const boot = useAppBoot();
  const summary = useHomeSummary(boot.status !== 'pending');
  const summaryMeasuredRef = useRef(false);
  const projects = summary?.projects ?? [];
  const latestDraft = summary?.latestDraft ?? null;
  const honestMachines = summary?.savedMachinesPreview ?? [];
  const allStarterProjectsComplete = projects.length > 0 && projects.every((project) => project.completed);
  const nextProject = projects.find((project) => !project.completed) ?? projects[0];
  const orderedProjects = useMemo(
    () => (nextProject
      ? [nextProject, ...projects.filter((project) => project.jobId !== nextProject.jobId)]
      : projects),
    [nextProject, projects],
  );

  const xp = summary?.xp ?? 0;
  const tier = tierForXp(xp);
  const tierName = TIER_NAMES[tier];
  const nextTier = tier < 4 ? tier + 1 : null;
  const tierFloor = TIER_THRESHOLDS[tier];
  const tierCeiling = nextTier ? TIER_THRESHOLDS[nextTier] : tierFloor;
  const tierProgress = nextTier ? Math.min(100, ((xp - tierFloor) / (tierCeiling - tierFloor)) * 100) : 100;

  useEffect(() => {
    if (boot.status === 'pending') {
      return;
    }

    const cancelPrefetch = scheduleBuildPrefetch();
    return cancelPrefetch;
  }, [boot.status]);

  useEffect(() => {
    if (!summary || summaryMeasuredRef.current) {
      return;
    }

    markPerformance('home-summary-ready');
    measurePerformance('home-summary-duration', 'app-mounted', 'home-summary-ready');
    summaryMeasuredRef.current = true;
  }, [summary]);

  const guidedAction = latestDraft
    ? {
        label: 'Resume Guided Play',
        to: `/build/${latestDraft.draftId}`,
        title: latestDraft.manifest.metadata.title,
        detail: 'Pick up where you left off.',
      }
    : nextProject
      ? {
          label: nextProject.completed ? 'Replay Guided Play' : 'Start Guided Play',
          to: `/build?job=${nextProject.jobId}`,
          title: nextProject.title,
          detail: nextProject.summary,
        }
      : {
          label: 'Browse Guided Play',
          to: '#starter-projects',
          title: 'Guided Play',
          detail: 'Start with a recipe or a starter project.',
        };
  const freeBuildAction = {
    label: 'Open Free Build',
    to: '/build',
    title: latestDraft ? 'Open the yard' : 'Start from scratch',
    detail: 'Open the canvas with the full part drawer and build whatever you want.',
  };
  const handbookRecipes = ENGINEERING_HANDBOOK_ENTRIES;
  const completedCount = summary?.completedCount ?? 0;
  const homeLoading = boot.status === 'pending' || (boot.status === 'ready' && !summary);
  const homeDegraded = boot.status === 'degraded';

  return (
    <div className="page page-home">
      <section className="hero-shell yard-hero home-hero">
        <div className="hero-copy home-hero-copy">
          <p className="eyebrow">Mason&apos;s Lab</p>
          <h1>Mason&apos;s Engineering Lab</h1>
          <p className="home-hero-deck">Choose guided play or open free build.</p>
          <div className="home-hero-stats" aria-label="Yard summary">
            <div className="home-stat-chip">
              <strong>{homeLoading ? '…' : projects.length}</strong>
              <span>Starter Projects</span>
            </div>
            <div className="home-stat-chip">
              <strong>{homeLoading ? '…' : `${completedCount}/${projects.length}`}</strong>
              <span>Completed</span>
            </div>
            <div className="home-stat-chip">
              <strong>{homeLoading ? '…' : xp}</strong>
              <span>{`Tier ${tier} · ${tierName}`}</span>
            </div>
          </div>
          {homeDegraded ? (
            <p className="builder-status builder-status-warning home-boot-status">
              {boot.message ?? 'Storage is limited, so the yard is running in reduced mode.'}
            </p>
          ) : null}
        </div>

        <div className="hero-panel home-entry-panel">
          {homeLoading ? (
            <div className="home-loading-stack" aria-hidden="true">
              <div className="home-focus-card home-loading-card">
                <div className="skeleton-line skeleton-line-eyebrow" />
                <div className="skeleton-line skeleton-line-title" />
                <div className="skeleton-line skeleton-line-copy" />
                <div className="skeleton-line skeleton-line-copy short" />
              </div>
              <div className="home-focus-card home-loading-card">
                <div className="skeleton-line skeleton-line-eyebrow" />
                <div className="skeleton-line skeleton-line-title" />
                <div className="skeleton-line skeleton-line-copy" />
                <div className="skeleton-line skeleton-line-copy short" />
              </div>
            </div>
          ) : (
            <>
              <div className="home-entry-grid">
                {guidedAction.to.startsWith('#') ? (
                  <a href={guidedAction.to} className="home-entry-card home-entry-card-guided">
                    <p className="eyebrow">Guided Play</p>
                    <strong>{guidedAction.title}</strong>
                    <p>{guidedAction.detail}</p>
                    <span>{guidedAction.label}</span>
                  </a>
                ) : (
                  <Link to={guidedAction.to} className="home-entry-card home-entry-card-guided">
                    <p className="eyebrow">Guided Play</p>
                    <strong>{guidedAction.title}</strong>
                    <p>{guidedAction.detail}</p>
                    <span>{guidedAction.label}</span>
                  </Link>
                )}

                <Link to={freeBuildAction.to} className="home-entry-card home-entry-card-free">
                  <p className="eyebrow">Free Build</p>
                  <strong>{freeBuildAction.title}</strong>
                  <p>{freeBuildAction.detail}</p>
                  <span>{freeBuildAction.label}</span>
                </Link>
              </div>

              <div className="home-path-list">
                <p className="eyebrow">Starter Path</p>
                {orderedProjects.slice(0, 3).map((project, index) => (
                  <Link key={project.jobId} to={`/build?job=${project.jobId}`} className="home-path-row">
                    <span className="home-path-index">{index + 1}</span>
                    <div>
                      <strong>{project.title}</strong>
                      <p>{project.completed ? 'Finished once. Replay anytime.' : project.summary}</p>
                    </div>
                  </Link>
                ))}
              </div>

              <div className="xp-bar-block home-tier-block">
                <div className="xp-bar-header">
                  <span className={`tier-badge tier-${tier}`}>Tier {tier} · {tierName}</span>
                  <span className="muted">{xp} XP</span>
                </div>
                <div className="xp-bar">
                  <div className="xp-bar-fill" style={{ width: `${tierProgress}%` }} />
                </div>
                <p className="xp-bar-caption muted">
                  Guided play teaches the basics. Free build is where the experiments start.
                </p>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="section-block">
        <div className="section-head">
          <div>
            <p className="eyebrow">Engineering Handbook</p>
            <h2>Open a working example</h2>
          </div>
        </div>
        <div className="card-grid home-handbook-grid">
          {handbookRecipes.map((recipe) => (
            <Link
              key={recipe.id}
              to={`/build?blueprint=${recipe.blueprintId}`}
              className="yard-start-card home-handbook-card"
            >
              <p className="eyebrow">Recipe</p>
              <strong>{recipe.title}</strong>
              <p>{recipe.summary}</p>
              <p className="muted">Parts: {recipe.partList.join(', ')}</p>
              <span>Open Recipe</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="section-block" id="starter-projects">
        <div className="section-head">
          <div>
            <p className="eyebrow">Guided Play</p>
            <h2>{allStarterProjectsComplete ? 'Starter path finished' : 'Start with clear cause and effect.'}</h2>
          </div>
        </div>
        {allStarterProjectsComplete ? (
          <div className="card-grid home-mission-grid">
            <article className="yard-start-card mission-card mission-card-map">
              <span className="yard-start-index">🗺</span>
              <div>
                <strong>Mission Map</strong>
                <p>The first three districts are live. More guided builds will appear here.</p>
              </div>
            </article>
            <Link to="/build" className="yard-start-card mission-card mission-card-free">
              <span className="yard-start-index">∞</span>
              <div>
                <strong>Free Build</strong>
                <p>Open the yard and experiment without the guided path.</p>
              </div>
            </Link>
          </div>
        ) : null}
        {homeLoading ? (
          <div className="job-grid home-job-grid">
            {Array.from({ length: 3 }).map((_, index) => (
              <article key={`job-skeleton-${index}`} className={`job-card featured home-loading-card ${index > 0 ? 'compact' : ''}`}>
                <div className="skeleton-line skeleton-line-eyebrow" />
                <div className="skeleton-line skeleton-line-title" />
                <div className="skeleton-line skeleton-line-copy" />
                <div className="skeleton-line skeleton-line-copy" />
                <div className="skeleton-line skeleton-line-copy short" />
              </article>
            ))}
          </div>
        ) : (
          <div className="job-grid home-job-grid">
            {orderedProjects.map((job, index) => (
              <JobCard
                key={job.jobId}
                job={job}
                completed={job.completed}
                featured={index === 0}
              />
            ))}
          </div>
        )}
      </section>

      <section className="section-block two-col">
        <div>
          <div className="section-head">
            <div>
              <p className="eyebrow">Your Bench</p>
              <h2>Your Latest Work</h2>
            </div>
          </div>

          {!homeLoading && latestDraft ? (
            <Link to={`/build/${latestDraft.draftId}`} className="yard-draft-card home-draft-card">
              <p className="eyebrow">Latest Draft</p>
              <strong>{latestDraft.manifest.metadata.title}</strong>
              <p>{latestDraft.manifest.metadata.shortDescription}</p>
              <span>Continue Working</span>
            </Link>
          ) : homeLoading ? (
            <div className="empty-card home-loading-card">
              <div className="skeleton-line skeleton-line-title" />
              <div className="skeleton-line skeleton-line-copy" />
              <div className="skeleton-line skeleton-line-copy short" />
            </div>
          ) : (
            <div className="empty-card">
              <h3>No Draft Yet</h3>
              <p>Start the first project and the yard will remember where you stopped.</p>
              <div className="home-empty-actions">
                {guidedAction.to.startsWith('#') ? (
                  <a href={guidedAction.to} className="home-inline-link">
                    Start First Project
                  </a>
                ) : (
                  <Link to={guidedAction.to} className="home-inline-link">
                    Start First Project
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="section-head">
            <div>
              <p className="eyebrow">Saved Machines</p>
              <h2>Machines Worth Keeping</h2>
            </div>
          </div>

          {!homeLoading && honestMachines.length > 0 ? (
            <div className="card-grid">
              {honestMachines.slice(0, 4).map((machine) => (
                <MachineCard key={machine.recordId} machine={machine} />
              ))}
            </div>
          ) : homeLoading ? (
            <div className="card-grid">
              {Array.from({ length: 2 }).map((_, index) => (
                <div key={`machine-skeleton-${index}`} className="machine-card home-loading-card">
                  <div className="skeleton-line skeleton-line-eyebrow" />
                  <div className="skeleton-line skeleton-line-title" />
                  <div className="skeleton-line skeleton-line-copy" />
                  <div className="skeleton-line skeleton-line-copy short" />
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-card">
              <h3>No saved machines yet</h3>
              <p>Save the first machine that teaches you something real about motion or flow.</p>
              <div className="home-empty-actions">
                <Link to="/build" className="home-inline-link">
                  Open Free Build
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
