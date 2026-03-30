/**
 * physics-engine.ts
 *
 * Wraps Matter.js for free-build mode (manifests without a recipeId).
 * Recipe machines (gear-train-lab, conveyor-loader, etc.) keep their
 * scripted simulation paths in simulation.ts unchanged.
 *
 * Interaction systems:
 *   - Motor → Gear (proximity, BFS propagation through gear meshes)
 *   - Motor → Wheel (same proximity; wheels roll on surfaces)
 *   - Gear ↔ Gear / Gear ↔ Wheel meshing (BFS includes both kinds)
 *   - Motor → Conveyor speed (near endpoint boosts belt speed)
 *   - Conveyor → Cargo (velocity blend pushes blocks along belt)
 *   - Winch → Rope → Hook (Matter.js spring constraints)
 *   - Hook → Cargo (rigid attachment constraint)
 *   - Hopper funnel (gentle gravity well for cargo above mouth)
 *   - Locomotive free-build (scripted rail-follow, no recipe needed)
 */

import Matter from 'matter-js';
import { getJointIsland, getPrimitiveAnchor as getConnectorAnchor } from './connectors';
import {
  getTrackPoseFromPoints,
  resolveRailRoute,
  trackLengthFromPoints,
  type RailRoute,
  type RailSwitchBranch,
} from './rail-routing';
import type { CargoLifecycleState, ExperimentManifest, PrimitiveInstance, PrimitiveKind } from './types';

// Must match MachineCanvas createCanvas(960, 560)
const CANVAS_W = 960;
const CANVAS_H = 560;
const DEFAULT_WAGON_RAIL_SPEED = 0.18;

function teethToRadius(teeth: number): number {
  return Math.max(24, teeth * 1.4);
}

function isRotatingPrimitiveKind(kind: PrimitiveKind): boolean {
  return kind === 'gear'
    || kind === 'wheel'
    || kind === 'pulley'
    || kind === 'chain-sprocket'
    || kind === 'flywheel';
}

function isTransmissionConnectorKind(kind: PrimitiveKind): boolean {
  return kind === 'belt-link' || kind === 'chain-link';
}

function rotatingRadius(prim: PrimitiveInstance): number {
  if (prim.kind === 'gear') return teethToRadius((prim.config as { teeth: number }).teeth);
  if (prim.kind === 'wheel') return (prim.config as { radius: number }).radius ?? 28;
  if (prim.kind === 'pulley' || prim.kind === 'chain-sprocket') {
    return (prim.config as { radius?: number }).radius ?? 28;
  }
  if (prim.kind === 'flywheel') {
    return (prim.config as { radius?: number }).radius ?? 36;
  }
  return 0;
}

// ─── Public interfaces ────────────────────────────────────────────────────────

export interface PhysicsFrame {
  rotations: Record<string, number>;
  hookY: number | null;
  hopperFill: number | null;
  bodyPositions: Record<string, { x: number; y: number; angle: number }>;
  /** id → list of gear/wheel ids it is currently driving (for canvas overlay) */
  motorDrives: Record<string, string[]>;
  /** gear/wheel id → list of meshed gear/wheel ids (for canvas overlay) */
  gearMeshes: Record<string, string[]>;
  /** loco progress 0-1 along its track (forwarded to RuntimeSnapshot.trainProgress) */
  trainProgress: number;
  /** true when loco has passed 85% of track */
  wagonDelivered: boolean;
  trainTrackId?: string;
  switchStates: Record<string, RailSwitchBranch>;
  /** gear chain telemetry — null when no gears are being driven */
  gearTelemetry: { inputRpm: number; outputRpm: number; gearRatio: number } | null;
  cargoStates: Record<string, CargoLifecycleState>;
  throughput: number;
  beltPowered: boolean;
  lostCargoCount: number;
  stableCargoSpawns: Record<string, { x: number; y: number }>;
  wagonLoads: Record<string, number>;
  wagonCargo: Record<string, string[]>;
  pistonExtensions: Record<string, number>;
  bucketContents: Record<string, number>;
  bucketStates: Record<string, 'collecting' | 'dumping'>;
  springCompressions: Record<string, number>;
  sandParticlePositions: Array<{ x: number; y: number }>;
}

export interface MatterWorldOptions {
  stableCargoSpawns?: Record<string, { x: number; y: number }>;
}

export interface PhysicsWorld {
  engine: Matter.Engine;
  tick: (
    _dt: number,
    prevRotations: Record<string, number>,
    prevHookY: number,
    _prevHopperFill: number,
    prevTrainProgress: number,
  ) => PhysicsFrame;
  applyControls: (controlValues: Record<string, string | number | boolean>) => void;
  cleanup: () => void;
}

// ─── Main builder ─────────────────────────────────────────────────────────────

