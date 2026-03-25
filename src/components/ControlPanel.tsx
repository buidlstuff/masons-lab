import type { ControlSpec } from '../lib/types';

interface ControlPanelProps {
  controls: ControlSpec[];
  values: Record<string, string | number | boolean>;
  onChange: (controlId: string, value: string | number | boolean) => void;
}

export function ControlPanel({ controls, values, onChange }: ControlPanelProps) {
  return (
    <section className="panel control-panel">
      <div className="panel-header compact">
        <div>
          <p className="eyebrow">Machine Controls</p>
          <h3>Live tuning</h3>
        </div>
      </div>

      <div className="control-stack">
        {controls.map((control) => {
          const value = values[control.id] ?? control.defaultValue;
          if (control.kind === 'slider') {
            return (
              <label key={control.id} className="field">
                <span>
                  {control.label}: <strong>{String(value)}</strong>
                </span>
                <input
                  type="range"
                  min={control.min}
                  max={control.max}
                  step={control.step}
                  value={Number(value)}
                  onChange={(event) => onChange(control.id, Number(event.target.value))}
                />
                {control.description ? <small>{control.description}</small> : null}
              </label>
            );
          }

          if (control.kind === 'toggle') {
            return (
              <label key={control.id} className="toggle-row">
                <span>{control.label}</span>
                <input
                  type="checkbox"
                  checked={Boolean(value)}
                  onChange={(event) => onChange(control.id, event.target.checked)}
                />
              </label>
            );
          }

          return (
            <button key={control.id} type="button" onClick={() => onChange(control.id, true)}>
              {control.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
