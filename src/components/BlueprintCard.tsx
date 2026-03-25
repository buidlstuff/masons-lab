import { Link } from 'react-router-dom';
import type { SavedBlueprintRecord } from '../lib/types';

interface BlueprintCardProps {
  blueprintRecord: SavedBlueprintRecord;
}

export function BlueprintCard({ blueprintRecord }: BlueprintCardProps) {
  const { blueprint } = blueprintRecord;

  return (
    <article className="blueprint-card">
      <div className="machine-card-top">
        <p className="eyebrow">{blueprint.category.replaceAll('-', ' ')}</p>
        <h3>{blueprint.title}</h3>
        <p>{blueprint.summary}</p>
      </div>
      <div className="blueprint-meta">
        <div className="tag-row">
          {blueprint.ports.slice(0, 3).map((port) => (
            <span key={port.portId} className="tag-chip">
              {port.label}
            </span>
          ))}
        </div>
        <div className="link-row">
          <Link to={`/build?blueprint=${blueprintRecord.recordId}`}>Use In Build</Link>
        </div>
      </div>
    </article>
  );
}
