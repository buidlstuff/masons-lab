import type { ExperimentManifest, PrimitiveInstance } from '../lib/types';

interface InspectorPanelProps {
  primitive?: PrimitiveInstance;
  manifest: ExperimentManifest;
  onDelete: (primitiveId: string) => void;
  onUpdateNumber: (primitiveId: string, key: string, value: number) => void;
}

const SAFE_NUMBER_FIELDS = ['x', 'y', 'rpm', 'teeth', 'speed', 'ropeLength', 'capacity', 'releaseRate', 'fill', 'radius', 'traction'];

export function InspectorPanel({ primitive, manifest, onDelete, onUpdateNumber }: InspectorPanelProps) {
  return (
    <section className="panel inspector-panel">
      <div className="panel-header compact">
        <div>
          <p className="eyebrow">Inspector</p>
          <h3>{primitive ? primitive.label ?? primitive.kind : 'Select a part'}</h3>
        </div>
      </div>

      {primitive ? (
        <div className="inspector-content">
          <p className="muted">{primitive.kind}</p>
          {Object.entries(primitive.config)
            .filter(([, value]) => typeof value === 'number')
            .filter(([key]) => SAFE_NUMBER_FIELDS.includes(key))
            .map(([key, value]) => (
              <label key={key} className="field">
                <span>{key}</span>
                <input
                  type="number"
                  value={value as number}
                  onChange={(event) => onUpdateNumber(primitive.id, key, Number(event.target.value))}
                />
              </label>
            ))}

          <button type="button" className="danger-button" onClick={() => onDelete(primitive.id)}>
            Delete Part
          </button>
        </div>
      ) : (
        <div className="inspector-empty">
          <p>Pick a machine part on the canvas to tweak its safe parameters.</p>
        </div>
      )}

      <div className="inspector-footer">
        <p className="eyebrow">Machine</p>
        <strong>{manifest.metadata.title}</strong>
        <p className="muted">{manifest.metadata.shortDescription}</p>
      </div>
    </section>
  );
}
