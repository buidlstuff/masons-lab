/**
 * physics-engine.ts
 *
 * Wraps Matter.js for free-build mode (manifests without a recipeId).
 * Recipe machines (gear-train-lab, conveyor-loader, etc.) keep their
 * scripted simulation paths in simulation.ts unchanged.
 *
 * Usage:
 *   const world = buildMatterWorld(manifest);
 *   Matter.Engine.update(world.engine, dtMs);
 *   const frame = world.tick(dt, prevRotations, prevHookY, prevHopperFill);
 *   world.applyControls(controlValues);  // live slider / toggle updates
 *   world.cleanup();                     // call on unmount / manifest change
 */

import Matter from 'matter-js';
import type { ExperimentManifest, PrimitiveInstance } from './types';

// Must match MachineCanvas createCanvas(960, 560)
const CANVAS_W = 960;
const CANVAS_H = 560;

function teethToRadius(teeth: number): number {
  return Math.max(24, teeth * 1.4);
}

// ─── Public interfaces ────────────────────────────────────────────────────────

/**
 * A snapshot of one physics tick — merged into RuntimeSnapshot by simulation.ts.
 * null means "no value for this field" (e.g. no hook in the manifest).
 */
export interface PhysicsFrame {
  rotations: Record<string, number>;
  hookY: number | null;
  hopperFill: number | null;
  bodyPositions: Record<string, { x: number; y: number; angle: number }>;
  /** id → list of gear ids it is currently driving (for canvas overlay) */
  motorDrives: Record<string, string[]>;
  /** gear id → list of meshed gear ids (for canvas overlay) */
  gearMeshes: Record<string, string[]>;
}

export interface PhysicsWorld {
  engine: Matter.Engine;
  tick: (
    _dt: number,
    prevRotations: Record<string, number>,
    prevHookY: number,
    _prevHopperFill: number,
  ) => PhysicsFrame;
  applyControls: (controlValues: Record<string, string | number | boolean>) => void;
  cleanup: () => void;
}

// ─── Main builder ─────────────────────────────────────────────────────────────

