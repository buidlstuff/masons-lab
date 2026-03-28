import type { ExperimentManifest, PrimitiveInstance } from './types';
import type { RuntimeSnapshot } from './simulation';

export type ChallengeTier = 'bronze' | 'silver' | 'gold';
export type ChallengeCategory = 'discovery' | 'engineering' | 'speed' | 'efficiency' | 'creative';

export interface ChallengeProgressValue {
  current: number;
  target: number;
}

export interface ChallengeDefinition {
  id: string;
  title: string;
  description: string;
  hint: string;
  tier: ChallengeTier;
  category: ChallengeCategory;
  successCheck: (manifest: ExperimentManifest, runtime: RuntimeSnapshot) => boolean;
  progressCheck?: (manifest: ExperimentManifest, runtime: RuntimeSnapshot) => ChallengeProgressValue;
}

export interface ChallengeScratchState {
  timers: Record<string, number>;
  minBallY: number;
  previousRotations: Record<string, number>;
}

export const ACTIVE_CHALLENGE_LIMIT = 3;
const GEAR_LIVE_THRESHOLD = 0.01;

export function createChallengeScratchState(): ChallengeScratchState {
  return {
    timers: {},
    minBallY: Number.POSITIVE_INFINITY,
    previousRotations: {},
  };
}

function countPlaced(manifest: ExperimentManifest, kind: PrimitiveInstance['kind']) {
  return manifest.primitives.filter((primitive) => primitive.kind === kind).length;
}

function getBodyPoint(
  primitive: PrimitiveInstance,
  runtime: RuntimeSnapshot,
): { x: number; y: number; angle?: number } | null {
  const body = runtime.bodyPositions?.[primitive.id];
  if (body) return body;
  if ('x' in primitive.config && 'y' in primitive.config) {
    return {
      x: Number(primitive.config.x),
      y: Number(primitive.config.y),
    };
  }
  return null;
}

function trackLength(points: Array<{ x: number; y: number }>) {
  let total = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    total += Math.hypot(points[index + 1].x - points[index].x, points[index + 1].y - points[index].y);
  }
  return total;
}

function countDrivenRotatingParts(runtime: RuntimeSnapshot) {
  const visited = new Set<string>();
  const queue: string[] = [];
  for (const drivenIds of Object.values(runtime.motorDrives ?? {})) {
    for (const id of drivenIds) {
      if (!visited.has(id)) {
        visited.add(id);
        queue.push(id);
      }
    }
  }
  let hops = 0;
  const maxHops = 20;
  while (queue.length > 0 && hops < maxHops) {
    const id = queue.shift()!;
    for (const meshId of runtime.gearMeshes?.[id] ?? []) {
      if (!visited.has(meshId)) {
        visited.add(meshId);
        queue.push(meshId);
      }
    }
    hops += 1;
  }
  return visited.size;
}

function hasLiveGearLink(manifest: ExperimentManifest, runtime: RuntimeSnapshot) {
  const gears = manifest.primitives.filter((primitive) => primitive.kind === 'gear');
  if (gears.length < 2) return false;
  const spinningIds = new Set(
    gears
      .filter((gear) => Math.abs(runtime.rotations[gear.id] ?? 0) > GEAR_LIVE_THRESHOLD)
      .map((gear) => gear.id),
  );
  if (spinningIds.size < 2) return false;
  for (const gear of gears) {
    if (!spinningIds.has(gear.id)) continue;
    for (const meshId of runtime.gearMeshes?.[gear.id] ?? []) {
      if (spinningIds.has(meshId)) return true;
    }
  }
  return false;
}

function collectFootprintPoints(manifest: ExperimentManifest) {
  const points: Array<{ x: number; y: number }> = [];
  for (const primitive of manifest.primitives) {
    if ('x' in primitive.config && 'y' in primitive.config) {
      points.push({
        x: Number(primitive.config.x),
        y: Number(primitive.config.y),
      });
    }
    if (primitive.kind === 'conveyor') {
      points.push(...((primitive.config as { path: Array<{ x: number; y: number }> }).path ?? []));
    }
    if (primitive.kind === 'rail-segment') {
      points.push(...((primitive.config as { points: Array<{ x: number; y: number }> }).points ?? []));
    }
  }
  return points;
}

