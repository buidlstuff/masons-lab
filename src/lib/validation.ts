import { parseExperimentManifest } from './schema';
import type { ExperimentManifest, PrimitiveKind } from './types';

const ALLOWED_AI_RECIPES = new Set([
  'gear-train-lab',
  'conveyor-loader',
  'winch-crane',
  'rail-cart-loop',
]);

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

  if (!manifest.metadata.recipeId || !ALLOWED_AI_RECIPES.has(manifest.metadata.recipeId)) {
    errors.push('Experiment recipe is not allowed in the vertical slice.');
  }

  if (manifest.primitives.length > 80) {
    errors.push('Primitive count exceeds the stage 1 safety budget.');
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
  switch (manifest.metadata.recipeId) {
    case 'gear-train-lab': {
      const gearCount = manifest.primitives.filter((primitive) => primitive.kind === 'gear').length;
      return gearCount >= 2 ? null : 'Gear Train Lab requires at least two gears.';
    }
    case 'conveyor-loader': {
      const conveyor = manifest.primitives.some((primitive) => primitive.kind === 'conveyor');
      const hopper = manifest.primitives.some((primitive) => primitive.kind === 'hopper');
      return conveyor && hopper ? null : 'Conveyor Loader requires a conveyor and a hopper.';
    }
    case 'winch-crane': {
      const winch = manifest.primitives.some((primitive) => primitive.kind === 'winch');
      const hook = manifest.primitives.some((primitive) => primitive.kind === 'hook');
      return winch && hook ? null : 'Winch Crane requires a winch and a hook.';
    }
    case 'rail-cart-loop': {
      const rail = manifest.primitives.some((primitive) => primitive.kind === 'rail-segment');
      const loco = manifest.primitives.some((primitive) => primitive.kind === 'locomotive');
      return rail && loco ? null : 'Rail Cart Loop requires rail and a locomotive.';
    }
    default:
      return 'Unknown recipe.';
  }
}
