import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useParams } from 'react-router-dom';
import { db } from '../lib/db';

export function BlueprintPage() {
  const { blueprintId } = useParams();
  const record = useLiveQuery(() => (blueprintId ? db.blueprints.get(blueprintId) : undefined), [blueprintId]);

  if (record === undefined) {
    return (
      <div className="page centered-page">
        <h1>Loading blueprint…</h1>
      </div>
    );
  }

  if (record === null) {
    return (
      <div className="page centered-page">
        <h1>Blueprint not found</h1>
        <Link to="/">Back to Yard</Link>
      </div>
    );
  }

  const { blueprint } = record;

  const portKindLabel: Record<string, string> = {
    'power-in': 'Power In',
    'power-out': 'Power Out',
    mount: 'Mount',
    'material-in': 'Material In',
    'material-out': 'Material Out',
  };

  return (
    <div className="page page-blueprint-detail">
      <div className="blueprint-detail-hero">
        <div>
          <p className="eyebrow">{blueprint.category.replaceAll('-', ' ')}</p>
          <h1>{blueprint.title}</h1>
          <p>{blueprint.summary}</p>
          <div className="tag-row">
            {blueprint.tags.map((tag) => (
              <span key={tag} className="tag-chip">{tag}</span>
            ))}
          </div>
        </div>
        <div className="hero-actions">
          <Link to={`/build?blueprint=${record.recordId}`} className="primary-link">
            Use In Build
          </Link>
          <Link to="/">Back to Yard</Link>
        </div>
      </div>

      <div className="blueprint-detail-grid">
        <section className="panel">
          <div className="panel-header compact">
            <div>
              <p className="eyebrow">Connection Ports</p>
              <h3>{blueprint.ports.length} port{blueprint.ports.length !== 1 ? 's' : ''}</h3>
            </div>
          </div>
          {blueprint.ports.length > 0 ? (
            <ul className="port-list">
              {blueprint.ports.map((port) => (
                <li key={port.portId} className="port-row">
                  <span className={`port-kind port-kind-${port.kind}`}>
                    {portKindLabel[port.kind] ?? port.kind}
                  </span>
                  <span>{port.label}</span>
                  {port.compatibleWith.length > 0 && (
                    <span className="muted">→ {port.compatibleWith.join(', ')}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No connection ports defined.</p>
          )}
        </section>

        <section className="panel">
          <div className="panel-header compact">
            <div>
              <p className="eyebrow">Parts in this Blueprint</p>
              <h3>{blueprint.fragment.primitives.length} part{blueprint.fragment.primitives.length !== 1 ? 's' : ''}</h3>
            </div>
          </div>
          <ul className="parts-list">
            {blueprint.fragment.primitives.map((prim) => (
              <li key={prim.id} className="part-row">
                <span className="part-kind">{prim.kind}</span>
                <span>{prim.label ?? prim.id}</span>
              </li>
            ))}
          </ul>
          {blueprint.fragment.controls.length > 0 && (
            <>
              <p className="eyebrow" style={{ marginTop: '1rem' }}>Controls</p>
              <ul className="parts-list">
                {blueprint.fragment.controls.map((ctrl) => (
                  <li key={ctrl.id} className="part-row">
                    <span className="part-kind">{ctrl.kind}</span>
                    <span>{ctrl.label}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
