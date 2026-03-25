# Experiment Schema

This document defines the canonical contract between:

- the AI model
- the validator
- the runtime
- the save system
- the evaluation harness

The schema is the product.

If the schema is weak, the AI will invent its own product surface and the lab will drift back toward arbitrary code generation. The schema exists to stop that drift.

The new product direction is construction-first:

- build machines
- combine systems
- move materials
- reuse modules
- discover combos

## Design Goals

1. Make machine experiments easy for models to generate reliably.
2. Make machine experiments safe for the runtime to execute.
3. Make edits preserve machine identity across iterations.
4. Make subassemblies reusable across saves.
5. Make evaluation measurable at the primitive, recipe, and module levels.

## Schema Strategy

V1 production mode is declarative.

That means the AI should return:

- metadata
- world settings
- primitive instances
- behavior recipes
- controls
- HUD widgets
- goals
- explanation text
- optional reusable blueprint definitions

V1 production mode should not require the AI to invent arbitrary JavaScript.

If script hooks ever exist, they must be:

- admin-only
- out of the Mason-facing production path
- separately validated

## Top-Level Envelope

```ts
export type SchemaVersion = '1.0.0';

export type ExperimentFamily =
  | 'structures'
  | 'earthworks'
  | 'lifting'
  | 'transport'
  | 'power-and-drivetrain'
  | 'flow-and-processing'
  | 'machine-combos';

export type ExperimentStatus =
  | 'draft'
  | 'validated'
  | 'saved'
  | 'golden'
  | 'archived';

export interface ExperimentManifest {
  schemaVersion: SchemaVersion;
  experimentId: string;
  slug: string;
  family: ExperimentFamily;
  status: ExperimentStatus;
  metadata: ExperimentMetadata;
  world: WorldConfig;
  primitives: PrimitiveInstance[];
  behaviors: BehaviorRecipe[];
  controls: ControlSpec[];
  hud: HudWidgetSpec[];
  goals: GoalSpec[];
  blueprints: MachineBlueprint[];
  assemblies: AssemblyInstance[];
  explanation: ExplanationSpec;
  validation: ValidationProfile;
  saveHints: SaveHints;
}
```

## Metadata

```ts
export interface ExperimentMetadata {
  title: string;
  subtitle?: string;
  shortDescription: string;
  teachingGoal: string;
  difficulty: 'easy' | 'medium' | 'hard' | 'boss';
  tags: string[];
  starter: boolean;
  recipeId?: string;
  thumbnailPreset: ThumbnailPreset;
  remixOfExperimentId?: string;
  createdBy: CreatedByInfo;
}

export interface CreatedByInfo {
  source: 'human' | 'ai';
  modelFamily?: string;
  modelId?: string;
  promptHash?: string;
  generatedAt?: string;
}
```

Rules:

- `title` must be short and kid-readable.
- `shortDescription` must describe what Mason can do, not how the machine is implemented.
- `teachingGoal` must name the tradeoff or engineering concept clearly.
- `recipeId` should be present for recipe-based builds.

## World Config

```ts
export interface WorldConfig {
  stage: StageSpec;
  camera: CameraSpec;
  timeline: TimelineSpec;
  terrain?: TerrainSpec;
  fields: FieldSpec[];
  randomSeed: number;
}

export interface StageSpec {
  width: 960 | 1280 | 1440;
  height: 540 | 720 | 900;
  background: BackgroundPreset;
  grid: 'off' | 'light' | 'engineering';
  boundaryMode: 'contain' | 'wrap';
}

export interface CameraSpec {
  mode: 'fixed' | 'zoomable';
  zoom: number;
  minZoom: number;
  maxZoom: number;
  panX: number;
  panY: number;
  followTargetId?: string;
}

export interface TimelineSpec {
  paused: boolean;
  timeScale: number;
  allowPause: boolean;
  allowStep: boolean;
  allowReset: boolean;
}

export interface TerrainSpec {
  preset: 'flat-yard' | 'ramp-yard' | 'pit' | 'rail-pad' | 'processing-line';
  diggableZones?: DigZoneSpec[];
}

export interface DigZoneSpec {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  materialType: MaterialType;
  quantity: number;
}
```

Rules:

