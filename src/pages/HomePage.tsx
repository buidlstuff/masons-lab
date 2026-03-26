import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { JobCard } from '../components/JobCard';
import { MachineCard } from '../components/MachineCard';
import { db } from '../lib/db';
import { TIER_NAMES, TIER_THRESHOLDS, tierForXp } from '../lib/xp';

export function HomePage() {
  const drafts = useLiveQuery(() => db.drafts.orderBy('updatedAt').reverse().toArray(), []);
  const machines = useLiveQuery(() => db.machines.orderBy('updatedAt').reverse().toArray(), []);
  const jobs = useLiveQuery(() => db.jobs.orderBy('tier').toArray(), []);
  const progress = useLiveQuery(() => db.jobProgress.toArray(), []);
  const xpRecord = useLiveQuery(() => db.settings.get('xp'), []);

  const honestDrafts = (drafts ?? []).filter((draft) => !draft.manifest.metadata.recipeId);
  const honestMachines = (machines ?? []).filter((machine) => !machine.featured && !machine.experiment.metadata.recipeId);
  const projects = (jobs ?? []).filter((job) => job.kind === 'starter-project' || job.playable !== false);
  const completedJobIds = new Set(progress?.filter((item) => item.completed).map((item) => item.jobId) ?? []);
  const nextProject = projects.find((project) => !completedJobIds.has(project.jobId)) ?? projects[0];
  const latestDraft = honestDrafts[0];

  const xp = xpRecord ? Number(xpRecord.value) : 0;
  const tier = tierForXp(xp);
  const tierName = TIER_NAMES[tier];
  const nextTier = tier < 4 ? tier + 1 : null;
  const tierFloor = TIER_THRESHOLDS[tier];
  const tierCeiling = nextTier ? TIER_THRESHOLDS[nextTier] : tierFloor;
  const tierProgress = nextTier ? Math.min(100, ((xp - tierFloor) / (tierCeiling - tierFloor)) * 100) : 100;

  const primaryAction = latestDraft
    ? {
        label: 'Continue Your Draft',
        to: `/build/${latestDraft.draftId}`,
        title: latestDraft.manifest.metadata.title,
        detail: 'Pick up where you left off in the honest sandbox.',
      }
    : nextProject
      ? {
          label: 'Start Project 1',
          to: `/jobs/${nextProject.jobId}`,
          title: nextProject.title,
          detail: 'The fastest path to a satisfying first machine is one guided starter project.',
        }
      : {
          label: 'Open Empty Yard',
          to: '/build',
          title: 'New Yard Draft',
          detail: 'Build one machine from scratch.',
        };

  return (
    <div className="page page-home">
      <section className="hero-shell yard-hero">
        <div className="hero-copy">
          <p className="eyebrow">Mason&apos;s Yard</p>
          <h1>One clear place to start. Three honest machines to learn.</h1>
          <p>
            Every starter project now runs on the real sandbox path. If a part is visible and editable, it should
            actually change what the machine does.
          </p>
          <div className="hero-actions">
            <Link to={primaryAction.to} className="primary-link">
              {primaryAction.label}
            </Link>
          </div>
        </div>

        <div className="hero-panel yard-start-panel">
          <p className="eyebrow">Start Here</p>
          <div className="yard-start-stack">
            <Link to={primaryAction.to} className="yard-start-card">
              <span className="yard-start-index">1</span>
              <div>
                <strong>{primaryAction.title}</strong>
                <p>{primaryAction.detail}</p>
              </div>
            </Link>
            {projects.slice(0, 2).map((project, index) => (
              <Link key={project.jobId} to={`/jobs/${project.jobId}`} className="yard-start-card">
                <span className="yard-start-index">{index + 2}</span>
                <div>
                  <strong>{project.title}</strong>
                  <p>{project.summary}</p>
                </div>
              </Link>
            ))}
          </div>

          <div className="xp-bar-block">
            <div className="xp-bar-header">
              <span className={`tier-badge tier-${tier}`}>Tier {tier} - {tierName}</span>
              <span className="muted">{xp} XP</span>
            </div>
            <div className="xp-bar">
              <div className="xp-bar-fill" style={{ width: `${tierProgress}%` }} />
            </div>
            <p className="xp-bar-caption muted">
              Projects earn XP once they are really working, not when a scripted preview says they are done.
            </p>
          </div>
        </div>
      </section>

      <section className="section-block">
        <div className="section-head">
          <div>
            <p className="eyebrow">Starter Projects</p>
            <h2>Learn the sandbox through 3 small machines</h2>
          </div>
        </div>
        <div className="job-grid">
          {projects.map((job) => (
            <JobCard key={job.jobId} job={job} completed={completedJobIds.has(job.jobId)} />
          ))}
        </div>
      </section>

      <section className="section-block two-col">
        <div>
          <div className="section-head">
            <div>
              <p className="eyebrow">Your Bench</p>
              <h2>Saved honest builds</h2>
            </div>
          </div>

          {latestDraft ? (
            <Link to={`/build/${latestDraft.draftId}`} className="yard-draft-card">
              <p className="eyebrow">Latest Draft</p>
              <strong>{latestDraft.manifest.metadata.title}</strong>
              <p>{latestDraft.manifest.metadata.shortDescription}</p>
              <span>Continue building</span>
            </Link>
          ) : (
            <div className="empty-card">
              <h3>No active draft yet</h3>
              <p>Start with the first project and you will have a real machine worth tweaking in minutes.</p>
            </div>
          )}
        </div>

        <div>
          <div className="section-head">
            <div>
              <p className="eyebrow">Saved Machines</p>
              <h2>Machines you decided to keep</h2>
            </div>
          </div>

          {honestMachines.length > 0 ? (
            <div className="card-grid">
              {honestMachines.slice(0, 4).map((machine) => (
                <MachineCard key={machine.recordId} machine={machine} />
              ))}
            </div>
          ) : (
            <div className="empty-card">
              <h3>No saved machines yet</h3>
              <p>Save the first machine that teaches you something real about motion or flow.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
