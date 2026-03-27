import { useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { JobCard } from '../components/JobCard';
import { MachineCard } from '../components/MachineCard';
import { useHomeSummary } from '../hooks/useHomeSummary';
import { useAppBoot } from '../lib/app-boot';
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

  const primaryAction = latestDraft
    ? {
        label: 'Continue Building',
        to: `/build/${latestDraft.draftId}`,
        title: latestDraft.manifest.metadata.title,
        detail: 'Pick up where you left off.',
      }
    : nextProject
      ? {
          label: 'Start Building',
          // Go directly into the builder — skip the detail page
          to: `/build?job=${nextProject.jobId}`,
          title: nextProject.title,
          detail: nextProject.summary,
        }
      : {
          label: 'Open Empty Yard',
          to: '/build',
          title: 'New Yard Draft',
          detail: 'Build one machine from scratch.',
        };
  const primaryLabel = latestDraft
    ? `Resume ${primaryAction.title}`
    : nextProject
      ? `Start ${nextProject.title}`
      : primaryAction.label;
  const secondaryAction = allStarterProjectsComplete
    ? { label: 'Open Free Build', to: '/build' }
    : { label: 'Browse Projects', to: '#starter-projects' };
  const completedCount = summary?.completedCount ?? 0;
  const isSecondaryHashLink = secondaryAction.to.startsWith('#');
  const homeLoading = boot.status === 'pending' || (boot.status === 'ready' && !summary);
  const homeDegraded = boot.status === 'degraded';

  return (
    <div className="page page-home">
      <section className="hero-shell yard-hero home-hero">
        <div className="hero-copy home-hero-copy">
          <p className="eyebrow">Mason&apos;s Lab</p>
          <h1>Build machines that actually work.</h1>
          <p className="home-hero-deck">
            A bright engineering yard for motion, flow, and problem-solving. Every visible part should earn its place.
          </p>
          <div className="hero-actions home-hero-actions">
            <Link to={primaryAction.to} className="primary-link">
              {primaryLabel}
            </Link>
            {isSecondaryHashLink ? (
              <a href={secondaryAction.to} className="ghost-button home-hero-link">
                {secondaryAction.label}
              </a>
            ) : (
              <Link to={secondaryAction.to} className="ghost-button home-hero-link">
                {secondaryAction.label}
              </Link>
            )}
          </div>
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
              <span>XP</span>
            </div>
          </div>
          {homeDegraded ? (
            <p className="builder-status builder-status-warning home-boot-status">
              {boot.message ?? 'Storage is limited, so the yard is running in reduced mode.'}
            </p>
          ) : null}
        </div>

        <div className="hero-panel home-focus-panel">
          {homeLoading ? (
            <div className="home-loading-stack" aria-hidden="true">
              <div className="home-focus-card home-loading-card">
                <div className="skeleton-line skeleton-line-eyebrow" />
                <div className="skeleton-line skeleton-line-title" />
                <div className="skeleton-line skeleton-line-copy" />
                <div className="skeleton-line skeleton-line-copy short" />
              </div>
              <div className="home-path-list home-loading-card">
                <div className="skeleton-line skeleton-line-eyebrow" />
                <div className="skeleton-line skeleton-line-copy" />
                <div className="skeleton-line skeleton-line-copy" />
                <div className="skeleton-line skeleton-line-copy short" />
              </div>
              <div className="xp-bar-block home-tier-block home-loading-card">
                <div className="skeleton-line skeleton-line-copy" />
                <div className="skeleton-line skeleton-line-copy short" />
              </div>
            </div>
          ) : (
            <>
              <div className="home-focus-card">
                <p className="eyebrow">Current Focus</p>
                <strong>{primaryAction.title}</strong>
                <p>{primaryAction.detail}</p>
                <Link to={primaryAction.to} className="home-inline-link">
                  {latestDraft ? 'Keep Going' : 'Jump In'}
                </Link>
              </div>

              <div className="home-path-list">
                <p className="eyebrow">Path</p>
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
                  XP only lands when the machine truly works.
                </p>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="section-block" id="starter-projects">
        <div className="section-head">
          <div>
            <p className="eyebrow">Starter Projects</p>
            <h2>{allStarterProjectsComplete ? 'Mission yard unlocked' : 'Three projects. Clear cause and effect.'}</h2>
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
                <Link to={primaryAction.to} className="home-inline-link">
                  {latestDraft ? 'Open Draft' : 'Start First Project'}
                </Link>
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
