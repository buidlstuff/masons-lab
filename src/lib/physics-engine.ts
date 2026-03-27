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

function rotatingRadius(prim: PrimitiveInstance): number {
  if (prim.kind === 'gear') return teethToRadius((prim.config as { teeth: number }).teeth);
  if (prim.kind === 'wheel') return (prim.config as { radius: number }).radius ?? 28;
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

  // ── Create a body for each positioned primitive ───────────────────────────
  for (const prim of manifest.primitives) {
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
      const winchBody = bodyMap.get(cfg.fromId);
      const hookBody = bodyMap.get(cfg.toId);
      if (winchBody && hookBody) {
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
  }

  // ── Pin gears to their spawn point (spin in place) ────────────────────────
  for (const prim of manifest.primitives) {
    if (prim.kind !== 'gear') continue;
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
      .filter((p) => p.kind === 'gear')
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
  const rotatingPrims = manifest.primitives.filter(
    (p) => p.kind === 'gear' || p.kind === 'wheel',
  );
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
      if (prim.kind !== 'winch') continue;
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
    const conveyorFrame = tickConveyors();
    const collectedThisTick = tickHopper();
    recoverLostCargo(_dt, conveyorFrame.supportedCargoIds);
    throughput = throughput * 0.84 + (collectedThisTick > 0 ? (collectedThisTick / Math.max(_dt, 0.016)) : 0) * 0.16;

    // Advance loco
    locoProgress = tickLocomotive(_dt, prevTrainProgress);

    const rotations: Record<string, number> = { ...prevRotations };
    const bodyPositions: Record<string, { x: number; y: number; angle: number }> = {};

    for (const [id, body] of bodyMap) {
      bodyPositions[id] = { x: body.position.x, y: body.position.y, angle: body.angle };
      const prim = manifest.primitives.find((p) => p.id === id);
      if (prim?.kind === 'gear' || prim?.kind === 'wheel') {
        rotations[id] = body.angle;
      }
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
      pistonExtensions: {},
      bucketContents: {},
      bucketStates: {},
      springCompressions: {},
      sandParticlePositions: [],
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

    case 'motor': {
      const cfg = prim.config as { x: number; y: number };
      return Matter.Bodies.rectangle(cfg.x, cfg.y, 56, 36, {
        label: prim.id,
        isStatic: true,
      });
    }

    case 'axle': {
      const cfg = prim.config as { x: number; y: number };
      return Matter.Bodies.circle(cfg.x, cfg.y, 5, {
        label: prim.id,
        isStatic: true,
      });
    }

    case 'winch': {
      const cfg = prim.config as { x: number; y: number };
      return Matter.Bodies.rectangle(cfg.x, cfg.y, 40, 40, {
        label: prim.id,
        isStatic: true,
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

    case 'beam':
    case 'rope':
    case 'conveyor':
    case 'hopper':
    case 'material-pile':
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