- `allowReset` must always be `true`.
- `randomSeed` must always be persisted.
- Terrain complexity must stay preset-driven or tightly clamped.

## Primitive Instances

```ts
export type PrimitiveKind =
  | 'node'
  | 'beam'
  | 'frame'
  | 'plate'
  | 'support'
  | 'wheel'
  | 'axle'
  | 'track'
  | 'slider'
  | 'spring'
  | 'motor'
  | 'gear'
  | 'gearbox'
  | 'shaft'
  | 'belt'
  | 'chain'
  | 'brake'
  | 'generator'
  | 'piston'
  | 'winch'
  | 'rope'
  | 'pulley'
  | 'boom'
  | 'bucket'
  | 'fork'
  | 'hook'
  | 'turntable'
  | 'rail-segment'
  | 'rail-switch'
  | 'bogie'
  | 'locomotive'
  | 'wagon'
  | 'conveyor'
  | 'chute'
  | 'coupler'
  | 'pipe'
  | 'valve'
  | 'pump'
  | 'tank'
  | 'hopper'
  | 'mixer'
  | 'material-pile'
  | 'cargo-block'
  | 'pallet'
  | 'soil-chunk'
  | 'sensor-lite'
  | 'switch'
  | 'indicator-light';

export interface PrimitiveInstance {
  id: string;
  kind: PrimitiveKind;
  label?: string;
  config: PrimitiveConfig;
  visuals?: VisualSpec[];
  locked?: boolean;
}
```

Rules:

- `id` must be stable across AI edits unless intentionally replaced.
- `kind` must be from the approved list only.
- `config` must validate against a per-kind schema.

## Primitive Configs

The actual config is a discriminated union.

```ts
export type PrimitiveConfig =
  | NodeConfig
  | BeamConfig
  | FrameConfig
  | WheelConfig
  | TrackConfig
  | MotorConfig
  | GearConfig
  | GearboxConfig
  | PistonConfig
  | WinchConfig
  | BoomConfig
  | BucketConfig
  | RailSegmentConfig
  | ConveyorConfig
  | PipeConfig
  | PumpConfig
  | HopperConfig
  | MaterialPileConfig
  | CargoBlockConfig
  | SensorLiteConfig;
```

Representative examples:

```ts
export interface MotorConfig {
  x: number;
  y: number;
  rpm: number;
  torque: number;
  reversible: boolean;
  powerState: boolean;
}

export interface GearConfig {
  x: number;
  y: number;
  teeth: number;
  input: boolean;
  rpm?: number;
  color: string;
}

export interface ConveyorConfig {
  path: Array<{ x: number; y: number }>;
  speed: number;
  direction: 'forward' | 'reverse';
  acceptsMaterialTypes: MaterialType[];
}

export interface HopperConfig {
  x: number;
  y: number;
  capacity: number;
  releaseRate: number;
  materialType: MaterialType;
}

export interface RailSegmentConfig {
  points: Array<{ x: number; y: number }>;
  segmentType: 'straight' | 'curve';
}
```

Rules:

- All values must be clamped by the validator.
- Reference-like config fields must point to existing primitive IDs.
- Unknown fields must be rejected.

## Material Types

```ts
export type MaterialType =
  | 'soil'
  | 'sand'
  | 'gravel'
  | 'ore'
  | 'steel-block'
  | 'cargo'
  | 'slurry'
  | 'concrete-lite';
```

Rules:

- `concrete-lite` and `slurry` are symbolic materials, not real process simulations.

## Behavior Recipes

The engine should prefer named recipes over open-ended logic.

```ts
export type BehaviorRecipeKind =
  | 'gear-mesh'
  | 'shaft-drive'
  | 'belt-drive'
  | 'chain-drive'
  | 'tracked-drive-lite'
  | 'wheel-drive-lite'
  | 'winch-hoist'
  | 'piston-extend'
  | 'bucket-scoop-lite'
  | 'bucket-dump-lite'
  | 'rail-follow'
  | 'rail-switch-route'
  | 'wagon-couple'
  | 'conveyor-carry'
  | 'hopper-feed'
  | 'pump-transfer'
  | 'valve-gate'
  | 'generator-power-bus'
  | 'sensor-trigger'
  | 'throughput-score';

export interface BehaviorRecipe {
  id: string;
  kind: BehaviorRecipeKind;
  targets: string[];
  params?: Record<string, string | number | boolean>;
}
```