export function buildMatterWorld(manifest: ExperimentManifest): PhysicsWorld {
  const engine = Matter.Engine.create({ gravity: { x: 0, y: 1.2 } });
  const bodyMap = new Map<string, Matter.Body>();
  const ropeConstraints: Matter.Constraint[] = []; // kept separate for length updates

  // Ground + boundary walls (slightly outside the visible canvas)
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
    // Beam → rigid distance constraint between two nodes
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

    // Rope → soft spring between winch (static) and hook (dynamic)
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

    // Cargo attached to hook → short rigid link
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

  // ── Pin gears to their spawn point ────────────────────────────────────────
  // Gears should spin in place, not fall under gravity.
  // A zero-length stiffness-1 constraint from world point → body center achieves this.
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
  // A motor drives any gear within 220px — close enough for the default layouts.
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

  // ── Gear-to-gear mesh map ─────────────────────────────────────────────────
  // When two gears' radii nearly touch, the second should counter-rotate.
  // We record pairs as (driverGearId → [meshedGearId, teethRatio][]).
  const gearMeshMap = new Map<string, Array<{ id: string; ratio: number }>>();
  const gearPrims = manifest.primitives.filter((p) => p.kind === 'gear');
  for (let i = 0; i < gearPrims.length; i += 1) {
    for (let j = i + 1; j < gearPrims.length; j += 1) {
      const a = gearPrims[i];
      const b = gearPrims[j];
      const aCfg = a.config as { x: number; y: number; teeth: number };
      const bCfg = b.config as { x: number; y: number; teeth: number };
      const rA = teethToRadius(aCfg.teeth);
      const rB = teethToRadius(bCfg.teeth);
      const dist = Math.hypot(aCfg.x - bCfg.x, aCfg.y - bCfg.y);
      // Mesh if centers are within combined radii + 16px tolerance
      if (dist <= rA + rB + 16) {
        const ratioAtoB = aCfg.teeth / bCfg.teeth;
        const ratioBtoA = bCfg.teeth / aCfg.teeth;
        if (!gearMeshMap.has(a.id)) gearMeshMap.set(a.id, []);
        if (!gearMeshMap.has(b.id)) gearMeshMap.set(b.id, []);
        gearMeshMap.get(a.id)!.push({ id: b.id, ratio: ratioAtoB });
        gearMeshMap.get(b.id)!.push({ id: a.id, ratio: ratioBtoA });
      }
    }
  }

  // Mutable control state (updated by applyControls without restarting engine)
  let currentControls: Record<string, string | number | boolean> = {};

  // ── applyControls ─────────────────────────────────────────────────────────
  function applyControls(controlValues: Record<string, string | number | boolean>) {
    currentControls = controlValues;

    // Update rope lengths when hook-height / rope-length slider moves
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
  // Called every tick to spin gears via setAngularVelocity (no torque API in
  // Matter.js 0.20 — this is the canonical approach for driven shafts).
  // Also propagates velocity through gear meshes (with direction reversal).
  function driveMotors() {
    // Track which gears have been driven this tick to avoid double-setting
    const driven = new Map<string, number>(); // gearId → angularVelocity

    for (const motor of manifest.primitives.filter((p) => p.kind === 'motor')) {
      const cfg = motor.config as { rpm: number; powerState: boolean };
      if (!cfg.powerState) continue;
      const rpmControl = manifest.controls.find(
        (c) => c.bind?.targetId === motor.id && c.bind?.path === 'rpm',
      );
      const rpm = rpmControl ? Number(currentControls[rpmControl.id] ?? cfg.rpm) : cfg.rpm;
      const angVel = (rpm * Math.PI) / 30; // RPM → rad/s

      for (const gearId of motorGearMap.get(motor.id) ?? []) {
        driven.set(gearId, angVel);
      }
    }

    // Propagate through gear meshes (BFS, max 8 hops to prevent infinite loops)
    const queue = [...driven.entries()];
    let hop = 0;
    while (queue.length > 0 && hop < 8) {
      const [driverId, driverVel] = queue.shift()!;
      for (const { id: meshId, ratio } of gearMeshMap.get(driverId) ?? []) {
        if (!driven.has(meshId)) {
          const meshVel = -driverVel / ratio; // reverse direction, adjust for tooth ratio
          driven.set(meshId, meshVel);
          queue.push([meshId, meshVel]);
        }
      }
      hop += 1;
    }

    // Apply velocities
    for (const [gearId, angVel] of driven) {
      const gearBody = bodyMap.get(gearId);
      if (gearBody) Matter.Body.setAngularVelocity(gearBody, angVel);
    }
  }

  // ── tick ──────────────────────────────────────────────────────────────────
  // Called after Engine.update(). Reads body state → PhysicsFrame.
  function tick(
    _dt: number,
    prevRotations: Record<string, number>,
    prevHookY: number,
    _prevHopperFill: number,
  ): PhysicsFrame {
    driveMotors();

    const rotations: Record<string, number> = { ...prevRotations };
    const bodyPositions: Record<string, { x: number; y: number; angle: number }> = {};

    for (const [id, body] of bodyMap) {
      bodyPositions[id] = { x: body.position.x, y: body.position.y, angle: body.angle };
      const prim = manifest.primitives.find((p) => p.id === id);
      if (prim?.kind === 'gear' || prim?.kind === 'wheel') {
        rotations[id] = body.angle;
      }
    }

    // Hook Y: read from physics body if present
    let hookY: number | null = null;
    const hookPrim = manifest.primitives.find((p) => p.kind === 'hook');
    if (hookPrim) {
      const hookBody = bodyMap.get(hookPrim.id);
      hookY = hookBody ? hookBody.position.y : prevHookY;
    }

    // Hopper fill: count cargo blocks overlapping the hopper's mouth
    let hopperFill: number | null = null;
    const hopperPrim = manifest.primitives.find((p) => p.kind === 'hopper');
    if (hopperPrim) {
      const hCfg = hopperPrim.config as { x: number; y: number };
      let count = 0;
      for (const prim of manifest.primitives) {
        if (prim.kind !== 'cargo-block') continue;
        const body = bodyMap.get(prim.id);
        if (!body) continue;
        const bx = body.position.x;
        const by = body.position.y;
        // Match the hopper's trapezoid zone drawn in MachineCanvas
        if (bx > hCfg.x - 45 && bx < hCfg.x + 45 && by > hCfg.y - 20 && by < hCfg.y + 75) {
          count++;
        }
      }
      hopperFill = count;
    }

    // Build overlay maps for the canvas
    const motorDrives: Record<string, string[]> = {};
    for (const [motorId, gearIds] of motorGearMap) {
      motorDrives[motorId] = gearIds;
    }
    const gearMeshes: Record<string, string[]> = {};
    for (const [gearId, meshes] of gearMeshMap) {
      gearMeshes[gearId] = meshes.map((m) => m.id);
    }

    return { rotations, hookY, hopperFill, bodyPositions, motorDrives, gearMeshes };
  }

  // ── cleanup ───────────────────────────────────────────────────────────────
  function cleanup() {
    Matter.World.clear(engine.world, false);
    Matter.Engine.clear(engine);
  }

  return { engine, tick, applyControls, cleanup };
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

    // These primitives are drawn purely from manifest / scripted state —
    // no rigid body needed in physics mode.
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
