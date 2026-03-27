import type { ExperimentManifest, PrimitiveInstance, PrimitiveKind, ProjectSuccessCheck, SiteJobDefinition } from './types';
import type { RuntimeSnapshot } from './simulation';

const MOTOR_RANGE = 220;
const CONVEYOR_RANGE = 28;
const CONVEYOR_MOTOR_RANGE = 300;

export interface GoalProgress {
  label: string;
  current: number;
  target: number;
  unit: string;
  met: boolean;
}

export interface EvaluatedProjectStep {
  stepId: string;
  title: string;
  instruction: string;
  allowedPartKinds: PrimitiveKind[];
  successCheck: ProjectSuccessCheck;
  successCopy: string;
  assistantPrompt: string;
  completed: boolean;
  progress: GoalProgress;
}

export interface ProjectEvaluation {
  complete: boolean;
  unlockedAllParts: boolean;
  currentStepIndex: number;
  currentStep: EvaluatedProjectStep | null;
  steps: EvaluatedProjectStep[];
  goal: GoalProgress;
}

export function evaluateProject(
  job: SiteJobDefinition | undefined,
  manifest: ExperimentManifest,
  runtime: RuntimeSnapshot,
): ProjectEvaluation | null {
  if (!job?.steps?.length) {
    return null;
  }

  const steps = job.steps.map((step) => {
    const progress = evaluateSuccessCheck(step.successCheck, manifest, runtime);
    return {
      ...step,
      completed: progress.met,
      progress: {
        ...progress,
        label: step.title,
      },
    };
  });

  const currentStepIndex = steps.findIndex((step) => !step.completed);
  const complete = currentStepIndex === -1;
  const currentStep = complete ? null : steps[currentStepIndex];
  const goal = complete || !currentStep
    ? finalGoalProgress(job, manifest, runtime)
    : currentStep.progress;
  const unlockIndex = job.playModeUnlockStep ?? Number.POSITIVE_INFINITY;

  return {
    complete,
    unlockedAllParts: complete || currentStepIndex >= unlockIndex,
    currentStepIndex: complete ? steps.length : currentStepIndex,
    currentStep,
    steps,
    goal,
  };
}

export function isJobComplete(
  job: SiteJobDefinition | undefined,
  manifest: ExperimentManifest,
  runtime: RuntimeSnapshot,
): boolean {
  return evaluateProject(job, manifest, runtime)?.complete ?? false;
}

export function getGoalProgress(
  job: SiteJobDefinition,
  manifest: ExperimentManifest,
  runtime: RuntimeSnapshot,
): GoalProgress {
  return evaluateProject(job, manifest, runtime)?.goal ?? finalGoalProgress(job, manifest, runtime);
}

function finalGoalProgress(
  job: SiteJobDefinition,
  manifest: ExperimentManifest,
  runtime: RuntimeSnapshot,
): GoalProgress {
  switch (job.goalType) {
    case 'spin-gear-train': {
      const liveLinks = countLiveGearLinks(manifest, runtime);
      return {
        label: 'Live gear train',
        current: liveLinks > 0 ? 2 : Math.min(1, countPlaced(manifest, 'gear')),
        target: 2,
        unit: 'gears',
        met: liveLinks > 0,
      };
    }
    case 'feed-the-hopper': {
      const fill = runtime.hopperFill ?? 0;
      return {
        label: 'Hopper fill',
        current: Math.min(1, Math.round(fill)),
        target: 1,
        unit: 'block',
        met: fill >= 1,
      };
    }
    case 'build-the-loader': {
      const fill = runtime.hopperFill ?? 0;
      return {
        label: 'Powered hopper fill',
        current: Math.min(3, Math.round(fill)),
        target: 3,
        unit: 'blocks',
        met: countMotorsNearConveyors(manifest) > 0 && fill >= 3,
      };
    }
    case 'fill-hopper': {
      const fill = runtime.hopperFill ?? 0;
      return {
        label: 'Fill hopper',
        current: Math.min(8, Math.round(fill)),
        target: 8,
        unit: 'blocks',
        met: fill >= 8,
      };
    }
    case 'gear-down':
      return {
        label: 'Reduce output RPM',
        current: Math.round(runtime.telemetry.outputRpm ?? 999),
        target: 45,
        unit: 'RPM',
        met: (runtime.telemetry.outputRpm ?? 999) <= 45 && (runtime.telemetry.inputRpm ?? 0) > 0,
      };
    case 'deliver-wagon':
      return {
        label: 'Deliver wagon',
        current: runtime.telemetry.wagonDelivered ? 1 : 0,
        target: 1,
        unit: '',
        met: Boolean(runtime.telemetry.wagonDelivered),
      };
    default:
      return { label: job.goalType, current: 0, target: 1, unit: '', met: false };
  }
}

