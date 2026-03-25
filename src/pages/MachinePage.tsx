import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { db } from '../lib/db';
import { createDraftFromMachine } from '../lib/seed-data';

export function MachinePage() {
  const { machineId } = useParams();
  const navigate = useNavigate();
  const machine = useLiveQuery(() => (machineId ? db.machines.get(machineId) : undefined), [machineId]);

  if (!machine) {
    return (
      <div className="page centered-page">
        <h1>Machine not found</h1>
        <Link to="/">Back to Yard</Link>
      </div>
    );
  }

  const currentMachine = machine;

  async function handleRemix() {
    const draft = createDraftFromMachine(currentMachine);
    await db.drafts.put(draft);
    navigate(`/build/${draft.draftId}`);
  }

  async function handleDuplicate() {
    const clone = {
      ...currentMachine,
      recordId: crypto.randomUUID(),
      experiment: {
        ...currentMachine.experiment,
        experimentId: crypto.randomUUID(),
        metadata: {
          ...currentMachine.experiment.metadata,
          title: `${currentMachine.experiment.metadata.title} Mk2`,
          remixOfExperimentId: currentMachine.experiment.experimentId,
        },
      },
      labEntry: currentMachine.labEntry ?? {},
      featured: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await db.machines.put(clone);
    navigate(`/machines/${clone.recordId}`);
  }

  return (
    <div className="page page-machine-detail">
      <div className="detail-hero">
        <div>
          <p className="eyebrow">{currentMachine.experiment.family.replaceAll('-', ' ')}</p>
          <h1>{currentMachine.experiment.metadata.title}</h1>
          <p>{currentMachine.experiment.metadata.shortDescription}</p>
        </div>
        <div className="hero-actions">
          <Link to={`/build?machine=${currentMachine.recordId}`} className="primary-link">
            Play Machine
          </Link>
          <button type="button" onClick={handleRemix}>
            Remix
          </button>
          <button type="button" onClick={handleDuplicate}>
            Duplicate
          </button>
        </div>
      </div>

      <section className="detail-grid">
        <article className="panel">
          <p className="eyebrow">Teaching Goal</p>
          <h2>What this machine teaches</h2>
          <p>{currentMachine.experiment.metadata.teachingGoal}</p>
        </article>
        <article className="panel">
          <p className="eyebrow">How It Works</p>
          <h2>Machine explainer</h2>
          <p>{currentMachine.experiment.explanation.whatIsHappening}</p>
          <ul>
            {currentMachine.experiment.explanation.whatToTryNext.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      </section>
    </div>
  );
}
