import { useMemo } from 'react';
import { PART_CATEGORIES, type ExperimentManifest, type PrimitiveInstance, type PrimitiveKind } from '../lib/types';

export const QUICK_PARTS: PrimitiveKind[] = [
  'motor',
  'gear',
  'wheel',
  'chassis',
  'conveyor',
  'hopper',
  'winch',
  'hook',
  'node',
  'pulley',
  'crane-arm',
];

const HIDDEN_PUBLIC_PART_KINDS = new Set<PrimitiveKind>([
  'rail-segment',
  'rail-switch',
  'locomotive',
  'wagon',
  'station-zone',
]);

interface PartControlAction {
  id: string;
  label: string;
  active?: boolean;
  onPress: () => void;
}

interface PartPaletteProps {
  manifest: ExperimentManifest;
  selectedPrimitive?: PrimitiveInstance;
  selectedKind?: PrimitiveKind | null;
  activeJobHint?: string;
  allowedKinds?: PrimitiveKind[];
  projectTitle?: string;
  projectStepTitle?: string;
  partControls?: { title: string; subtitle?: string; actions: PartControlAction[] } | null;
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
  partControls,
  onSelectKind,
}: PartPaletteProps) {
  const counts = useMemo(() => countKinds(manifest), [manifest]);
  const visibleCategories = useMemo(
    () => PART_CATEGORIES
      .map((category) => ({
        ...category,
        kinds: category.kinds.filter((kind) => isPublicPartVisible(kind)),
      }))
      .filter((category) => category.kinds.length > 0),
    [],
  );
  const suggestions = useMemo(
    () => deriveSuggestions(manifest, selectedPrimitive),
    [manifest, selectedPrimitive],
  );
  const guidedKinds = useMemo(
    () => (allowedKinds ? Array.from(new Set(allowedKinds.filter((kind) => isPublicPartVisible(kind)))) : null),
    [allowedKinds],
  );
  const visibleSuggestions = useMemo(
    () => {
      const publicSuggestions = suggestions.filter((suggestion) => isPublicPartVisible(suggestion.kind));
      return guidedKinds
        ? publicSuggestions.filter((suggestion) => guidedKinds.includes(suggestion.kind))
        : publicSuggestions;
    },
    [guidedKinds, suggestions],
  );
  const quickPartKinds = useMemo(
    () => {
      if (guidedKinds) {
        return Array.from(new Set([...guidedKinds, ...visibleSuggestions.map((suggestion) => suggestion.kind)])).slice(0, 10);
      }
      return QUICK_PARTS;
    },
    [guidedKinds, visibleSuggestions],
  );
  const canvasKinds = useMemo(
    () => Object.entries(counts)
      .filter(([, count]) => count > 0)
      .filter(([kind]) => isPublicPartVisible(kind as PrimitiveKind))
      .sort((left, right) => right[1] - left[1])
      .map(([kind]) => kind as PrimitiveKind),
    [counts],
  );
  const paletteHint = useMemo(() => {
    if (selectedPrimitive && visibleSuggestions.length > 0) {
      return `Good next matches: ${visibleSuggestions.slice(0, 3).map((suggestion) => labelForPart(suggestion.kind)).join(', ')}.`;
    }

    if (selectedPrimitive) {
      return connectionHintForKind(selectedPrimitive.kind);
    }

    return activeJobHint ?? 'The full parts shelf stays here. Pick a part, then click the canvas to place it.';
  }, [activeJobHint, selectedPrimitive, visibleSuggestions]);
  const categoryAnchors = useMemo(
    () => visibleCategories.map((category) => ({
      label: category.label,
      anchorId: `parts-${category.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    })),
    [visibleCategories],
  );

  const isLimitedStep = Boolean(guidedKinds);
  const showSelectionStrip = Boolean(guidedKinds || activeJobHint);

  const renderPartTile = (kind: PrimitiveKind) => (
    <button
      key={kind}
      type="button"
      className={`palette-item palette-item-quick ${selectedKind === kind ? 'active' : ''}`}
      title={labelForPart(kind)}
      disabled={isLimitedStep && !guidedKinds?.includes(kind)}
      onClick={() => onSelectKind(selectedKind === kind ? null : kind)}
    >
      <span className="palette-icon">{iconForPart(kind)}</span>
      <span className="palette-label">{labelForPart(kind)}</span>
      {counts[kind] ? <span className="palette-item-count">x{counts[kind]}</span> : null}
    </button>
  );

  return (
    <section className="panel palette-panel parts-dock-panel">
      <div className="panel-header compact palette-panel-head">
        <div>
          <p className="eyebrow">Parts</p>
          <h3>{guidedKinds ? projectStepTitle ?? projectTitle ?? 'Step parts' : 'Pick, place, and build'}</h3>
          <p className="palette-panel-subtitle">
            {guidedKinds
              ? 'This step highlights the useful parts first. The whole shelf is still visible below.'
              : 'The canvas stays in view while this shelf holds every part in the yard.'}
          </p>
        </div>
        {selectedKind ? (
          <button type="button" className="ghost-button" onClick={() => onSelectKind(null)}>
            Clear
          </button>
        ) : null}
      </div>

      {partControls && partControls.actions.length > 0 ? (
        <div className="palette-part-controls">
          <div className="palette-part-controls-header">
            <strong>{partControls.title}</strong>
            {partControls.subtitle ? <span className="muted">{partControls.subtitle}</span> : null}
          </div>
          <div className="palette-part-controls-row">
            {partControls.actions.map((action) => (
              <button
                key={action.id}
                type="button"
                className={`palette-control-btn${action.active ? ' is-active' : ''}`}
                onClick={action.onPress}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {showSelectionStrip ? (
        <div className="palette-selection-strip">
          <p className="palette-selection-label">{selectedPrimitive ? 'Selected part' : 'Build hint'}</p>
          <strong>
            {selectedPrimitive
              ? `${labelForPart(selectedPrimitive.kind)} selected`
              : manifest.primitives.length === 0
                ? 'Start with one visible cause-and-effect part'
                : 'Parts stay on the right. Connections start from the red Connect Parts button.'}
          </strong>
          <p className="muted">{paletteHint}</p>
        </div>
      ) : null}

      <div className="palette-category-chip-row palette-category-jump-row">
        {categoryAnchors.map((category) => (
          <button
            key={category.anchorId}
            type="button"
            className="palette-category-chip"
            onClick={() => {
              document.getElementById(category.anchorId)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
            }}
          >
            <span>{category.label}</span>
          </button>
        ))}
      </div>

      <div className="palette-panel-body">
        <div className="palette-quick-section">
          <div className="mini-head">
            <p className="palette-category-label">{guidedKinds ? 'This Step' : 'Quick Parts'}</p>
            <span className="palette-inline-hint">
              {guidedKinds
                ? 'Use these first.'
                : 'These stay visible so you can place parts without digging.'}
            </span>
          </div>
          <div className="palette-grid palette-grid-quick">
            {quickPartKinds.map(renderPartTile)}
          </div>
        </div>

        <div className="palette-section-head">
          <p className="palette-category-label">All Parts</p>
          <span className="palette-inline-hint">
            Scroll the full shelf. {guidedKinds ? 'Dimmed parts come later in the guided build.' : 'Everything is immediately available.'}
          </span>
        </div>
        <div className="palette-category-panels">
          {visibleCategories.map((category, index) => {
            const presentCount = category.kinds.reduce((total, kind) => total + counts[kind], 0);
            const anchorId = categoryAnchors[index]?.anchorId ?? category.label;
            const hasStepPart = guidedKinds ? category.kinds.some((kind) => guidedKinds.includes(kind)) : false;
            return (
              <section
                key={category.label}
                id={anchorId}
                className={`palette-category-block${guidedKinds && !hasStepPart ? ' is-dimmed' : ''}`}
              >
                <div className="palette-category-title-row">
                  <strong>{category.label}</strong>
                  <span className="palette-category-summary-count">
                    {presentCount > 0 ? `${presentCount} on canvas` : `${category.kinds.length} parts`}
                  </span>
                </div>
                <div className="palette-grid palette-grid-tight">
                  {category.kinds.map(renderPartTile)}
                </div>
              </section>
            );
          })}
        </div>
      </div>

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
        push('rail-segment', 'Drag train parts near rail if you want them to snap into train mode.');
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

export function isPublicPartVisible(kind: PrimitiveKind) {
  return !HIDDEN_PUBLIC_PART_KINDS.has(kind);
}

export function countKinds(manifest: ExperimentManifest) {
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
      return 'Rails define the path and now automatically snap nearby locomotives and wagons into train mode.';
    case 'locomotive':
      return 'Locomotives snap to nearby rail, but they can also stay off rail as regular bodies that take bolt-on parts, wheels, and tools.';
    case 'wagon':
      return 'Wagons can ride rail automatically or stay free as cargo carriers that accept bolt-on parts and loose material.';
    case 'station-zone':
      return 'Station zones give wagons a deliberate place to load or unload instead of relying on lucky proximity.';
    case 'trampoline':
      return 'Trampolines bounce falling cargo, balls, and rocks back into the rest of the machine.';
    default:
      return 'Pick a matching part below if you want a clearer reaction from the canvas.';
  }
}

export function iconForPart(kind: PrimitiveKind): string {
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

export function labelForPart(kind: PrimitiveKind): string {
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