export function buildMatterWorld(
  manifest: ExperimentManifest,
  options: MatterWorldOptions = {},
): PhysicsWorld {
  const MATERIAL_KINDS: PrimitiveKind[] = ['cargo-block', 'ball', 'rock'];
  const engine = Matter.Engine.create({ gravity: { x: 0, y: 1.2 } });
  const bodyMap = new Map<string, Matter.Body>();
  const primitiveMap = new Map(manifest.primitives.map((primitive) => [primitive.id, primitive] as const));
  const ropeConstraints: Array<{
    primitiveId: string;
    fromId: string;
    viaIds: string[];
    totalLength: number;
    constraint: Matter.Constraint;
  }> = [];
  const boltLinks: Array<{
    primitiveId: string;
    fromId: string;
    toId: string;
    offsetX: number;
    offsetY: number;
    angleOffset: number;
  }> = [];
  const hingeLinks: Array<{
    primitiveId: string;
    fromId: string;
    toId: string;
    fromLocalX: number;
    fromLocalY: number;
    toLocalX: number;
    toLocalY: number;
    minAngle: number;
    maxAngle: number;
    motorId?: string;
    targetAngle?: number;
    enabled?: boolean;
    constraint: Matter.Constraint;
  }> = [];
  const cargoSpawnMap = new Map<string, { x: number; y: number }>();
  const cargoIdleTimers = new Map<string, number>();
  const cargoRespawnCounts = new Map<string, number>();
  const cargoStates = new Map<string, CargoLifecycleState>();
  const collectedCargoIds = new Set<string>();
  const wagonCargoAssignments = new Map<string, { wagonId: string; slot: number }>();
  const wagonCargoCooldowns = new Map<string, number>();
  const wagonUnloadTimers = new Map<string, number>();
  const trampolineCooldowns = new Map<string, number>();
  const railVehicleProgressState = new Map<string, number>();
  const wagonFollowOffsetState = new Map<string, number>();
  let lostCargoCount = 0;
  let throughput = 0;
  const motorPistonMap = new Map<string, string[]>();
  const motorWinchMap = new Map<string, string[]>();
  const motorLocoMap = new Map<string, string[]>();
  const gearRackMap = new Map<string, string>();
  const pistonExtensionsState: Record<string, number> = {};
  const springCompressionsState: Record<string, number> = {};
  const bucketContentsState: Record<string, number> = {};
  const bucketStateMap: Record<string, 'collecting' | 'dumping'> = {};
  const sandParticleBodies: Matter.Body[] = [];
  let totalParticleCount = 0;
  const MAX_PARTICLES = 30;
  const siloFloorMap = new Map<string, Matter.Body>();
  const beltLinkMap = new Map<string, Array<{ id: string; ratio: number }>>();

  const conveyorSupports: Array<{
    conveyorId: string;
    body: Matter.Body;
    ax: number;
    ay: number;
    bx: number;
    by: number;
  }> = [];
  const hopperStructures: Array<{
    hopperId: string;
    x: number;
    y: number;
    walls: Matter.Body[];
  }> = [];

  function localAnchorForPrimitive(primitive: PrimitiveInstance, role: 'general' | 'joint' | 'rope' = 'general') {
    if (primitive.kind === 'crane-arm') {
      const config = primitive.config as { length?: number };
      const length = config.length ?? 120;
      if (role === 'joint') {
        return { x: -length / 2, y: 0 };
      }
      if (role === 'rope') {
        return { x: length / 2, y: 0 };
      }
      return { x: 0, y: 0 };
    }

    if (primitive.kind === 'bucket') {
      const config = primitive.config as { depth?: number };
      if (role === 'joint' || role === 'rope') {
        return { x: 0, y: -(config.depth ?? 30) / 2 };
      }
    }

    return { x: 0, y: 0 };
  }

  function worldPointFromBody(body: Matter.Body, localPoint: { x: number; y: number }) {
    const cos = Math.cos(body.angle);
    const sin = Math.sin(body.angle);
    return {
      x: body.position.x + localPoint.x * cos - localPoint.y * sin,
      y: body.position.y + localPoint.x * sin + localPoint.y * cos,
    };
  }

  function primitiveCurrentPoint(primitiveId: string, role: 'general' | 'joint' | 'rope' = 'general') {
    const primitive = primitiveMap.get(primitiveId);
    if (!primitive) return { x: 0, y: 0 };
    const body = bodyMap.get(primitive.id);
    if (body) return worldPointFromBody(body, localAnchorForPrimitive(primitive, role));
    return getConnectorAnchor(primitive, role, manifest.primitives);
  }

  function anchorForPrimitive(primitiveId: string, role: 'general' | 'joint' | 'rope' = 'general') {
    const primitive = primitiveMap.get(primitiveId);
    if (!primitive) {
      return { pointA: { x: 0, y: 0 } };
    }
    const body = bodyMap.get(primitive.id);
    if (body) {
      return { bodyA: body, pointA: localAnchorForPrimitive(primitive, role) };
    }
    return { pointA: primitiveCurrentPoint(primitive.id, role) };
  }

  function ropePrefixLength(fromId: string, viaIds: string[]) {
    if (viaIds.length === 0) return 0;
    const points = [fromId, ...viaIds].map((primitiveId) => primitiveCurrentPoint(primitiveId, 'rope'));
    let total = 0;
    for (let index = 0; index < points.length - 1; index += 1) {
      total += Math.hypot(
        points[index + 1].x - points[index].x,
        points[index + 1].y - points[index].y,
      );
    }
    return total;
  }

  function syncRopeConstraint(entry: {
    primitiveId: string;
    fromId: string;
    viaIds: string[];
    totalLength: number;
    constraint: Matter.Constraint;
  }) {
    const prefix = ropePrefixLength(entry.fromId, entry.viaIds);
    entry.constraint.length = Math.max(24, entry.totalLength - prefix);
  }

  function normalizeAngle(angle: number) {
    let next = angle;
    while (next > Math.PI) next -= Math.PI * 2;
    while (next < -Math.PI) next += Math.PI * 2;
    return next;
  }

  function clampNumber(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
  }

  function placeBodyAtPivot(
    body: Matter.Body,
    localPoint: { x: number; y: number },
    pivot: { x: number; y: number },
    angle = body.angle,
  ) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    Matter.Body.setPosition(body, {
      x: pivot.x - (localPoint.x * cos - localPoint.y * sin),
      y: pivot.y - (localPoint.x * sin + localPoint.y * cos),
    });
  }

  function listAssignedCargoForWagon(wagonId: string) {
    return [...wagonCargoAssignments.entries()]
      .filter(([, entry]) => entry.wagonId === wagonId)
      .sort((a, b) => a[1].slot - b[1].slot);
  }

  function compactWagonAssignments(wagonId: string) {
    const assignedCargo = listAssignedCargoForWagon(wagonId);
    assignedCargo.forEach(([cargoId, entry], slot) => {
      if (entry.slot !== slot) {
        wagonCargoAssignments.set(cargoId, { wagonId, slot });
      }
    });
    return listAssignedCargoForWagon(wagonId);
  }

  function findWagonUnloadTarget(
    wagonPos: { x: number; y: number },
  ): { x: number; y: number; vx: number; vy: number; priority: number; dist: number } | null {
    let best: { x: number; y: number; vx: number; vy: number; priority: number; dist: number } | null = null;

    const considerTarget = (
      priority: number,
      x: number,
      y: number,
      vx: number,
      vy: number,
      maxDist: number,
    ) => {
      const dist = Math.hypot(x - wagonPos.x, y - wagonPos.y);
      if (dist > maxDist) return;
      if (!best || priority < best.priority || (priority === best.priority && dist < best.dist)) {
        best = { x, y, vx, vy, priority, dist };
      }
    };

    for (const primitive of manifest.primitives) {
      if (primitive.kind === 'hopper') {
        const cfg = primitive.config as { x: number; y: number };
        considerTarget(0, cfg.x, cfg.y - 46, 0, 1.6, 110);
      }

      if (primitive.kind === 'chute') {
        const cfg = primitive.config as { x: number; y: number; length?: number; angle?: number };
        const angle = ((cfg.angle ?? 30) * Math.PI) / 180;
        const halfLength = (cfg.length ?? 100) / 2;
        const topX = cfg.x - Math.cos(angle) * halfLength;
        const topY = cfg.y - Math.sin(angle) * halfLength;
        considerTarget(1, topX, topY - 18, Math.cos(angle) * 1.2, Math.sin(angle) * 1.2, 86);
      }

      if (primitive.kind === 'silo-bin') {
        const cfg = primitive.config as { x: number; y: number; width?: number; height?: number };
        const height = cfg.height ?? 100;
        considerTarget(1, cfg.x, cfg.y - height / 2 - 22, 0, 1.4, 92);
      }

      if (primitive.kind === 'conveyor') {
        const path = (primitive.config as { path: Array<{ x: number; y: number }> }).path;
        const closest = closestPointOnPolyline(path, wagonPos.x, wagonPos.y);
        if (!closest) continue;
        considerTarget(2, closest.x, closest.y - 18, closest.dx * 2.2, closest.dy * 0.8, 60);
      }
    }

    return best;
  }

  function pointInsideStation(
    point: { x: number; y: number },
    action?: 'load' | 'unload',
  ): { primitive: PrimitiveInstance; config: { x: number; y: number; width?: number; height?: number; action: 'load' | 'unload' } } | null {
    for (const primitive of manifest.primitives) {
      if (primitive.kind !== 'station-zone') continue;
      const config = primitive.config as {
        x: number;
        y: number;
        width?: number;
        height?: number;
        action: 'load' | 'unload';
      };
      if (action && config.action !== action) continue;
      const width = config.width ?? 120;
      const height = config.height ?? 80;
      if (Math.abs(point.x - config.x) <= width / 2 && Math.abs(point.y - config.y) <= height / 2) {
        return { primitive, config };
      }
    }
    return null;
  }

  function bodyInsideWaterZone(body: Matter.Body) {
    for (const zone of manifest.primitives) {
      if (zone.kind !== 'water') continue;
      const cfg = zone.config as { x: number; y: number; width?: number; height?: number };
      const width = cfg.width ?? 100;
      const height = cfg.height ?? 80;
      const left = cfg.x - width / 2;
      const right = cfg.x + width / 2;
      const top = cfg.y - height / 2;
      const bottom = cfg.y + height / 2;
      if (
        body.position.x >= left
        && body.position.x <= right
        && body.position.y >= top
        && body.position.y <= bottom
      ) {
        return true;
      }
    }
    return false;
  }

  // Ground + boundary walls
  Matter.World.add(engine.world, [
    Matter.Bodies.rectangle(CANVAS_W / 2, CANVAS_H + 25, CANVAS_W + 100, 50, {
      isStatic: true,
      label: '__ground__',
      friction: 0.85,
      restitution: 0.2,
    }),
    Matter.Bodies.rectangle(-25, CANVAS_H / 2, 50, CANVAS_H * 2, {
      isStatic: true,
      label: '__wall_left__',
    }),
    Matter.Bodies.rectangle(CANVAS_W + 25, CANVAS_H / 2, 50, CANVAS_H * 2, {
      isStatic: true,
      label: '__wall_right__',
    }),
  ]);

  for (const cargo of manifest.primitives.filter((primitive) => MATERIAL_KINDS.includes(primitive.kind))) {
    const cfg = cargo.config as { x: number; y: number };
    cargoSpawnMap.set(
      cargo.id,
      options.stableCargoSpawns?.[cargo.id] ?? { x: cfg.x, y: cfg.y },
    );
    cargoStates.set(cargo.id, 'spawned');
  }

  for (const primitive of manifest.primitives) {
    if (primitive.kind !== 'locomotive' && primitive.kind !== 'wagon') continue;
    const cfg = primitive.config as { trackId?: string; progress?: number; offset?: number };
    if (typeof cfg.trackId !== 'string') continue;
    let progress = cfg.progress ?? 0;
    if (
      primitive.kind === 'wagon'
      && typeof cfg.progress !== 'number'
      && typeof cfg.offset === 'number'
    ) {
      const leadLocomotive = manifest.primitives.find((candidate) =>
        candidate.kind === 'locomotive'
        && (candidate.config as { trackId?: string }).trackId === cfg.trackId);
      const leadProgress = Number((leadLocomotive?.config as { progress?: number } | undefined)?.progress ?? 0);
      progress = leadProgress + cfg.offset;
    }
    railVehicleProgressState.set(primitive.id, wrapUnitProgress(progress));
  }

  for (const wagon of manifest.primitives.filter((primitive) => primitive.kind === 'wagon')) {
    const wagonCfg = wagon.config as { trackId?: string; offset?: number; progress?: number };
    if (typeof wagonCfg.trackId !== 'string') continue;
    const leadLocomotive = manifest.primitives.find((primitive) =>
      primitive.kind === 'locomotive'
      && (primitive.config as { trackId?: string }).trackId === wagonCfg.trackId);
    if (!leadLocomotive) continue;
    const leadProgress = wrapUnitProgress(
      Number((leadLocomotive.config as { progress?: number }).progress ?? 0),
    );
    wagonFollowOffsetState.set(
      wagon.id,
      normalizeRailOffset(
        typeof wagonCfg.offset === 'number'
          ? wagonCfg.offset
          : Number(wagonCfg.progress ?? 0) - leadProgress,
      ),
    );
  }

  function spawnSandParticlesForPile(prim: PrimitiveInstance) {
    const cfg = prim.config as { x: number; y: number; quantity?: number };
    const qty = Math.min(cfg.quantity ?? 10, Math.max(0, MAX_PARTICLES - totalParticleCount));
    totalParticleCount += qty;
    for (let index = 0; index < qty; index += 1) {
      const particle = Matter.Bodies.circle(
        cfg.x + (Math.random() - 0.5) * 20,
        cfg.y + (Math.random() - 0.5) * 10 - index * 5,
        4,
        {
          label: `sand-${prim.id}-${index}`,
          mass: 0.1,
          restitution: 0,
          friction: 0.5,
          frictionAir: 0.01,
          collisionFilter: { category: 0x0004, mask: 0x0001 },
        },
      );
      sandParticleBodies.push(particle);
      Matter.World.add(engine.world, particle);
    }
  }

  // ── Create a body for each positioned primitive ───────────────────────────
  for (const prim of manifest.primitives) {
    if (prim.kind === 'material-pile') {
      spawnSandParticlesForPile(prim);
      continue;
    }
    const body = createBodyForPrimitive(prim, manifest.primitives);
    if (body) {
      bodyMap.set(prim.id, body);
      Matter.World.add(engine.world, body);
    }
  }

  // Mechanical islands should not fight themselves through contact collisions.
  // Bolted and hinged assemblies read much better when the joint defines motion.
  const groupedBodies = new Set<string>();
  let nextCollisionGroup = -1;
  for (const prim of manifest.primitives) {
    if (!bodyMap.has(prim.id) || groupedBodies.has(prim.id)) continue;
    const islandBodyIds = [...getJointIsland(manifest, prim.id)].filter((id) => bodyMap.has(id));
    islandBodyIds.forEach((id) => groupedBodies.add(id));
    if (islandBodyIds.length < 2) continue;
    const collisionGroup = nextCollisionGroup;
    nextCollisionGroup -= 1;
    for (const bodyId of islandBodyIds) {
      const body = bodyMap.get(bodyId);
      if (body) {
        body.collisionFilter.group = collisionGroup;
      }
    }
  }

  // ── Conveyor support bodies ───────────────────────────────────────────────
  for (const prim of manifest.primitives) {
    if (prim.kind !== 'conveyor') continue;
    const cfg = prim.config as { path: Array<{ x: number; y: number }> };
    for (let index = 0; index < cfg.path.length - 1; index += 1) {
      const start = cfg.path[index];
      const end = cfg.path[index + 1];
      const segLen = Math.hypot(end.x - start.x, end.y - start.y);
      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      const centerX = (start.x + end.x) / 2;
      const centerY = (start.y + end.y) / 2 + 12;
      const support = Matter.Bodies.rectangle(centerX, centerY, segLen + 8, 14, {
        isStatic: true,
        angle,
        label: `support-${prim.id}-${index}`,
        friction: 0.9,
        restitution: 0.02,
      });
      conveyorSupports.push({
        conveyorId: prim.id,
        body: support,
        ax: start.x,
        ay: start.y,
        bx: end.x,
        by: end.y,
      });
      Matter.World.add(engine.world, support);
    }
  }

  // ── Hopper guide walls ────────────────────────────────────────────────────
  for (const prim of manifest.primitives) {
    if (prim.kind !== 'hopper') continue;
    const cfg = prim.config as { x: number; y: number };
    const leftWall = Matter.Bodies.rectangle(cfg.x - 24, cfg.y + 24, 12, 84, {
      isStatic: true,
      angle: 0.28,
      label: `hopper-wall-left-${prim.id}`,
      friction: 0.4,
      restitution: 0.05,
    });
    const rightWall = Matter.Bodies.rectangle(cfg.x + 24, cfg.y + 24, 12, 84, {
      isStatic: true,
      angle: -0.28,
      label: `hopper-wall-right-${prim.id}`,
      friction: 0.4,
      restitution: 0.05,
    });
    const binFloor = Matter.Bodies.rectangle(cfg.x, cfg.y + 70, 58, 10, {
      isStatic: true,
      label: `hopper-floor-${prim.id}`,
      friction: 0.7,
      restitution: 0.02,
    });
    hopperStructures.push({
      hopperId: prim.id,
      x: cfg.x,
      y: cfg.y,
      walls: [leftWall, rightWall, binFloor],
    });
    Matter.World.add(engine.world, [leftWall, rightWall, binFloor]);
  }

  for (const prim of manifest.primitives) {
    if (prim.kind === 'silo-bin') {
      const cfg = prim.config as { x: number; y: number; width?: number; height?: number; gateOpen?: boolean };
      const width = cfg.width ?? 80;
      const height = cfg.height ?? 100;
      const rightWall = Matter.Bodies.rectangle(cfg.x + width / 2, cfg.y, 10, height, {
        isStatic: true,
        label: `silo-wall-right-${prim.id}`,
        friction: 0.8,
      });
      const floor = Matter.Bodies.rectangle(cfg.x, cfg.y + height / 2, width, 10, {
        isStatic: true,
        label: `silo-floor-${prim.id}`,
        friction: 0.8,
      });
      Matter.World.add(engine.world, rightWall);
      if (!(cfg.gateOpen ?? false)) {
        Matter.World.add(engine.world, floor);
      }
      siloFloorMap.set(prim.id, floor);
    }

    if (prim.kind === 'tunnel') {
      const cfg = prim.config as { x: number; y: number; width?: number; angle?: number };
      const width = cfg.width ?? 100;
      const angle = ((cfg.angle ?? 0) * Math.PI) / 180;
      const bottomWall = Matter.Bodies.rectangle(cfg.x, cfg.y + 20, width, 10, {
        isStatic: true,
        label: `tunnel-floor-${prim.id}`,
        angle,
        friction: 0.5,
      });
      Matter.World.add(engine.world, bottomWall);
    }
  }

  const physicsOverrides = manifest.world.physicsOverrides;
  if (physicsOverrides) {
    if (typeof physicsOverrides.gravityY === 'number') {
      engine.gravity.y = physicsOverrides.gravityY;
    }
    if (
      typeof physicsOverrides.globalRestitution === 'number'
      || typeof physicsOverrides.globalFriction === 'number'
    ) {
      for (const body of Matter.Composite.allBodies(engine.world)) {
        if (typeof physicsOverrides.globalRestitution === 'number') {
          body.restitution = physicsOverrides.globalRestitution;
        }
        if (typeof physicsOverrides.globalFriction === 'number') {
          body.friction = physicsOverrides.globalFriction;
          body.frictionStatic = physicsOverrides.globalFriction;
        }
      }
    }
  }

  // ── Create constraints ────────────────────────────────────────────────────
  for (const prim of manifest.primitives) {
    if (prim.kind === 'beam') {
      const cfg = prim.config as { fromNodeId: string; toNodeId: string; stiffness: number };
      const bodyA = bodyMap.get(cfg.fromNodeId);
      const bodyB = bodyMap.get(cfg.toNodeId);
      if (bodyA && bodyB) {
        const dx = bodyB.position.x - bodyA.position.x;
        const dy = bodyB.position.y - bodyA.position.y;
        Matter.World.add(
          engine.world,
          Matter.Constraint.create({
            bodyA,
            bodyB,
            length: Math.max(Math.sqrt(dx * dx + dy * dy), 1),
            stiffness: Math.max(0.1, cfg.stiffness),
            damping: 0.1,
            label: prim.id,
          }),
        );
      }
    }

    if (prim.kind === 'rope' || isTransmissionConnectorKind(prim.kind)) {
      const cfg = prim.config as { fromId: string; toId: string; length: number; viaIds?: string[] };
      const fromPrim = primitiveMap.get(cfg.fromId);
      const toPrim = primitiveMap.get(cfg.toId);
      const actsAsTransmission = prim.kind !== 'rope'
        || (fromPrim && toPrim && isRotatingPrimitiveKind(fromPrim.kind) && isRotatingPrimitiveKind(toPrim.kind));
      if (actsAsTransmission && fromPrim && toPrim && isRotatingPrimitiveKind(fromPrim.kind) && isRotatingPrimitiveKind(toPrim.kind)) {
        const ratioAtoB = rotatingRadius(fromPrim) / Math.max(1, rotatingRadius(toPrim));
        const ratioBtoA = rotatingRadius(toPrim) / Math.max(1, rotatingRadius(fromPrim));
        if (!beltLinkMap.has(fromPrim.id)) beltLinkMap.set(fromPrim.id, []);
        if (!beltLinkMap.has(toPrim.id)) beltLinkMap.set(toPrim.id, []);
        if (!beltLinkMap.get(fromPrim.id)!.some((link) => link.id === toPrim.id)) {
          beltLinkMap.get(fromPrim.id)!.push({ id: toPrim.id, ratio: ratioAtoB });
        }
        if (!beltLinkMap.get(toPrim.id)!.some((link) => link.id === fromPrim.id)) {
          beltLinkMap.get(toPrim.id)!.push({ id: fromPrim.id, ratio: ratioBtoA });
        }
      } else if (prim.kind === 'rope') {
        const endpointPrim = primitiveMap.get(cfg.toId);
        const endpointBody = bodyMap.get(cfg.toId);
        if (!fromPrim || !endpointPrim || !endpointBody) continue;
        const viaIds = (cfg.viaIds ?? []).filter((viaId) => primitiveMap.has(viaId));
        const anchorId = viaIds.at(-1) ?? cfg.fromId;
        const anchor = anchorForPrimitive(anchorId, 'rope');
        const constraint = Matter.Constraint.create({
          ...(anchor.bodyA ? { bodyA: anchor.bodyA } : {}),
          pointA: anchor.pointA,
          bodyB: endpointBody,
          pointB: localAnchorForPrimitive(endpointPrim, 'rope'),
          length: Math.max(24, cfg.length - ropePrefixLength(cfg.fromId, viaIds)),
          stiffness: 0.05,
          damping: 0.2,
          label: `rope-${prim.id}`,
        });
        ropeConstraints.push({
          primitiveId: prim.id,
          fromId: cfg.fromId,
          viaIds,
          totalLength: cfg.length,
          constraint,
        });
        Matter.World.add(engine.world, constraint);
      }
    }

    if (prim.kind === 'bolt-link') {
      const cfg = prim.config as { fromId: string; toId: string; offsetX: number; offsetY: number; angleOffset: number };
      const fromBody = bodyMap.get(cfg.fromId);
      const toBody = bodyMap.get(cfg.toId);
      if (fromBody && toBody) {
        boltLinks.push({
          primitiveId: prim.id,
          fromId: cfg.fromId,
          toId: cfg.toId,
          offsetX: cfg.offsetX,
          offsetY: cfg.offsetY,
          angleOffset: cfg.angleOffset,
        });
        // Two-point constraint locking: one at the offset (translation) and one
        // rotated 20px away (rotation), so the pair acts as a stiff rigid link
        // instead of the old setPosition/setAngle override that killed physics.
        const cos0 = Math.cos(cfg.angleOffset);
        const sin0 = Math.sin(cfg.angleOffset);
        Matter.World.add(engine.world, Matter.Constraint.create({
          bodyA: fromBody,
          pointA: { x: cfg.offsetX, y: cfg.offsetY },
          bodyB: toBody,
          pointB: { x: 0, y: 0 },
          length: 0,
          stiffness: 0.92,
          damping: 0.3,
          label: `bolt-pos-${prim.id}`,
        }));
        Matter.World.add(engine.world, Matter.Constraint.create({
          bodyA: fromBody,
          pointA: { x: cfg.offsetX + cos0 * 20, y: cfg.offsetY + sin0 * 20 },
          bodyB: toBody,
          pointB: { x: 20, y: 0 },
          length: 0,
          stiffness: 0.92,
          damping: 0.3,
          label: `bolt-rot-${prim.id}`,
        }));
      }
    }

    if (prim.kind === 'hinge-link' || prim.kind === 'powered-hinge-link') {
      const cfg = prim.config as {
        fromId: string;
        toId: string;
        fromLocalX: number;
        fromLocalY: number;
        toLocalX: number;
        toLocalY: number;
        minAngle: number;
        maxAngle: number;
        motorId?: string;
        targetAngle?: number;
        enabled?: boolean;
      };
      const fromBody = bodyMap.get(cfg.fromId);
      const toBody = bodyMap.get(cfg.toId);
      if (fromBody && toBody) {
        const constraint = Matter.Constraint.create({
          bodyA: fromBody,
          pointA: { x: cfg.fromLocalX, y: cfg.fromLocalY },
          bodyB: toBody,
          pointB: { x: cfg.toLocalX, y: cfg.toLocalY },
          length: 0,
          stiffness: 1,
          damping: 0.3,
          label: `hinge-${prim.id}`,
        });
        hingeLinks.push({
          primitiveId: prim.id,
          fromId: cfg.fromId,
          toId: cfg.toId,
          fromLocalX: cfg.fromLocalX,
          fromLocalY: cfg.fromLocalY,
          toLocalX: cfg.toLocalX,
          toLocalY: cfg.toLocalY,
          minAngle: cfg.minAngle,
          maxAngle: cfg.maxAngle,
          motorId: cfg.motorId,
          targetAngle: cfg.targetAngle,
          enabled: cfg.enabled,
          constraint,
        });
        Matter.World.add(engine.world, constraint);
      }
    }

    if (prim.kind === 'cargo-block') {
      const cfg = prim.config as { attachedToId?: string };
      if (cfg.attachedToId) {
        const hookBody = bodyMap.get(cfg.attachedToId);
        const cargoBody = bodyMap.get(prim.id);
        if (hookBody && cargoBody) {
          Matter.World.add(
            engine.world,
            Matter.Constraint.create({
              bodyA: hookBody,
              bodyB: cargoBody,
              length: 20,
              stiffness: 0.9,
              damping: 0.1,
              label: `attach-${prim.id}`,
            }),
          );
        }
      }
    }

    if (
      prim.kind === 'wheel'
      || prim.kind === 'motor'
      || prim.kind === 'gear'
      || prim.kind === 'pulley'
      || prim.kind === 'chain-sprocket'
      || prim.kind === 'flywheel'
      || prim.kind === 'winch'
      || prim.kind === 'bucket'
      || prim.kind === 'counterweight'
    ) {
      const cfg = prim.config as {
        attachedToId?: string;
        attachOffsetX?: number;
        attachOffsetY?: number;
      };
      if (cfg.attachedToId) {
        const parentBody = bodyMap.get(cfg.attachedToId);
        const childBody = bodyMap.get(prim.id);
        if (parentBody && childBody) {
          Matter.World.add(
            engine.world,
            Matter.Constraint.create({
              bodyA: parentBody,
              pointA: {
                x: cfg.attachOffsetX ?? 0,
                y: cfg.attachOffsetY ?? 0,
              },
              bodyB: childBody,
              pointB: { x: 0, y: 0 },
              length: 0,
              stiffness: prim.kind === 'wheel' ? 0.95 : 0.9,
              damping: 0.1,
              label: `attach-${prim.id}`,
            }),
          );
        }
      }
    }

    if (prim.kind === 'spring-linear') {
      const cfg = prim.config as { x: number; y: number; orientation?: string; restLength?: number; stiffness?: number };
      const plateBody = bodyMap.get(prim.id);
      if (plateBody) {
        Matter.World.add(
          engine.world,
          Matter.Constraint.create({
            pointA: { x: cfg.x, y: cfg.y },
            bodyB: plateBody,
            pointB: { x: 0, y: 0 },
            length: cfg.restLength ?? 40,
            stiffness: cfg.stiffness ?? 0.05,
            damping: 0.2,
            label: `spring-${prim.id}`,
          }),
        );
      }
    }

    if (prim.kind === 'crane-arm') {
      const cfg = prim.config as {
        x: number;
        y: number;
        length?: number;
        attachedToId?: string;
        attachOffsetX?: number;
        attachOffsetY?: number;
      };
      const armBody = bodyMap.get(prim.id);
      if (armBody) {
        const length = cfg.length ?? 120;
        const parentBody = cfg.attachedToId ? bodyMap.get(cfg.attachedToId) : null;
        Matter.World.add(
          engine.world,
          Matter.Constraint.create({
            ...(parentBody
              ? {
                  bodyA: parentBody,
                  pointA: {
                    x: cfg.attachOffsetX ?? 0,
                    y: cfg.attachOffsetY ?? 0,
                  },
                }
              : {
                  pointA: { x: cfg.x, y: cfg.y },
                }),
            bodyB: armBody,
            pointB: { x: -length / 2, y: 0 },
            length: 0,
            stiffness: 0.9,
            damping: 0.5,
            label: `arm-pivot-${prim.id}`,
          }),
        );
      }
    }
  }

  // ── Pin gears to their spawn point (spin in place) ────────────────────────
  for (const prim of manifest.primitives) {
    if (prim.kind !== 'gear' && prim.kind !== 'pulley' && prim.kind !== 'chain-sprocket') continue;
    // Flywheels are intentionally not pinned so later phases can mount them on moving assemblies.
    const cfg = prim.config as { attachedToId?: string };
    if (cfg.attachedToId) continue;
    const body = bodyMap.get(prim.id);
    if (!body) continue;
    Matter.World.add(
      engine.world,
      Matter.Constraint.create({
        pointA: { x: body.position.x, y: body.position.y },
        bodyB: body,
        pointB: { x: 0, y: 0 },
        length: 0,
        stiffness: 1,
        damping: 0,
        label: `pin-${prim.id}`,
      }),
    );
  }

  // ── Motor → gear proximity map ────────────────────────────────────────────
  const motorGearMap = new Map<string, string[]>();
  for (const motor of manifest.primitives.filter((p) => p.kind === 'motor')) {
    const mCfg = motor.config as { x: number; y: number };
    const gearIds = manifest.primitives
      .filter((p) => p.kind === 'gear' || p.kind === 'pulley' || p.kind === 'chain-sprocket' || p.kind === 'flywheel')
      .filter((p) => {
        const gCfg = p.config as { x: number; y: number };
        return Math.hypot(gCfg.x - mCfg.x, gCfg.y - mCfg.y) < 220;
      })
      .map((p) => p.id);
    motorGearMap.set(motor.id, gearIds);
  }

  // ── Motor → wheel proximity map ───────────────────────────────────────────
  // Wheels spin and roll when driven — no pinning, so they can propel vehicles.
  const motorWheelMap = new Map<string, string[]>();
  for (const motor of manifest.primitives.filter((p) => p.kind === 'motor')) {
    const mCfg = motor.config as { x: number; y: number };
    const wheelIds = manifest.primitives
      .filter((p) => p.kind === 'wheel')
      .filter((p) => {
        const wCfg = p.config as { x: number; y: number };
        return Math.hypot(wCfg.x - mCfg.x, wCfg.y - mCfg.y) < 220;
      })
      .map((p) => p.id);
    motorWheelMap.set(motor.id, wheelIds);
  }

  // ── Gear / Wheel mesh map ─────────────────────────────────────────────────
  // Includes gear-gear, gear-wheel, and wheel-wheel pairs.
  // When two rotating parts' radii nearly touch, they counter-rotate.
  const gearMeshMap = new Map<string, Array<{ id: string; ratio: number }>>();
  const rotatingPrims = manifest.primitives.filter((p) => isRotatingPrimitiveKind(p.kind));
  for (let i = 0; i < rotatingPrims.length; i += 1) {
    for (let j = i + 1; j < rotatingPrims.length; j += 1) {
      const a = rotatingPrims[i];
      const b = rotatingPrims[j];
      const aCfg = a.config as { x: number; y: number };
      const bCfg = b.config as { x: number; y: number };
      const rA = rotatingRadius(a);
      const rB = rotatingRadius(b);
      const dist = Math.hypot(aCfg.x - bCfg.x, aCfg.y - bCfg.y);
      if (dist <= rA + rB + 16) {
        // ratio: angular velocity ratio between the two (larger radius = slower)
        const ratioAtoB = rA / rB;
        const ratioBtoA = rB / rA;
        if (!gearMeshMap.has(a.id)) gearMeshMap.set(a.id, []);
        if (!gearMeshMap.has(b.id)) gearMeshMap.set(b.id, []);
        gearMeshMap.get(a.id)!.push({ id: b.id, ratio: ratioAtoB });
        gearMeshMap.get(b.id)!.push({ id: a.id, ratio: ratioBtoA });
      }
    }
  }

  // Gearbox virtual transmission: connects input-side rotating parts to output-side.
  for (const gb of manifest.primitives.filter((p) => p.kind === 'gearbox')) {
    const cfg = gb.config as { x: number; y: number; inputTeeth: number; outputTeeth: number };
    const ratio = cfg.inputTeeth / Math.max(1, cfg.outputTeeth);
    const inputSide = rotatingPrims.filter((p) => {
      const pc = p.config as { x: number; y: number };
      return pc.x < cfg.x && Math.hypot(pc.x - cfg.x, pc.y - cfg.y) < 220;
    });
    const outputSide = rotatingPrims.filter((p) => {
      const pc = p.config as { x: number; y: number };
      return pc.x >= cfg.x && Math.hypot(pc.x - cfg.x, pc.y - cfg.y) < 220;
    });
    for (const inp of inputSide) {
      for (const out of outputSide) {
        if (inp.id === out.id) continue;
        if (!gearMeshMap.has(inp.id)) gearMeshMap.set(inp.id, []);
        if (!gearMeshMap.has(out.id)) gearMeshMap.set(out.id, []);
        if (!gearMeshMap.get(inp.id)!.some((mesh) => mesh.id === out.id)) {
          gearMeshMap.get(inp.id)!.push({ id: out.id, ratio });
        }
        if (!gearMeshMap.get(out.id)!.some((mesh) => mesh.id === inp.id)) {
          gearMeshMap.get(out.id)!.push({ id: inp.id, ratio: 1 / ratio });
        }
      }
    }
  }

  // ── Motor → conveyor proximity map ────────────────────────────────────────
  // A motor within 300px of a conveyor can boost that belt when powered.
  const conveyorMotorMap = new Map<string, string[]>();
  for (const motor of manifest.primitives.filter((p) => p.kind === 'motor')) {
    const mCfg = motor.config as { x: number; y: number };
    for (const conv of manifest.primitives.filter((p) => p.kind === 'conveyor')) {
      const cCfg = conv.config as { path: Array<{ x: number; y: number }> };
      const near = distToPolyline(cCfg.path, mCfg.x, mCfg.y) < 300;
      if (near) {
        if (!conveyorMotorMap.has(conv.id)) {
          conveyorMotorMap.set(conv.id, []);
        }
        conveyorMotorMap.get(conv.id)!.push(motor.id);
      }
    }
  }

  // Motor → piston proximity map
  for (const motor of manifest.primitives.filter((p) => p.kind === 'motor')) {
    const mCfg = motor.config as { x: number; y: number };
    const pistonIds = manifest.primitives
      .filter((p) => p.kind === 'piston')
      .filter((p) => {
        const pCfg = p.config as { x: number; y: number };
        return Math.hypot(pCfg.x - mCfg.x, pCfg.y - mCfg.y) < 220;
      })
      .map((p) => p.id);
    motorPistonMap.set(motor.id, pistonIds);
  }

  // Motor → winch proximity map
  for (const motor of manifest.primitives.filter((p) => p.kind === 'motor')) {
    const mCfg = motor.config as { x: number; y: number };
    const winchIds = manifest.primitives
      .filter((p) => p.kind === 'winch')
      .filter((p) => {
        const wCfg = p.config as { x: number; y: number };
        return Math.hypot(wCfg.x - mCfg.x, wCfg.y - mCfg.y) < 220;
      })
      .map((p) => p.id);
    motorWinchMap.set(motor.id, winchIds);
  }

  // Motor → locomotive proximity map
  for (const motor of manifest.primitives.filter((p) => p.kind === 'motor')) {
    const mCfg = motor.config as { x: number; y: number };
    const locoIds = manifest.primitives
      .filter((p) => p.kind === 'locomotive')
      .filter((p) => {
        const lCfg = p.config as { trackId?: string };
        const track = lCfg.trackId ? primitiveMap.get(lCfg.trackId) : null;
        if (!track || track.kind !== 'rail-segment') return false;
        return distToPolyline(
          (track.config as { points: Array<{ x: number; y: number }> }).points,
          mCfg.x,
          mCfg.y,
        ) < 300;
      })
      .map((p) => p.id);
    motorLocoMap.set(motor.id, locoIds);
  }

  // Gear → rack proximity map
  for (const rack of manifest.primitives.filter((p) => p.kind === 'rack')) {
    const rCfg = rack.config as { x: number; y: number; width?: number; orientation?: string };
    const horizontal = rCfg.orientation !== 'vertical';
    const rackEndX = horizontal ? rCfg.x - (rCfg.width ?? 80) / 2 : rCfg.x;
    const rackEndY = horizontal ? rCfg.y : rCfg.y - (rCfg.width ?? 80) / 2;
    for (const gear of rotatingPrims) {
      const gCfg = gear.config as { x: number; y: number };
      const radius = rotatingRadius(gear);
      if (Math.hypot(rackEndX - gCfg.x, rackEndY - gCfg.y) < radius + 30) {
        gearRackMap.set(rack.id, gear.id);
        break;
      }
    }
  }

  // ── Rail vehicle state ────────────────────────────────────────────────────
  // Rail-bound locomotives and wagons keep real physics bodies so they can
  // carry cargo and participate in bolt/hinge assemblies honestly.
  const locoPrim = manifest.primitives.find((primitive) =>
    primitive.kind === 'locomotive'
    && typeof (primitive.config as { trackId?: string }).trackId === 'string',
  );
  let locoProgress = locoPrim
    ? (railVehicleProgressState.get(locoPrim.id) ?? 0)
    : 0;

  let currentControls: Record<string, string | number | boolean> = {};
  let activeMotorIds = new Set<string>();

  function readRailSwitchBranch(switchId: string): RailSwitchBranch {
    const switchPrim = primitiveMap.get(switchId);
    if (!switchPrim || switchPrim.kind !== 'rail-switch') {
      return 'right';
    }
    const branchControl = manifest.controls.find(
      (control) => control.bind?.targetId === switchId && control.bind?.path === 'branchRight',
    );
    const branchRight = branchControl
      ? Boolean(
        currentControls[branchControl.id]
        ?? ((switchPrim.config as { branch?: RailSwitchBranch }).branch ?? 'right') === 'right',
      )
      : ((switchPrim.config as { branch?: RailSwitchBranch }).branch ?? 'right') === 'right';
    return branchRight ? 'right' : 'left';
  }

  function readLocoState(locomotive: PrimitiveInstance) {
    const cfg = locomotive.config as { speed: number; enabled?: boolean };
    const enabledControl = manifest.controls.find(
      (control) => control.bind?.targetId === locomotive.id && control.bind?.path === 'enabled',
    );
    const speedControl = manifest.controls.find(
      (control) => control.bind?.targetId === locomotive.id && control.bind?.path === 'speed',
    );
    return {
      enabled: enabledControl
        ? Boolean(currentControls[enabledControl.id] ?? cfg.enabled ?? true)
        : cfg.enabled ?? true,
      speed: speedControl
        ? Number(currentControls[speedControl.id] ?? cfg.speed)
        : cfg.speed,
    };
  }

  function getRailRoute(
    routeCache: Map<string, RailRoute>,
    trackId: string,
  ) {
    if (!routeCache.has(trackId)) {
      routeCache.set(trackId, resolveRailRoute(manifest.primitives, trackId, readRailSwitchBranch));
    }
    return routeCache.get(trackId)!;
  }

  function syncRailVehicleBody(
    primitive: PrimitiveInstance,
    routeCache: Map<string, RailRoute>,
  ) {
    const cfg = primitive.config as { trackId?: string };
    if (typeof cfg.trackId !== 'string') return;
    const route = getRailRoute(routeCache, cfg.trackId);
    if (route.points.length < 2) return;
    const body = bodyMap.get(primitive.id);
    if (!body) return;
    const progress = railVehicleProgressState.get(primitive.id) ?? 0;
    const pose = getTrackPoseFromPoints(route.points, progress);
    Matter.Body.setPosition(body, { x: pose.x, y: pose.y });
    if (Math.abs(normalizeAngle(body.angle - pose.angle)) > 0.0001) {
      Matter.Body.setAngle(body, pose.angle);
    }
    Matter.Body.setVelocity(body, { x: 0, y: 0 });
    Matter.Body.setAngularVelocity(body, 0);
  }

  function readRailVehiclePose(
    primitive: PrimitiveInstance,
    routeCache: Map<string, RailRoute>,
  ) {
    const body = bodyMap.get(primitive.id);
    if (body) {
      return { x: body.position.x, y: body.position.y, angle: body.angle };
    }

    const cfg = primitive.config as { x?: number; y?: number; trackId?: string; progress?: number };
    if (typeof cfg.trackId === 'string') {
      const route = getRailRoute(routeCache, cfg.trackId);
      if (route.points.length >= 2) {
        return getTrackPoseFromPoints(
          route.points,
          railVehicleProgressState.get(primitive.id) ?? wrapUnitProgress(cfg.progress ?? 0),
        );
      }
    }

    return {
      x: Number(cfg.x ?? 0),
      y: Number(cfg.y ?? 0),
      angle: 0,
    };
  }

  // ── applyControls ─────────────────────────────────────────────────────────
  function applyControls(controlValues: Record<string, string | number | boolean>) {
    currentControls = controlValues;

    for (const prim of manifest.primitives) {
      if (prim.kind === 'winch') {
        const ropeControl = manifest.controls.find(
          (c) => c.bind?.targetId === prim.id && c.bind?.path === 'ropeLength',
        );
        if (!ropeControl) continue;
        const newLength = Number(
          controlValues[ropeControl.id] ?? (prim.config as { ropeLength: number }).ropeLength,
        );
        for (const rope of ropeConstraints) {
          if (rope.fromId !== prim.id) continue;
          rope.totalLength = newLength;
          syncRopeConstraint(rope);
        }
      }

      if (prim.kind === 'silo-bin') {
        const gateControl = manifest.controls.find(
          (c) => c.bind?.targetId === prim.id && c.bind?.path === 'gateOpen',
        );
        const floorBody = siloFloorMap.get(prim.id);
        if (!gateControl || !floorBody) continue;
        const shouldOpen = Boolean(controlValues[gateControl.id] ?? (prim.config as { gateOpen?: boolean }).gateOpen);
        const floorPresent = Matter.Composite.allBodies(engine.world).some((body) => body === floorBody);
        if (shouldOpen && floorPresent) {
          Matter.World.remove(engine.world, floorBody);
        } else if (!shouldOpen && !floorPresent) {
          Matter.World.add(engine.world, floorBody);
        }
      }
    }
  }

  function readMotorState(motor: PrimitiveInstance) {
    const cfg = motor.config as { rpm: number; powerState: boolean };
    const powerControl = manifest.controls.find(
      (control) => control.bind?.targetId === motor.id && control.bind?.path === 'powerState',
    );
    const powered = powerControl
      ? Boolean(currentControls[powerControl.id] ?? cfg.powerState)
      : cfg.powerState;
    const rpmControl = manifest.controls.find(
      (control) => control.bind?.targetId === motor.id && control.bind?.path === 'rpm',
    );
    const rpm = rpmControl
      ? Number(currentControls[rpmControl.id] ?? cfg.rpm)
      : cfg.rpm;
    return {
      powered,
      rpm,
      angVel: (rpm * Math.PI) / 30,
    };
  }

  function tickWaterZones(supportedCargoIds: Set<string>) {
    const waterZones = manifest.primitives.filter((p) => p.kind === 'water');
    if (waterZones.length === 0) return;

    for (const body of Matter.Composite.allBodies(engine.world)) {
      if (body.isStatic) continue;
      const primForBody = manifest.primitives.find((p) => bodyMap.get(p.id) === body);
      if (primForBody && supportedCargoIds.has(primForBody.id)) continue;

      for (const zone of waterZones) {
        const cfg = zone.config as { x: number; y: number; width?: number; height?: number; density?: number };
        const width = cfg.width ?? 100;
        const height = cfg.height ?? 80;
        const left = cfg.x - width / 2;
        const right = cfg.x + width / 2;
        const top = cfg.y - height / 2;
        const bottom = cfg.y + height / 2;
        if (body.position.x < left || body.position.x > right) continue;
        if (body.position.y < top || body.position.y > bottom) continue;
        const submersion = clampNumber(
          (body.position.y - top) / Math.max(1, height),
          0.08,
          1,
        );
        const dampedVerticalVelocity = clampNumber(
          body.velocity.y < 0
            ? body.velocity.y * 0.68
            : body.velocity.y * 0.74,
          -1.2,
          2.4,
        );
        Matter.Body.setVelocity(body, {
          x: body.velocity.x * 0.92,
          y: body.position.y < top + 18 && dampedVerticalVelocity < -0.6
            ? -0.6
            : dampedVerticalVelocity,
        });
        const density = clampNumber(cfg.density ?? 0.8, 0.2, 1.4);
        Matter.Body.applyForce(body, body.position, {
          x: -body.velocity.x * body.mass * 0.00016,
          y: -(body.mass * engine.gravity.y * Math.min(0.82, (0.2 + density * 0.35) * submersion)),
        });
      }
    }
  }

  // ── driveMotors ───────────────────────────────────────────────────────────
  // Applies torque toward target angular velocity on gears and wheels driven
  // by active motors.  Instead of instantly setting angular velocity (which
  // overrides all physics and causes wild behaviour when parts interact), we
  // blend toward the target so parts accelerate gradually and can stall
  // under heavy loads.
  // BFS propagates target velocity through the gear/wheel mesh map.
  // Returns the driven map so tick() can compute gear telemetry.

  /** How quickly driven parts reach target velocity (0 = frozen, 1 = instant). */
  const MOTOR_BLEND = 0.12;
  /** Max angular acceleration per tick (rad/s²-ish) — prevents sudden jumps. */
  const MAX_ANGULAR_ACCEL = 0.35;

  function driveMotors(): Map<string, number> {
    const driven = new Map<string, number>(); // id → target angularVelocity
    activeMotorIds = new Set<string>();

    for (const motor of manifest.primitives.filter((p) => p.kind === 'motor')) {
      const { powered, angVel } = readMotorState(motor);
      if (!powered) continue;
      activeMotorIds.add(motor.id);

      // Drive gears in range
      for (const gearId of motorGearMap.get(motor.id) ?? []) {
        driven.set(gearId, angVel);
      }
      // Drive wheels in range
      for (const wheelId of motorWheelMap.get(motor.id) ?? []) {
        driven.set(wheelId, angVel);
      }
    }

    // BFS: propagate through gear/wheel mesh (reverse direction, scale by ratio)
    const queue = [...driven.entries()];
    let hop = 0;
    while (queue.length > 0 && hop < 12) {
      const [driverId, driverVel] = queue.shift()!;
      for (const { id: meshId, ratio } of gearMeshMap.get(driverId) ?? []) {
        if (!driven.has(meshId)) {
          const meshVel = -driverVel / ratio;
          driven.set(meshId, meshVel);
          queue.push([meshId, meshVel]);
        }
      }
      for (const { id: linkId, ratio } of beltLinkMap.get(driverId) ?? []) {
        if (!driven.has(linkId)) {
          const linkVel = driverVel / ratio;
          driven.set(linkId, linkVel);
          queue.push([linkId, linkVel]);
        }
      }
      hop += 1;
    }

    // Apply velocities via gradual blend instead of instant override.
    // Wheels use tangential force so friction can transmit to the chassis.
    const WHEEL_DRIVE_FORCE = 0.0012;
    const WHEEL_MAX_FORCE = 0.006;
    for (const [id, targetAngVel] of driven) {
      const body = bodyMap.get(id);
      if (!body) continue;
      const prim = primitiveMap.get(id);

      if (prim?.kind === 'wheel') {
        // Force-based drive: apply tangential force at the bottom of the wheel
        // so that ground friction creates a reaction force on the chassis.
        const cfg = prim.config as { radius?: number };
        const radius = cfg.radius ?? 28;
        const diff = targetAngVel - body.angularVelocity;
        const forceMag = clampNumber(
          diff * body.mass * radius * WHEEL_DRIVE_FORCE,
          -WHEEL_MAX_FORCE,
          WHEEL_MAX_FORCE,
        );
        // Tangential force at wheel bottom (ground contact point)
        Matter.Body.applyForce(
          body,
          { x: body.position.x, y: body.position.y + radius },
          { x: forceMag, y: 0 },
        );
      } else {
        // Gears, pulleys, etc: gradual angular velocity blend
        const current = body.angularVelocity;
        const diff = targetAngVel - current;
        const clamped = clampNumber(diff, -MAX_ANGULAR_ACCEL, MAX_ANGULAR_ACCEL);
        const blended = current + clamped * MOTOR_BLEND + diff * MOTOR_BLEND;
        const final = Math.abs(blended) > Math.abs(targetAngVel) && Math.sign(blended) === Math.sign(targetAngVel)
          ? targetAngVel
          : blended;
        Matter.Body.setAngularVelocity(body, final);
      }
    }
    return driven;
  }

  function getMotorState(motorId: string) {
    const motor = primitiveMap.get(motorId);
    if (!motor || motor.kind !== 'motor') {
      return { powered: false, rpm: 0 };
    }
    const cfg = motor.config as { rpm: number; powerState: boolean };
    const powerControl = manifest.controls.find(
      (control) => control.bind?.targetId === motor.id && control.bind?.path === 'powerState',
    );
    const rpmControl = manifest.controls.find(
      (control) => control.bind?.targetId === motor.id && control.bind?.path === 'rpm',
    );
    return {
      powered: powerControl ? Boolean(currentControls[powerControl.id] ?? cfg.powerState) : cfg.powerState,
      rpm: rpmControl ? Number(currentControls[rpmControl.id] ?? cfg.rpm) : cfg.rpm,
    };
  }

  function getConveyorDrive(conveyorId: string) {
    let maxRpm = 0;
    for (const motorId of conveyorMotorMap.get(conveyorId) ?? []) {
      const state = getMotorState(motorId);
      if (!state.powered || !activeMotorIds.has(motorId)) continue;
      maxRpm = Math.max(maxRpm, state.rpm);
    }
    return {
      powered: maxRpm > 0,
      rpm: maxRpm,
    };
  }

  // ── tickConveyors ─────────────────────────────────────────────────────────
  // Cargo now rides on thin physical supports while the belt adds tangential
  // drive along the segment. That keeps blocks from tunneling through the lane.
  function tickConveyors() {
    const cargoBlocks = manifest.primitives.filter((p) => MATERIAL_KINDS.includes(p.kind));
    const supportedCargoIds = new Set<string>();
    let anyPowered = false;
    if (cargoBlocks.length === 0) {
      return { supportedCargoIds, beltPowered: anyPowered };
    }

    for (const prim of manifest.primitives) {
      if (prim.kind !== 'conveyor') continue;
      const cfg = prim.config as {
        path: Array<{ x: number; y: number }>;
        speed: number;
        direction: 'forward' | 'reverse';
      };
      if (cfg.path.length < 2) continue;

      const drive = getConveyorDrive(prim.id);
      const effectiveSpeed = drive.powered ? Math.max(cfg.speed, drive.rpm * 0.45) : cfg.speed;
      anyPowered ||= drive.powered;

      const dirMult = cfg.direction === 'reverse' ? -1 : 1;

      for (let i = 0; i < cfg.path.length - 1; i += 1) {
        const ax = cfg.path[i].x;
        const ay = cfg.path[i].y;
        const bx = cfg.path[i + 1].x;
        const by = cfg.path[i + 1].y;
        const segLen = Math.hypot(bx - ax, by - ay);
        if (segLen < 1) continue;

        // Unit direction along belt
        const nx = ((bx - ax) / segLen) * dirMult;
        const ny = ((by - ay) / segLen) * dirMult;
        const targetVx = nx * effectiveSpeed * 0.5;
        const targetVy = ny * effectiveSpeed * 0.5;

        for (const cargo of cargoBlocks) {
          const body = bodyMap.get(cargo.id);
          if (!body || collectedCargoIds.has(cargo.id) || wagonCargoAssignments.has(cargo.id)) continue;

          // Perpendicular distance from cargo center to this segment
          const perp = distToSegment(body.position.x, body.position.y, ax, ay, bx, by);
          if (perp > 28) continue;

          // Also check it's within the segment extents (not before/after endpoints)
          const along =
            (body.position.x - ax) * (nx * dirMult) +
            (body.position.y - ay) * (ny * dirMult);
          if (along < -10 || along > segLen + 10) continue;

          supportedCargoIds.add(cargo.id);
          cargoSpawnMap.set(cargo.id, { x: body.position.x, y: Math.max(60, body.position.y) });
          cargoStates.set(cargo.id, 'supported');

          // Stronger tangential drive with a light vertical correction toward the belt.
          const blendX = body.velocity.x + (targetVx - body.velocity.x) * 0.22;
          const blendY = body.velocity.y + (targetVy - body.velocity.y) * 0.04;
          Matter.Body.setVelocity(body, { x: blendX, y: blendY });
          Matter.Body.applyForce(body, body.position, {
            x: nx * body.mass * effectiveSpeed * 0.00018,
            y: 0,
          });
        }
      }
    }

    return { supportedCargoIds, beltPowered: anyPowered };
  }

  // ── tickHopper ────────────────────────────────────────────────────────────
  // Hopper walls do most of the physical work. A light guide force helps cargo
  // commit to the mouth, then a collection zone freezes the block.
  function tickHopper() {
    let collectedThisTick = 0;
    if (hopperStructures.length === 0) {
      return collectedThisTick;
    }

    for (const prim of manifest.primitives) {
      if (!MATERIAL_KINDS.includes(prim.kind)) continue;
      const body = bodyMap.get(prim.id);
      if (!body) continue;

      if (collectedCargoIds.has(prim.id)) {
        wagonCargoAssignments.delete(prim.id);
        const slotIndex = [...collectedCargoIds].indexOf(prim.id);
        const hopper = hopperStructures[0];
        const targetX = hopper.x + (slotIndex % 3 - 1) * 18;
        const targetY = hopper.y + 80 + Math.floor(slotIndex / 3) * 20;
        Matter.Body.setPosition(body, { x: targetX, y: targetY });
        Matter.Body.setVelocity(body, { x: 0, y: 0 });
        cargoStates.set(prim.id, 'collected');
        continue;
      }

      for (const hopper of hopperStructures) {
        const mouthX = hopper.x;
        const mouthTop = hopper.y - 10;
        const mouthBot = hopper.y + 70;
        const collectTop = hopper.y - 40;
        const collectBot = hopper.y + 52;
        const collectHalfW = 40;

        if (
          body.position.x > mouthX - collectHalfW &&
          body.position.x < mouthX + collectHalfW &&
          body.position.y > collectTop &&
          body.position.y < collectBot
        ) {
          collectedCargoIds.add(prim.id);
          wagonCargoAssignments.delete(prim.id);
          Matter.Body.setStatic(body, true);
          cargoStates.set(prim.id, 'collected');
          collectedThisTick += 1;
          break;
        }

        const dx = mouthX - body.position.x;
        if (Math.abs(dx) > 96 || body.position.y > mouthBot || body.position.y < mouthTop - 130) continue;
        Matter.Body.applyForce(body, body.position, { x: dx * 0.00022, y: 0.00095 });
      }
    }

    return collectedThisTick;
  }

  // ── Vehicle stabilization ──────────────────────────────────────────────────
  // Gently correct chassis tilt toward horizontal when wheels are attached,
  // preventing the common physics-sandbox problem where cars flip on every bump.
  function tickVehicleStabilization() {
    for (const prim of manifest.primitives) {
      if (prim.kind !== 'chassis') continue;
      const body = bodyMap.get(prim.id);
      if (!body || body.isStatic) continue;
      const hasWheels = manifest.primitives.some(
        (p) => p.kind === 'wheel'
          && (p.config as { attachedToId?: string }).attachedToId === prim.id,
      );
      if (!hasWheels) continue;
      // Gentle tilt correction + angular damping
      const tiltCorrection = -body.angle * 0.025;
      Matter.Body.setAngularVelocity(
        body,
        body.angularVelocity * 0.92 + tiltCorrection,
      );
    }
  }

  function recoverLostCargo(dt: number, supportedCargoIds: Set<string>) {
    const conveyors = manifest.primitives.filter((primitive) => primitive.kind === 'conveyor');
    const hoppers = manifest.primitives.filter((primitive) => primitive.kind === 'hopper');
    const stations = manifest.primitives.filter((primitive) => primitive.kind === 'station-zone');
    const sceneKeepsLooseCargo = manifest.metadata.tags.includes('silly-scene');

    for (const cargo of manifest.primitives.filter((primitive) => MATERIAL_KINDS.includes(primitive.kind))) {
      const body = bodyMap.get(cargo.id);
      if (!body || collectedCargoIds.has(cargo.id) || wagonCargoAssignments.has(cargo.id)) {
        continue;
      }

      const nearConveyor = conveyors.some((conveyor) =>
        distToPolyline(
          (conveyor.config as { path: Array<{ x: number; y: number }> }).path,
          body.position.x,
          body.position.y,
        ) <= 72,
      );
      const nearHopper = hoppers.some((hopper) => {
        const cfg = hopper.config as { x: number; y: number };
        return Math.hypot(cfg.x - body.position.x, cfg.y - body.position.y) <= 120;
      });
      const nearStation = stations.some((station) => {
        const cfg = station.config as { x: number; y: number; width?: number; height?: number };
        return Math.abs(cfg.x - body.position.x) <= (cfg.width ?? 120) / 2 + 24
          && Math.abs(cfg.y - body.position.y) <= (cfg.height ?? 80) / 2 + 24;
      });
      const inWater = bodyInsideWaterZone(body);

      if (supportedCargoIds.has(cargo.id) || inWater) {
        cargoIdleTimers.set(cargo.id, 0);
        cargoStates.set(cargo.id, inWater && body.speed > 0.25 ? 'airborne' : 'supported');
        continue;
      }

      const groundedAwayFromFlow = body.position.y > CANVAS_H - 24
        && !nearConveyor
        && !nearHopper
        && !nearStation
        && !inWater;
      const idle = groundedAwayFromFlow && body.speed < 0.18
        ? (cargoIdleTimers.get(cargo.id) ?? 0) + dt
        : 0;
      cargoIdleTimers.set(cargo.id, idle);

      if (sceneKeepsLooseCargo) {
        cargoStates.set(cargo.id, supportedCargoIds.has(cargo.id) ? 'supported' : body.speed > 0.25 ? 'airborne' : 'spawned');
        continue;
      }

      const outOfBounds = body.position.y > CANVAS_H + 90 || body.position.x < -80 || body.position.x > CANVAS_W + 80;
      const irrecoverable = groundedAwayFromFlow && idle > 1.25;

      if (outOfBounds || irrecoverable) {
        const respawn = cargoSpawnMap.get(cargo.id) ?? (cargo.config as { x: number; y: number });
        Matter.Body.setStatic(body, false);
        Matter.Body.setPosition(body, { x: respawn.x, y: respawn.y });
        Matter.Body.setVelocity(body, { x: 0, y: 0 });
        Matter.Body.setAngle(body, 0);
        Matter.Body.setAngularVelocity(body, 0);
        cargoIdleTimers.set(cargo.id, 0);
        cargoRespawnCounts.set(cargo.id, (cargoRespawnCounts.get(cargo.id) ?? 0) + 1);
        cargoStates.set(cargo.id, 'respawned');
        lostCargoCount += 1;
        continue;
      }

      cargoStates.set(cargo.id, body.speed > 0.25 ? 'airborne' : 'spawned');
    }
  }

  function tickPistons(dt: number) {
    for (const prim of manifest.primitives.filter((p) => p.kind === 'piston')) {
      const powered = [...activeMotorIds].some((motorId) => (motorPistonMap.get(motorId) ?? []).includes(prim.id));
      const cfg = prim.config as { x: number; y: number; stroke?: number; speed?: number; orientation?: string };
      const stroke = cfg.stroke ?? 60;
      const speed = cfg.speed ?? 30;
      const rodBody = bodyMap.get(prim.id);
      if (!rodBody) continue;
      const ext = pistonExtensionsState[prim.id] ?? 0;
      const nextExt = powered
        ? Math.min(1, ext + (speed / Math.max(1, stroke)) * dt)
        : Math.max(0, ext - (speed / Math.max(1, stroke)) * dt);
      pistonExtensionsState[prim.id] = nextExt;
      const vertical = cfg.orientation === 'vertical';
      Matter.Body.setPosition(rodBody, {
        x: cfg.x + (vertical ? 0 : nextExt * stroke),
        y: cfg.y + (vertical ? nextExt * stroke : 0),
      });
      Matter.Body.setVelocity(rodBody, { x: 0, y: 0 });
    }
  }

  function tickRacks() {
    for (const prim of manifest.primitives.filter((p) => p.kind === 'rack')) {
      const rackBody = bodyMap.get(prim.id);
      const gearId = gearRackMap.get(prim.id);
      if (!rackBody || !gearId) continue;
      const gearBody = bodyMap.get(gearId);
      if (!gearBody) continue;
      const gearPrim = primitiveMap.get(gearId);
      if (!gearPrim) continue;
      const radius = rotatingRadius(gearPrim);
      const linearVel = gearBody.angularVelocity * radius;
      const cfg = prim.config as { orientation?: string };
      Matter.Body.setVelocity(rackBody, {
        x: cfg.orientation === 'vertical' ? 0 : linearVel,
        y: cfg.orientation === 'vertical' ? linearVel : 0,
      });
    }
  }

  function tickSprings() {
    for (const prim of manifest.primitives.filter((p) => p.kind === 'spring-linear')) {
      const cfg = prim.config as { x: number; y: number; restLength?: number };
      const plateBody = bodyMap.get(prim.id);
      if (!plateBody) continue;
      const rest = cfg.restLength ?? 40;
      const current = Math.hypot(plateBody.position.x - cfg.x, plateBody.position.y - cfg.y);
      springCompressionsState[prim.id] = Math.max(0, Math.min(1, 1 - current / Math.max(1, rest)));
    }
  }

  function tickWinches(dt: number) {
    for (const prim of manifest.primitives.filter((p) => p.kind === 'winch')) {
      const powered = [...activeMotorIds].some((motorId) => (motorWinchMap.get(motorId) ?? []).includes(prim.id));
      if (!powered) continue;
      const cfg = prim.config as { speed?: number };
      for (const rope of ropeConstraints) {
        if (rope.fromId !== prim.id) continue;
        const delta = Math.min((cfg.speed ?? 10) * dt, 2);
        rope.totalLength = Math.max(40, rope.totalLength - delta);
        syncRopeConstraint(rope);
      }
    }
  }

  function tickBoltLinks() {
    // Soft correction: nudge bolted bodies toward their target position/angle
    // using forces instead of teleporting.  The two-point constraints handle
    // most of the rigidity; this cleanup pass prevents drift without killing
    // external forces (wheel traction, collisions, gravity).
    const BOLT_POS_STIFFNESS = 0.35;
    const BOLT_ANGLE_STIFFNESS = 0.25;
    for (const link of boltLinks) {
      const fromBody = bodyMap.get(link.fromId);
      const toBody = bodyMap.get(link.toId);
      if (!fromBody || !toBody) continue;
      const cos = Math.cos(fromBody.angle);
      const sin = Math.sin(fromBody.angle);
      const targetX = fromBody.position.x + link.offsetX * cos - link.offsetY * sin;
      const targetY = fromBody.position.y + link.offsetX * sin + link.offsetY * cos;
      const dx = targetX - toBody.position.x;
      const dy = targetY - toBody.position.y;
      // Positional correction via velocity nudge
      Matter.Body.setVelocity(toBody, {
        x: fromBody.velocity.x + dx * BOLT_POS_STIFFNESS,
        y: fromBody.velocity.y + dy * BOLT_POS_STIFFNESS,
      });
      // Angular correction
      const targetAngle = fromBody.angle + link.angleOffset;
      const angleDiff = normalizeAngle(targetAngle - toBody.angle);
      Matter.Body.setAngularVelocity(
        toBody,
        fromBody.angularVelocity + angleDiff * BOLT_ANGLE_STIFFNESS,
      );
    }
  }

  function tickHinges(dt: number) {
    for (const link of hingeLinks) {
      const fromBody = bodyMap.get(link.fromId);
      const toBody = bodyMap.get(link.toId);
      if (!fromBody || !toBody) continue;

      const pivot = worldPointFromBody(fromBody, { x: link.fromLocalX, y: link.fromLocalY });
      const minAngle = (link.minAngle * Math.PI) / 180;
      const maxAngle = (link.maxAngle * Math.PI) / 180;
      const currentRelativeAngle = normalizeAngle(toBody.angle - fromBody.angle);
      const currentRelativeVelocity = toBody.angularVelocity - fromBody.angularVelocity;
      let nextRelativeAngle = currentRelativeAngle;
      let commandedRelativeVelocity = currentRelativeVelocity * 0.82;
      let maxRelativeVelocity = 1.4;

      if (link.motorId) {
        const motor = primitiveMap.get(link.motorId);
        const connectorPrim = primitiveMap.get(link.primitiveId);
        const enabledControl = manifest.controls.find(
          (control) => control.bind?.targetId === link.primitiveId && control.bind?.path === 'enabled',
        );
        const targetControl = manifest.controls.find(
          (control) => control.bind?.targetId === link.primitiveId && control.bind?.path === 'targetAngle',
        );
        const enabled = enabledControl
          ? Boolean(currentControls[enabledControl.id] ?? (connectorPrim?.config as { enabled?: boolean } | undefined)?.enabled ?? true)
          : link.enabled ?? true;
        const targetAngle = targetControl
          ? Number(currentControls[targetControl.id] ?? (connectorPrim?.config as { targetAngle?: number } | undefined)?.targetAngle ?? 45)
          : link.targetAngle ?? 45;
        if (enabled && motor?.kind === 'motor') {
          const motorState = readMotorState(motor);
          if (motorState.powered) {
            const clampedTarget = clampNumber(targetAngle, link.minAngle, link.maxAngle);
            const targetRelativeAngle = (clampedTarget * Math.PI) / 180;
            const deltaAngle = normalizeAngle(targetRelativeAngle - currentRelativeAngle);
            maxRelativeVelocity = clampNumber(Math.abs(motorState.angVel) * 0.12, 0.35, 0.9);
            // PD controller: proportional + derivative damping for smooth motion
            const pGain = 1.8;
            const dGain = 0.35;
            const desiredRelativeVelocity = clampNumber(
              deltaAngle * pGain - currentRelativeVelocity * dGain,
              -maxRelativeVelocity,
              maxRelativeVelocity,
            );
            commandedRelativeVelocity = clampNumber(
              currentRelativeVelocity + (desiredRelativeVelocity - currentRelativeVelocity) * 0.38,
              -maxRelativeVelocity,
              maxRelativeVelocity,
            );
            if (Math.abs(deltaAngle) < 0.015 && Math.abs(currentRelativeVelocity) < 0.08) {
              nextRelativeAngle = targetRelativeAngle;
              commandedRelativeVelocity = 0;
            }
          }
        }
      }

      if (nextRelativeAngle === currentRelativeAngle) {
        nextRelativeAngle = currentRelativeAngle + commandedRelativeVelocity * Math.max(dt, 0.016);
      }

      const clampedRelative = clampNumber(nextRelativeAngle, minAngle, maxAngle);
      if (clampedRelative !== nextRelativeAngle) {
        commandedRelativeVelocity = 0;
      }

      const nextWorldAngle = fromBody.angle + clampedRelative;
      if (Math.abs(nextWorldAngle - toBody.angle) > 0.0001) {
        Matter.Body.setAngle(toBody, nextWorldAngle);
      }
      placeBodyAtPivot(toBody, { x: link.toLocalX, y: link.toLocalY }, pivot, nextWorldAngle);
      Matter.Body.setAngularVelocity(
        toBody,
        fromBody.angularVelocity + clampNumber(commandedRelativeVelocity, -maxRelativeVelocity, maxRelativeVelocity),
      );
    }
  }

  function tickBuckets() {
    for (const prim of manifest.primitives.filter((p) => p.kind === 'bucket')) {
      const bucketBody = bodyMap.get(prim.id);
      if (!bucketBody) continue;
      const rawAngle = ((bucketBody.angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const state = bucketStateMap[prim.id] ?? 'collecting';
      if (state === 'collecting' && rawAngle > 1.745) {
        bucketStateMap[prim.id] = 'dumping';
        bucketContentsState[prim.id] = 0;
      } else if (state === 'dumping' && rawAngle < 1.047) {
        bucketStateMap[prim.id] = 'collecting';
      }

      if (bucketStateMap[prim.id] !== 'dumping') {
        let count = 0;
        const bx = bucketBody.position.x;
        const by = bucketBody.position.y;
        for (const matPrim of manifest.primitives.filter((p) => MATERIAL_KINDS.includes(p.kind))) {
          const matBody = bodyMap.get(matPrim.id);
          if (!matBody || collectedCargoIds.has(matPrim.id) || wagonCargoAssignments.has(matPrim.id)) continue;
          if (Math.hypot(matBody.position.x - bx, matBody.position.y - by) < 30) {
            count += 1;
          }
        }
        bucketContentsState[prim.id] = count;
      }
    }
  }

  function tickTrampolines(dt: number) {
    const trampolines = manifest.primitives.filter((p) => p.kind === 'trampoline');
    if (trampolines.length === 0) return;

    for (const [primitiveId, cooldown] of [...trampolineCooldowns.entries()]) {
      const nextCooldown = cooldown - dt;
      if (nextCooldown <= 0) {
        trampolineCooldowns.delete(primitiveId);
      } else {
        trampolineCooldowns.set(primitiveId, nextCooldown);
      }
    }

    for (const prim of manifest.primitives.filter((p) => MATERIAL_KINDS.includes(p.kind))) {
      if (collectedCargoIds.has(prim.id) || wagonCargoAssignments.has(prim.id)) continue;
      const body = bodyMap.get(prim.id);
      if (!body) continue;
      if ((trampolineCooldowns.get(prim.id) ?? 0) > 0) continue;

      for (const trampoline of trampolines) {
        const cfg = trampoline.config as { x: number; y: number; width?: number };
        const halfWidth = (cfg.width ?? 160) / 2;
        const trampolineTop = cfg.y - 8;
        const bodyHalfHeight = body.bounds.max.y - body.position.y;
        const bodyBottom = body.bounds.max.y;
        if (Math.abs(body.position.x - cfg.x) > halfWidth + 16) continue;
        if (body.position.y > cfg.y + 18) continue;
        if (bodyBottom < trampolineTop - 8 || bodyBottom > trampolineTop + 18) continue;
        if (body.velocity.y < -0.35) continue;

        const downwardSpeed = Math.max(1.6, body.velocity.y + engine.gravity.y * 2.2);
        const bounceVelocity = -Math.max(10, Math.min(16, downwardSpeed * 1.9));
        Matter.Body.setPosition(body, {
          x: body.position.x,
          y: trampolineTop - bodyHalfHeight - 1,
        });
        Matter.Body.setVelocity(body, {
          x: body.velocity.x * 1.02,
          y: bounceVelocity,
        });
        trampolineCooldowns.set(prim.id, 0.18);
        break;
      }
    }
  }

  function tickRailVehicles(
    dt: number,
    prevPrimaryProgress: number,
  ): {
    primaryLocomotive: PrimitiveInstance | null;
    primaryProgress: number;
    primaryRoute: RailRoute | null;
    routeCache: Map<string, RailRoute>;
  } {
    const routeCache = new Map<string, RailRoute>();
    const railLocomotives = manifest.primitives.filter((primitive) =>
      primitive.kind === 'locomotive'
      && typeof (primitive.config as { trackId?: string }).trackId === 'string');
    const leadLocomotiveByTrack = new Map<string, PrimitiveInstance>();

    for (const locomotive of railLocomotives) {
      const cfg = locomotive.config as { trackId: string; progress?: number; drivePartId?: string };
      const route = getRailRoute(routeCache, cfg.trackId);
      const locoState = readLocoState(locomotive);
      const currentProgress = railVehicleProgressState.get(locomotive.id)
        ?? (locomotive.id === locoPrim?.id ? prevPrimaryProgress : wrapUnitProgress(cfg.progress ?? 0));
      let nextProgress = currentProgress;

      if (locoState.enabled && route.points.length >= 2) {
        if (cfg.drivePartId) {
          const drivePrim = primitiveMap.get(cfg.drivePartId);
          const driveBody = drivePrim ? bodyMap.get(drivePrim.id) : null;
          if (drivePrim && driveBody && isRotatingPrimitiveKind(drivePrim.kind)) {
            const linearSpeed = Math.abs(driveBody.angularVelocity * rotatingRadius(drivePrim));
            const delta = dt * (linearSpeed / Math.max(1, trackLengthFromPoints(route.points)));
            nextProgress = wrapUnitProgress(currentProgress + delta);
          }
        }

        if (nextProgress === currentProgress) {
          let motorRpm = 0;
          for (const [motorId, locoIds] of motorLocoMap) {
            if (!locoIds.includes(locomotive.id) || !activeMotorIds.has(motorId)) continue;
            const motorPrim = primitiveMap.get(motorId);
            if (!motorPrim || motorPrim.kind !== 'motor') continue;
            motorRpm = Math.max(
              motorRpm,
              Number((motorPrim.config as { rpm?: number }).rpm ?? 0),
            );
          }
          const effectiveSpeed = motorRpm > 0
            ? Math.max(Math.abs(locoState.speed), motorRpm * 0.005)
            : Math.abs(locoState.speed);
          nextProgress = wrapUnitProgress(currentProgress + dt * effectiveSpeed * 0.35);
        }
      }

      railVehicleProgressState.set(locomotive.id, nextProgress);
      syncRailVehicleBody(locomotive, routeCache);
      if (!leadLocomotiveByTrack.has(cfg.trackId)) {
        leadLocomotiveByTrack.set(cfg.trackId, locomotive);
      }
    }

    for (const wagon of manifest.primitives.filter((primitive) =>
      primitive.kind === 'wagon'
      && typeof (primitive.config as { trackId?: string }).trackId === 'string')) {
      const cfg = wagon.config as { trackId: string; progress?: number; offset?: number };
      const leadLocomotive = leadLocomotiveByTrack.get(cfg.trackId);
      const currentProgress = railVehicleProgressState.get(wagon.id)
        ?? wrapUnitProgress(cfg.progress ?? 0);
      let nextProgress = currentProgress;

      if (leadLocomotive) {
        let followOffset = wagonFollowOffsetState.get(wagon.id);
        if (typeof followOffset !== 'number') {
          const leadProgress = railVehicleProgressState.get(leadLocomotive.id) ?? 0;
          followOffset = normalizeRailOffset(currentProgress - leadProgress);
          wagonFollowOffsetState.set(wagon.id, followOffset);
        }
        nextProgress = wrapUnitProgress(
          (railVehicleProgressState.get(leadLocomotive.id) ?? 0) + followOffset,
        );
      } else {
        nextProgress = wrapUnitProgress(currentProgress + dt * DEFAULT_WAGON_RAIL_SPEED * 0.35);
      }

      railVehicleProgressState.set(wagon.id, nextProgress);
      syncRailVehicleBody(wagon, routeCache);
    }

    const primaryLocomotive = railLocomotives[0] ?? null;
    const primaryRoute = primaryLocomotive
      ? getRailRoute(
          routeCache,
          (primaryLocomotive.config as { trackId: string }).trackId,
        )
      : null;
    const primaryProgress = primaryLocomotive
      ? (railVehicleProgressState.get(primaryLocomotive.id) ?? prevPrimaryProgress)
      : prevPrimaryProgress;

    return {
      primaryLocomotive,
      primaryProgress,
      primaryRoute,
      routeCache,
    };
  }

  function tickWagons(
    dt: number,
    routeCache: Map<string, RailRoute>,
  ) {
    const wagonLoads: Record<string, number> = {};
    const wagonCargo: Record<string, string[]> = {};
    const wagons = manifest.primitives.filter((p) => p.kind === 'wagon');
    if (wagons.length === 0) return { wagonLoads, wagonCargo };

    for (const [cargoId, cooldown] of [...wagonCargoCooldowns.entries()]) {
      const nextCooldown = cooldown - dt;
      if (nextCooldown <= 0) {
        wagonCargoCooldowns.delete(cargoId);
      } else {
        wagonCargoCooldowns.set(cargoId, nextCooldown);
      }
    }

    for (const [cargoId] of [...wagonCargoAssignments.entries()]) {
      const body = bodyMap.get(cargoId);
      if (!body || collectedCargoIds.has(cargoId)) {
        wagonCargoAssignments.delete(cargoId);
      }
    }

    for (const wagon of wagons) {
      const cfg = wagon.config as { capacity?: number };
      const wagonPose = readRailVehiclePose(wagon, routeCache);
      const wagonBody = bodyMap.get(wagon.id);
      const wagonPos = { x: wagonPose.x, y: wagonPose.y };
      const capacity = cfg.capacity ?? 6;
      const loadStation = pointInsideStation(wagonPos, 'load');
      const unloadStation = pointInsideStation(wagonPos, 'unload');

      let assignedCargo = compactWagonAssignments(wagon.id);
      const fallbackUnloadTarget = unloadStation ? null : findWagonUnloadTarget(wagonPos);
      if (assignedCargo.length > 0 && (unloadStation || fallbackUnloadTarget)) {
        const nextTimer = Math.max(0, (wagonUnloadTimers.get(wagon.id) ?? 0) - dt);
        if (nextTimer <= 0) {
          const [cargoId, entry] = assignedCargo[0];
          const body = bodyMap.get(cargoId);
          if (body) {
            wagonCargoAssignments.delete(cargoId);
            wagonCargoCooldowns.set(cargoId, 0.7);
            Matter.Body.setStatic(body, false);
            if (unloadStation) {
              const width = unloadStation.config.width ?? 120;
              const height = unloadStation.config.height ?? 80;
              const column = (entry.slot % 3) - 1;
              const row = Math.floor(entry.slot / 3);
              Matter.Body.setPosition(body, {
                x: unloadStation.config.x + column * Math.min(18, Math.max(12, width / 8)),
                y: unloadStation.config.y + height / 2 - 18 - row * 18,
              });
              Matter.Body.setVelocity(body, { x: 0, y: 1.2 });
            } else if (fallbackUnloadTarget) {
              Matter.Body.setPosition(body, { x: fallbackUnloadTarget.x, y: fallbackUnloadTarget.y });
              Matter.Body.setVelocity(body, { x: fallbackUnloadTarget.vx, y: fallbackUnloadTarget.vy });
            }
            Matter.Body.setAngle(body, 0);
            Matter.Body.setAngularVelocity(body, 0);
            cargoStates.set(cargoId, 'airborne');
          }
          wagonUnloadTimers.set(wagon.id, 0.28);
        } else {
          wagonUnloadTimers.set(wagon.id, nextTimer);
        }
      } else {
        wagonUnloadTimers.delete(wagon.id);
      }

      assignedCargo = compactWagonAssignments(wagon.id);
      let loadedCount = assignedCargo.length;
      if (loadedCount < capacity && !unloadStation && !fallbackUnloadTarget) {
        for (const material of manifest.primitives.filter((p) => MATERIAL_KINDS.includes(p.kind))) {
          const body = bodyMap.get(material.id);
          if (!body || collectedCargoIds.has(material.id) || wagonCargoAssignments.has(material.id)) continue;
          if ((wagonCargoCooldowns.get(material.id) ?? 0) > 0) continue;
          if ((material.config as { attachedToId?: string }).attachedToId) continue;

          const inLoadZone = loadStation
            ? Math.abs(body.position.x - loadStation.config.x) <= (loadStation.config.width ?? 120) / 2
              && Math.abs(body.position.y - loadStation.config.y) <= (loadStation.config.height ?? 80) / 2
            : Math.abs(body.position.x - wagonPos.x) <= 24 && Math.abs(body.position.y - wagonPos.y) <= 20;
          if (!inLoadZone) continue;

          wagonCargoAssignments.set(material.id, { wagonId: wagon.id, slot: loadedCount });
          Matter.Body.setStatic(body, true);
          Matter.Body.setVelocity(body, { x: 0, y: 0 });
          cargoStates.set(material.id, 'supported');
          loadedCount += 1;
          if (loadedCount >= capacity) break;
        }
      }

      assignedCargo = compactWagonAssignments(wagon.id);
      wagonLoads[wagon.id] = assignedCargo.length;
      wagonCargo[wagon.id] = assignedCargo.map(([cargoId]) => cargoId);

      for (const [cargoId, entry] of assignedCargo) {
        const body = bodyMap.get(cargoId);
        if (!body) continue;
        const column = (entry.slot % 3) - 1;
        const row = Math.floor(entry.slot / 3);
        const localSlot = { x: column * 16, y: -8 - row * 18 };
        const slotPoint = wagonBody
          ? worldPointFromBody(wagonBody, localSlot)
          : {
              x: wagonPos.x + localSlot.x,
              y: wagonPos.y + localSlot.y,
            };
        Matter.Body.setPosition(body, slotPoint);
        Matter.Body.setVelocity(body, { x: 0, y: 0 });
        Matter.Body.setAngle(body, 0);
        Matter.Body.setAngularVelocity(body, 0);
        cargoStates.set(cargoId, 'supported');
      }
    }

    return { wagonLoads, wagonCargo };
  }

  // ── tick ──────────────────────────────────────────────────────────────────
  function tick(
    _dt: number,
    prevRotations: Record<string, number>,
    prevHookY: number,
    _prevHopperFill: number,
    prevTrainProgress: number,
  ): PhysicsFrame {
    // Cap velocities from the just-completed Matter.Engine.update to prevent tunneling.
    const MAX_VELOCITY = 18;
    for (const body of Matter.Composite.allBodies(engine.world)) {
      if (body.isStatic) continue;
      if (Math.abs(body.velocity.x) > MAX_VELOCITY || Math.abs(body.velocity.y) > MAX_VELOCITY) {
        Matter.Body.setVelocity(body, {
          x: Math.sign(body.velocity.x) * Math.min(Math.abs(body.velocity.x), MAX_VELOCITY),
          y: Math.sign(body.velocity.y) * Math.min(Math.abs(body.velocity.y), MAX_VELOCITY),
        });
      }
    }
    for (const rope of ropeConstraints) {
      syncRopeConstraint(rope);
    }

    const drivenVels = driveMotors();
    const switchStates = Object.fromEntries(
      manifest.primitives
        .filter((primitive) => primitive.kind === 'rail-switch')
        .map((primitive) => [primitive.id, readRailSwitchBranch(primitive.id)]),
    ) as Record<string, RailSwitchBranch>;
    const inertiaDriven = new Map<string, number>();
    // Flywheel inertia: spinning flywheels keep driving nearby meshes after motor power drops.
    for (const prim of manifest.primitives.filter((p) => p.kind === 'flywheel')) {
      const body = bodyMap.get(prim.id);
      if (!body) continue;
      if (Math.abs(body.angularVelocity) < 0.05) continue;
      if (drivenVels.has(prim.id)) continue;

      const flywheelQueue: Array<[string, number]> = [[prim.id, body.angularVelocity]];
      const flywheelVisited = new Set([prim.id]);
      let flywheelHops = 0;
      while (flywheelQueue.length > 0 && flywheelHops < 3) {
        const [driverId, vel] = flywheelQueue.shift()!;
        for (const { id: meshId, ratio } of gearMeshMap.get(driverId) ?? []) {
          if (flywheelVisited.has(meshId) || drivenVels.has(meshId)) continue;
          const meshVel = -vel / ratio;
          const meshBody = bodyMap.get(meshId);
          if (meshBody) {
            Matter.Body.setAngularVelocity(meshBody, meshVel);
          }
          inertiaDriven.set(meshId, meshVel);
          flywheelVisited.add(meshId);
          flywheelQueue.push([meshId, meshVel]);
        }
        for (const { id: linkId, ratio } of beltLinkMap.get(driverId) ?? []) {
          if (flywheelVisited.has(linkId) || drivenVels.has(linkId)) continue;
          const linkVel = vel / ratio;
          const linkBody = bodyMap.get(linkId);
          if (linkBody) {
            Matter.Body.setAngularVelocity(linkBody, linkVel);
          }
          inertiaDriven.set(linkId, linkVel);
          flywheelVisited.add(linkId);
          flywheelQueue.push([linkId, linkVel]);
        }
        flywheelHops += 1;
      }
    }
    // Advance rail vehicles early so carried cargo and attached parts use the
    // real vehicle positions for the rest of the frame.
    const railFrame = tickRailVehicles(_dt, prevTrainProgress);
    locoProgress = railFrame.primaryProgress;

    tickWinches(_dt);
    tickBoltLinks();
    tickHinges(_dt);
    tickVehicleStabilization();
    tickPistons(_dt);
    tickRacks();
    tickSprings();
    const conveyorFrame = tickConveyors();
    tickWaterZones(conveyorFrame.supportedCargoIds);
    tickTrampolines(_dt);
    const wagonFrame = tickWagons(_dt, railFrame.routeCache);
    const collectedThisTick = tickHopper();
    tickBuckets();
    recoverLostCargo(_dt, conveyorFrame.supportedCargoIds);
    for (const particle of sandParticleBodies) {
      if (
        particle.position.y > CANVAS_H + 50
        || particle.position.x < -80
        || particle.position.x > CANVAS_W + 80
      ) {
        const pileId = particle.label.replace(/^sand-/, '').replace(/-\d+$/, '');
        const pilePrim = primitiveMap.get(pileId);
        if (!pilePrim) continue;
        const cfg = pilePrim.config as { x: number; y: number };
        Matter.Body.setPosition(particle, { x: cfg.x + (Math.random() - 0.5) * 20, y: cfg.y });
        Matter.Body.setVelocity(particle, { x: 0, y: 0 });
      }
    }
    throughput = throughput * 0.84 + (collectedThisTick > 0 ? (collectedThisTick / Math.max(_dt, 0.016)) : 0) * 0.16;

    const rotations: Record<string, number> = { ...prevRotations };
    const bodyPositions: Record<string, { x: number; y: number; angle: number }> = {};

    for (const [id, body] of bodyMap) {
      bodyPositions[id] = { x: body.position.x, y: body.position.y, angle: body.angle };
      const prim = primitiveMap.get(id);
      if (prim && isRotatingPrimitiveKind(prim.kind)) {
        rotations[id] = body.angle;
      }
    }
    for (const [id, angVel] of inertiaDriven) {
      const baseAngle = bodyPositions[id]?.angle ?? rotations[id] ?? 0;
      rotations[id] = baseAngle + angVel * _dt;
    }

    // Hook Y
    let hookY: number | null = null;
    const hookPrim = manifest.primitives.find((p) => p.kind === 'hook');
    if (hookPrim) {
      const hookBody = bodyMap.get(hookPrim.id);
      hookY = hookBody ? hookBody.position.y : prevHookY;
    }

    // Hopper fill: use the stable collectedCargoIds set so the counter never drops
    let hopperFill: number | null = null;
    const hopperPrim = manifest.primitives.find((p) => p.kind === 'hopper');
    if (hopperPrim) {
      hopperFill = collectedCargoIds.size;
    }

    // Build overlay maps for the canvas
    // motorDrives: motor → all gear+wheel ids it drives
    const motorDrives: Record<string, string[]> = {};
    for (const [motorId, gearIds] of motorGearMap) {
      motorDrives[motorId] = [...gearIds];
    }
    for (const [motorId, wheelIds] of motorWheelMap) {
      if (!motorDrives[motorId]) motorDrives[motorId] = [];
      for (const wId of wheelIds) {
        if (!motorDrives[motorId].includes(wId)) motorDrives[motorId].push(wId);
      }
    }
    const gearMeshes: Record<string, string[]> = {};
    for (const [id, meshes] of gearMeshMap) {
      gearMeshes[id] = meshes.map((m) => m.id);
    }

    // Gear chain telemetry: find driven gears, compute input/output RPM
    let gearTelemetry: PhysicsFrame['gearTelemetry'] = null;
    const drivenGears = manifest.primitives.filter(
      (p) => p.kind === 'gear' && drivenVels.has(p.id),
    );
    if (drivenGears.length >= 1) {
      const vels = drivenGears.map((g) => Math.abs(drivenVels.get(g.id)!));
      const maxVel = Math.max(...vels);
      const minVel = Math.min(...vels);
      const inputRpm = Math.round(maxVel * 30 / Math.PI);
      const outputRpm = Math.round(minVel * 30 / Math.PI);
      const gearRatio = minVel > 0.001 ? +(maxVel / minVel).toFixed(2) : 1;
      gearTelemetry = { inputRpm, outputRpm, gearRatio };
    }

    // Wagon delivered: loco past 85% of its track
    const wagonDelivered = Boolean(railFrame.primaryLocomotive) && locoProgress > 0.85;

    return {
      rotations,
      hookY,
      hopperFill,
      bodyPositions,
      motorDrives,
      gearMeshes,
      trainProgress: locoProgress,
      wagonDelivered,
      trainTrackId: railFrame.primaryRoute?.activeTrackId,
      switchStates,
      gearTelemetry,
      cargoStates: Object.fromEntries(cargoStates.entries()),
      throughput: Number(throughput.toFixed(1)),
      beltPowered: conveyorFrame.beltPowered,
      lostCargoCount,
      stableCargoSpawns: Object.fromEntries(cargoSpawnMap.entries()),
      wagonLoads: wagonFrame.wagonLoads,
      wagonCargo: wagonFrame.wagonCargo,
      pistonExtensions: { ...pistonExtensionsState },
      bucketContents: { ...bucketContentsState },
      bucketStates: { ...bucketStateMap },
      springCompressions: { ...springCompressionsState },
      sandParticlePositions: sandParticleBodies.map((body) => ({ x: body.position.x, y: body.position.y })),
    };
  }

  // ── cleanup ───────────────────────────────────────────────────────────────
  function cleanup() {
    Matter.World.clear(engine.world, false);
    Matter.Engine.clear(engine);
  }

  return { engine, tick, applyControls, cleanup };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Shortest distance from point (px, py) to line segment (ax,ay)→(bx,by).
 */
function distToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function distToPolyline(points: Array<{ x: number; y: number }>, px: number, py: number): number {
  if (points.length < 2) {
    return Number.POSITIVE_INFINITY;
  }

  let closest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length - 1; index += 1) {
    closest = Math.min(
      closest,
      distToSegment(px, py, points[index].x, points[index].y, points[index + 1].x, points[index + 1].y),
    );
  }
  return closest;
}

function closestPointOnPolyline(
  points: Array<{ x: number; y: number }>,
  px: number,
  py: number,
): { x: number; y: number; dx: number; dy: number; dist: number } | null {
  if (points.length < 2) return null;

  let best: { x: number; y: number; dx: number; dy: number; dist: number } | null = null;
  for (let index = 0; index < points.length - 1; index += 1) {
    const ax = points[index].x;
    const ay = points[index].y;
    const bx = points[index + 1].x;
    const by = points[index + 1].y;
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) continue;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
    const x = ax + t * dx;
    const y = ay + t * dy;
    const dist = Math.hypot(px - x, py - y);
    const invLen = 1 / Math.sqrt(lenSq);
    const unitX = dx * invLen;
    const unitY = dy * invLen;
    if (!best || dist < best.dist) {
      best = { x, y, dx: unitX, dy: unitY, dist };
    }
  }
  return best;
}

