import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { BlueprintCard } from '../components/BlueprintCard';
import { JobCard } from '../components/JobCard';
import { MachineCard } from '../components/MachineCard';
import { db } from '../lib/db';
import { tierForXp, TIER_NAMES } from '../lib/xp';

export function HomePage() {
  const machines = useLiveQuery(() => db.machines.orderBy('updatedAt').reverse().toArray(), []);
  const jobs = useLiveQuery(() => db.jobs.toArray(), []);
  const progress = useLiveQuery(() => db.jobProgress.toArray(), []);
  const blueprints = useLiveQuery(() => db.blueprints.toArray(), []);
  const xpRecord = useLiveQuery(() => db.settings.get('xp'), []);
  const xp = xpRecord ? Number(xpRecord.value) : 0;
  const tier = tierForXp(xp);
  const tierName = TIER_NAMES[tier];

  const featured = machines?.filter((machine) => machine.featured) ?? [];
  const saved = machines?.filter((machine) => !machine.featured) ?? [];
  const starterBlueprints = blueprints?.filter((blueprint) => blueprint.starter) ?? [];
  const savedBlueprints = blueprints?.filter((blueprint) => !blueprint.starter) ?? [];
  const playableJobs = jobs?.filter((job) => job.playable !== false) ?? [];
  const previewJobs = jobs?.filter((job) => job.playable === false) ?? [];

  return (
    <div className="page page-home">
      <section className="hero-shell">
        <div className="hero-copy">
          <p className="eyebrow">Mason's Yard</p>
          <h1>Mason&apos;s Construction Sandbox</h1>
          <p>
            Build machines, solve site jobs, and save the best parts for the next invention.
          </p>
          <div className="hero-actions">
            <Link to="/build" className="primary-link">
              Start a New Draft
            </Link>
            {featured[0] ? <Link to={`/build?machine=${featured[0].recordId}`}>Launch Featured Machine</Link> : null}
          </div>
        </div>
        <div className="hero-panel">
          <p className="eyebrow">Current Yard Build</p>
          <ul>
            <li>{featured.length} featured machines</li>
            <li>{blueprints?.length ?? 0} starter and saved blueprints</li>
            <li>{jobs?.length ?? 0} site jobs ({playableJobs.length} playable now)</li>
            <li>Hybrid AI + manual build mode</li>
          </ul>
          <div className="xp-bar-block">
            <div className="xp-bar-header">
              <span className={`tier-badge tier-${tier}`}>Tier {tier} — {tierName}</span>
              <span className="muted">{xp} XP</span>
            </div>
            <div className="xp-bar">
              <div
                className="xp-bar-fill"
                style={{ width: `${Math.min(100, (xp / 1000) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="section-block">
        <div className="section-head">
          <div>
            <p className="eyebrow">Featured Machines</p>
            <h2>Machines already waiting in the yard</h2>
          </div>
          <Link to="/build">New Draft</Link>
        </div>
        <div className="card-grid">
          {featured.map((machine, index) => (
            <MachineCard
              key={machine.recordId}
              machine={machine}
              accent={['#47c5a5', '#fec84b', '#ef7b45', '#60a5fa'][index % 4]}
            />
          ))}
        </div>
      </section>

      <section className="section-block two-col">
        <div>
          <div className="section-head">
            <div>
              <p className="eyebrow">My Machines</p>
              <h2>Saved builds and remixes</h2>
            </div>
          </div>
          {saved.length > 0 ? (
            <div className="card-grid">
              {saved.map((machine) => (
                <MachineCard key={machine.recordId} machine={machine} />
              ))}
            </div>
          ) : (
            <div className="empty-card">
              <h3>No saved remixes yet</h3>
              <p>Open a featured machine, tweak it, and save your first yard build.</p>
            </div>
          )}
        </div>
        <div>
          <div className="section-head">
            <div>
              <p className="eyebrow">My Blueprints</p>
              <h2>Reusable modules for the yard</h2>
            </div>
          </div>
          <div className="section-stack">
            {starterBlueprints.length > 0 ? (
              <>
                <div className="mini-head">
                  <strong>Starter blueprints</strong>
                  <span className="muted">{starterBlueprints.length} ready-to-mount modules</span>
                </div>
                <div className="card-grid">
                  {starterBlueprints.slice(0, 6).map((blueprint) => (
                    <BlueprintCard key={blueprint.recordId} blueprintRecord={blueprint} />
                  ))}
                </div>
              </>
            ) : null}

            {savedBlueprints.length > 0 ? (
              <>
                <div className="mini-head">
                  <strong>Saved blueprints</strong>
                  <span className="muted">{savedBlueprints.length} modules from your own machines</span>
                </div>
                <div className="card-grid">
                  {savedBlueprints.map((blueprint) => (
                    <BlueprintCard key={blueprint.recordId} blueprintRecord={blueprint} />
                  ))}
                </div>
              </>
            ) : (
              <div className="empty-card">
                <h3>No custom blueprints yet</h3>
                <p>Use Save Blueprint in the builder to turn a machine into a reusable module.</p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="section-block two-col">
        <div>
          <div className="section-head">
            <div>
              <p className="eyebrow">Today&apos;s Job Board</p>
              <h2>Playable jobs and future yard work</h2>
            </div>
          </div>
          <div className="job-grid">
            {playableJobs.map((job) => (
              <JobCard
                key={job.jobId}
                job={job}
                completed={Boolean(progress?.find((item) => item.jobId === job.jobId && item.completed))}
              />
            ))}
          </div>
          {previewJobs.length > 0 ? (
            <div className="preview-strip">
              <div className="mini-head">
                <strong>Next wave</strong>
                <span className="muted">{previewJobs.length} more jobs scaffolded for Stage 2</span>
              </div>
              <div className="job-grid">
                {previewJobs.slice(0, 3).map((job) => (
                  <JobCard key={job.jobId} job={job} />
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <div>
          <div className="section-head">
            <div>
              <p className="eyebrow">Lab Notebook</p>
              <h2>Latest build notes</h2>
            </div>
          </div>
          <div className="notebook-card">
            {machines?.slice(0, 3).map((machine) => (
              <article key={machine.recordId} className="notebook-entry">
                <strong>{machine.experiment.metadata.title}</strong>
                <p>{machine.labEntry.whatLearned ?? machine.experiment.metadata.teachingGoal}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
