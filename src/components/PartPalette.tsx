import { useMemo, useState } from 'react';
import { PART_CATEGORIES, type ExperimentManifest, type PrimitiveInstance, type PrimitiveKind } from '../lib/types';

const QUICK_PARTS: PrimitiveKind[] = [
  'motor',
  'gear',
  'wheel',
  'conveyor',
  'hopper',
  'winch',
  'hook',
  'node',
  'pulley',
  'crane-arm',
];

interface PartPaletteProps {
  manifest: ExperimentManifest;
  selectedPrimitive?: PrimitiveInstance;
  selectedKind?: PrimitiveKind | null;
  activeJobHint?: string;
  allowedKinds?: PrimitiveKind[];
  projectTitle?: string;
  projectStepTitle?: string;
  onSelectKind: (kind: PrimitiveKind | null) => void;
}

interface PaletteSuggestion {
  kind: PrimitiveKind;
  reason: string;
}

export function PartPalette({
  manifest,
  selectedPrimitive,
  selectedKind,
  activeJobHint,
  allowedKinds,
  projectTitle,
  projectStepTitle,
  onSelectKind,
}: PartPaletteProps) {
  const [compactMode, setCompactMode] = useState(() => {
    try {
      return localStorage.getItem('mason-beginner-mode') !== 'false';
    } catch {
      return true;
    }
  });

  const counts = useMemo(() => countKinds(manifest), [manifest]);
  const suggestions = useMemo(
    () => deriveSuggestions(manifest, selectedPrimitive),
    [manifest, selectedPrimitive],
  );
  const guidedKinds = useMemo(
    () => (allowedKinds ? Array.from(new Set(allowedKinds)) : null),
    [allowedKinds],
  );
  const visibleSuggestions = useMemo(
    () => guidedKinds ? suggestions.filter((suggestion) => guidedKinds.includes(suggestion.kind)) : suggestions,
    [guidedKinds, suggestions],
  );
  const quickPartKinds = useMemo(
    () => (guidedKinds ? guidedKinds : QUICK_PARTS),
    [guidedKinds],
  );
  const canvasKinds = useMemo(
    () => Object.entries(counts)
      .filter(([, count]) => count > 0)
      .sort((left, right) => right[1] - left[1])
      .map(([kind]) => kind as PrimitiveKind),
    [counts],
  );

  function setCompact(next: boolean) {
    setCompactMode(next);
    try {
      localStorage.setItem('mason-beginner-mode', String(next));
    } catch {
      // Ignore storage failures.
    }
  }

  const renderPartTile = (kind: PrimitiveKind) => (
    <button
      key={kind}
      type="button"
      className={`palette-item palette-item-quick ${selectedKind === kind ? 'active' : ''}`}
      title={labelForPart(kind)}
      onClick={() => onSelectKind(selectedKind === kind ? null : kind)}
    >
      <span className="palette-icon">{iconForPart(kind)}</span>
      <span className="palette-label">{labelForPart(kind)}</span>
      {counts[kind] ? <span className="palette-item-count">x{counts[kind]}</span> : null}
    </button>
  );

  return (
    <section className="panel palette-panel">
      <div className="panel-header compact">
        <div>
          <p className="eyebrow">Parts</p>
          <h3>{guidedKinds ? projectStepTitle ?? 'Parts for this step' : 'Pick, place, and build'}</h3>
        </div>
        {selectedKind ? (
          <button type="button" className="ghost-button" onClick={() => onSelectKind(null)}>
            Clear
          </button>
        ) : null}
      </div>

      {!guidedKinds ? (
        <div className="palette-mode-toggle">
          <button
            type="button"
            className={`palette-mode-btn ${compactMode ? 'active' : ''}`}
            onClick={() => {
              if (!compactMode) {
                setCompact(true);
              }
            }}
          >
            Compact
          </button>
          <button
            type="button"
            className={`palette-mode-btn ${!compactMode ? 'active' : ''}`}
            onClick={() => {
              if (compactMode) {
                setCompact(false);
              }
            }}
          >
            Expanded
          </button>
        </div>
      ) : null}

      <div className="palette-quick-section">
        <div className="mini-head">
          <p className="palette-category-label">{guidedKinds ? 'This Step' : 'Quick Parts'}</p>
          <span className="palette-inline-hint">
            {guidedKinds
              ? 'Only the useful parts for this step are shown here.'
              : compactMode
                ? 'Core parts stay visible here. Expand categories below for the full shelf.'
                : 'The full shelf is open below. Use these for the fastest starts.'}
          </span>
        </div>
        <div className="palette-grid palette-grid-quick">
          {quickPartKinds.map(renderPartTile)}
        </div>
      </div>

      {guidedKinds ? (
        <div className="palette-context-card compact">
          <p className="palette-context-label">Project step</p>
          <strong>{projectTitle ?? 'Starter project'} is focused on these parts right now</strong>
          <p className="muted">
            {activeJobHint ?? 'Finish this step first. More parts unlock after the project is actually working.'}
          </p>
        </div>
      ) : (
        <div className="palette-category-panels">
          {PART_CATEGORIES.map((category) => {
            const presentCount = category.kinds.reduce((total, kind) => total + counts[kind], 0);
            return (
              <details key={category.label} className="palette-category-panel" open={!compactMode}>
                <summary className="palette-category-summary">
                  <span>{category.label}</span>
                  <span className="palette-category-summary-count">
                    {presentCount > 0 ? `${presentCount} on canvas` : `${category.kinds.length} parts`}
                  </span>
                </summary>
                <div className="palette-grid palette-grid-tight">
                  {category.kinds.map(renderPartTile)}
                </div>
              </details>
            );
          })}
        </div>
      )}

      <div className="palette-context-card compact">
        <p className="palette-context-label">{selectedPrimitive ? 'Selected part' : 'Build hint'}</p>
        <strong>
          {selectedPrimitive
            ? `${labelForPart(selectedPrimitive.kind)} selected`
            : manifest.primitives.length === 0
              ? 'Start with one visible cause-and-effect part'
              : 'Parts live here. Connections start from the big Connect Parts button above the canvas.'}
        </strong>
        <p className="muted">
          {selectedPrimitive
            ? connectionHintForKind(selectedPrimitive.kind)
            : activeJobHint ?? 'Motors, gears, conveyors, winches, and rails are the fastest ways to see motion.'}
        </p>
      </div>

      {selectedPrimitive && visibleSuggestions.length > 0 ? (
        <div className="palette-suggestion-list compact">
          {visibleSuggestions.slice(0, 2).map((suggestion) => (
            <button
              key={suggestion.kind}
              type="button"
              className={`palette-suggestion-card compact ${selectedKind === suggestion.kind ? 'active' : ''}`}
              onClick={() => onSelectKind(selectedKind === suggestion.kind ? null : suggestion.kind)}
            >
              <span className="palette-suggestion-icon">{iconForPart(suggestion.kind)}</span>
              <div className="palette-suggestion-copy">
                <span className="palette-suggestion-label">{labelForPart(suggestion.kind)}</span>
                <span className="palette-suggestion-reason">{suggestion.reason}</span>
              </div>
              {counts[suggestion.kind] ? (
                <span className="palette-suggestion-count">x{counts[suggestion.kind]}</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}

      {canvasKinds.length > 0 ? (
        <div className="palette-presence">
          {canvasKinds.slice(0, 6).map((kind) => (
            <span key={kind} className="palette-presence-chip">
              {labelForPart(kind)} x{counts[kind]}
            </span>
          ))}
        </div>
      ) : null}

      {selectedKind ? (
        <p className="palette-hint muted">
          Place {labelForPart(selectedKind)} on the canvas, then press Escape if you want to cancel.
        </p>
      ) : null}
    </section>
  );
}

function deriveSuggestions(
  manifest: ExperimentManifest,
  selectedPrimitive?: PrimitiveInstance,
): PaletteSuggestion[] {
  const suggestions = new Map<PrimitiveKind, string>();
  const counts = countKinds(manifest);
  const push = (kind: PrimitiveKind, reason: string) => {
    if (!suggestions.has(kind)) {
      suggestions.set(kind, reason);
    }
  };

  if (selectedPrimitive) {
    switch (selectedPrimitive.kind) {
      case 'motor':
        push('gear', 'Drop it inside the motor ring for instant rotation.');
        push('wheel', 'A wheel inside the ring gives quick visible motion.');
        push('pulley', 'Pulleys give you another driven rotating part right away.');
        push('flywheel', 'A flywheel makes stored momentum visible.');
        break;
      case 'gear':
      case 'wheel':
        push('gear', 'Touching gears mesh and make the motion legible.');
        push('pulley', 'Pulleys mesh like gears but read as smooth wheels.');
        push('flywheel', 'Flywheels keep the drivetrain moving longer.');
        push('motor', 'Add or move a motor nearby if this part is still idle.');
        break;
      case 'conveyor':
        push('hopper', 'Hoppers give conveyors a clear target.');
        push('cargo-block', 'Cargo is the fastest way to test conveyor movement.');
        push('motor', 'A nearby motor boosts conveyor speed.');
        break;
      case 'hopper':
        push('conveyor', 'Conveyors feed material into the hopper.');
        push('cargo-block', 'Cargo shows whether the hopper is actually receiving anything.');
        break;
      case 'winch':
      case 'hook':
        push('hook', 'A hook is the missing half of the hoist.');
        push('winch', 'A winch and hook only become useful together.');
        break;
      case 'node':
        push('node', 'A second node lets Connect create a beam.');
        break;
      case 'rail-segment':
        push('locomotive', 'Locomotives make the track meaningful.');
        push('wagon', 'Wagons show delivery progress once the train is moving.');
        push('station-zone', 'Stations make trains load and unload on purpose instead of feeling disconnected.');
        break;
      case 'locomotive':
      case 'wagon':
        push('rail-segment', 'Train parts still need a real rail segment underneath them.');
        push('station-zone', 'Stations give the rail system clear pickup and drop-off moments.');
        break;
      case 'ball':
      case 'rock':
      case 'cargo-block':
        push('trampoline', 'A trampoline is a fast way to turn a falling part into a visible bounce.');
        break;
      default:
        break;
    }
  }

  if (manifest.primitives.length === 0) {
    push('motor', 'Best first move for immediate motion.');
    push('conveyor', 'Great if you want cargo feedback quickly.');
    push('rail-segment', 'Start here if you want a train instead of gears.');
  } else {
    if (counts.motor > 0 && counts.gear === 0) {
      push('gear', 'You already have power on the canvas. Give the motor something to drive.');
    }
    if (counts.conveyor > 0 && counts.hopper === 0) {
      push('hopper', 'A hopper gives your conveyor an obvious destination.');
    }
    if ((counts.conveyor > 0 || counts.hopper > 0) && counts['cargo-block'] === 0) {
      push('cargo-block', 'Cargo makes processing setups readable right away.');
    }
    if (counts.winch > 0 && counts.hook === 0) {
      push('hook', 'Without a hook, the winch never gets to lift anything.');
    }
    if (counts['rail-segment'] > 0 && counts.locomotive === 0) {
      push('locomotive', 'Add a locomotive once the track exists.');
    }
    if ((counts.locomotive > 0 || counts.wagon > 0) && counts['station-zone'] === 0) {
      push('station-zone', 'Station zones make trains feel like they belong in the rest of the machine.');
    }
    if (counts.node === 1) {
      push('node', 'One more node is enough to create a beam.');
    }
  }

  return [...suggestions.entries()]
    .map(([kind, reason]) => ({ kind, reason }))
    .slice(0, 5);
}

function countKinds(manifest: ExperimentManifest) {
  const counts: Record<PrimitiveKind, number> = {
    node: 0,
    beam: 0,
    wheel: 0,
    axle: 0,
    motor: 0,
    gear: 0,
    winch: 0,
    rope: 0,
    'belt-link': 0,
    'chain-link': 0,
    'bolt-link': 0,
    'hinge-link': 0,
    'powered-hinge-link': 0,
    hook: 0,
    'rail-segment': 0,
    'rail-switch': 0,
    locomotive: 0,
    wagon: 0,
    'station-zone': 0,
    conveyor: 0,
    hopper: 0,
    'cargo-block': 0,
    'material-pile': 0,
    ramp: 0,
    platform: 0,
    wall: 0,
    ball: 0,
    rock: 0,
    'spring-linear': 0,
    pulley: 0,
    'chain-sprocket': 0,
    rack: 0,
    piston: 0,
    'crane-arm': 0,
    bucket: 0,
    counterweight: 0,
    cam: 0,
    'cam-follower': 0,
    'bevel-gear': 0,
    flywheel: 0,
    gearbox: 0,
    chassis: 0,
    chute: 0,
    'silo-bin': 0,
    water: 0,
    hinge: 0,
    tunnel: 0,
    trampoline: 0,
  };

  manifest.primitives.forEach((primitive) => {
    counts[primitive.kind] += 1;
  });

  return counts;
}

function connectionHintForKind(kind: PrimitiveKind) {
  switch (kind) {
    case 'motor':
      return 'Motors feel best when a gear, wheel, pulley, flywheel, or conveyor can pick up the power.';
    case 'gear':
      return 'Gears want motor reach, contact with another rotating part, or a chassis mount for a real drivetrain.';
    case 'pulley':
      return 'Pulleys can carry a drive link, route a belt through an idler path, or act as rope redirectors once a winch rope exists.';
    case 'chain-sprocket':
      return 'These can mesh by contact, use Connect to add a visible chain link, or mount onto a chassis.';
    case 'flywheel':
      return 'Flywheels store spin, so feed them from a motor or belt train and mount them onto a frame if needed.';
    case 'gearbox':
      return 'Gearboxes work best with rotating parts on both sides of the box.';
    case 'chassis':
      return 'Chassis parts come alive once wheels or a motor are mounted onto them.';
    case 'crane-arm':
      return 'Crane arms are strongest when they are mounted to a chassis and pick up a bucket or counterweight.';
    case 'cargo-block':
      return 'Cargo can be dropped loose or hooked directly to a lifting tool.';
    case 'conveyor':
      return 'Conveyors are easiest to read when cargo moves into a hopper.';
    case 'winch':
    case 'hook':
      return 'Hoists only make sense once the winch and hook are linked, and pulleys can now redirect that rope path.';
    case 'rail-segment':
      return 'Rails define the path, and locomotives can now be linked to a real rotating drive part.';
    case 'locomotive':
      return 'Locomotives need rail plus a linked rotating driver if you want them to feel part of the machine.';
    case 'wagon':
      return 'Wagons now load loose material near the rail and can unload it into hoppers, chutes, silos, or conveyors.';
    case 'station-zone':
      return 'Station zones give wagons a deliberate place to load or unload instead of relying on lucky proximity.';
    case 'trampoline':
      return 'Trampolines bounce falling cargo, balls, and rocks back into the rest of the machine.';
    default:
      return 'Pick a matching part below if you want a clearer reaction from the canvas.';
  }
}

function iconForPart(kind: PrimitiveKind): string {
  switch (kind) {
    case 'node':
      return 'O';
    case 'wheel':
      return 'o';
    case 'chassis':
      return 'U';
    case 'axle':
      return '=';
    case 'ramp':
      return '/';
    case 'platform':
      return '_';
    case 'wall':
      return '|';
    case 'motor':
      return 'M';
    case 'gear':
      return '*';
    case 'piston':
      return 'T';
    case 'rack':
      return 'R';
    case 'spring-linear':
      return 'S';
    case 'crane-arm':
      return 'A';
    case 'counterweight':
      return 'C';
    case 'bucket':
      return 'B';
    case 'pulley':
      return 'P';
    case 'chain-sprocket':
      return 'C';
    case 'flywheel':
      return 'F';
    case 'gearbox':
      return 'G';
    case 'winch':
      return 'W';
    case 'hook':
      return 'J';
    case 'rail-segment':
      return '=';
    case 'rail-switch':
      return 'Y';
    case 'locomotive':
      return 'L';
    case 'wagon':
      return 'U';
    case 'station-zone':
      return 'Z';
    case 'conveyor':
      return '>';
    case 'hopper':
      return 'V';
    case 'cargo-block':
      return '#';
    case 'material-pile':
      return '^';
    case 'water':
      return '~';
    case 'hinge':
      return 'H';
    case 'chute':
      return '/';
    case 'silo-bin':
      return 'S';
    case 'tunnel':
      return 'T';
    case 'ball':
      return '0';
    case 'rock':
      return '@';
    case 'trampoline':
      return 'T';
    default:
      return '+';
  }
}

function labelForPart(kind: PrimitiveKind): string {
  switch (kind) {
    case 'rail-segment':
      return 'Rail';
    case 'rail-switch':
      return 'Switch';
    case 'station-zone':
      return 'Station';
    case 'cargo-block':
      return 'Cargo';
    case 'material-pile':
      return 'Pile';
    case 'chain-sprocket':
      return 'Chain Sprocket';
    default:
      return kind
        .split('-')
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(' ');
  }
}
