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
import type { CargoLifecycleState, ExperimentManifest, PrimitiveInstance, PrimitiveKind } from './types';

// Must match MachineCanvas createCanvas(960, 560)
const CANVAS_W = 960;
const CANVAS_H = 560;

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
  /** gear chain telemetry — null when no gears are being driven */
  gearTelemetry: { inputRpm: number; outputRpm: number; gearRatio: number } | null;
  cargoStates: Record<string, CargoLifecycleState>;
  throughput: number;
  beltPowered: boolean;
  lostCargoCount: number;
  stableCargoSpawns: Record<string, { x: number; y: number }>;
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
  const ropeConstraints: Matter.Constraint[] = [];
  const cargoSpawnMap = new Map<string, { x: number; y: number }>();
  const cargoIdleTimers = new Map<string, number>();
  const cargoRespawnCounts = new Map<string, number>();
  const cargoStates = new Map<string, CargoLifecycleState>();
  const collectedCargoIds = new Set<string>();
  let lostCargoCount = 0;
  let throughput = 0;
  const motorPistonMap = new Map<string, string[]>();
  const motorWinchMap = new Map<string, string[]>();
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
    const body = createBodyForPrimitive(prim);
    if (body) {
      bodyMap.set(prim.id, body);
      Matter.World.add(engine.world, body);
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

    if (prim.kind === 'rope') {
      const cfg = prim.config as { fromId: string; toId: string; length: number };
      const fromPrim = manifest.primitives.find((item) => item.id === cfg.fromId);
      const toPrim = manifest.primitives.find((item) => item.id === cfg.toId);
      if (fromPrim && toPrim && isRotatingPrimitiveKind(fromPrim.kind) && isRotatingPrimitiveKind(toPrim.kind)) {
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
      } else {
        const winchBody = bodyMap.get(cfg.fromId);
        const hookBody = bodyMap.get(cfg.toId);
        if (!winchBody || !hookBody) continue;
        const constraint = Matter.Constraint.create({
          bodyA: winchBody,
          bodyB: hookBody,
          length: cfg.length,
          stiffness: 0.05,
          damping: 0.2,
          label: `rope-${prim.id}`,
        });
        ropeConstraints.push(constraint);
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

  // ── Loco free-build state ─────────────────────────────────────────────────
  // In free-build mode (no recipeId), we do scripted rail-follow here.
  const locoPrim = manifest.primitives.find((p) => p.kind === 'locomotive');
  let locoProgress = locoPrim
    ? ((locoPrim.config as { progress: number }).progress ?? 0)
    : 0;

  let currentControls: Record<string, string | number | boolean> = {};
  let activeMotorIds = new Set<string>();

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
        const winchBody = bodyMap.get(prim.id);
        if (!winchBody) continue;
        for (const c of ropeConstraints) {
          if (c.bodyA === winchBody) {
            c.length = newLength;
          }
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
        Matter.Body.setVelocity(body, {
          x: body.velocity.x * 0.94,
          y: body.velocity.y * 0.94,
        });
        const density = cfg.density ?? 0.8;
        Matter.Body.applyForce(body, body.position, {
          x: 0,
          y: -(body.mass * engine.gravity.y * density),
        });
      }
    }
  }

  // ── driveMotors ───────────────────────────────────────────────────────────
  // Sets angular velocity on gears and wheels driven by active motors.
  // BFS propagates velocity through the gear/wheel mesh map.
  // Returns the driven map so tick() can compute gear telemetry.
  function driveMotors(): Map<string, number> {
    const driven = new Map<string, number>(); // id → angularVelocity
    activeMotorIds = new Set<string>();

    for (const motor of manifest.primitives.filter((p) => p.kind === 'motor')) {
      const cfg = motor.config as { rpm: number; powerState: boolean };
      const powerControl = manifest.controls.find(
        (c) => c.bind?.targetId === motor.id && c.bind?.path === 'powerState',
      );
      const powered = powerControl
        ? Boolean(currentControls[powerControl.id] ?? cfg.powerState)
        : cfg.powerState;
      if (!powered) continue;
      const rpmControl = manifest.controls.find(
        (c) => c.bind?.targetId === motor.id && c.bind?.path === 'rpm',
      );
      const rpm = rpmControl
        ? Number(currentControls[rpmControl.id] ?? cfg.rpm)
        : cfg.rpm;
      const angVel = (rpm * Math.PI) / 30; // RPM → rad/s
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

    // Apply velocities
    for (const [id, angVel] of driven) {
      const body = bodyMap.get(id);
      if (body) Matter.Body.setAngularVelocity(body, angVel);
    }
    return driven;
  }

  function getMotorState(motorId: string) {
    const motor = manifest.primitives.find((primitive) => primitive.id === motorId && primitive.kind === 'motor');
    if (!motor) {
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
          if (!body || collectedCargoIds.has(cargo.id)) continue;

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

  function recoverLostCargo(dt: number, supportedCargoIds: Set<string>) {
    const conveyors = manifest.primitives.filter((primitive) => primitive.kind === 'conveyor');
    const hoppers = manifest.primitives.filter((primitive) => primitive.kind === 'hopper');

    for (const cargo of manifest.primitives.filter((primitive) => MATERIAL_KINDS.includes(primitive.kind))) {
      const body = bodyMap.get(cargo.id);
      if (!body || collectedCargoIds.has(cargo.id)) {
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

      if (supportedCargoIds.has(cargo.id)) {
        cargoIdleTimers.set(cargo.id, 0);
        cargoStates.set(cargo.id, 'supported');
        continue;
      }

      const groundedAwayFromFlow = body.position.y > CANVAS_H - 24 && !nearConveyor && !nearHopper;
      const idle = groundedAwayFromFlow && body.speed < 0.18
        ? (cargoIdleTimers.get(cargo.id) ?? 0) + dt
        : 0;
      cargoIdleTimers.set(cargo.id, idle);

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
      const gearPrim = manifest.primitives.find((p) => p.id === gearId);
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
      const winchBody = bodyMap.get(prim.id);
      if (!winchBody) continue;
      for (const constraint of ropeConstraints) {
        if (constraint.bodyA !== winchBody) continue;
        const delta = Math.min((cfg.speed ?? 10) * dt, 2);
        constraint.length = Math.max(50, constraint.length - delta);
      }
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
          if (!matBody || collectedCargoIds.has(matPrim.id)) continue;
          if (Math.hypot(matBody.position.x - bx, matBody.position.y - by) < 30) {
            count += 1;
          }
        }
        bucketContentsState[prim.id] = count;
      }
    }
  }

  // ── tickLocomotive ────────────────────────────────────────────────────────
  // Advance loco + wagon positions along their track in free-build mode.
  // Returns updated locoProgress (0..1).
  function tickLocomotive(dt: number, prevProgress: number): number {
    if (!locoPrim) return prevProgress;
    const cfg = locoPrim.config as { speed: number; trackId: string };
    const speedControl = manifest.controls.find(
      (c) => c.bind?.targetId === locoPrim.id && c.bind?.path === 'speed',
    );
    const speed = speedControl
      ? Number(currentControls[speedControl.id] ?? cfg.speed)
      : cfg.speed;
    return (locoProgress + dt * Math.abs(speed) * 0.35) % 1;
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

    const drivenVels = driveMotors();
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
    tickWinches(_dt);
    tickPistons(_dt);
    tickRacks();
    tickSprings();
    const conveyorFrame = tickConveyors();
    tickWaterZones(conveyorFrame.supportedCargoIds);
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
        const pilePrim = manifest.primitives.find((p) => p.id === pileId);
        if (!pilePrim) continue;
        const cfg = pilePrim.config as { x: number; y: number };
        Matter.Body.setPosition(particle, { x: cfg.x + (Math.random() - 0.5) * 20, y: cfg.y });
        Matter.Body.setVelocity(particle, { x: 0, y: 0 });
      }
    }
    throughput = throughput * 0.84 + (collectedThisTick > 0 ? (collectedThisTick / Math.max(_dt, 0.016)) : 0) * 0.16;

    // Advance loco
    locoProgress = tickLocomotive(_dt, prevTrainProgress);

    const rotations: Record<string, number> = { ...prevRotations };
    const bodyPositions: Record<string, { x: number; y: number; angle: number }> = {};

    for (const [id, body] of bodyMap) {
      bodyPositions[id] = { x: body.position.x, y: body.position.y, angle: body.angle };
      const prim = manifest.primitives.find((p) => p.id === id);
      if (prim && isRotatingPrimitiveKind(prim.kind)) {
        rotations[id] = body.angle;
      }
    }
    for (const [id, angVel] of inertiaDriven) {
      const baseAngle = bodyPositions[id]?.angle ?? rotations[id] ?? 0;
      rotations[id] = baseAngle + angVel * _dt;
    }

    // Virtual positions for loco + wagons (not real physics bodies)
    if (locoPrim) {
      const trackPrim = manifest.primitives.find(
        (p) => p.id === (locoPrim.config as { trackId: string }).trackId,
      );
      const locoPos = trackPoint(trackPrim, locoProgress);
      bodyPositions[locoPrim.id] = { x: locoPos.x, y: locoPos.y, angle: 0 };

      for (const wagon of manifest.primitives.filter((p) => p.kind === 'wagon')) {
        const wCfg = wagon.config as { offset: number };
        const wProgress = Math.max(0, (locoProgress + wCfg.offset) % 1);
        const wPos = trackPoint(trackPrim, wProgress);
        bodyPositions[wagon.id] = { x: wPos.x, y: wPos.y, angle: 0 };
      }
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
    const wagonDelivered = Boolean(locoPrim) && locoProgress > 0.85;

    return {
      rotations,
      hookY,
      hopperFill,
      bodyPositions,
      motorDrives,
      gearMeshes,
      trainProgress: locoProgress,
      wagonDelivered,
      gearTelemetry,
      cargoStates: Object.fromEntries(cargoStates.entries()),
      throughput: Number(throughput.toFixed(1)),
      beltPowered: conveyorFrame.beltPowered,
      lostCargoCount,
      stableCargoSpawns: Object.fromEntries(cargoSpawnMap.entries()),
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

/**
 * Interpolate a position along a rail-segment track at 0..1 progress.
 * Mirrors the logic in MachineCanvas getTrackPoint().
 */
function trackPoint(
  track: PrimitiveInstance | undefined,
  progress: number,
): { x: number; y: number } {
  if (!track || track.kind !== 'rail-segment') return { x: 0, y: 0 };
  const pts = (track.config as { points: Array<{ x: number; y: number }> }).points;
  if (pts.length < 2) return pts[0] ?? { x: 0, y: 0 };
  const clamped = Math.max(0, Math.min(0.999, progress));
  const seg = Math.min(pts.length - 2, Math.floor(clamped * (pts.length - 1)));
  const t = clamped * (pts.length - 1) - seg;
  const a = pts[seg];
  const b = pts[seg + 1];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

// ─── Body factory ─────────────────────────────────────────────────────────────

function createBodyForPrimitive(prim: PrimitiveInstance): Matter.Body | null {
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
      return Matter.Bodies.rectangle(cfg.x, cfg.y, cfg.width ?? 140, cfg.height ?? 20, {
        label: prim.id,
        density: 0.002,
        friction: 0.7,
        frictionAir: 0.02,
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

    case 'beam':
    case 'rope':
    case 'conveyor':
    case 'hopper':
    case 'material-pile':
    case 'water':
    case 'hinge':
    case 'rail-segment':
    case 'rail-switch':
    case 'locomotive':
    case 'wagon':
      return null;

    default: {
      console.warn(`createBodyForPrimitive: unknown kind "${(prim as { kind: string }).kind}", skipping`);
      return null;
    }
  }
}