function evaluateSuccessCheck(
  successCheck: ProjectSuccessCheck,
  manifest: ExperimentManifest,
  runtime: RuntimeSnapshot,
): GoalProgress {
  switch (successCheck) {
    case 'has-motor': {
      const current = Math.min(1, countPlaced(manifest, 'motor'));
      return { label: 'Place a motor', current, target: 1, unit: 'motor', met: current >= 1 };
    }
    case 'first-gear-live': {
      const gears = manifest.primitives.filter((p) => p.kind === 'gear');
      const hasRunningGear = gears.some((g) => Math.abs(runtime.rotations[g.id] ?? 0) > 0.01);
      return {
        label: 'Wake up the first gear',
        current: hasRunningGear ? 1 : 0,
        target: 1,
        unit: 'gear',
        met: hasRunningGear,
      };
    }
    case 'gear-train-live': {
      const liveLinks = countLiveGearLinks(manifest, runtime);
      return {
        label: 'Spin two meshed gears',
        current: liveLinks > 0 ? 2 : Math.min(1, countPlaced(manifest, 'gear')),
        target: 2,
        unit: 'gears',
        met: liveLinks > 0,
      };
    }
    case 'has-conveyor': {
      const current = Math.min(1, countPlaced(manifest, 'conveyor'));
      return { label: 'Place a conveyor', current, target: 1, unit: 'belt', met: current >= 1 };
    }
    case 'has-hopper': {
      const current = Math.min(1, countPlaced(manifest, 'hopper'));
      return { label: 'Place a hopper', current, target: 1, unit: 'hopper', met: current >= 1 };
    }
    case 'cargo-on-conveyor': {
      const current = Math.min(1, countCargoOnConveyors(manifest, runtime));
      return {
        label: 'Put cargo on the belt',
        current,
        target: 1,
        unit: 'cargo',
        met: current >= 1,
      };
    }
    case 'hopper-catching-cargo': {
      const fill = runtime.hopperFill ?? 0;
      return {
        label: 'Catch cargo in the hopper',
        current: Math.min(1, Math.round(fill)),
        target: 1,
        unit: 'block',
        met: fill >= 1,
      };
    }
    case 'motor-near-conveyor': {
      const current = Math.min(1, countMotorsNearConveyors(manifest));
      return {
        label: 'Power the conveyor',
        current,
        target: 1,
        unit: 'motor',
        met: current >= 1,
      };
    }
    case 'powered-loader-target': {
      const fill = runtime.hopperFill ?? 0;
      const powered = countMotorsNearConveyors(manifest) > 0;
      return {
        label: 'Reach the fill target',
        current: Math.min(3, Math.round(fill)),
        target: 3,
        unit: 'blocks',
        met: powered && fill >= 3,
      };
    }
    default:
      return { label: successCheck, current: 0, target: 1, unit: '', met: false };
  }
}

function countPlaced(manifest: ExperimentManifest, kind: PrimitiveKind) {
  return manifest.primitives.filter((primitive) => primitive.kind === kind).length;
}

function countLiveGearLinks(manifest: ExperimentManifest, runtime: RuntimeSnapshot) {
  const gears = manifest.primitives.filter((primitive) => primitive.kind === 'gear');
  if (gears.length < 2) {
    return 0;
  }

  // Check via rotations directly — more reliable than telemetry.outputRpm which
  // takes a tick to populate after a physics world rebuild.
  const anySpinning = gears.some((g) => Math.abs(runtime.rotations[g.id] ?? 0) > 0.01);
  if (!anySpinning) {
    return 0;
  }

  let links = 0;
  for (const gear of gears) {
    const meshes = runtime.gearMeshes?.[gear.id] ?? [];
    for (const meshId of meshes) {
      const other = manifest.primitives.find((primitive) => primitive.id === meshId);
      if (!other || other.kind !== 'gear' || gear.id >= meshId) {
        continue;
      }
      links += 1;
    }
  }
  return links;
}