function wrapUnitProgress(value: number) {
  return ((value % 1) + 1) % 1;
}

function normalizeRailOffset(value: number) {
  let next = value;
  while (next > 0.5) next -= 1;
  while (next < -0.5) next += 1;
  return next;
}

function getRailVehicleSpawnPose(
  primitive: PrimitiveInstance,
  primitives: PrimitiveInstance[],
) {
  const cfg = primitive.config as { x?: number; y?: number; trackId?: string; progress?: number; offset?: number };
  if (typeof cfg.trackId === 'string') {
    const route = resolveRailRoute(primitives, cfg.trackId);
    if (route.points.length >= 2) {
      let progress = cfg.progress ?? 0;
      if (
        primitive.kind === 'wagon'
        && typeof cfg.progress !== 'number'
        && typeof cfg.offset === 'number'
      ) {
        const leadLocomotive = primitives.find((candidate) =>
          candidate.kind === 'locomotive'
          && (candidate.config as { trackId?: string }).trackId === cfg.trackId);
        const leadProgress = Number((leadLocomotive?.config as { progress?: number } | undefined)?.progress ?? 0);
        progress = wrapUnitProgress(leadProgress + cfg.offset);
      }
      return {
        ...getTrackPoseFromPoints(route.points, progress),
        railBound: true,
      };
    }
  }

  return {
    x: Number(cfg.x ?? 0),
    y: Number(cfg.y ?? 0),
    angle: 0,
    railBound: false,
  };
}

