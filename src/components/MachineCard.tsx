import { Link } from 'react-router-dom';
import { db } from '../lib/db';
import type { SavedExperimentRecord } from '../lib/types';

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: '#4ade80',
  medium: '#fec84b',
  hard: '#ef7b45',
  boss: '#f87171',
};

interface MachineCardProps {
  machine: SavedExperimentRecord;
  accent?: string;
}

export function MachineCard({ machine, accent = '#47c5a5' }: MachineCardProps) {
  const difficulty = machine.experiment.metadata.difficulty;
  const diffColor = DIFFICULTY_COLORS[difficulty] ?? '#94a3b8';
  const isFavorite = machine.labEntry.favorite ?? false;

  function toggleFavorite(e: React.MouseEvent) {
    e.preventDefault();
    void db.machines.update(machine.recordId, {
      labEntry: { ...machine.labEntry, favorite: !isFavorite },
      updatedAt: new Date().toISOString(),
    });
  }

  return (
    <article className="machine-card" style={{ ['--card-accent' as string]: accent }}>
      <div className="machine-card-top">
        <div className="machine-card-eyebrow">
          <p className="eyebrow">{machine.experiment.family.replaceAll('-', ' ')}</p>
          <span className="difficulty-pill" style={{ color: diffColor, borderColor: `${diffColor}44` }}>
            {difficulty}
          </span>
        </div>
        <h3>{machine.experiment.metadata.title}</h3>
        <p>{machine.experiment.metadata.shortDescription}</p>
      </div>
      <div className="machine-card-bottom">
        <div className="tag-row">
          {machine.experiment.metadata.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="tag-chip">{tag}</span>
          ))}
        </div>
        <div className="machine-card-actions">
          <button
            type="button"
            className="fav-btn"
            onClick={toggleFavorite}
            title={isFavorite ? 'Remove Favorite' : 'Save as Favorite'}
            aria-label={isFavorite ? 'Remove favorite machine' : 'Save machine as favorite'}
            aria-pressed={isFavorite}
          >
            {isFavorite ? '★' : '☆'}
          </button>
          <Link to={`/machines/${machine.recordId}`} className="machine-card-link">
            Inspect
          </Link>
          <Link to={`/build?machine=${machine.recordId}`} className="machine-card-link machine-card-link-primary">
            Open Build
          </Link>
        </div>
      </div>
    </article>
  );
}
