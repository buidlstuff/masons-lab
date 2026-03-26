import type { PrimitiveKind } from '../lib/types';

interface StarterOverlayProps {
  visible: boolean;
  onSelectKind: (kind: PrimitiveKind) => void;
}

const STARTER_STEPS = [
  {
    num: '1',
    kind: 'motor' as PrimitiveKind,
    icon: '⚡',
    label: 'Place a Motor',
    desc: 'Click anywhere on the canvas. A green ring shows its reach.',
  },
  {
    num: '2',
    kind: 'gear' as PrimitiveKind,
    icon: '⚙',
    label: 'Place a Gear inside the ring',
    desc: "Drop a gear inside the green circle and watch it spin!",
  },
  {
    num: '3',
    kind: 'gear' as PrimitiveKind,
    icon: '⚙',
    label: 'Add a second Gear touching the first',
    desc: 'Gears that touch each other spin in opposite directions.',
  },
];

export function StarterOverlay({ visible, onSelectKind }: StarterOverlayProps) {
  if (!visible) return null;

  return (
    <div className="starter-overlay">
      <div className="starter-card">
        <p className="eyebrow">Hey Mason — ready to build?</p>
        <h2>Build your first gear train</h2>
        <p className="muted">Follow these 3 steps and you'll have a spinning machine in under a minute.</p>
        <div className="starter-steps">
          {STARTER_STEPS.map((step, i) => (
            <button
              key={i}
              type="button"
              className={`starter-step ${i === 0 ? 'starter-step-primary' : ''}`}
              onClick={() => onSelectKind(step.kind)}
            >
              <span className="starter-step-num">{step.num}</span>
              <div className="starter-step-body">
                <span className="starter-step-label">{step.icon} {step.label}</span>
                <span className="starter-step-desc">{step.desc}</span>
              </div>
            </button>
          ))}
        </div>
        <p className="starter-skip muted">Or just pick any part from the drawer on the right →</p>
      </div>
    </div>
  );
}
