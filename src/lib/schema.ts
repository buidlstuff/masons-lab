import { z } from 'zod';
import type { ExperimentManifest } from './types';

const stageSchema = z.object({
  width: z.union([z.literal(960), z.literal(1280), z.literal(1440)]),
  height: z.union([z.literal(540), z.literal(720), z.literal(900)]),
  background: z.enum(['lab-dark', 'yard-blueprint', 'machine-bay']),
  grid: z.enum(['off', 'light', 'engineering']),
  boundaryMode: z.enum(['contain', 'wrap']),
});

const cameraSchema = z.object({
  mode: z.enum(['fixed', 'zoomable']),
  zoom: z.number().min(0.5).max(2),
  minZoom: z.number().min(0.25).max(2),
  maxZoom: z.number().min(0.5).max(4),
  panX: z.number(),
  panY: z.number(),
  followTargetId: z.string().optional(),
});

const timelineSchema = z.object({
  paused: z.boolean(),
  timeScale: z.number().min(0.1).max(4),
  allowPause: z.boolean(),
  allowStep: z.boolean(),
  allowReset: z.boolean(),
});

const primitiveSchema = z.object({
  id: z.string().min(1),
  kind: z.enum([
    'node',
    'beam',
    'wheel',
    'axle',
    'chassis',
    'motor',
    'gear',
    'pulley',
    'chain-sprocket',
    'flywheel',
    'gearbox',
    'spring-linear',
    'rack',
    'piston',
    'crane-arm',
    'bucket',
    'counterweight',
    'winch',
    'rope',
    'belt-link',
    'chain-link',
    'hook',
    'rail-segment',
    'rail-switch',
    'locomotive',
    'wagon',
    'conveyor',
    'hopper',
    'cargo-block',
    'material-pile',
    'ramp',
    'platform',
    'wall',
    'ball',
    'rock',
    'cam',
    'cam-follower',
    'bevel-gear',
    'chute',
    'silo-bin',
    'water',
    'hinge',
    'tunnel',
  ]),
  label: z.string().optional(),
  config: z.record(z.string(), z.any()),
  locked: z.boolean().optional(),
});

const behaviorSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['gear-mesh', 'winch-hoist', 'rail-follow', 'rail-switch-route', 'conveyor-carry', 'hopper-feed']),
  targets: z.array(z.string().min(1)),
  params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});

const controlSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['slider', 'toggle', 'button']),
  label: z.string().min(1),
  description: z.string().optional(),
  bind: z
    .object({
      targetId: z.string(),
      path: z.string(),
    })
    .optional(),
  defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  action: z.enum(['reset', 'spawn', 'route-switch', 'pause']).optional(),
});

const hudSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['readout', 'label', 'challenge-card']),
  label: z.string().min(1),
  metric: z.enum(['input-rpm', 'output-rpm', 'gear-ratio', 'hopper-fill', 'throughput', 'train-speed', 'hook-height']).optional(),
  units: z.string().optional(),
  position: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right']),
});

const goalSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['fill-hopper', 'gear-down', 'deliver-wagon']),
  label: z.string().min(1),
  successMessage: z.string().min(1),
  params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
});

const explanationSchema = z.object({
  whatIsHappening: z.string().min(1),
  whatToTryNext: z.array(z.string().min(1)).min(1),
  vocabulary: z.array(
    z.object({
      term: z.string().min(1),
      kidFriendlyMeaning: z.string().min(1),
    }),
  ),
  safetyNotes: z.array(z.string()).optional(),
});

export const experimentManifestSchema = z.object({
  schemaVersion: z.literal('1.0.0'),
  experimentId: z.string().min(1),
  slug: z.string().min(1),
  family: z.enum([
    'structures',
    'earthworks',
    'lifting',
    'transport',
    'power-and-drivetrain',
    'flow-and-processing',
    'machine-combos',
  ]),
  status: z.enum(['draft', 'validated', 'saved', 'golden', 'archived']),
  metadata: z.object({
    title: z.string().min(1),
    subtitle: z.string().optional(),
    shortDescription: z.string().min(1),
    teachingGoal: z.string().min(1),
    difficulty: z.enum(['easy', 'medium', 'hard', 'boss']),
    tags: z.array(z.string()),
    starter: z.boolean(),
    featured: z.boolean().optional(),
    recipeId: z.string().optional(),
    thumbnailPreset: z.string().min(1),
    remixOfExperimentId: z.string().optional(),
    createdBy: z.object({
      source: z.enum(['human', 'ai']),
      modelFamily: z.string().optional(),
      modelId: z.string().optional(),
      promptHash: z.string().optional(),
      generatedAt: z.string().optional(),
    }),
  }),
  world: z.object({
    stage: stageSchema,
    camera: cameraSchema,
    timeline: timelineSchema,
    randomSeed: z.number().int(),
  }),
  primitives: z.array(primitiveSchema),
  behaviors: z.array(behaviorSchema),
  controls: z.array(controlSchema),
  hud: z.array(hudSchema),
  goals: z.array(goalSchema),
  blueprints: z.array(z.any()),
  assemblies: z.array(z.any()),
  explanation: explanationSchema,
  validation: z.object({
    engineMode: z.enum(['production', 'guided', 'experimental']),
    schemaPassed: z.boolean(),
    referenceChecksPassed: z.boolean(),
    runtimeSmokePassed: z.boolean(),
    fpsBudgetPassed: z.boolean(),
    bannedApiScanPassed: z.boolean(),
    portBindingsPassed: z.boolean(),
    warnings: z.array(z.string()),
  }),
  saveHints: z.object({
    thumbnailFocus: z.string().optional(),
    starterControlPreset: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
    notebookPrompt: z.string().optional(),
    saveMode: z.enum(['experiment-only', 'experiment-and-blueprints', 'blueprints-only']).optional(),
  }),
});

export function parseExperimentManifest(input: unknown): ExperimentManifest {
  return experimentManifestSchema.parse(input) as ExperimentManifest;
}
