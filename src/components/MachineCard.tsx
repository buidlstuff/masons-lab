import { Link } from 'react-router-dom';
import type { SavedExperimentRecord } from '../lib/types';

interface MachineCardProps {
  machine: SavedExperimentRecord;
  accent?: string;
}

export function MachineCard({ machine, accent = '#47c5a5' }: MachineCardProps) {
  return (
    <article className="machine-card" style={{ ['--card-accent' as string]: accent }}>
      <div className="machine-card-top">
        <p className="eyebrow">{machine.experiment.family.replaceAll('-', ' ')}</p>
        <h3>{machine.experiment.metadata.title}</h3>
        <p>{machine.experiment.metadata.shortDescription}</p>
      </div>
      <div className="machine-card-bottom">
        <div className="tag-row">
          {machine.experiment.metadata.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="tag-chip">
              {tag}
            </span>
          ))}
        </div>
        <div className="link-row">
          <Link to={`/machines/${machine.recordId}`}>Inspect</Link>
          <Link to={`/build?machine=${machine.recordId}`}>Play</Link>
        </div>
      </div>
    </article>
  );
}