function normalizeAngle(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export const CHALLENGES: ChallengeDefinition[] = [
  {
    id: 'first-spin',
    title: 'First Spin',
    description: 'Place a motor and watch it turn.',
    hint: 'Drag a motor from the palette onto the canvas.',
    tier: 'bronze',
    category: 'discovery',
    successCheck: (manifest) => manifest.primitives.some((primitive) => primitive.kind === 'motor'),
    progressCheck: (manifest) => ({ current: Math.min(1, countPlaced(manifest, 'motor')), target: 1 }),
  },
  {
    id: 'gear-head',
    title: 'Gear Head',
    description: 'Get 3 rotating parts linked in a live drive chain.',
    hint: 'Start with a motor, then chain gears together until the motion spreads.',
    tier: 'bronze',
    category: 'discovery',
    successCheck: (_manifest, runtime) => countDrivenRotatingParts(runtime) >= 3,
    progressCheck: (_manifest, runtime) => ({ current: Math.min(3, countDrivenRotatingParts(runtime)), target: 3 }),
  },
  {
    id: 'delivery-boy',
    title: 'Delivery Boy',
    description: 'Get a locomotive to the end of its track.',
    hint: 'Place a rail segment, then put a locomotive on it and give it speed or a rotating driver.',
    tier: 'bronze',
    category: 'discovery',
    successCheck: (_manifest, runtime) => runtime.trainProgress > 0.85,
  },
  {
    id: 'splash-zone',
    title: 'Splash Zone',
    description: 'Drop a ball into water.',
    hint: 'Place a water zone, then drop a ball above it.',
    tier: 'bronze',
    category: 'discovery',
    successCheck: (manifest, runtime) => {
      if (!runtime.bodyPositions) return false;
      const waters = manifest.primitives.filter((primitive) => primitive.kind === 'water');
      const balls = manifest.primitives.filter((primitive) => primitive.kind === 'ball');
      return balls.some((ball) => {
        const ballPos = runtime.bodyPositions?.[ball.id];
        if (!ballPos) return false;
        return waters.some((water) => {
          const cfg = water.config as { x: number; y: number; width?: number; height?: number };
          const halfWidth = (cfg.width ?? 100) / 2;
          const halfHeight = (cfg.height ?? 80) / 2;
          return ballPos.x > cfg.x - halfWidth
            && ballPos.x < cfg.x + halfWidth
            && ballPos.y > cfg.y - halfHeight
            && ballPos.y < cfg.y + halfHeight;
        });
      });
    },
  },
  {
    id: 'sand-castle',
    title: 'Sand Castle',
    description: 'Spawn a big sand shower.',
    hint: 'A material pile releases sand particles.',
    tier: 'bronze',
    category: 'discovery',
    successCheck: (_manifest, runtime) => (runtime.sandParticlePositions?.length ?? 0) >= 20,
    progressCheck: (_manifest, runtime) => ({ current: Math.min(20, runtime.sandParticlePositions?.length ?? 0), target: 20 }),
  },
  {
    id: 'rube-goldberg',
    title: 'Rube Goldberg Starter',
    description: 'Build a 15+ part machine that fills a hopper with a powered belt.',
    hint: 'Connect motors to gears to conveyors so the whole chain has to work.',
    tier: 'silver',
    category: 'engineering',
    successCheck: (manifest, runtime) => manifest.primitives.length >= 15 && runtime.hopperFill >= 1 && runtime.beltPowered,
    progressCheck: (manifest) => ({ current: Math.min(15, manifest.primitives.length), target: 15 }),
  },
  {
    id: 'speed-demon',
    title: 'Speed Demon',
    description: 'Get a gear train spinning above 500 RPM.',
    hint: 'A gearbox with more input teeth than output teeth speeds things up.',
    tier: 'silver',
    category: 'engineering',
    successCheck: (_manifest, runtime) => (runtime.telemetry.outputRpm ?? 0) > 500,
  },
  {
    id: 'long-haul',
    title: 'The Long Haul',
    description: 'Build a 600px+ conveyor that delivers cargo to a hopper.',
    hint: 'Stretch out the conveyor path points and keep the hopper at the end.',
    tier: 'silver',
    category: 'engineering',
    successCheck: (manifest, runtime) => (
      runtime.hopperFill >= 1
      && manifest.primitives
        .filter((primitive) => primitive.kind === 'conveyor')
        .some((primitive) => trackLength((primitive.config as { path: Array<{ x: number; y: number }> }).path ?? []) > 600)
    ),
  },
  {
    id: 'crane-operator',
    title: 'Crane Operator',
    description: 'Use a winch to lift cargo high above the ground.',
    hint: 'Connect winch → rope → hook, then attach cargo to the hook.',
    tier: 'silver',
    category: 'engineering',
    successCheck: (manifest, runtime) => manifest.primitives.some((primitive) => primitive.kind === 'hook')
      && runtime.hookY > 0
      && runtime.hookY < 200,
  },
  {
    id: 'bridge-builder',
    title: 'Bridge Builder',
    description: 'Build a beam bridge and roll a ball across it.',
    hint: 'Connect nodes with beams, then roll a ball over the span.',
    tier: 'silver',
    category: 'engineering',
    successCheck: (manifest, runtime) => {
      const beams = manifest.primitives.filter((primitive) => primitive.kind === 'beam');
      if (beams.length < 5 || !runtime.bodyPositions) return false;
      return manifest.primitives.filter((primitive) => primitive.kind === 'ball').some((ball) => {
        const livePos = runtime.bodyPositions?.[ball.id];
        if (!livePos) return false;
        const startX = (ball.config as { x: number }).x;
        return Math.abs(livePos.x - startX) > 80;
      });
    },
  },
  {
    id: 'counterbalance',
    title: 'Counterbalance',
    description: 'Hold a crane arm close to level for 3 seconds.',
    hint: 'Add a counterweight on the side opposite from the bucket.',
    tier: 'gold',
    category: 'engineering',
    successCheck: () => false,
  },
  {
    id: 'gear-ratio-master',
    title: 'Gear Ratio Master',
    description: 'Achieve a gear ratio close to 4:1.',
    hint: 'A 48-tooth gear driving a 12-tooth gear is the classic speed-up.',
    tier: 'gold',
    category: 'engineering',
    successCheck: (_manifest, runtime) => {
      const ratio = runtime.telemetry.gearRatio;
      return typeof ratio === 'number' && Math.abs(ratio - 4) < 0.5;
    },
  },
  {
    id: 'perpetual-motion',
    title: 'Perpetual Motion (Almost)',
    description: 'Let a flywheel coast for 10 seconds after the motor input drops away.',
    hint: 'Heavy flywheels store energy. Spin one up, then let it keep the machine alive.',
    tier: 'gold',
    category: 'engineering',
    successCheck: () => false,
  },
  {
    id: 'spring-launcher',
    title: 'Spring Launcher',
    description: 'Launch a ball high with a spring.',
    hint: 'Compress the spring and let it fling the ball upward.',
    tier: 'silver',
    category: 'engineering',
    successCheck: () => false,
  },
  {
    id: 'bucket-brigade',
    title: 'Bucket Brigade',
    description: 'Have 3 buckets containing material at the same time.',
    hint: 'Use cranes and buckets to hold onto multiple loads.',
    tier: 'gold',
    category: 'engineering',
    successCheck: (_manifest, runtime) => Object.values(runtime.bucketContents ?? {}).filter((count) => count >= 1).length >= 3,
  },
  {
    id: 'speed-loader',
    title: 'Speed Loader',
    description: 'Fill a hopper with 5 blocks in under 30 seconds.',
    hint: 'Pre-position cargo on a powered belt and keep the path short.',
    tier: 'silver',
    category: 'speed',
    successCheck: (_manifest, runtime) => runtime.hopperFill >= 5 && runtime.time < 30,
  },
  {
    id: 'express-train',
    title: 'Express Train',
    description: 'Reach the end of the track in under 10 seconds.',
    hint: 'Crank up the locomotive speed or drive it from a fast rotating part.',
    tier: 'bronze',
    category: 'speed',
    successCheck: (_manifest, runtime) => runtime.trainProgress > 0.85 && runtime.time < 10,
  },
  {
    id: 'blitz-build',
    title: 'Blitz Build',
    description: 'Spin a real two-gear train in under 15 seconds.',
    hint: 'Motor first, then two gears close enough to mesh.',
    tier: 'gold',
    category: 'speed',
    successCheck: (manifest, runtime) => runtime.time < 15 && hasLiveGearLink(manifest, runtime),
  },
  {
    id: 'minimalist',
    title: 'Minimalist',
    description: 'Fill a hopper using only 4 parts.',
    hint: 'One motor, one conveyor, one hopper, and one cargo block is enough.',
    tier: 'silver',
    category: 'efficiency',
    successCheck: (manifest, runtime) => runtime.hopperFill >= 1 && manifest.primitives.length <= 4,
  },
  {
    id: 'power-miser',
    title: 'Power Miser',
    description: 'Drive 5+ linked rotating parts with a single motor.',
    hint: 'One motor can animate a long gear chain if you keep the meshes alive.',
    tier: 'silver',
    category: 'efficiency',
    successCheck: (_manifest, runtime) => Object.keys(runtime.motorDrives ?? {}).length === 1 && countDrivenRotatingParts(runtime) >= 5,
  },
  {
    id: 'compact-machine',
    title: 'Compact Machine',
    description: 'Build a working loader inside a tight footprint.',
    hint: 'Stack the conveyor above the hopper and keep everything tucked in.',
    tier: 'gold',
    category: 'efficiency',
    successCheck: (manifest, runtime) => {
      if (runtime.hopperFill < 3) return false;
      const points = collectFootprintPoints(manifest);
      if (points.length === 0) return false;
      const xs = points.map((point) => point.x);
      const ys = points.map((point) => point.y);
      return (Math.max(...xs) - Math.min(...xs)) <= 400
        && (Math.max(...ys) - Math.min(...ys)) <= 300;
    },
  },
  {
    id: 'waterfall',
    title: 'Waterfall',
    description: 'Route 3 cargo pieces through 3 chutes into a hopper.',
    hint: 'Angle the chutes so each one hands off to the next.',
    tier: 'silver',
    category: 'creative',
    successCheck: (manifest, runtime) => countPlaced(manifest, 'chute') >= 3 && runtime.hopperFill >= 3,
  },
  {
    id: 'pinball-wizard',
    title: 'Pinball Wizard',
    description: 'Build a 5-obstacle pinball scene that lands a ball in a bucket.',
    hint: 'Walls and ramps can act like bumpers if the bucket waits at the end.',
    tier: 'gold',
    category: 'creative',
    successCheck: (manifest, runtime) => {
      const obstacles = manifest.primitives.filter((primitive) => primitive.kind === 'wall' || primitive.kind === 'ramp');
      const balls = manifest.primitives.filter((primitive) => primitive.kind === 'ball');
      const buckets = manifest.primitives.filter((primitive) => primitive.kind === 'bucket');
      if (obstacles.length < 5 || balls.length === 0 || buckets.length === 0) return false;
      return balls.some((ball) => {
        const ballPos = getBodyPoint(ball, runtime);
        if (!ballPos) return false;
        return buckets.some((bucket) => {
          const bucketPos = getBodyPoint(bucket, runtime);
          if (!bucketPos) return false;
          return Math.hypot(ballPos.x - bucketPos.x, ballPos.y - bucketPos.y) < 40;
        });
      });
    },
  },
  {
    id: 'ramp-jump',
    title: 'Ramp Jump',
    description: 'Launch a ball off a ramp and land on a distant platform.',
    hint: 'Steeper ramps plus a clean landing platform make the jump legible.',
    tier: 'silver',
    category: 'creative',
    successCheck: (manifest, runtime) => {
      const ramps = manifest.primitives.filter((primitive) => primitive.kind === 'ramp');
      const platforms = manifest.primitives.filter((primitive) => primitive.kind === 'platform');
      const balls = manifest.primitives.filter((primitive) => primitive.kind === 'ball');
      if (ramps.length === 0 || platforms.length === 0 || balls.length === 0 || !runtime.bodyPositions) return false;
      return balls.some((ball) => {
        const ballPos = runtime.bodyPositions?.[ball.id];
        if (!ballPos) return false;
        return platforms.some((platform) => {
          const platformCfg = platform.config as { x: number; y: number; width?: number };
          const onPlatform = Math.abs(ballPos.y - platformCfg.y) < 20
            && Math.abs(ballPos.x - platformCfg.x) < (platformCfg.width ?? 120) / 2;
          const farFromEveryRamp = ramps.every((ramp) => Math.abs(platformCfg.x - (ramp.config as { x: number }).x) > 180);
          return onPlatform && farFromEveryRamp;
        });
      });
    },
  },
  {
    id: 'full-monty',
    title: 'The Full Monty',
    description: 'Use structure, power, rail, and flow parts in one machine.',
    hint: 'You need at least one building piece, one power part, one rail part, and one flow part.',
    tier: 'gold',
    category: 'creative',
    successCheck: (manifest) => {
      const kinds = new Set(manifest.primitives.map((primitive) => primitive.kind));
      const hasStructure = ['node', 'beam', 'ramp', 'platform', 'wall', 'chassis'].some((kind) => kinds.has(kind as PrimitiveInstance['kind']));
      const hasPower = ['motor', 'gear', 'gearbox', 'flywheel', 'pulley'].some((kind) => kinds.has(kind as PrimitiveInstance['kind']));
      const hasRail = ['rail-segment', 'locomotive', 'wagon'].some((kind) => kinds.has(kind as PrimitiveInstance['kind']));
      const hasFlow = ['conveyor', 'hopper', 'cargo-block', 'ball', 'rock'].some((kind) => kinds.has(kind as PrimitiveInstance['kind']));
      return hasStructure && hasPower && hasRail && hasFlow;
    },
  },
];

export function evaluateChallengeCompletion(
  challenge: ChallengeDefinition,
  manifest: ExperimentManifest,
  runtime: RuntimeSnapshot,
  scratch: ChallengeScratchState,
  deltaSeconds: number,
) {
  switch (challenge.id) {
    case 'counterbalance': {
      const craneArm = manifest.primitives.find((primitive) => primitive.kind === 'crane-arm');
      const angle = craneArm ? normalizeAngle(runtime.bodyPositions?.[craneArm.id]?.angle ?? Number.NaN) : Number.NaN;
      const balanced = Number.isFinite(angle) && Math.abs(angle) < 0.087;
      scratch.timers[challenge.id] = balanced ? (scratch.timers[challenge.id] ?? 0) + deltaSeconds : 0;
      return scratch.timers[challenge.id] >= 3;
    }
    case 'perpetual-motion': {
      const flywheels = manifest.primitives.filter((primitive) => primitive.kind === 'flywheel');
      let spinning = false;
      for (const flywheel of flywheels) {
        const currentRotation = runtime.rotations[flywheel.id] ?? 0;
        const previousRotation = scratch.previousRotations[flywheel.id] ?? currentRotation;
        scratch.previousRotations[flywheel.id] = currentRotation;
        if (Math.abs(currentRotation - previousRotation) > GEAR_LIVE_THRESHOLD) {
          spinning = true;
        }
      }
      const motorInputLive = (runtime.telemetry.inputRpm ?? 0) > 0.1;
      scratch.timers[challenge.id] = flywheels.length > 0 && spinning && !motorInputLive
        ? (scratch.timers[challenge.id] ?? 0) + deltaSeconds
        : 0;
      return scratch.timers[challenge.id] >= 10;
    }
    case 'spring-launcher': {
      for (const ball of manifest.primitives.filter((primitive) => primitive.kind === 'ball')) {
        const point = getBodyPoint(ball, runtime);
        if (point) {
          scratch.minBallY = Math.min(scratch.minBallY, point.y);
        }
      }
      return manifest.primitives.some((primitive) => primitive.kind === 'spring-linear') && scratch.minBallY < 260;
    }
    default:
      return challenge.successCheck(manifest, runtime);
  }
}
