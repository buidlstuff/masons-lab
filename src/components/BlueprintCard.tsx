import { Link } from 'react-router-dom';
import { db } from '../lib/db';
import type { SavedBlueprintRecord } from '../lib/types';

interface BlueprintCardProps {
  blueprintRecord: SavedBlueprintRecord;
}

export function BlueprintCard({ blueprintRecord }: BlueprintCardProps) {
  const { blueprint } = blueprintRecord;
  const isFavorite = blueprintRecord.favorite ?? false;

  function toggleFavorite(e: React.MouseEvent) {
    e.preventDefault();
    void db.blueprints.update(blueprintRecord.recordId, {
      favorite: !isFavorite,
      updatedAt: new Date().toISOString(),
    });
  }

  return (
    <article className="blueprint-card">
      <div className="machine-card-top">
        <div className="machine-card-eyebrow">
          <p className="eyebrow">{blueprint.category.replaceAll('-', ' ')}</p>
          {blueprintRecord.starter && <span className="starter-badge">Starter</span>}
        </div>
        <h3>{blueprint.title}</h3>
        <p>{blueprint.summary}</p>
      </div>
      <div className="blueprint-meta">
        <div className="tag-row">
          {blueprint.ports.slice(0, 3).map((port) => (
            <span key={port.portId} className="tag-chip">{port.label}</span>
          ))}
        </div>
        <div className="link-row">
          <button type="button" className="fav-btn" onClick={toggleFavorite} title={isFavorite ? 'Unfavorite' : 'Favorite'}>
            {isFavorite ? '★' : '☆'}
          </button>
          <Link to={`/build?blueprint=${blueprintRecord.recordId}`}>Use In Build</Link>
          <Link to={`/blueprints/${blueprintRecord.recordId}`}>Inspect</Link>
        </div>
      </div>
    </article>
  );
}
