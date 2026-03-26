import { useState } from 'react';
import { PART_CATEGORIES, type PrimitiveKind } from '../lib/types';

// The 5 parts with the strongest, most immediate physics feedback in free-build mode.
const BEGINNER_PARTS: Array<{ kind: PrimitiveKind; icon: string; label: string; tagline: string }> = [
  { kind: 'motor',    icon: '⚡', label: 'Motor',    tagline: 'Makes things spin' },
  { kind: 'gear',     icon: '⚙', label: 'Gear',     tagline: 'Changes speed' },
  { kind: 'wheel',    icon: '○', label: 'Wheel',    tagline: 'Rolls on surfaces' },
  { kind: 'conveyor', icon: '▶', label: 'Conveyor', tagline: 'Moves cargo along' },
  { kind: 'hopper',   icon: '▽', label: 'Hopper',   tagline: 'Collects and fills' },
];

interface PartPaletteProps {
  selectedKind?: PrimitiveKind | null;
  onSelectKind: (kind: PrimitiveKind | null) => void;
}

export function PartPalette({ selectedKind, onSelectKind }: PartPaletteProps) {
  const [beginner, setBeginner] = useState(() => {
    try { return localStorage.getItem('mason-beginner-mode') !== 'false'; }
    catch { return true; }
  });

  function toggleBeginner() {
    const next = !beginner;
    setBeginner(next);
    try { localStorage.setItem('mason-beginner-mode', String(next)); } catch { /* ignore */ }
  }

  return (
    <section className="panel palette-panel">
      <div className="panel-header compact">
        <div>
          <p className="eyebrow">Part Drawer</p>
          <h3>Pick a part to place</h3>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {selectedKind && (
            <button type="button" className="ghost-button" onClick={() => onSelectKind(null)}>
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Mode toggle */}
      <div className="palette-mode-toggle">
        <button
          type="button"
          className={`palette-mode-btn ${beginner ? 'active' : ''}`}
          onClick={() => { if (!beginner) toggleBeginner(); }}
        >
          Starter
        </button>
        <button
          type="button"
          className={`palette-mode-btn ${!beginner ? 'active' : ''}`}
          onClick={() => { if (beginner) toggleBeginner(); }}
        >
          All Parts
        </button>
      </div>

      {beginner ? (
        /* ── Beginner mode: 5 core parts with taglines ── */
        <div className="palette-beginner-list">
          {BEGINNER_PARTS.map(({ kind, icon, label, tagline }) => (
            <button
              key={kind}
              type="button"
              className={`palette-beginner-item ${selectedKind === kind ? 'active' : ''}`}
              onClick={() => onSelectKind(selectedKind === kind ? null : kind)}
            >
              <span className="palette-beginner-icon">{icon}</span>
              <div className="palette-beginner-info">
                <span className="palette-beginner-label">{label}</span>
                <span className="palette-beginner-tagline">{tagline}</span>
              </div>
              {selectedKind === kind && <span className="palette-beginner-check">▶</span>}
            </button>
          ))}

          <details className="palette-more-details">
            <summary className="palette-more-summary">More parts…</summary>
            <div className="palette-categories">
              {PART_CATEGORIES.map((category) => (
                <div key={category.label} className="palette-category">
                  <p className="palette-category-label">{category.label}</p>
                  <div className="palette-grid">
                    {category.kinds
                      .filter((k) => !BEGINNER_PARTS.some((b) => b.kind === k))
                      .map((kind) => (
                        <button
                          key={kind}
                          type="button"
                          className={`palette-item ${selectedKind === kind ? 'active' : ''}`}
                          title={labelForPart(kind)}
                          onClick={() => onSelectKind(selectedKind === kind ? null : kind)}
                        >
                          <span className="palette-icon">{iconForPart(kind)}</span>
                          <span className="palette-label">{labelForPart(kind)}</span>
                        </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </details>
        </div>
      ) : (
        /* ── All-parts mode: category grid ── */
        <div className="palette-categories">
          {PART_CATEGORIES.map((category) => (
            <div key={category.label} className="palette-category">
              <p className="palette-category-label">{category.label}</p>
              <div className="palette-grid">
                {category.kinds.map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    className={`palette-item ${selectedKind === kind ? 'active' : ''}`}
                    title={labelForPart(kind)}
                    onClick={() => onSelectKind(selectedKind === kind ? null : kind)}
                  >
                    <span className="palette-icon">{iconForPart(kind)}</span>
                    <span className="palette-label">{labelForPart(kind)}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedKind && (
        <p className="palette-hint muted">
          Click on the canvas to place {labelForPart(selectedKind)}.
        </p>
      )}
    </section>
  );
}

function iconForPart(kind: PrimitiveKind): string {
  switch (kind) {
    case 'node': return '●';
    case 'wheel': return '○';
    case 'axle': return '─';
    case 'motor': return '⚡';
    case 'gear': return '⚙';
    case 'winch': return '🔧';
    case 'hook': return '🪝';
    case 'rail-segment': return '═';
    case 'rail-switch': return '⇌';
    case 'locomotive': return '🚂';
    case 'wagon': return '🚃';
    case 'conveyor': return '▶';
    case 'hopper': return '▽';
    case 'cargo-block': return '■';
    case 'material-pile': return '▲';
    default: return '◆';
  }
}

function labelForPart(kind: PrimitiveKind): string {
  switch (kind) {
    case 'rail-segment': return 'Rail';
    case 'rail-switch': return 'Switch';
    case 'cargo-block': return 'Cargo';
    case 'material-pile': return 'Pile';
    default:
      return kind
        .split('-')
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(' ');
  }
}
