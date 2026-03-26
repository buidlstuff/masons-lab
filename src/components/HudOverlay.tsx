import type { BuildTelemetry, HudWidgetSpec } from '../lib/types';

interface HudOverlayProps {
  hud: HudWidgetSpec[];
  telemetry: BuildTelemetry;
}

function metricValue(metric: string | undefined, telemetry: BuildTelemetry): string {
  switch (metric) {
    case 'input-rpm':   return `${Math.round(telemetry.inputRpm ?? 0)}`;
    case 'output-rpm':  return `${Math.round(telemetry.outputRpm ?? 0)}`;
    case 'gear-ratio':  return `${(telemetry.gearRatio ?? 1).toFixed(2)}:1`;
    case 'hopper-fill': return `${Math.round(telemetry.hopperFill ?? 0)}`;
    case 'throughput':  return `${Math.round(telemetry.throughput ?? 0)}/s`;
    case 'train-speed': return `${telemetry.trainSpeed ?? 0}`;
    case 'hook-height': return `${Math.round(telemetry.hookHeight ?? 0)}px`;
    default: return '—';
  }
}

function metricUnit(metric: string | undefined): string {
  switch (metric) {
    case 'input-rpm':
    case 'output-rpm':  return 'RPM';
    case 'gear-ratio':  return '';
    case 'hopper-fill': return 'blocks';
    case 'throughput':  return '';
    case 'train-speed': return '';
    case 'hook-height': return '';
    default: return '';
  }
}

export function HudOverlay({ hud, telemetry }: HudOverlayProps) {
  const readouts = hud.filter((w) => w.kind === 'readout' && w.metric);
  if (readouts.length === 0) return null;

  return (
    <div className="hud-overlay" aria-label="Live readouts">
      {readouts.map((widget) => (
        <div key={widget.id} className={`hud-widget hud-${widget.position}`}>
          <span className="hud-label">{widget.label}</span>
          <span className="hud-value">
            {metricValue(widget.metric, telemetry)}
            {metricUnit(widget.metric) && (
              <span className="hud-unit"> {metricUnit(widget.metric)}</span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