// ─── Body factory ─────────────────────────────────────────────────────────────

function createBodyForPrimitive(
  prim: PrimitiveInstance,
  primitives: PrimitiveInstance[],
): Matter.Body | null {
  switch (prim.kind) {
    case 'node': {
      const cfg = prim.config as { x: number; y: number };
      return Matter.Bodies.circle(cfg.x, cfg.y, 8, {
        label: prim.id,
        restitution: 0.3,
        friction: 0.8,
        density: 0.003,
      });
    }

    case 'wheel': {
      const cfg = prim.config as { x: number; y: number; radius: number; traction: number };
      return Matter.Bodies.circle(cfg.x, cfg.y, cfg.radius, {
        label: prim.id,
        friction: cfg.traction,
        frictionAir: 0.01,
        restitution: 0.15,
        density: 0.003,
      });
    }

    case 'gear': {
      const cfg = prim.config as { x: number; y: number; teeth: number };
      return Matter.Bodies.circle(cfg.x, cfg.y, teethToRadius(cfg.teeth), {
        label: prim.id,
        frictionAir: 0.05,
        restitution: 0.0,
        density: 0.002,
      });
    }

    case 'pulley':
    case 'chain-sprocket': {
      const cfg = prim.config as { x: number; y: number; radius?: number };
      return Matter.Bodies.circle(cfg.x, cfg.y, cfg.radius ?? 28, {
        label: prim.id,
        frictionAir: 0.02,
        density: 0.002,
        restitution: 0.0,
      });
    }

    case 'flywheel': {
      const cfg = prim.config as { x: number; y: number; radius?: number; mass?: number };
      const radius = cfg.radius ?? 36;
      const mass = cfg.mass ?? 5;
      return Matter.Bodies.circle(cfg.x, cfg.y, radius, {
        label: prim.id,
        frictionAir: 0.001,
        density: mass / (Math.PI * radius * radius),
        restitution: 0.0,
      });
    }

    case 'gearbox': {
      const cfg = prim.config as { x: number; y: number };
      return Matter.Bodies.rectangle(cfg.x, cfg.y, 48, 32, {
        isStatic: true,
        label: prim.id,
      });
    }

    case 'piston': {
      const cfg = prim.config as { x: number; y: number; orientation?: string; stroke?: number };
      const vertical = cfg.orientation === 'vertical';
      const stroke = cfg.stroke ?? 60;
      return Matter.Bodies.rectangle(
        cfg.x + (vertical ? 0 : stroke * 0.1),
        cfg.y + (vertical ? stroke * 0.1 : 0),
        vertical ? 10 : stroke * 0.4,
        vertical ? stroke * 0.4 : 10,
        {
          label: prim.id,
          density: 0.001,
          frictionAir: 0.4,
        },
      );
    }

    case 'rack': {
      const cfg = prim.config as { x: number; y: number; width?: number; orientation?: string };
      const width = cfg.width ?? 80;
      return Matter.Bodies.rectangle(cfg.x, cfg.y, cfg.orientation === 'vertical' ? 10 : width, cfg.orientation === 'vertical' ? width : 10, {
        label: prim.id,
        density: 0.001,
        frictionAir: 0.3,
        friction: 0.0,
      });
    }

    case 'spring-linear': {
      const cfg = prim.config as { x: number; y: number; orientation?: string; restLength?: number };
      const vertical = cfg.orientation === 'vertical';
      const rest = cfg.restLength ?? 40;
      return Matter.Bodies.rectangle(
        cfg.x + (vertical ? 0 : rest),
        cfg.y + (vertical ? rest : 0),
        vertical ? 24 : 8,
        vertical ? 8 : 24,
        {
          label: prim.id,
          density: 0.001,
          frictionAir: 0.3,
        },
      );
    }

    case 'crane-arm': {
      const cfg = prim.config as { x: number; y: number; length?: number };
      const length = cfg.length ?? 120;
      return Matter.Bodies.rectangle(cfg.x + length / 2, cfg.y, length, 10, {
        label: prim.id,
        density: 0.001,
        frictionAir: 0.1,
      });
    }

    case 'counterweight': {
      const cfg = prim.config as { x: number; y: number; mass?: number };
      return Matter.Bodies.rectangle(cfg.x, cfg.y, 24, 32, {
        label: prim.id,
        mass: cfg.mass ?? 5,
        frictionAir: 0.05,
        restitution: 0.1,
      });
    }

    case 'bucket': {
      const cfg = prim.config as { x: number; y: number; width?: number; depth?: number };
      const width = cfg.width ?? 40;
      const depth = cfg.depth ?? 30;
      return Matter.Bodies.rectangle(cfg.x, cfg.y + depth / 2, width, 8, {
        label: prim.id,
        density: 0.001,
        frictionAir: 0.1,
        restitution: 0.05,
      });
    }

    case 'motor': {
      const cfg = prim.config as { x: number; y: number; attachedToId?: string };
      return Matter.Bodies.rectangle(cfg.x, cfg.y, 56, 36, {
        label: prim.id,
        isStatic: !cfg.attachedToId,
        density: cfg.attachedToId ? 0.0015 : undefined,
        frictionAir: cfg.attachedToId ? 0.08 : undefined,
      });
    }

    case 'axle': {
      const cfg = prim.config as { x: number; y: number };
      return Matter.Bodies.circle(cfg.x, cfg.y, 5, {
        label: prim.id,
        isStatic: true,
      });
    }

    case 'chassis': {
      const cfg = prim.config as { x: number; y: number; width?: number; height?: number };
      // Check if this chassis has wheels attached — if so, use vehicle-friendly
      // low friction; otherwise use high friction so it acts as a stable base
      // (e.g. for the powered-arm recipe).
      const hasWheels = primitives.some(
        (p) => p.kind === 'wheel'
          && (p.config as { attachedToId?: string }).attachedToId === prim.id,
      );
      return Matter.Bodies.rectangle(cfg.x, cfg.y, cfg.width ?? 140, cfg.height ?? 20, {
        label: prim.id,
        density: 0.002,
        friction: hasWheels ? 0.3 : 0.9,
        frictionStatic: hasWheels ? 0.2 : 1.2,
        frictionAir: hasWheels ? 0.008 : 0.02,
        restitution: 0.05,
      });
    }

    case 'winch': {
      const cfg = prim.config as { x: number; y: number; attachedToId?: string };
      return Matter.Bodies.rectangle(cfg.x, cfg.y, 40, 40, {
        label: prim.id,
        isStatic: !cfg.attachedToId,
        density: cfg.attachedToId ? 0.0015 : undefined,
        frictionAir: cfg.attachedToId ? 0.08 : undefined,
      });
    }

    case 'hook': {
      const cfg = prim.config as { x: number; y: number };
      return Matter.Bodies.circle(cfg.x, cfg.y, 10, {
        label: prim.id,
        restitution: 0.15,
        friction: 0.4,
        density: 0.004,
      });
    }

    case 'cargo-block': {
      const cfg = prim.config as { x: number; y: number; weight: number };
      return Matter.Bodies.rectangle(cfg.x, cfg.y, 24, 24, {
        label: prim.id,
        density: Math.max(0.001, (cfg.weight ?? 1) * 0.002),
        friction: 0.5,
        restitution: 0.25,
      });
    }

    case 'ramp':
    case 'platform': {
      const cfg = prim.config as { x: number; y: number; width?: number; angle?: number };
      return Matter.Bodies.rectangle(cfg.x, cfg.y, cfg.width ?? 120, 12, {
        isStatic: true,
        label: prim.id,
        angle: ((cfg.angle ?? 0) * Math.PI) / 180,
        friction: 0.6,
        restitution: 0.1,
      });
    }

    case 'wall': {
      const cfg = prim.config as { x: number; y: number; height?: number };
      return Matter.Bodies.rectangle(cfg.x, cfg.y, 12, cfg.height ?? 80, {
        isStatic: true,
        label: prim.id,
        friction: 0.8,
        restitution: 0.1,
      });
    }

    case 'ball': {
      const cfg = prim.config as { x: number; y: number; radius?: number };
      return Matter.Bodies.circle(cfg.x, cfg.y, cfg.radius ?? 12, {
        label: prim.id,
        restitution: 0.3,
        friction: 0.3,
        frictionAir: 0.005,
        density: 0.002,
      });
    }

    case 'rock': {
      const cfg = prim.config as { x: number; y: number };
      return Matter.Bodies.circle(cfg.x, cfg.y, 16, {
        label: prim.id,
        isStatic: false,
        mass: 3,
        restitution: 0.05,
        friction: 0.9,
        frictionAir: 0.008,
      });
    }

    case 'silo-bin': {
      const cfg = prim.config as { x: number; y: number; width?: number; height?: number };
      const width = cfg.width ?? 80;
      const height = cfg.height ?? 100;
      return Matter.Bodies.rectangle(cfg.x - width / 2, cfg.y, 10, height, {
        isStatic: true,
        label: prim.id,
        friction: 0.8,
      });
    }

    case 'chute': {
      const cfg = prim.config as { x: number; y: number; length?: number; angle?: number };
      return Matter.Bodies.rectangle(cfg.x, cfg.y, cfg.length ?? 100, 10, {
        isStatic: true,
        label: prim.id,
        angle: ((cfg.angle ?? 30) * Math.PI) / 180,
        friction: 0.3,
        restitution: 0.1,
      });
    }

    case 'tunnel': {
      const cfg = prim.config as { x: number; y: number; width?: number; angle?: number };
      return Matter.Bodies.rectangle(cfg.x, cfg.y - 20, cfg.width ?? 100, 10, {
        isStatic: true,
        label: prim.id,
        angle: ((cfg.angle ?? 0) * Math.PI) / 180,
        friction: 0.5,
      });
    }

    case 'trampoline': {
      const cfg = prim.config as { x: number; y: number; width?: number };
      return Matter.Bodies.rectangle(cfg.x, cfg.y, cfg.width ?? 160, 16, {
        isStatic: true,
        label: prim.id,
        friction: 0.08,
        restitution: 0.92,
      });
    }

    case 'locomotive': {
      const pose = getRailVehicleSpawnPose(prim, primitives);
      return Matter.Bodies.rectangle(pose.x, pose.y, 48, 28, {
        label: prim.id,
        angle: pose.angle,
        isSensor: pose.railBound,
        density: 0.0025,
        friction: 0.55,
        frictionAir: 0.03,
        restitution: 0.06,
      });
    }

    case 'wagon': {
      const pose = getRailVehicleSpawnPose(prim, primitives);
      return Matter.Bodies.rectangle(pose.x, pose.y, 40, 24, {
        label: prim.id,
        angle: pose.angle,
        isSensor: pose.railBound,
        density: 0.0022,
        friction: 0.6,
        frictionAir: 0.03,
        restitution: 0.05,
      });
    }

    case 'beam':
    case 'rope':
    case 'belt-link':
    case 'chain-link':
    case 'bolt-link':
    case 'hinge-link':
    case 'powered-hinge-link':
    case 'conveyor':
    case 'hopper':
    case 'material-pile':
    case 'water':
    case 'hinge':
    case 'rail-segment':
    case 'rail-switch':
    case 'station-zone':
      return null;

    default: {
      console.warn(`createBodyForPrimitive: unknown kind "${(prim as { kind: string }).kind}", skipping`);
      return null;
    }
  }
}