Rules:

- Recipes may only use whitelisted params.
- Recipes own the complex math and machine logic.
- The AI should compose recipes, not invent new simulation engines.

## Blueprints

Blueprints are reusable machine modules.

Examples:

- tracked chassis
- crane arm
- conveyor section
- hopper feeder
- powered axle
- pump station

```ts
export type BlueprintCategory =
  | 'chassis'
  | 'drivetrain'
  | 'tool-head'
  | 'transport'
  | 'flow-system'
  | 'control-panel'
  | 'structure';

export interface MachineBlueprint {
  blueprintId: string;
  category: BlueprintCategory;
  title: string;
  summary: string;
  tags: string[];
  ports: BlueprintPort[];
  fragment: BlueprintFragment;
}

export interface BlueprintPort {
  portId: string;
  kind: 'power-in' | 'power-out' | 'mount' | 'material-in' | 'material-out' | 'control-in';
  label: string;
  compatibleWith: string[];
}

export interface BlueprintFragment {
  primitives: PrimitiveInstance[];
  behaviors: BehaviorRecipe[];
  controls: ControlSpec[];
  hud: HudWidgetSpec[];
}
```

Rules:

- Blueprints must be self-contained fragments.
- Blueprint IDs are global and stable.
- Ports are how modules connect without the model inventing ad hoc coupling logic.

## Assemblies

Assemblies are how an experiment groups primitives into named machine systems.

```ts
export interface AssemblyInstance {
  assemblyId: string;
  label: string;
  role:
    | 'machine-base'
    | 'tool-head'
    | 'drivetrain'
    | 'transport-line'
    | 'processing-line'
    | 'support-structure'
    | 'control-bank';
  source:
    | { type: 'inline'; primitiveIds: string[] }
    | { type: 'blueprint'; blueprintId: string };
  mountedToAssemblyId?: string;
  portBindings?: PortBinding[];
}

export interface PortBinding {
  fromAssemblyId: string;
  fromPortId: string;
  toAssemblyId: string;
  toPortId: string;
}
```

Why this exists:

- Mason should be able to save a crane arm separately from a chassis.
- The AI should be able to say "mount the saved bucket arm onto the tracked base."
- The validator should understand legal module connections.

## Controls

```ts
export type ControlKind = 'slider' | 'toggle' | 'button' | 'select';

export interface ControlSpec {
  id: string;
  kind: ControlKind;
  label: string;
  description?: string;
  bind?: BindingSpec;
  options?: SelectOption[];
  defaultValue?: string | number | boolean;
  min?: number;
  max?: number;
  step?: number;
  action?: ButtonAction;
}

export interface BindingSpec {
  targetId: string;
  path: string;
  transform?: 'identity' | 'percent-to-decimal' | 'negate';
}

export interface SelectOption {
  label: string;
  value: string;
}

export type ButtonAction =
  | 'reset'
  | 'spawn'
  | 'route-switch'
  | 'dump'
  | 'scoop'
  | 'pause';
```

Rules:

- Controls must be renderable without custom UI code.
- `path` must point to a whitelisted mutable field.
- Buttons may only call allowed engine actions.

## HUD

```ts
export type HudWidgetKind =
  | 'label'
  | 'readout'
  | 'gauge'
  | 'warning-zone'
  | 'mini-graph'
  | 'challenge-card';

export interface HudWidgetSpec {
  id: string;
  kind: HudWidgetKind;
  label?: string;
  source?: MetricSource;
  position: HudPosition;
  units?: string;
  format?: 'integer' | 'decimal-1' | 'decimal-2' | 'percent';
}

export type HudPosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'bottom-center';

export interface MetricSource {
  type:
    | 'rpm'
    | 'gear-ratio'
    | 'lifted-load'
    | 'hopper-fill'
    | 'material-count'
    | 'throughput'
    | 'route-state'
    | 'pump-flow'
    | 'travel-distance'
    | 'score'
    | 'timer';
  targetId?: string;
}
```

Rules:

- HUD widgets must never require AI-authored HTML.
- Metrics must come from the engine's metric registry.

## Goals

