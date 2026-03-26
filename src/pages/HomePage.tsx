import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { BlueprintCard } from '../components/BlueprintCard';
import { JobCard } from '../components/JobCard';
import { MachineCard } from '../components/MachineCard';
import { db } from '../lib/db';
import { TIER_NAMES, TIER_THRESHOLDS, tierForXp } from '../lib/xp';

export function HomePage() {
  const drafts = useLiveQuery(() => db.drafts.orderBy('updatedAt').reverse().toArray(), []);
  const machines = useLiveQuery(() => db.machines.orderBy('updatedAt').reverse().toArray(), []);
  const jobs = useLiveQuery(() => db.jobs.toArray(), []);
  const progress = useLiveQuery(() => db.jobProgress.toArray(), []);
  const blueprints = useLiveQuery(() => db.blueprints.toArray(), []);
  const xpRecord = useLiveQuery(() => db.settings.get('xp'), []);

  const xp = xpRecord ? Number(xpRecord.value) : 0;
  const tier = tierForXp(xp);
  const tierName = TIER_NAMES[tier];
  const nextTier = tier < 4 ? tier + 1 : null;
  const tierFloor = TIER_THRESHOLDS[tier];
  const tierCeiling = nextTier ? TIER_THRESHOLDS[nextTier] : tierFloor;
  const tierProgress = nextTier ? Math.min(100, ((xp - tierFloor) / (tierCeiling - tierFloor)) * 100) : 100;
  const xpToNextTier = nextTier ? Math.max(0, tierCeiling - xp) : 0;

  const featured = machines?.filter((machine) => machine.featured) ?? [];
  const saved = machines?.filter((machine) => !machine.featured) ?? [];
  const starterBlueprints = blueprints?.filter((blueprint) => blueprint.starter) ?? [];
  const savedBlueprints = blueprints?.filter((blueprint) => !blueprint.starter) ?? [];
  const playableJobs = jobs?.filter((job) => job.playable !== false) ?? [];
  const completedJobIds = new Set(progress?.filter((item) => item.completed).map((item) => item.jobId) ?? []);
  const nextJob = playableJobs.find((job) => !completedJobIds.has(job.jobId)) ?? playableJobs[0];
  const latestDraft = drafts?.[0];
  const latestMachine = saved[0] ?? featured[0];
  const latestBlueprint = savedBlueprints[0] ?? starterBlueprints[0];

  const primaryAction = latestDraft
    ? {
        label: 'Continue Latest Draft',
        to: `/build/${latestDraft.draftId}`,
        title: latestDraft.manifest.metadata.title,
        detail: 'Pick up where you left off on the workbench.',
      }
    : nextJob
      ? {
          label: 'Start a Guided Job',
          to: `/jobs/${nextJob.jobId}`,
          title: nextJob.title,
          detail: 'Jobs give you a clear goal and the fastest way to earn XP.',
        }
      : {
          label: 'Start Your First Build',
          to: '/build',
          title: 'New draft',
          detail: 'Open the builder and make one thing move in under 30 seconds.',
        };

  return (
    <div className="page page-home">
      <section className="hero-shell yard-hero">
        <div className="hero-copy">
          <p className="eyebrow">Mason's Yard</p>
          <h1>Build something that moves, then put it to work.</h1>
          <p>
            The yard is easier to read now: start one clear task, learn from the featured rigs, and keep your own
            machines on the bench.
          </p>
          <div className="hero-actions">
            <Link to={primaryAction.to} className="primary-link">
              {primaryAction.label}
            </Link>
            {nextJob ? <Link to={`/jobs/${nextJob.jobId}`}>Today's Job</Link> : null}
            {featured[0] ? <Link to={`/build?machine=${featured[0].recordId}`}>Remix Featured Machine</Link> : null}
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
            {nextJob ? (
              <Link to={`/jobs/${nextJob.jobId}`} className="yard-start-card">
                <span className="yard-start-index">2</span>
                <div>
                  <strong>{nextJob.title}</strong>
                  <p>{nextJob.summary}</p>
                </div>
              </Link>
            ) : null}
            {latestMachine ? (
              <Link to={`/build?machine=${latestMachine.recordId}`} className="yard-start-card">
                <span className="yard-start-index">3</span>
                <div>
                  <strong>Remix {latestMachine.experiment.metadata.title}</strong>
                  <p>Use an existing machine as a starting point instead of opening a blank yard.</p>
                </div>
              </Link>
            ) : null}
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
              {nextTier
                ? `Jobs earn XP. ${xpToNextTier} XP until Tier ${nextTier} - ${TIER_NAMES[nextTier]}.`
                : 'Jobs earn XP. You already unlocked the top yard tier.'}
            </p>
          </div>
        </div>
      </section>

      <section className="section-block two-col">
        <div>
          <div className="section-head">
            <div>
              <p className="eyebrow">Learn from the Yard</p>
              <h2>Featured machines worth opening</h2>
            </div>
          </div>
          {featured.length > 0 ? (
            <div className="card-grid">
              {featured.map((machine, index) => (
                <MachineCard
                  key={machine.recordId}
                  machine={machine}
                  accent={['#47c5a5', '#fec84b', '#ef7b45', '#60a5fa'][index % 4]}
                />
              ))}
            </div>
          ) : (
            <div className="empty-card">
              <h3>No featured yard rigs yet</h3>
              <p>Start a draft and save a machine once you find a build worth keeping around.</p>
            </div>
          )}
        </div>

        <div>
          <div className="section-head">
            <div>
              <p className="eyebrow">Starter Modules</p>
              <h2>Blueprints you can mount quickly</h2>
            </div>
          </div>
          {starterBlueprints.length > 0 ? (
            <div className="card-grid">
              {starterBlueprints.slice(0, 6).map((blueprint) => (
                <BlueprintCard key={blueprint.recordId} blueprintRecord={blueprint} />
              ))}
            </div>
          ) : (
            <div className="empty-card">
              <h3>No starter blueprints yet</h3>
              <p>Save a working build as a blueprint to create your own reusable modules.</p>
            </div>
          )}
        </div>
      </section>

      <section className="section-block two-col">
        <div>
          <div className="section-head">
            <div>
              <p className="eyebrow">Your Bench</p>
              <h2>Saved machines and active drafts</h2>
            </div>
          </div>

          {latestDraft ? (
            <Link to={`/build/${latestDraft.draftId}`} className="yard-draft-card">
              <p className="eyebrow">Latest Draft</p>
              <strong>{latestDraft.manifest.metadata.title}</strong>
              <p>{latestDraft.manifest.metadata.shortDescription}</p>
              <span>Continue building</span>
            </Link>
          ) : null}

          {saved.length > 0 ? (
            <div className="card-grid">
              {saved.map((machine) => (
                <MachineCard key={machine.recordId} machine={machine} />
              ))}
            </div>
          ) : (
            <div className="empty-card">
              <h3>No saved machines yet</h3>
              <p>Use Save Machine in the builder once a draft is worth keeping on the bench.</p>
            </div>
          )}
        </div>

        <div>
          <div className="section-head">
            <div>
              <p className="eyebrow">Your Shelf</p>
              <h2>Custom blueprints and notes</h2>
            </div>
          </div>

          {latestBlueprint ? (
            <div className="yard-mini-summary">
              <strong>Most recent blueprint</strong>
              <p className="muted">
                {latestBlueprint.blueprint.title}: {latestBlueprint.blueprint.summary}
              </p>
            </div>
          ) : null}

          {savedBlueprints.length > 0 ? (
            <div className="card-grid">
              {savedBlueprints.map((blueprint) => (
                <BlueprintCard key={blueprint.recordId} blueprintRecord={blueprint} />
              ))}
            </div>
          ) : (
            <div className="empty-card">
              <h3>No custom blueprints yet</h3>
              <p>Save Blueprint from the builder to turn a working idea into a reusable module.</p>
            </div>
          )}

          <div className="notebook-card">
            {(machines ?? []).slice(0, 3).map((machine) => (
              <article key={machine.recordId} className="notebook-entry">
                <strong>{machine.experiment.metadata.title}</strong>
                <p>{machine.labEntry.whatLearned ?? machine.experiment.metadata.teachingGoal}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section-block">
        <div className="section-head">
          <div>
            <p className="eyebrow">Job Board</p>
            <h2>Guided work orders for XP and practice</h2>
          </div>
        </div>
        <div className="job-grid">
          {playableJobs.map((job) => (
            <JobCard key={job.jobId} job={job} completed={completedJobIds.has(job.jobId)} />
          ))}
        </div>
      </section>
    </div>
  );
}
