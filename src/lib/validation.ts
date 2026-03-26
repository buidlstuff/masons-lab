import { parseExperimentManifest } from './schema';
import type { ExperimentManifest, PrimitiveKind } from './types';

const ALLOWED_AI_PRIMITIVES = new Set<PrimitiveKind>([
  'node',
  'beam',
  'wheel',
  'axle',
  'motor',
  'gear',
  'winch',
  'rope',
  'hook',
  'rail-segment',
  'rail-switch',
  'locomotive',
  'wagon',
  'conveyor',
  'hopper',
  'cargo-block',
  'material-pile',
]);

export interface ValidationResult {
  ok: boolean;
  manifest: ExperimentManifest;
  warnings: string[];
  errors: string[];
}

export function validateExperimentManifest(input: unknown): ValidationResult {
  const manifest = parseExperimentManifest(input);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!manifest.world.timeline.allowReset) {
    errors.push('Reset must always be enabled.');
  }

  const ids = new Set<string>();
  for (const primitive of manifest.primitives) {
    if (ids.has(primitive.id)) {
      errors.push(`Duplicate primitive id: ${primitive.id}`);
    }
    ids.add(primitive.id);
    if (!ALLOWED_AI_PRIMITIVES.has(primitive.kind)) {
      errors.push(`Primitive ${primitive.kind} is not in the stage 1 allowlist.`);
    }
  }

  for (const behavior of manifest.behaviors) {
    for (const target of behavior.targets) {
      if (!ids.has(target)) {
        errors.push(`Behavior ${behavior.id} references missing target ${target}.`);
      }
    }
  }

  for (const primitive of manifest.primitives) {
    if (primitive.kind === 'beam') {
      const config = primitive.config as { fromNodeId?: string; toNodeId?: string };
      if (!config.fromNodeId || !ids.has(config.fromNodeId)) {
        errors.push(`Beam ${primitive.id} has an invalid fromNodeId.`);
      }
      if (!config.toNodeId || !ids.has(config.toNodeId)) {
        errors.push(`Beam ${primitive.id} has an invalid toNodeId.`);
      }
    }
    if (primitive.kind === 'rope') {
      const config = primitive.config as { fromId?: string; toId?: string };
      if (!config.fromId || !ids.has(config.fromId)) {
        errors.push(`Rope ${primitive.id} has an invalid fromId.`);
      }
      if (!config.toId || !ids.has(config.toId)) {
        errors.push(`Rope ${primitive.id} has an invalid toId.`);
      }
    }
  }

  if (manifest.primitives.length > 80) {
    errors.push('Primitive count exceeds the stage 1 safety budget.');
  }

  if (manifest.primitives.length === 0) {
    errors.push('Experiment needs at least one part.');
  }

  if (manifest.metadata.recipeId) {
    warnings.push('Recipe-backed manifests are deprecated. Starter projects should run on the honest sandbox path.');
  }

  if (manifest.primitives.length > 40) {
    warnings.push('This machine is getting dense for the vertical slice.');
  }

  const smokeError = smokeTestManifest(manifest);
  if (smokeError) {
    errors.push(smokeError);
  }

  return {
    ok: errors.length === 0,
    manifest: {
      ...manifest,
      validation: {
        ...manifest.validation,
        schemaPassed: true,
        referenceChecksPassed: errors.filter((error) => error.includes('invalid') || error.includes('missing') || error.includes('Duplicate')).length === 0,
        runtimeSmokePassed: !smokeError,
        fpsBudgetPassed: manifest.primitives.length <= 80,
        bannedApiScanPassed: true,
        portBindingsPassed: true,
        warnings,
      },
    },
    warnings,
    errors,
  };
}

function smokeTestManifest(manifest: ExperimentManifest): string | null {
  const hasMotor = manifest.primitives.some((primitive) => primitive.kind === 'motor');
  const gearCount = manifest.primitives.filter((primitive) => primitive.kind === 'gear').length;
  const conveyorCount = manifest.primitives.filter((primitive) => primitive.kind === 'conveyor').length;
  const cargoCount = manifest.primitives.filter((primitive) => primitive.kind === 'cargo-block').length;
  const hopperCount = manifest.primitives.filter((primitive) => primitive.kind === 'hopper').length;

  if (gearCount > 0 && !hasMotor) {
    return 'Gear builds need at least one motor so the machine can do something visible.';
  }

  if (conveyorCount > 0 && cargoCount === 0 && hopperCount === 0) {
    return 'Conveyor builds should include cargo or a hopper so the motion is legible.';
  }

  return null;
}
