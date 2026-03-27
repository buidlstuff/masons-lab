import type { ExperimentManifest, PrimitiveInstance } from '../lib/types';

interface InspectorPanelProps {
  primitive?: PrimitiveInstance;
  manifest: ExperimentManifest;
  onDelete: (primitiveId: string) => void;
  onUpdateValue: (primitiveId: string, key: string, value: number | string | boolean) => void;
}

const SAFE_NUMBER_FIELDS = ['x', 'y', 'rpm', 'teeth', 'speed', 'ropeLength', 'capacity', 'releaseRate', 'fill', 'radius', 'traction'];
const SAFE_TEXT_FIELDS = ['trackId'];

export function InspectorPanel({ primitive, manifest, onDelete, onUpdateValue }: InspectorPanelProps) {
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

          {/* Motor power toggle — the most important boolean in the whole lab */}
          {primitive.kind === 'motor' && (
            <div className="motor-power-row">
              <span>Power</span>
              <button
                type="button"
                className={`motor-power-btn ${(primitive.config as { powerState?: boolean }).powerState ? 'on' : 'off'}`}
                onClick={() => onUpdateValue(primitive.id, 'powerState', !(primitive.config as { powerState?: boolean }).powerState)}
              >
                {(primitive.config as { powerState?: boolean }).powerState ? 'ON' : 'OFF'}
              </button>
            </div>
          )}
          {Object.entries(primitive.config)
            .filter(([, value]) => typeof value === 'number')
            .filter(([key]) => SAFE_NUMBER_FIELDS.includes(key))
            .map(([key, value]) => (
              <label key={key} className="field">
                <span>{key}</span>
                <input
                  type="number"
                  value={value as number}
                  onChange={(event) => onUpdateValue(primitive.id, key, Number(event.target.value))}
                />
              </label>
            ))}

          {Object.entries(primitive.config)
            .filter(([, value]) => typeof value === 'string')
            .filter(([key]) => SAFE_TEXT_FIELDS.includes(key))
            .map(([key, value]) => (
              <label key={key} className="field">
                <span>{key}</span>
                <input
                  type="text"
                  value={value as string}
                  onChange={(event) => onUpdateValue(primitive.id, key, event.target.value)}
                />
              </label>
            ))}

          {Object.entries(primitive.config).filter(([key, value]) =>
            (typeof value === 'number' && SAFE_NUMBER_FIELDS.includes(key))
            || (typeof value === 'string' && SAFE_TEXT_FIELDS.includes(key)),
          ).length === 0 ? (
            <p className="muted">This part is mostly positioned directly on the canvas. Drag it to move it.</p>
          ) : null}

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
