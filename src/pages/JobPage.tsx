import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { db } from '../lib/db';
import { createDraftFromMachine } from '../lib/seed-data';

export function JobPage() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const job = useLiveQuery(() => (jobId ? db.jobs.get(jobId) : undefined), [jobId]);
  const recommendedMachines = useLiveQuery(
    async () => {
      if (!job) {
        return [];
      }
      return db.machines.where('recordId').anyOf(job.recommendedMachineIds).toArray();
    },
    [job],
  );

  if (!job) {
    return (
      <div className="page centered-page">
        <h1>Job not found</h1>
        <Link to="/">Back to Yard</Link>
      </div>
    );
  }

  const currentJob = job;

  async function handleLaunch(machineId?: string) {
    if (!machineId) {
      navigate('/build');
      return;
    }

    const machine = await db.machines.get(machineId);
    if (!machine) {
      navigate('/build');
      return;
    }

    const draft = createDraftFromMachine(machine);
    await db.drafts.put(draft);
    navigate(`/build/${draft.draftId}?job=${currentJob.jobId}`);
  }

  return (
    <div className="page page-job-detail">
      <div className="detail-hero">
        <div>
          <p className="eyebrow">Tier {currentJob.tier} {currentJob.playable === false ? 'Preview Job' : 'Playable Job'}</p>
          <h1>{currentJob.title}</h1>
          <p>{currentJob.summary}</p>
        </div>
        <div className="hero-actions">
          <button
            type="button"
            className="primary-link"
            onClick={() => handleLaunch(recommendedMachines?.[0]?.recordId)}
            disabled={currentJob.playable === false && !recommendedMachines?.[0]?.recordId}
          >
            Launch Recommended Machine
          </button>
          <Link to="/build">Open Empty Draft</Link>
        </div>
      </div>

      {currentJob.playable === false ? (
        <section className="panel">
          <p className="eyebrow">Stage 2 Preview</p>
          <h2>This job is planned, not fully simulated yet</h2>
          <p>
            The blueprint and progression scaffolding are live, but this job still needs its dedicated runtime rules and success checks.
          </p>
        </section>
      ) : null}

      <section className="detail-grid">
        <article className="panel">
          <p className="eyebrow">Objective</p>
          <h2>What to complete</h2>
          <p>{currentJob.objective}</p>
          <p className="muted">{currentJob.teachingGoal}</p>
        </article>
        <article className="panel">
          <p className="eyebrow">Hint Cards</p>
          <h2>Engineering nudges</h2>
          <ul>
            {currentJob.hints.map((hint) => (
              <li key={hint}>{hint}</li>
            ))}
          </ul>
          {currentJob.recommendedBlueprintIds?.length ? (
            <p className="muted">Recommended blueprints: {currentJob.recommendedBlueprintIds.join(', ')}</p>
          ) : null}
        </article>
      </section>
    </div>
  );
}
