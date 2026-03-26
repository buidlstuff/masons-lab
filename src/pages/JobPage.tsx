import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { db } from '../lib/db';
import { createDraftFromProject } from '../lib/seed-data';

export function JobPage() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const job = useLiveQuery(() => (jobId ? db.jobs.get(jobId) : undefined), [jobId]);

  if (!job) {
    return (
      <div className="page centered-page">
        <h1>Project not found</h1>
        <Link to="/">Back to Yard</Link>
      </div>
    );
  }

  const project = job;

  async function handleLaunch() {
    const draft = createDraftFromProject(project);
    await db.drafts.put(draft);
    navigate(`/build/${draft.draftId}?job=${project.jobId}`);
  }

  return (
    <div className="page page-job-detail">
      <div className="detail-hero">
        <div>
          <p className="eyebrow">Starter Project</p>
          <h1>{project.title}</h1>
          <p>{project.summary}</p>
        </div>
        <div className="hero-actions">
          <button type="button" className="primary-link" onClick={() => void handleLaunch()}>
            Start Project
          </button>
          <Link to="/build">Open Empty Yard</Link>
        </div>
      </div>

      <section className="detail-grid">
        <article className="panel">
          <p className="eyebrow">Goal</p>
          <h2>What you will learn</h2>
          <p>{project.objective}</p>
          <p className="muted">{project.teachingGoal}</p>
        </article>

        <article className="panel">
          <p className="eyebrow">Coaching</p>
          <h2>What the project will emphasize</h2>
          <ul>
            {project.hints.map((hint) => (
              <li key={hint}>{hint}</li>
            ))}
          </ul>
        </article>
      </section>

      <section className="panel">
        <p className="eyebrow">Step by Step</p>
        <h2>Only the relevant parts show up at each stage</h2>
        <div className="preview-strip">
          {(project.steps ?? []).map((step, index) => (
            <article key={step.stepId} className="yard-start-card">
              <span className="yard-start-index">{index + 1}</span>
              <div>
                <strong>{step.title}</strong>
                <p>{step.instruction}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
