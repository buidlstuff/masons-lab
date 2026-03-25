import { PART_CATEGORIES, type PrimitiveKind } from '../lib/types';

interface PartPaletteProps {
  selectedKind?: PrimitiveKind | null;
  onSelectKind: (kind: PrimitiveKind | null) => void;
}

export function PartPalette({ selectedKind, onSelectKind }: PartPaletteProps) {
  return (
    <section className="panel palette-panel">
      <div className="panel-header compact">
        <div>
          <p className="eyebrow">Part Drawer</p>
          <h3>Pick a part to place</h3>
        </div>
        {selectedKind && (
          <button type="button" className="ghost-button" onClick={() => onSelectKind(null)}>
            Clear
          </button>
        )}
      </div>
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
      {selectedKind && (
        <p className="palette-hint muted">Click on the canvas to place a {labelForPart(selectedKind)}.</p>
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
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(' ');
  }
}
