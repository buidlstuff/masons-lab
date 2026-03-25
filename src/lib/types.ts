export type SchemaVersion = '1.0.0';

export type ExperimentFamily =
  | 'structures'
  | 'earthworks'
  | 'lifting'
  | 'transport'
  | 'power-and-drivetrain'
  | 'flow-and-processing'
  | 'machine-combos';

export type ExperimentStatus = 'draft' | 'validated' | 'saved' | 'golden' | 'archived';

export type Difficulty = 'easy' | 'medium' | 'hard' | 'boss';

export type PrimitiveKind =
  | 'node'
  | 'beam'
  | 'wheel'
  | 'axle'
  | 'motor'
  | 'gear'
  | 'winch'
  | 'rope'
  | 'hook'
  | 'rail-segment'
  | 'rail-switch'
  | 'locomotive'
  | 'wagon'
  | 'conveyor'
  | 'hopper'
  | 'cargo-block'
  | 'material-pile';

export type BehaviorRecipeKind =
  | 'gear-mesh'
  | 'winch-hoist'
  | 'rail-follow'
  | 'rail-switch-route'
  | 'conveyor-carry'
  | 'hopper-feed';

export type ControlKind = 'slider' | 'toggle' | 'button';

export type GoalKind = 'fill-hopper' | 'gear-down' | 'deliver-wagon';

export type BlueprintCategory =
  | 'chassis'
  | 'drivetrain'
  | 'tool-head'
  | 'transport'
  | 'flow-system'
  | 'control-panel'
  | 'structure';