```ts
export type GoalKind =
  | 'move-load'
  | 'lift-load'
  | 'fill-wagon'
  | 'deliver-material'
  | 'route-correctly'
  | 'maintain-throughput'
  | 'complete-site-job';

export interface GoalSpec {
  id: string;
  kind: GoalKind;
  label: string;
  successMessage: string;
  params: Record<string, string | number | boolean>;
}
```

Examples:

- move 8 gravel blocks into the hopper
- route the wagon to bay B
- lift the steel block onto the frame
- pump 100 units of slurry into the tank

## Explanation Block

```ts
export interface ExplanationSpec {
  whatIsHappening: string;
  whatToTryNext: string[];
  vocabulary: VocabularyItem[];
  safetyNotes?: string[];
}

export interface VocabularyItem {
  term: string;
  kidFriendlyMeaning: string;
}
```

Rules:

- `whatIsHappening` must explain the machine honestly.
- `whatToTryNext` should suggest real combo-building ideas.
- `vocabulary` should name concepts like torque, hopper, coupler, traction, or throughput.

## Validation Profile

```ts
export interface ValidationProfile {
  engineMode: 'production' | 'guided' | 'experimental';
  schemaPassed: boolean;
  referenceChecksPassed: boolean;
  runtimeSmokePassed: boolean;
  fpsBudgetPassed: boolean;
  bannedApiScanPassed: boolean;
  portBindingsPassed: boolean;
  warnings: string[];
}
```

Rules:

- Mason-facing saves require all checks to pass.
- Port and blueprint binding errors must fail validation.

## Save Hints

```ts
export interface SaveHints {
  thumbnailFocus?: string;
  starterControlPreset?: Record<string, string | number | boolean>;
  notebookPrompt?: string;
  saveMode?: 'experiment-only' | 'experiment-and-blueprints' | 'blueprints-only';
}
```

## Saved Record Shapes

```ts
export interface SavedExperimentRecord {
  recordId: string;
  experiment: ExperimentManifest;
  thumbnailUrl?: string;
  labEntry: LabEntry;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface SavedBlueprintRecord {
  recordId: string;
  blueprint: MachineBlueprint;
  thumbnailUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LabEntry {
  whatBuilt?: string;
  whatLearned?: string;
  whatToChangeNext?: string;
  difficulty?: 'easy' | 'medium' | 'hard' | 'boss';
  favorite?: boolean;
}
```

## AI Output Contracts

For creation:

```ts
export interface GenerateExperimentResult {
  intent: {
    family: ExperimentFamily;
    title: string;
    confidence: number;
    suggestedRecipeId?: string;
  };
  experiment: ExperimentManifest;
}
```

For edits:

```ts
export interface EditExperimentResult {
  summary: string;
  experiment: ExperimentManifest;
  changedIds: string[];
  preservedIds: string[];
  createdBlueprintIds?: string[];
}
```

For blueprint extraction:

```ts
export interface ExtractBlueprintResult {
  summary: string;
  blueprint: MachineBlueprint;
  sourceAssemblyId: string;
}
```

## Identity Preservation Rules

When the AI edits an experiment:

1. Unchanged primitives keep the same `id`.
2. Unchanged assemblies keep the same `assemblyId`.
3. Unchanged blueprints keep the same `blueprintId`.
4. Renames do not change IDs.
5. Only deleted objects lose their IDs.
6. New objects get new IDs.

This is critical for:

- repeatable edits
- reusable modules
- reliable thumbnails
- meaningful eval metrics

## Forbidden Fields And Behaviors

The validator must reject any manifest containing:

- inline script source
- HTML strings
- CSS strings
- external fetch instructions
- unknown primitive kinds
- unknown recipe kinds
- controls bound to forbidden paths
- ports with unknown compatibility classes
- references to missing IDs
- duplicate IDs

## Versioning Rules

1. `schemaVersion` is required on every manifest.
2. Patch versions are validator-only or additive clarifications.
3. Minor versions may add optional fields.
4. Major versions may change field meaning and require migrations.
5. Saved records keep their original schema version forever.

## Product Stance

The schema should feel small and strict.

That is a feature.

A schema that is too flexible becomes a disguised code editor.
A schema that is too narrow becomes boring.

The sweet spot is:

- rich machine recipes
- narrow primitives
- strong behaviors
- stable IDs
- reusable blueprints
- honest explanations