function countCargoOnConveyors(manifest: ExperimentManifest, runtime: RuntimeSnapshot) {
  const conveyors = manifest.primitives.filter((primitive) => primitive.kind === 'conveyor');
  if (conveyors.length === 0) {
    return 0;
  }

  return manifest.primitives.filter((primitive) => {
    if (primitive.kind !== 'cargo-block') {
      return false;
    }
    const point = runtime.bodyPositions?.[primitive.id]
      ?? (primitive.config as { x: number; y: number });
    return conveyors.some((conveyor) =>
      distanceToPolyline(
        (conveyor.config as { path: Array<{ x: number; y: number }> }).path,
        point.x,
        point.y,
      ) <= CONVEYOR_RANGE,
    );
  }).length;
}

function countMotorsNearConveyors(manifest: ExperimentManifest) {
  const conveyors = manifest.primitives.filter((primitive) => primitive.kind === 'conveyor');
  const motors = manifest.primitives.filter((primitive) => primitive.kind === 'motor');

  return motors.filter((motor) => {
    const config = motor.config as { x: number; y: number };
    return conveyors.some((conveyor) =>
      distanceToPolyline(
        (conveyor.config as { path: Array<{ x: number; y: number }> }).path,
        config.x,
        config.y,
      ) <= CONVEYOR_MOTOR_RANGE,
    );
  }).length;
}

export function countActiveGearPairs(manifest: ExperimentManifest, runtime: RuntimeSnapshot) {
  return countLiveGearLinks(manifest, runtime);
}

export function countActiveCargo(manifest: ExperimentManifest, runtime: RuntimeSnapshot) {
  return countCargoOnConveyors(manifest, runtime);
}

export function countPoweredConveyors(manifest: ExperimentManifest) {
  const conveyors = manifest.primitives.filter((primitive) => primitive.kind === 'conveyor');
  if (conveyors.length === 0) {
    return 0;
  }

  return conveyors.filter((conveyor) => {
    const points = (conveyor.config as { path: Array<{ x: number; y: number }> }).path;
    return manifest.primitives.some((primitive) => {
      if (primitive.kind !== 'motor') {
        return false;
      }
      const config = primitive.config as { x: number; y: number };
      return points.some((point) => Math.hypot(point.x - config.x, point.y - config.y) <= CONVEYOR_MOTOR_RANGE);
    });
  }).length;
}

export function hasDrivenGear(manifest: ExperimentManifest) {
  const motors = manifest.primitives.filter((primitive) => primitive.kind === 'motor');
  const gears = manifest.primitives.filter((primitive) => primitive.kind === 'gear');
  return gears.some((gear) => motors.some((motor) => isWithinMotorReach(motor, gear)));
}

function isWithinMotorReach(motor: PrimitiveInstance, rotatingPart: PrimitiveInstance) {
  const motorConfig = motor.config as { x: number; y: number };
  const partConfig = rotatingPart.config as { x: number; y: number };
  return Math.hypot(motorConfig.x - partConfig.x, motorConfig.y - partConfig.y) <= MOTOR_RANGE;
}

function distanceToPolyline(points: Array<{ x: number; y: number }>, x: number, y: number) {
  if (points.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  if (points.length === 1) {
    return Math.hypot(points[0].x - x, points[0].y - y);
  }

  let closest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length - 1; index += 1) {
    closest = Math.min(closest, distanceToSegment(points[index], points[index + 1], x, y));
  }
  return closest;
}

function distanceToSegment(
  start: { x: number; y: number },
  end: { x: number; y: number },
  x: number,
  y: number,
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  if (dx === 0 && dy === 0) {
    return Math.hypot(x - start.x, y - start.y);
  }

  const t = Math.max(0, Math.min(1, ((x - start.x) * dx + (y - start.y) * dy) / (dx * dx + dy * dy)));
  const px = start.x + dx * t;
  const py = start.y + dy * t;
  return Math.hypot(px - x, py - y);
}