export interface StageSpec {
  width: 960 | 1280 | 1440;
  height: 540 | 720 | 900;
  background: 'lab-dark' | 'yard-blueprint' | 'machine-bay';
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

export interface WorldConfig {
  stage: StageSpec;
  camera: CameraSpec;
  timeline: TimelineSpec;
  randomSeed: number;
}

export interface ExperimentMetadata {
  title: string;
  subtitle?: string;
  shortDescription: string;
  teachingGoal: string;
  difficulty: Difficulty;
  tags: string[];
  starter: boolean;
  featured?: boolean;
  recipeId?: string;
  thumbnailPreset: string;
  remixOfExperimentId?: string;
  createdBy: {
    source: 'human' | 'ai';
    modelFamily?: string;
    modelId?: string;
    promptHash?: string;
    generatedAt?: string;
  };
}

export interface NodeConfig {
  x: number;
  y: number;
}

export interface BeamConfig {
  fromNodeId: string;
  toNodeId: string;
  stiffness: number;
}

export interface WheelConfig {
  x: number;
  y: number;
  radius: number;
  traction: number;
}

export interface AxleConfig {
  x: number;
  y: number;
}

export interface MotorConfig {
  x: number;
  y: number;
  rpm: number;
  torque: number;
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

export interface WinchConfig {
  x: number;
  y: number;
  speed: number;
  ropeLength: number;
}

export interface RopeConfig {
  fromId: string;
  toId: string;
  length: number;
}

export interface HookConfig {
  x: number;
  y: number;
}

export interface RailSegmentConfig {
  points: Array<{ x: number; y: number }>;
  segmentType: 'straight' | 'curve';
}

export interface RailSwitchConfig {
  x: number;
  y: number;
  branch: 'left' | 'right';
}

export interface LocomotiveConfig {
  trackId: string;
  progress: number;
  speed: number;
}

export interface WagonConfig {
  trackId: string;
  offset: number;
  capacity: number;
}

export interface ConveyorConfig {
  path: Array<{ x: number; y: number }>;
  speed: number;
  direction: 'forward' | 'reverse';
}

export interface HopperConfig {
  x: number;
  y: number;
  capacity: number;
  releaseRate: number;
  fill: number;
}

export interface CargoBlockConfig {
  x: number;
  y: number;
  weight: number;
  attachedToId?: string;
}

export interface MaterialPileConfig {
  x: number;
  y: number;
  quantity: number;
}

export type PrimitiveConfig =
  | NodeConfig
  | BeamConfig
  | WheelConfig
  | AxleConfig
  | MotorConfig
  | GearConfig
  | WinchConfig
  | RopeConfig
  | HookConfig
  | RailSegmentConfig
  | RailSwitchConfig
  | LocomotiveConfig
  | WagonConfig
  | ConveyorConfig
  | HopperConfig
  | CargoBlockConfig
  | MaterialPileConfig;

export interface PrimitiveInstance {
  id: string;
  kind: PrimitiveKind;
  label?: string;
  config: PrimitiveConfig;
  locked?: boolean;
}

export interface BehaviorRecipe {
  id: string;
  kind: BehaviorRecipeKind;
  targets: string[];
  params?: Record<string, string | number | boolean>;
}

export interface BindingSpec {
  targetId: string;
  path: string;
}

export interface ControlSpec {
  id: string;
  kind: ControlKind;
  label: string;
  description?: string;
  bind?: BindingSpec;
  defaultValue?: string | number | boolean;
  min?: number;
  max?: number;
  step?: number;
  action?: 'reset' | 'spawn' | 'route-switch' | 'pause';
}

export interface HudWidgetSpec {
  id: string;
  kind: 'readout' | 'label' | 'challenge-card';
  label: string;
  metric?:
    | 'input-rpm'
    | 'output-rpm'
    | 'gear-ratio'
    | 'hopper-fill'
    | 'throughput'
    | 'train-speed'
    | 'hook-height';
  units?: string;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

export interface GoalSpec {
  id: string;
  kind: GoalKind;
  label: string;
  successMessage: string;
  params: Record<string, string | number | boolean>;
}

export interface MachineBlueprint {
  blueprintId: string;
  category: BlueprintCategory;
  title: string;
  summary: string;
  tags: string[];
  ports: Array<{
    portId: string;
    kind: 'power-in' | 'power-out' | 'mount' | 'material-in' | 'material-out';
    label: string;
    compatibleWith: string[];
  }>;
  fragment: {
    primitives: PrimitiveInstance[];
    behaviors: BehaviorRecipe[];
    controls: ControlSpec[];
    hud: HudWidgetSpec[];
  };
}

export interface AssemblyInstance {
  assemblyId: string;
  label: string;
  role:
    | 'machine-base'
    | 'tool-head'
    | 'drivetrain'
    | 'transport-line'
    | 'support-structure';
  source:
    | { type: 'inline'; primitiveIds: string[] }
    | { type: 'blueprint'; blueprintId: string };
}

export interface ExplanationSpec {
  whatIsHappening: string;
  whatToTryNext: string[];
  vocabulary: Array<{ term: string; kidFriendlyMeaning: string }>;
  safetyNotes?: string[];
}

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

export interface SaveHints {
  thumbnailFocus?: string;
  starterControlPreset?: Record<string, string | number | boolean>;
  notebookPrompt?: string;
  saveMode?: 'experiment-only' | 'experiment-and-blueprints' | 'blueprints-only';
}

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

export interface SavedExperimentRecord {
  recordId: string;
  experiment: ExperimentManifest;
  thumbnailUrl?: string;
  labEntry: {
    whatBuilt?: string;
    whatLearned?: string;
    whatToChangeNext?: string;
    difficulty?: Difficulty;
    favorite?: boolean;
  };
  featured?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SavedBlueprintRecord {
  recordId: string;
  blueprint: MachineBlueprint;
  thumbnailUrl?: string;
  starter?: boolean;
  favorite?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SiteJobDefinition {
  jobId: string;
  tier: 1 | 2 | 3 | 4;
  title: string;
  summary: string;
  teachingGoal: string;
  startingRecipeIds: string[];
  recommendedMachineIds: string[];
  recommendedBlueprintIds?: string[];
  allowedFamilies?: ExperimentFamily[];
  goalType: GoalKind;
  hints: string[];
  objective: string;
  playable?: boolean;
}

export interface JobProgressRecord {
  id: string;
  jobId: string;
  completed: boolean;
  lastPlayedAt?: string;
}

export interface DraftRecord {
  draftId: string;
  sourceMachineId?: string;
  sourceBlueprintId?: string;
  manifest: ExperimentManifest;
  updatedAt: string;
}

export interface SettingRecord {
  key: string;
  value: string;
}

export interface GenerateExperimentResult {
  intent: {
    family: ExperimentFamily;
    title: string;
    confidence: number;
    suggestedRecipeId?: string;
  };
  experiment: ExperimentManifest;
}

export interface EditExperimentResult {
  summary: string;
  experiment: ExperimentManifest;
  changedIds: string[];
  preservedIds: string[];
}

export interface ExplainExperimentResult {
  explanation: ExplanationSpec;
}

export interface BuildTelemetry {
  inputRpm?: number;
  outputRpm?: number;
  gearRatio?: number;
  hopperFill?: number;
  throughput?: number;
  trainSpeed?: number;
  hookHeight?: number;
  loadPlaced?: boolean;
  wagonDelivered?: boolean;
}

export const SLICE_PARTS: PrimitiveKind[] = [
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
  'conveyor',
  'hopper',
];
