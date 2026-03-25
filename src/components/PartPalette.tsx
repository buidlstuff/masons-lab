import { SLICE_PARTS, type PrimitiveKind } from '../lib/types';

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
          <h3>12-part slice</h3>
        </div>
        <button type="button" className="ghost-button" onClick={() => onSelectKind(null)}>
          Clear Tool
        </button>
      </div>
      <div className="palette-grid">
        {SLICE_PARTS.map((kind) => (
          <button
            key={kind}
            type="button"
            className={`palette-item ${selectedKind === kind ? 'active' : ''}`}
            onClick={() => onSelectKind(selectedKind === kind ? null : kind)}
          >
            <span>{labelForPart(kind)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function labelForPart(kind: PrimitiveKind) {
  switch (kind) {
    case 'rail-segment':
      return 'Rail';
    default:
      return kind
        .split('-')
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(' ');
  }
}
