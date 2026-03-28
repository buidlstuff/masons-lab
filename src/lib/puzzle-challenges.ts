import { createEmptyManifest } from './manifest-factories';
import type {
  ExperimentManifest,
  PhysicsOverrides,
  PrimitiveConfig,
  PrimitiveInstance,
  PrimitiveKind,
} from './types';
import type { RuntimeSnapshot } from './simulation';

interface PuzzlePrimitiveSeed {
  id: string;
  kind: PrimitiveKind;
  label?: string;
  config: PrimitiveConfig;
}

export interface PuzzleChallengeSolvedCase {
  manifest: ExperimentManifest;
  runtime: RuntimeSnapshot;
}

export interface PuzzleChallengeDefinition {
  id: string;
  title: string;
  emoji: string;
  description: string;
  objective: string;
  hint: string;
  allowedKinds: PrimitiveKind[];
  physicsOverrides?: PhysicsOverrides;
  createParts: () => PuzzlePrimitiveSeed[];
  successCheck: (manifest: ExperimentManifest, runtime: RuntimeSnapshot) => boolean;
  createSolvedCase: () => PuzzleChallengeSolvedCase;
}

function titleCaseKind(kind: PrimitiveKind) {
  return kind
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function createPrimitive(seed: PuzzlePrimitiveSeed): PrimitiveInstance {
  return {
    id: seed.id,
    kind: seed.kind,
    label: seed.label ?? titleCaseKind(seed.kind),
    config: structuredClone(seed.config),
  };
}

function createRuntimeSnapshot(overrides: Partial<RuntimeSnapshot> = {}): RuntimeSnapshot {
  return {
    time: 0,
    rotations: {},
    cargoProgress: {},
    hookY: 0,
    trainProgress: 0,
    trainDelivered: false,
    trainTrackId: undefined,
    hopperFill: 0,
    throughput: 0,
    telemetry: {},
    cargoStates: {},
    beltPowered: false,
    lostCargoCount: 0,
    stableCargoSpawns: {},
    wagonLoads: {},
    wagonCargo: {},
    pistonExtensions: {},
    bucketContents: {},
    bucketStates: {},
    springCompressions: {},
    sandParticlePositions: [],
    bodyPositions: {},
    ...overrides,
  };
}

function ballNearBucket(manifest: ExperimentManifest, runtime: RuntimeSnapshot) {
  const bucket = manifest.primitives.find((primitive) => primitive.kind === 'bucket');
  if (!bucket) return false;
  const bucketPoint = runtime.bodyPositions?.[bucket.id] ?? ('x' in bucket.config && 'y' in bucket.config
    ? { x: Number(bucket.config.x), y: Number(bucket.config.y) }
    : null);
  if (!bucketPoint) return false;
  return manifest.primitives
    .filter((primitive) => primitive.kind === 'ball')
    .some((ball) => {
      const point = runtime.bodyPositions?.[ball.id];
      return point ? Math.hypot(point.x - bucketPoint.x, point.y - bucketPoint.y) < 42 : false;
    });
}

function createBasePuzzleManifest(definition: PuzzleChallengeDefinition): ExperimentManifest {
  const manifest = createEmptyManifest();
  const world = definition.physicsOverrides
    ? {
        ...manifest.world,
        physicsOverrides: { ...definition.physicsOverrides },
      }
    : manifest.world;

  return {
    ...manifest,
    slug: definition.id,
    family: 'machine-combos',
    metadata: {
      ...manifest.metadata,
      title: definition.title,
      subtitle: 'Puzzle Challenge',
      shortDescription: definition.description,
      teachingGoal: definition.objective,
      tags: Array.from(new Set([
        ...manifest.metadata.tags,
        'puzzle-challenge',
        `puzzle-challenge:${definition.id}`,
      ])),
      thumbnailPreset: 'yard-draft',
    },
    world,
    primitives: definition.createParts().map(createPrimitive),
    explanation: {
      whatIsHappening: definition.description,
      whatToTryNext: [
        definition.objective,
        definition.hint,
        'Only trust the result if the moving parts honestly cause it.',
      ],
      vocabulary: [
        {
          term: 'puzzle',
          kidFriendlyMeaning: 'A setup with a clear goal and only a few useful ways to solve it.',
        },
      ],
    },
  };
}

function getPuzzleTagId(manifest: ExperimentManifest) {
  const tag = manifest.metadata.tags.find((entry) => entry.startsWith('puzzle-challenge:'));
  return tag?.slice('puzzle-challenge:'.length) ?? null;
}

export const PUZZLE_CHALLENGES: PuzzleChallengeDefinition[] = [
  {
    id: 'hook-and-drop',
    title: 'Hook and Drop',
    emoji: '🪝',
    description: 'Carry the hooked cargo over the wall and lower it into the hopper.',
    objective: 'Use the winch, rope, and hook to get one real cargo block into the hopper.',
    hint: 'Keep the rope short enough to clear the wall, then lower the hook on the hopper side.',
    allowedKinds: ['winch', 'hook', 'cargo-block', 'hopper', 'wall'],
    createParts: () => [
      { id: 'hook-drop-winch', kind: 'winch', label: 'Winch', config: { x: 170, y: 120, speed: 30, ropeLength: 190 } },
      { id: 'hook-drop-hook', kind: 'hook', label: 'Hook', config: { x: 170, y: 265 } },
      { id: 'hook-drop-cargo', kind: 'cargo-block', label: 'Cargo', config: { x: 170, y: 305, weight: 1, attachedToId: 'hook-drop-hook' } },
      { id: 'hook-drop-wall', kind: 'wall', label: 'Wall', config: { x: 430, y: 390, height: 210 } },
      { id: 'hook-drop-hopper', kind: 'hopper', label: 'Hopper', config: { x: 720, y: 430, capacity: 8, releaseRate: 0, fill: 0 } },
    ],
    successCheck: (_manifest, runtime) => (runtime.hopperFill ?? 0) >= 1,
    createSolvedCase: () => {
      const manifest = createPuzzleChallengeManifest('hook-and-drop')!;
      manifest.primitives.push({
        id: 'hook-drop-rope',
        kind: 'rope',
        label: 'Hoist Rope',
        config: { fromId: 'hook-drop-winch', toId: 'hook-drop-hook', length: 190 },
      });
      return {
        manifest,
        runtime: createRuntimeSnapshot({
          hopperFill: 1,
          bodyPositions: { 'hook-drop-cargo': { x: 720, y: 415, angle: 0 } },
        }),
      };
    },
  },
  {
    id: 'pulley-detour',
    title: 'Pulley Detour',
    emoji: '🧵',
    description: 'Route the rope through an idler pulley so the bucket can lift onto the high shelf.',
    objective: 'Use the pulley as a real rope redirector and lift the bucket onto the upper platform.',
    hint: 'Click the pulley after the winch while you are in rope mode, then finish on the bucket.',
    allowedKinds: ['winch', 'pulley', 'bucket', 'platform', 'wall'],
    createParts: () => [
      { id: 'pulley-detour-winch', kind: 'winch', label: 'Winch', config: { x: 180, y: 120, speed: 28, ropeLength: 230 } },
      { id: 'pulley-detour-pulley', kind: 'pulley', label: 'Idler Pulley', config: { x: 420, y: 110, radius: 28 } },
      { id: 'pulley-detour-wall', kind: 'wall', label: 'Blocker', config: { x: 360, y: 360, height: 240 } },
      { id: 'pulley-detour-platform', kind: 'platform', label: 'Shelf', config: { x: 700, y: 220, width: 210 } },
      { id: 'pulley-detour-bucket', kind: 'bucket', label: 'Bucket', config: { x: 700, y: 420, width: 44, depth: 30 } },
    ],
    successCheck: (manifest, runtime) => manifest.primitives.some((primitive) =>
      primitive.kind === 'rope'
      && Array.isArray((primitive.config as { viaIds?: string[] }).viaIds)
      && ((primitive.config as { viaIds?: string[] }).viaIds?.includes('pulley-detour-pulley') ?? false))
      && (runtime.bodyPositions?.['pulley-detour-bucket']?.y ?? 999) < 235,
    createSolvedCase: () => {
      const manifest = createPuzzleChallengeManifest('pulley-detour')!;
      manifest.primitives.push({
        id: 'pulley-detour-rope',
        kind: 'rope',
        label: 'Bucket Rope',
        config: {
          fromId: 'pulley-detour-winch',
          viaIds: ['pulley-detour-pulley'],
          toId: 'pulley-detour-bucket',
          length: 250,
        },
      });
      return {
        manifest,
        runtime: createRuntimeSnapshot({
          bodyPositions: { 'pulley-detour-bucket': { x: 700, y: 190, angle: 0 } },
        }),
      };
    },
  },
  {
    id: 'bucket-bridge',
    title: 'Bucket Bridge',
    emoji: '🪣',
    description: 'Use the hanging bucket to carry cargo over the gap and into the hopper.',
    objective: 'Get one cargo block across the gap and into the hopper with the bucket hoist.',
    hint: 'Lift the bucket under the cargo first, then carry the load over the hopper side.',
    allowedKinds: ['winch', 'bucket', 'cargo-block', 'hopper', 'platform'],
    createParts: () => [
      { id: 'bucket-bridge-left', kind: 'platform', label: 'Left Platform', config: { x: 220, y: 420, width: 220 } },
      { id: 'bucket-bridge-right', kind: 'platform', label: 'Right Platform', config: { x: 710, y: 420, width: 220 } },
      { id: 'bucket-bridge-winch', kind: 'winch', label: 'Winch', config: { x: 240, y: 120, speed: 28, ropeLength: 220 } },
      { id: 'bucket-bridge-bucket', kind: 'bucket', label: 'Bucket', config: { x: 260, y: 300, width: 46, depth: 30 } },
      { id: 'bucket-bridge-cargo', kind: 'cargo-block', label: 'Cargo', config: { x: 180, y: 360, weight: 1 } },
      { id: 'bucket-bridge-hopper', kind: 'hopper', label: 'Hopper', config: { x: 730, y: 380, capacity: 8, releaseRate: 0, fill: 0 } },
    ],
    successCheck: (_manifest, runtime) => (runtime.hopperFill ?? 0) >= 1,
    createSolvedCase: () => {
      const manifest = createPuzzleChallengeManifest('bucket-bridge')!;
      manifest.primitives.push({
        id: 'bucket-bridge-rope',
        kind: 'rope',
        label: 'Bucket Rope',
        config: { fromId: 'bucket-bridge-winch', toId: 'bucket-bridge-bucket', length: 220 },
      });
      return {
        manifest,
        runtime: createRuntimeSnapshot({
          hopperFill: 1,
          bodyPositions: {
            'bucket-bridge-bucket': { x: 720, y: 310, angle: 0.6 },
            'bucket-bridge-cargo': { x: 730, y: 372, angle: 0 },
          },
        }),
      };
    },
  },
  {
    id: 'powered-sweep',
    title: 'Powered Sweep',
    emoji: '🦾',
    description: 'Drive the crane arm with a powered hinge and sweep the cargo into the hopper.',
    objective: 'Create a real powered hinge, run it, and sweep one block into the hopper.',
    hint: 'Use the chassis as the base, connect the arm to it with Powered Hinge, and keep the motor nearby.',
    allowedKinds: ['motor', 'crane-arm', 'chassis', 'counterweight', 'bucket', 'cargo-block'],
    createParts: () => [
      { id: 'powered-sweep-motor', kind: 'motor', label: 'Motor', config: { x: 160, y: 270, rpm: 90, torque: 1.2, powerState: true } },
      { id: 'powered-sweep-base', kind: 'chassis', label: 'Base', config: { x: 310, y: 360, width: 200, height: 24 } },
      { id: 'powered-sweep-arm', kind: 'crane-arm', label: 'Crane Arm', config: { x: 310, y: 340, length: 170 } },
      { id: 'powered-sweep-counter', kind: 'counterweight', label: 'Counterweight', config: { x: 260, y: 340, mass: 6, attachedToId: 'powered-sweep-arm' } },
      { id: 'powered-sweep-cargo', kind: 'cargo-block', label: 'Cargo', config: { x: 525, y: 350, weight: 1 } },
      { id: 'powered-sweep-hopper', kind: 'hopper', label: 'Hopper', config: { x: 730, y: 390, capacity: 8, releaseRate: 0, fill: 0 } },
    ],
    successCheck: (manifest, runtime) => manifest.primitives.some((primitive) => primitive.kind === 'powered-hinge-link')
      && ((runtime.hopperFill ?? 0) >= 1 || (runtime.bodyPositions?.['powered-sweep-cargo']?.x ?? 0) > 650),
    createSolvedCase: () => {
      const manifest = createPuzzleChallengeManifest('powered-sweep')!;
      manifest.primitives.push({
        id: 'powered-sweep-hinge',
        kind: 'powered-hinge-link',
        label: 'Powered Hinge',
        config: {
          fromId: 'powered-sweep-base',
          toId: 'powered-sweep-arm',
          pivotX: 310,
          pivotY: 340,
          fromLocalX: 0,
          fromLocalY: -18,
          toLocalX: -85,
          toLocalY: 0,
          minAngle: -55,
          maxAngle: 65,
          motorId: 'powered-sweep-motor',
          targetAngle: 35,
          enabled: true,
        },
      });
      return {
        manifest,
        runtime: createRuntimeSnapshot({
          hopperFill: 1,
          bodyPositions: {
            'powered-sweep-arm': { x: 390, y: 330, angle: 0.45 },
            'powered-sweep-cargo': { x: 710, y: 380, angle: 0 },
          },
        }),
      };
    },
  },
  {
    id: 'spring-mail',
    title: 'Spring Mail',
    emoji: '📮',
    description: 'Drop the ball onto the spring and pop it into the waiting bucket.',
    objective: 'Use the spring launcher to land the ball inside the bucket.',
    hint: 'The ball needs a clean drop onto the spring plate before it can arc into the bucket.',
    allowedKinds: ['spring-linear', 'ball', 'bucket', 'wall', 'platform'],
    createParts: () => [
      { id: 'spring-mail-platform', kind: 'platform', label: 'Launch Platform', config: { x: 240, y: 360, width: 240 } },
      { id: 'spring-mail-spring', kind: 'spring-linear', label: 'Spring', config: { x: 180, y: 300, orientation: 'vertical', restLength: 60, stiffness: 0.08 } },
      { id: 'spring-mail-ball', kind: 'ball', label: 'Ball', config: { x: 180, y: 185, radius: 14 } },
      { id: 'spring-mail-bucket', kind: 'bucket', label: 'Bucket', config: { x: 520, y: 250, width: 42, depth: 28 } },
      { id: 'spring-mail-wall', kind: 'wall', label: 'Guide Wall', config: { x: 380, y: 285, height: 130 } },
    ],
    successCheck: ballNearBucket,
    createSolvedCase: () => {
      const manifest = createPuzzleChallengeManifest('spring-mail')!;
      return {
        manifest,
        runtime: createRuntimeSnapshot({
          bodyPositions: {
            'spring-mail-ball': { x: 520, y: 250, angle: 0 },
            'spring-mail-bucket': { x: 520, y: 250, angle: 0 },
          },
        }),
      };
    },
  },
  {
    id: 'tunnel-shot',
    title: 'Tunnel Shot',
    emoji: '🕳️',
    description: 'Send the ball through the tunnel and chute so it reaches the far side.',
    objective: 'Build a clean shot that carries the ball through the tunnel run into the target lane.',
    hint: 'A steeper ramp makes the tunnel entrance easier to hit, and the chute should catch the exit.',
    allowedKinds: ['ball', 'ramp', 'tunnel', 'chute', 'platform', 'wall'],
    createParts: () => [
      { id: 'tunnel-shot-ramp', kind: 'ramp', label: 'Launch Ramp', config: { x: 210, y: 410, width: 240, angle: -18 } },
      { id: 'tunnel-shot-ball', kind: 'ball', label: 'Ball', config: { x: 135, y: 300, radius: 16 } },
      { id: 'tunnel-shot-tunnel', kind: 'tunnel', label: 'Tunnel', config: { x: 470, y: 310, width: 180, angle: -4 } },
      { id: 'tunnel-shot-chute', kind: 'chute', label: 'Exit Chute', config: { x: 670, y: 265, length: 120, angle: -28 } },
      { id: 'tunnel-shot-platform', kind: 'platform', label: 'Target Lane', config: { x: 815, y: 390, width: 170 } },
    ],
    successCheck: (_manifest, runtime) => (runtime.bodyPositions?.['tunnel-shot-ball']?.x ?? 0) > 735,
    createSolvedCase: () => {
      const manifest = createPuzzleChallengeManifest('tunnel-shot')!;
      return {
        manifest,
        runtime: createRuntimeSnapshot({
          bodyPositions: {
            'tunnel-shot-ball': { x: 790, y: 370, angle: 0 },
          },
        }),
      };
    },
  },
  {
    id: 'flywheel-nudge',
    title: 'Flywheel Nudge',
    emoji: '🌀',
    description: 'Spin up the flywheel and let the stored motion finish the last push.',
    objective: 'Use a belt-driven flywheel to keep the loader moving long enough to score.',
    hint: 'The flywheel only helps once it is connected to the motor-driven side and can coast the last bit.',
    allowedKinds: ['motor', 'pulley', 'flywheel', 'cargo-block', 'hopper', 'platform'],
    createParts: () => [
      { id: 'flywheel-nudge-motor', kind: 'motor', label: 'Motor', config: { x: 170, y: 280, rpm: 95, torque: 1.2, powerState: true } },
      { id: 'flywheel-nudge-pulley', kind: 'pulley', label: 'Drive Pulley', config: { x: 260, y: 280, radius: 28 } },
      { id: 'flywheel-nudge-flywheel', kind: 'flywheel', label: 'Flywheel', config: { x: 420, y: 280, radius: 38, mass: 6 } },
      { id: 'flywheel-nudge-platform', kind: 'platform', label: 'Runway', config: { x: 520, y: 360, width: 420 } },
      { id: 'flywheel-nudge-cargo', kind: 'cargo-block', label: 'Cargo', config: { x: 520, y: 320, weight: 1 } },
      { id: 'flywheel-nudge-hopper', kind: 'hopper', label: 'Hopper', config: { x: 790, y: 360, capacity: 8, releaseRate: 0, fill: 0 } },
    ],
    successCheck: (manifest, runtime) => manifest.primitives.some((primitive) => primitive.kind === 'flywheel')
      && manifest.primitives.some((primitive) => primitive.kind === 'belt-link')
      && (runtime.hopperFill ?? 0) >= 1,
    createSolvedCase: () => {
      const manifest = createPuzzleChallengeManifest('flywheel-nudge')!;
      manifest.primitives.push({
        id: 'flywheel-nudge-belt',
        kind: 'belt-link',
        label: 'Drive Belt',
        config: { fromId: 'flywheel-nudge-pulley', toId: 'flywheel-nudge-flywheel', length: 160 },
      });
      return {
        manifest,
        runtime: createRuntimeSnapshot({
          hopperFill: 1,
          rotations: { 'flywheel-nudge-flywheel': 1.6 },
          bodyPositions: { 'flywheel-nudge-cargo': { x: 790, y: 350, angle: 0 } },
        }),
      };
    },
  },
  {
    id: 'wagon-transfer',
    title: 'Wagon Transfer',
    emoji: '🚃',
    description: 'Run the wagon through the load station, then unload the cargo into the hopper.',
    objective: 'Complete a full load-and-unload trip with the train parts and station zones.',
    hint: 'The wagon should meet the load station first, then arrive at the unload station with the hopper under it.',
    allowedKinds: ['rail-segment', 'rail-switch', 'locomotive', 'wagon', 'station-zone', 'hopper', 'cargo-block', 'motor'],
    createParts: () => [
      {
        id: 'wagon-transfer-track-main',
        kind: 'rail-segment',
        label: 'Main Rail',
        config: { points: [{ x: 180, y: 280 }, { x: 520, y: 280 }], segmentType: 'straight' },
      },
      {
        id: 'wagon-transfer-switch',
        kind: 'rail-switch',
        label: 'Junction',
        config: { x: 520, y: 280, branch: 'right' },
      },
      {
        id: 'wagon-transfer-track-left',
        kind: 'rail-segment',
        label: 'Load Branch',
        config: { points: [{ x: 520, y: 280 }, { x: 760, y: 220 }], segmentType: 'straight' },
      },
      {
        id: 'wagon-transfer-track-right',
        kind: 'rail-segment',
        label: 'Unload Branch',
        config: { points: [{ x: 520, y: 280 }, { x: 780, y: 340 }], segmentType: 'straight' },
      },
      {
        id: 'wagon-transfer-loco',
        kind: 'locomotive',
        label: 'Locomotive',
        config: { trackId: 'wagon-transfer-track-main', progress: 0, speed: 0.4 },
      },
      {
        id: 'wagon-transfer-wagon',
        kind: 'wagon',
        label: 'Wagon',
        config: { trackId: 'wagon-transfer-track-main', offset: -0.08, capacity: 4 },
      },
      { id: 'wagon-transfer-motor', kind: 'motor', label: 'Motor', config: { x: 220, y: 220, rpm: 95, torque: 1, powerState: true } },
      { id: 'wagon-transfer-load-station', kind: 'station-zone', label: 'Load Station', config: { x: 720, y: 260, width: 140, height: 120, action: 'load' } },
      { id: 'wagon-transfer-unload-station', kind: 'station-zone', label: 'Unload Station', config: { x: 720, y: 380, width: 150, height: 150, action: 'unload' } },
      { id: 'wagon-transfer-cargo', kind: 'cargo-block', label: 'Cargo', config: { x: 700, y: 235, weight: 1 } },
      { id: 'wagon-transfer-hopper', kind: 'hopper', label: 'Hopper', config: { x: 720, y: 430, capacity: 8, releaseRate: 0, fill: 0 } },
    ],
    successCheck: (_manifest, runtime) => (runtime.hopperFill ?? 0) >= 1
      && (runtime.wagonLoads['wagon-transfer-wagon'] ?? 0) === 0
      && (runtime.trainProgress ?? 0) > 0.45,
    createSolvedCase: () => {
      const manifest = createPuzzleChallengeManifest('wagon-transfer')!;
      return {
        manifest,
        runtime: createRuntimeSnapshot({
          hopperFill: 1,
          trainProgress: 0.72,
          trainTrackId: 'wagon-transfer-track-right',
          wagonLoads: { 'wagon-transfer-wagon': 0 },
          wagonCargo: { 'wagon-transfer-wagon': [] },
        }),
      };
    },
  },
  {
    id: 'counterweight-rescue',
    title: 'Counterweight Rescue',
    emoji: '⚖️',
    description: 'Use the counterweight to keep the arm calm enough to lift the load over the blocker.',
    objective: 'Lift the cargo above the blocker while the arm stays reasonably level.',
    hint: 'A calmer arm is easier to lift from. Balance first, then shorten the rope.',
    allowedKinds: ['winch', 'crane-arm', 'counterweight', 'cargo-block', 'wall', 'platform'],
    createParts: () => [
      { id: 'counterweight-rescue-winch', kind: 'winch', label: 'Winch', config: { x: 140, y: 120, speed: 28, ropeLength: 230 } },
      { id: 'counterweight-rescue-platform', kind: 'platform', label: 'Base Platform', config: { x: 320, y: 390, width: 240 } },
      { id: 'counterweight-rescue-arm', kind: 'crane-arm', label: 'Crane Arm', config: { x: 250, y: 320, length: 180 } },
      { id: 'counterweight-rescue-counter', kind: 'counterweight', label: 'Counterweight', config: { x: 220, y: 320, mass: 6, attachedToId: 'counterweight-rescue-arm' } },
      { id: 'counterweight-rescue-cargo', kind: 'cargo-block', label: 'Cargo', config: { x: 360, y: 350, weight: 1 } },
      { id: 'counterweight-rescue-wall', kind: 'wall', label: 'Blocker', config: { x: 540, y: 360, height: 180 } },
    ],
    successCheck: (_manifest, runtime) => {
      const cargoY = runtime.bodyPositions?.['counterweight-rescue-cargo']?.y ?? 999;
      const armAngle = Math.abs(runtime.bodyPositions?.['counterweight-rescue-arm']?.angle ?? 1);
      return cargoY < 220 && armAngle < 0.35;
    },
    createSolvedCase: () => {
      const manifest = createPuzzleChallengeManifest('counterweight-rescue')!;
      manifest.primitives.push({
        id: 'counterweight-rescue-rope',
        kind: 'rope',
        label: 'Arm Rope',
        config: { fromId: 'counterweight-rescue-winch', toId: 'counterweight-rescue-arm', length: 220 },
      });
      return {
        manifest,
        runtime: createRuntimeSnapshot({
          bodyPositions: {
            'counterweight-rescue-arm': { x: 330, y: 290, angle: 0.08 },
            'counterweight-rescue-cargo': { x: 630, y: 180, angle: 0 },
          },
        }),
      };
    },
  },
  {
    id: 'trampoline-bank-shot',
    title: 'Trampoline Bank Shot',
    emoji: '🤾',
    description: 'Use the springy pads and walls to ricochet the ball into the bucket.',
    objective: 'Make the ball bank off the trampoline path and finish in the bucket.',
    hint: 'The first bounce should aim at the wall, and the wall should send the ball toward the bucket.',
    allowedKinds: ['trampoline', 'ball', 'bucket', 'wall', 'platform'],
    createParts: () => [
      { id: 'trampoline-bank-shot-trampoline-a', kind: 'trampoline', label: 'Bounce Pad A', config: { x: 260, y: 500, width: 180 } },
      { id: 'trampoline-bank-shot-trampoline-b', kind: 'trampoline', label: 'Bounce Pad B', config: { x: 590, y: 430, width: 170 } },
      { id: 'trampoline-bank-shot-wall', kind: 'wall', label: 'Bank Wall', config: { x: 720, y: 320, height: 180 } },
      { id: 'trampoline-bank-shot-ball', kind: 'ball', label: 'Ball', config: { x: 210, y: 120, radius: 16 } },
      { id: 'trampoline-bank-shot-bucket', kind: 'bucket', label: 'Bucket', config: { x: 840, y: 260, width: 42, depth: 28 } },
    ],
    successCheck: ballNearBucket,
    createSolvedCase: () => {
      const manifest = createPuzzleChallengeManifest('trampoline-bank-shot')!;
      return {
        manifest,
        runtime: createRuntimeSnapshot({
          bodyPositions: {
            'trampoline-bank-shot-ball': { x: 840, y: 260, angle: 0 },
            'trampoline-bank-shot-bucket': { x: 840, y: 260, angle: 0 },
          },
        }),
      };
    },
  },
];

export function getPuzzleChallenge(challengeId: string) {
  return PUZZLE_CHALLENGES.find((challenge) => challenge.id === challengeId) ?? null;
}

export function getPuzzleChallengeForManifest(manifest: ExperimentManifest) {
  const taggedId = getPuzzleTagId(manifest);
  return taggedId ? getPuzzleChallenge(taggedId) : null;
}

export function createPuzzleChallengeManifest(challengeId: string) {
  const definition = getPuzzleChallenge(challengeId);
  if (!definition) return null;
  return createBasePuzzleManifest(definition);
}
