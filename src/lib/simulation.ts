import { useEffect, useRef, useState } from 'react';
import { buildMatterWorld, type PhysicsWorld } from './physics-engine';
import type { BuildTelemetry, ExperimentManifest, PrimitiveInstance } from './types';
import Matter from 'matter-js';

export interface RuntimeSnapshot {
  time: number;
  rotations: Record<string, number>;
  cargoProgress: Record<string, number>;
  hookY: number;
  trainProgress: number;
  trainDelivered: boolean;
  hopperFill: number;
  throughput: number;
  telemetry: BuildTelemetry;
  /** Populated in free-build (physics) mode. MachineCanvas uses these for
   *  live body positions instead of the static manifest config values. */
  bodyPositions?: Record<string, { x: number; y: number; angle: number }>;
  /** motor id → gear ids it is driving (for canvas connection overlay) */
  motorDrives?: Record<string, string[]>;
  /** gear id → meshed gear ids (for canvas connection overlay) */
  gearMeshes?: Record<string, string[]>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useMachineSimulation(
  manifest: ExperimentManifest,
  controlValues: Record<string, string | number | boolean>,
): RuntimeSnapshot {
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot>(() => createInitialSnapshot(manifest));

  // Refs let the single rAF loop pick up the latest values without restarting.
  const physicsRef = useRef<PhysicsWorld | null>(null);
  const snapshotRef = useRef<RuntimeSnapshot>(snapshot);
  const controlsRef = useRef(controlValues);
  const manifestRef = useRef(manifest);

  useEffect(() => {
    controlsRef.current = controlValues;
  }, [controlValues]);

  useEffect(() => {
    manifestRef.current = manifest;
  }, [manifest]);

  // Push live control changes into the physics world (rope length, motor RPM etc.)
  useEffect(() => {
    physicsRef.current?.applyControls(controlValues);
  }, [controlValues]);

  // Rebuild the physics world whenever the manifest changes.
  // Recipe manifests (recipeId set) stay on the scripted simulation path.
  useEffect(() => {
    physicsRef.current?.cleanup();
    physicsRef.current = null;

    const recipeId = manifest.metadata.recipeId;
    if (!recipeId) {
      physicsRef.current = buildMatterWorld(manifest);
    }

    const initial = createInitialSnapshot(manifest);
    snapshotRef.current = initial;
    setSnapshot(initial);

    return () => {
      physicsRef.current?.cleanup();
      physicsRef.current = null;
    };
  }, [manifest]);

  // Single rAF loop — never restarts, reads everything through refs.
  useEffect(() => {
    let frame: number;
    let last = performance.now();
    let active = true;

    const tick = (now: number) => {
      if (!active) return;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      frame = requestAnimationFrame(tick);

      const pw = physicsRef.current;
      const currentManifest = manifestRef.current;
      const currentControls = controlsRef.current;

      if (pw) {
        // ── Physics mode (free build) ──────────────────────────────────────
        Matter.Engine.update(pw.engine, dt * 1000);
        const prev = snapshotRef.current;
        const frame = pw.tick(dt, prev.rotations, prev.hookY, prev.hopperFill);
        const next: RuntimeSnapshot = {
          ...prev,
          time: prev.time + dt,
          rotations: frame.rotations,
          hookY: frame.hookY !== null ? frame.hookY : prev.hookY,
          hopperFill: frame.hopperFill !== null ? frame.hopperFill : prev.hopperFill,
          bodyPositions: frame.bodyPositions,
          motorDrives: frame.motorDrives,
          gearMeshes: frame.gearMeshes,
          telemetry: {
            ...prev.telemetry,
            hookHeight: frame.hookY !== null ? Math.round(frame.hookY) : prev.telemetry.hookHeight,
            hopperFill: frame.hopperFill !== null ? frame.hopperFill : prev.telemetry.hopperFill,
          },
        };
        snapshotRef.current = next;
        setSnapshot(next);
      } else {
        // ── Scripted simulation mode (recipe machines) ─────────────────────
        const next = stepSimulation(currentManifest, snapshotRef.current, currentControls, dt);
        snapshotRef.current = next;
        setSnapshot(next);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => {
      active = false;
      cancelAnimationFrame(frame);
    };
  }, []); // intentionally empty — everything accessed through refs

  return snapshot;
}

// ─── Scripted simulation (recipe machines — unchanged) ───────────────────────

function createInitialSnapshot(manifest: ExperimentManifest): RuntimeSnapshot {
  const primitives = manifest?.primitives ?? [];
  const hook = primitives.find((primitive) => primitive.kind === 'hook');
  const hookY = hook && 'y' in hook.config ? (hook.config.y as number) : 0;
  const loco = primitives.find((primitive) => primitive.kind === 'locomotive');
  const trainProgress = loco && 'progress' in loco.config ? (loco.config.progress as number) : 0;

  return {
    time: 0,
    rotations: {},
    cargoProgress: {},
    hookY,
    trainProgress,
    trainDelivered: false,
    hopperFill: getInitialHopperFill(manifest),
    throughput: 0,
    telemetry: {},
  };
}

function getInitialHopperFill(manifest: ExperimentManifest) {
  const hopper = (manifest?.primitives ?? []).find((primitive) => primitive.kind === 'hopper');
  return hopper && 'fill' in hopper.config ? (hopper.config.fill as number) : 0;
}

function stepSimulation(
  manifest: ExperimentManifest,
  previous: RuntimeSnapshot,
  controlValues: Record<string, string | number | boolean>,
  dt: number,
): RuntimeSnapshot {
  const recipeId = manifest.metadata.recipeId;
  switch (recipeId) {
    case 'gear-train-lab':
      return stepGearTrain(manifest, previous, controlValues, dt);
    case 'conveyor-loader':
      return stepConveyor(manifest, previous, controlValues, dt);
    case 'winch-crane':
      return stepWinchCrane(manifest, previous, controlValues, dt);
    case 'rail-cart-loop':
      return stepRailCart(manifest, previous, controlValues, dt);
    default:
      return { ...previous, time: previous.time + dt };
  }
}

function stepGearTrain(
  manifest: ExperimentManifest,
  previous: RuntimeSnapshot,
  controlValues: Record<string, string | number | boolean>,
  dt: number,
) {
  const motor = manifest.primitives.find((primitive) => primitive.kind === 'motor');
  const gears = manifest.primitives.filter((primitive) => primitive.kind === 'gear');
  const inputRpm = Number(controlValues['input-rpm'] ?? (motor?.config as { rpm?: number } | undefined)?.rpm ?? 60);
  const middleTeeth = Number(controlValues['gear-2-teeth'] ?? (gears[1]?.config as { teeth?: number } | undefined)?.teeth ?? 40);
  const gear1Teeth = Number((gears[0]?.config as { teeth?: number } | undefined)?.teeth ?? 20);
  const gear3Teeth = Number((gears[2]?.config as { teeth?: number } | undefined)?.teeth ?? 20);
  const ratio = (middleTeeth / gear1Teeth) * (gear3Teeth / middleTeeth);
  const outputRpm = inputRpm / ratio;

  const rotations = {
    'gear-1': (previous.rotations['gear-1'] ?? 0) + inputRpm * dt * 0.12,
    'gear-2': (previous.rotations['gear-2'] ?? 0) - (inputRpm / (middleTeeth / gear1Teeth)) * dt * 0.12,
    'gear-3': (previous.rotations['gear-3'] ?? 0) + outputRpm * dt * 0.12,
  };

  return {
    ...previous,
    time: previous.time + dt,
    rotations,
    telemetry: {
      inputRpm,
      outputRpm,
      gearRatio: ratio,
    },
  };
}

function stepConveyor(
  manifest: ExperimentManifest,
  previous: RuntimeSnapshot,
  controlValues: Record<string, string | number | boolean>,
  dt: number,
) {
  const conveyor = manifest.primitives.find((primitive) => primitive.kind === 'conveyor');
  const hopper = manifest.primitives.find((primitive) => primitive.kind === 'hopper');
  const cargo = manifest.primitives.filter((primitive) => primitive.kind === 'cargo-block');
  const speed = Number(controlValues['conv-speed'] ?? (conveyor?.config as { speed?: number } | undefined)?.speed ?? 55);
  const releaseRate = Number(controlValues['hopper-rate'] ?? (hopper?.config as { releaseRate?: number } | undefined)?.releaseRate ?? 1.5);

  let fill = previous.hopperFill;
  const cargoProgress = { ...previous.cargoProgress };

  for (const block of cargo) {
    const next = (cargoProgress[block.id] ?? Math.random() * 0.15) + dt * (speed / 180);
    if (next >= 1 && fill < 20) {
      fill = Math.min(20, fill + releaseRate * 0.4);
      cargoProgress[block.id] = 0;
    } else {
      cargoProgress[block.id] = next;
    }
  }

  const throughput = Math.round(speed * releaseRate * 0.2);

  return {
    ...previous,
    time: previous.time + dt,
    cargoProgress,
    hopperFill: fill,
    throughput,
    telemetry: {
      hopperFill: fill,
      throughput,
    },
  };
}

function stepWinchCrane(
  manifest: ExperimentManifest,
  previous: RuntimeSnapshot,
  controlValues: Record<string, string | number | boolean>,
  dt: number,
) {
  const winch = manifest.primitives.find((primitive) => primitive.kind === 'winch');
  const ropeLength = Number(controlValues['rope-length'] ?? (winch?.config as { ropeLength?: number } | undefined)?.ropeLength ?? 230);
  const speed = Number(controlValues['winch-speed'] ?? (winch?.config as { speed?: number } | undefined)?.speed ?? 42);
  const smoothing = Math.max(0.05, Math.min(1, dt * (speed / 18)));
  const hookY = previous.hookY + (180 + ropeLength - previous.hookY) * smoothing;

  return {
    ...previous,
    time: previous.time + dt,
    hookY,
    telemetry: {
      hookHeight: Math.round(hookY),
      loadPlaced: hookY <= 280,
    },
  };
}

function stepRailCart(
  manifest: ExperimentManifest,
  previous: RuntimeSnapshot,
  controlValues: Record<string, string | number | boolean>,
  dt: number,
) {
  const loco = manifest.primitives.find((primitive) => primitive.kind === 'locomotive');
  const speed = Number(controlValues['train-speed'] ?? (loco?.config as { speed?: number } | undefined)?.speed ?? 0.18);
  const goBranch = Boolean(controlValues['route-toggle']);
  const nextProgress = (previous.trainProgress + dt * speed * 0.35) % 1;
  const delivered = goBranch && nextProgress > 0.72;

  return {
    ...previous,
    time: previous.time + dt,
    trainProgress: nextProgress,
    trainDelivered: delivered,
    telemetry: {
      trainSpeed: Number((speed * 10).toFixed(1)),
      wagonDelivered: delivered,
    },
  };
}

export function findPrimitiveById(primitives: PrimitiveInstance[], primitiveId?: string) {
  return primitives.find((primitive) => primitive.id === primitiveId);
}
