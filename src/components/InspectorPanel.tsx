import type { ExperimentManifest, PrimitiveInstance, PrimitiveKind } from '../lib/types';

interface InspectorPanelProps {
  primitive?: PrimitiveInstance;
  manifest: ExperimentManifest;
  onDelete: (primitiveId: string) => void;
  onUpdateValue: (primitiveId: string, key: string, value: number | string | boolean) => void;
}

const SAFE_NUMBER_FIELDS = ['x', 'y', 'rpm', 'teeth', 'speed', 'ropeLength', 'capacity', 'releaseRate', 'fill', 'radius', 'traction', 'mass', 'inputTeeth', 'outputTeeth'];
const SAFE_TEXT_FIELDS = ['trackId'];
const POSITION_ONLY_KINDS: PrimitiveKind[] = ['ball', 'rock'];
const CUSTOM_NUMBER_FIELDS: Partial<Record<PrimitiveKind, Array<{
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
}>>> = {
  ramp: [
    { key: 'width', label: 'width', min: 40, max: 240, step: 20 },
    { key: 'angle', label: 'angle', min: 0, max: 60, step: 5 },
  ],
  platform: [
    { key: 'width', label: 'width', min: 40, max: 240, step: 20 },
  ],
  wall: [
    { key: 'height', label: 'height', min: 20, max: 200, step: 10 },
  ],
};

function getCustomNumberFieldValue(primitive: PrimitiveInstance, key: string): number {
  switch (primitive.kind) {
    case 'ramp': {
      const config = primitive.config as { width: number; angle: number };
      return key === 'width' ? config.width : config.angle;
    }
    case 'platform': {
      const config = primitive.config as { width: number };
      return config.width;
    }
    case 'wall': {
      const config = primitive.config as { height: number };
      return config.height;
    }
    default:
      return 0;
  }
}

export function InspectorPanel({ primitive, manifest, onDelete, onUpdateValue }: InspectorPanelProps) {
  const customFields = primitive ? (CUSTOM_NUMBER_FIELDS[primitive.kind] ?? []) : [];
  const hiddenKeys = new Set<string>(customFields.map((field) => field.key));
  const positionOnly = primitive ? POSITION_ONLY_KINDS.includes(primitive.kind) : false;
  if (primitive && ['ramp', 'platform', 'wall', 'ball', 'rock'].includes(primitive.kind)) {
    hiddenKeys.add('x');
    hiddenKeys.add('y');
  }
  if (positionOnly) {
    hiddenKeys.add('radius');
  }

  const genericNumberFields = primitive
    ? Object.entries(primitive.config)
      .filter(([, value]) => typeof value === 'number')
      .filter(([key]) => SAFE_NUMBER_FIELDS.includes(key) && !hiddenKeys.has(key))
    : [];

  const genericTextFields = primitive
    ? Object.entries(primitive.config)
      .filter(([, value]) => typeof value === 'string')
      .filter(([key]) => SAFE_TEXT_FIELDS.includes(key) && !hiddenKeys.has(key))
    : [];

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
          {customFields.map((field) => (
            <label key={field.key} className="field">
              <span>{field.label}</span>
              <input
                type="number"
                min={field.min}
                max={field.max}
                step={field.step}
                value={getCustomNumberFieldValue(primitive, field.key)}
                onChange={(event) => onUpdateValue(primitive.id, field.key, Number(event.target.value))}
              />
            </label>
          ))}

          {positionOnly && 'x' in primitive.config && 'y' in primitive.config ? (
            <p className="muted">
              Position: {Math.round((primitive.config as { x: number; y: number }).x)}, {Math.round((primitive.config as { x: number; y: number }).y)}
            </p>
          ) : null}

          {genericNumberFields
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

          {genericTextFields
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

          {customFields.length === 0 && genericNumberFields.length === 0 && genericTextFields.length === 0 && !positionOnly ? (
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
