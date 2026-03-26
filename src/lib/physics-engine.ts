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
import type { ExperimentManifest, PrimitiveInstance } from './types';

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

export function buildMatterWorld(manifest: ExperimentManifest): PhysicsWorld {
  const engine = Matter.Engine.create({ gravity: { x: 0, y: 1.2 } });
  const bodyMap = new Map<string, Matter.Body>();
  const ropeConstraints: Matter.Constraint[] = [];

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

  // ── Create a body for each positioned primitive ───────────────────────────
  for (const prim of manifest.primitives) {
    const body = createBodyForPrimitive(prim);
    if (body) {
      bodyMap.set(prim.id, body);
      Matter.World.add(engine.world, body);
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

  // ── Motor → conveyor speed map ────────────────────────────────────────────
  // A motor within 300px of any conveyor endpoint boosts that belt.
  // conveyorMotorRpm: conveyor id → highest motor RPM driving it
  const conveyorMotorRpm = new Map<string, number>();
  for (const motor of manifest.primitives.filter((p) => p.kind === 'motor')) {
    const mCfg = motor.config as { x: number; y: number; rpm: number };
    for (const conv of manifest.primitives.filter((p) => p.kind === 'conveyor')) {
      const cCfg = conv.config as { path: Array<{ x: number; y: number }> };
      const near = cCfg.path.some(
        (pt) => Math.hypot(pt.x - mCfg.x, pt.y - mCfg.y) < 300,
      );
      if (near) {
        const prev = conveyorMotorRpm.get(conv.id) ?? 0;
        conveyorMotorRpm.set(conv.id, Math.max(prev, mCfg.rpm));
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

    for (const motor of manifest.primitives.filter((p) => p.kind === 'motor')) {
      const cfg = motor.config as { rpm: number; powerState: boolean };
      if (!cfg.powerState) continue;
      const rpmControl = manifest.controls.find(
        (c) => c.bind?.targetId === motor.id && c.bind?.path === 'rpm',
      );
      const rpm = rpmControl
        ? Number(currentControls[rpmControl.id] ?? cfg.rpm)
        : cfg.rpm;
      const angVel = (rpm * Math.PI) / 30; // RPM → rad/s

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

  // ── tickConveyors ─────────────────────────────────────────────────────────
  // For each conveyor path segment, nudge nearby cargo blocks along the belt.
  // Motor RPM near the belt endpoint boosts effective speed.
  function tickConveyors() {
    const cargoBlocks = manifest.primitives.filter((p) => p.kind === 'cargo-block');
    if (cargoBlocks.length === 0) return;

    for (const prim of manifest.primitives) {
      if (prim.kind !== 'conveyor') continue;
      const cfg = prim.config as {
        path: Array<{ x: number; y: number }>;
        speed: number;
        direction: 'forward' | 'reverse';
      };
      if (cfg.path.length < 2) continue;

      // Effective speed: config speed, boosted by motor if present
      const motorRpm = conveyorMotorRpm.get(prim.id);
      const effectiveSpeed = motorRpm !== undefined
        ? Math.max(cfg.speed, motorRpm * 0.45)
        : cfg.speed;

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
          if (!body) continue;

          // Perpendicular distance from cargo center to this segment
          const perp = distToSegment(body.position.x, body.position.y, ax, ay, bx, by);
          if (perp > 22) continue; // not on this belt

          // Also check it's within the segment extents (not before/after endpoints)
          const along =
            (body.position.x - ax) * (nx * dirMult) +
            (body.position.y - ay) * (ny * dirMult);
          if (along < -10 || along > segLen + 10) continue;

          // Blend velocity toward belt direction (15% per tick at 60fps)
          const blendX = body.velocity.x + (targetVx - body.velocity.x) * 0.15;
          const blendY = body.velocity.y + (targetVy - body.velocity.y) * 0.08;
          Matter.Body.setVelocity(body, { x: blendX, y: blendY });
        }
      }
    }
  }

  // ── tickHopper ────────────────────────────────────────────────────────────
  // Apply a gentle inward + downward force on cargo blocks that are above
  // and near the hopper mouth. This funnels dropped blocks into the collector.
  function tickHopper() {
    const hopperPrim = manifest.primitives.find((p) => p.kind === 'hopper');
    if (!hopperPrim) return;
    const hCfg = hopperPrim.config as { x: number; y: number };
    const mouthX = hCfg.x;
    const mouthTop = hCfg.y - 10; // top lip of the trapezoid
    const mouthBot = hCfg.y + 60; // bottom of the hopper

    for (const prim of manifest.primitives) {
      if (prim.kind !== 'cargo-block') continue;
      const body = bodyMap.get(prim.id);
      if (!body) continue;
      const dx = mouthX - body.position.x;
      const dy = body.position.y;
      // Only affect blocks above the hopper and within 60px horizontally
      if (Math.abs(dx) > 60 || dy > mouthBot || dy < mouthTop - 80) continue;

      // Inward force: pull toward center, stronger the closer to mouth
      const inward = dx * 0.00012;
      // Downward nudge when in the funnel zone
      const downward = 0.0006;
      Matter.Body.applyForce(body, body.position, {
        x: inward,
        y: downward,
      });
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
    const drivenVels = driveMotors();
    tickConveyors();
    tickHopper();

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

    // Hopper fill: count cargo blocks in the collector zone
    let hopperFill: number | null = null;
    const hopperPrim = manifest.primitives.find((p) => p.kind === 'hopper');
    if (hopperPrim) {
      const hCfg = hopperPrim.config as { x: number; y: number };
      let count = 0;
      for (const prim of manifest.primitives) {
        if (prim.kind !== 'cargo-block') continue;
        const body = bodyMap.get(prim.id);
        if (!body) continue;
        if (
          body.position.x > hCfg.x - 45 &&
          body.position.x < hCfg.x + 45 &&
          body.position.y > hCfg.y - 20 &&
          body.position.y < hCfg.y + 75
        ) {
          count++;
        }
      }
      hopperFill = count;
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

    case 'beam':
    case 'rope':
    case 'conveyor':
    case 'hopper':
    case 'material-pile':
    case 'rail-segment':
    case 'rail-switch':
    case 'locomotive':
    case 'wagon':
    default:
      return null;
  }
}
