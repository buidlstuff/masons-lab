import { nanoid } from 'nanoid';
import { mountBlueprintToManifest } from './blueprints';
import type {
  DraftRecord,
  ExperimentManifest,
  MachineBlueprint,
  SavedBlueprintRecord,
  SavedExperimentRecord,
  SiteJobDefinition,
} from './types';

function baseWorld() {
  return {
    stage: {
      width: 1280 as const,
      height: 720 as const,
      background: 'lab-dark' as const,
      grid: 'engineering' as const,
      boundaryMode: 'contain' as const,
    },
    camera: {
      mode: 'fixed' as const,
      zoom: 1,
      minZoom: 0.75,
      maxZoom: 1.5,
      panX: 0,
      panY: 0,
    },
    timeline: {
      paused: false,
      timeScale: 1,
      allowPause: true,
      allowStep: false,
      allowReset: true,
    },
    randomSeed: 42,
  };
}

function baseManifest(partial: Partial<ExperimentManifest>): ExperimentManifest {
  return {
    schemaVersion: '1.0.0',
    experimentId: nanoid(),
    slug: 'draft-machine',
    family: 'power-and-drivetrain',
    status: 'validated',
    metadata: {
      title: 'Untitled Machine',
      shortDescription: 'A machine waiting for its first test.',
      teachingGoal: 'Explore how machine parts work together.',
      difficulty: 'easy',
      tags: [],
      starter: false,
      thumbnailPreset: 'machine-card',
      createdBy: { source: 'human' },
    },
    world: baseWorld(),
    primitives: [],
    behaviors: [],
    controls: [],
    hud: [],
    goals: [],
    blueprints: [],
    assemblies: [],
    explanation: {
      whatIsHappening: 'This machine is still being assembled.',
      whatToTryNext: ['Add a power source.', 'Give it a clear job.'],
      vocabulary: [],
    },
    validation: {
      engineMode: 'production',
      schemaPassed: true,
      referenceChecksPassed: true,
      runtimeSmokePassed: true,
      fpsBudgetPassed: true,
      bannedApiScanPassed: true,
      portBindingsPassed: true,
      warnings: [],
    },
    saveHints: {
      saveMode: 'experiment-only',
    },
    ...partial,
  };
}

function baseBlueprint(partial: MachineBlueprint): MachineBlueprint {
  return {
    blueprintId: partial.blueprintId,
    category: partial.category,
    title: partial.title,
    summary: partial.summary,
    tags: partial.tags,
    ports: partial.ports,
    fragment: {
      primitives: partial.fragment.primitives,
      behaviors: partial.fragment.behaviors,
      controls: partial.fragment.controls,
      hud: partial.fragment.hud,
    },
  };
}

export function createEmptyManifest(): ExperimentManifest {
  return baseManifest({
    slug: 'yard-draft',
    family: 'machine-combos',
    status: 'draft',
    metadata: {
      title: 'New Yard Draft',
      subtitle: 'Start with parts or ask the assistant to build one machine',
      shortDescription: 'An empty yard draft ready for machines, modules, and ideas.',
      teachingGoal: 'Start from a blank construction bay and assemble a machine one part at a time.',
      difficulty: 'easy',
      tags: ['draft', 'yard'],
      starter: false,
      thumbnailPreset: 'yard-draft',
      createdBy: { source: 'human' },
    },
    explanation: {
      whatIsHappening: 'The yard is empty until you place parts or load a blueprint.',
      whatToTryNext: ['Place a motor and a gear.', 'Load a starter blueprint.', 'Ask the assistant to build a featured machine.'],
      vocabulary: [{ term: 'draft', kidFriendlyMeaning: 'A machine that is still being built.' }],
    },
  });
}

function gearTrainManifest(): ExperimentManifest {
  return baseManifest({
    slug: 'gear-ratio-lab',
    family: 'power-and-drivetrain',
    metadata: {
      title: 'Gear Ratio Lab',
      subtitle: 'Speed vs force',
      shortDescription: 'Spin gears and watch output speed change.',
      teachingGoal: 'Bigger output gears trade speed for force.',
      difficulty: 'easy',
      tags: ['featured', 'gears', 'rpm'],
      starter: true,
      featured: true,
      recipeId: 'gear-train-lab',
      thumbnailPreset: 'gear-closeup',
      createdBy: { source: 'human' },
    },
    primitives: [
      { id: 'motor-1', kind: 'motor', label: 'Input Motor', config: { x: 240, y: 360, rpm: 60, torque: 1.5, powerState: true } },
      { id: 'gear-1', kind: 'gear', label: 'Driver Gear', config: { x: 420, y: 360, teeth: 20, input: true, rpm: 60, color: '#47c5a5' } },
      { id: 'gear-2', kind: 'gear', label: 'Driven Gear', config: { x: 580, y: 360, teeth: 40, input: false, color: '#fec84b' } },
      { id: 'gear-3', kind: 'gear', label: 'Output Gear', config: { x: 740, y: 360, teeth: 20, input: false, color: '#ef7b45' } },
    ],
    behaviors: [
      { id: 'mesh-1', kind: 'gear-mesh', targets: ['gear-1', 'gear-2'] },
      { id: 'mesh-2', kind: 'gear-mesh', targets: ['gear-2', 'gear-3'] },
    ],
    controls: [
      { id: 'input-rpm', kind: 'slider', label: 'Input RPM', description: 'How fast the motor spins.', bind: { targetId: 'motor-1', path: 'rpm' }, defaultValue: 60, min: 10, max: 180, step: 5 },
      { id: 'gear-2-teeth', kind: 'slider', label: 'Middle Gear Teeth', description: 'More teeth slows it down.', bind: { targetId: 'gear-2', path: 'teeth' }, defaultValue: 40, min: 20, max: 80, step: 5 },
    ],
    hud: [
      { id: 'input-rpm', kind: 'readout', label: 'Input Speed', metric: 'input-rpm', units: 'RPM', position: 'top-right' },
      { id: 'output-rpm', kind: 'readout', label: 'Output Speed', metric: 'output-rpm', units: 'RPM', position: 'top-right' },
      { id: 'ratio', kind: 'readout', label: 'Gear Ratio', metric: 'gear-ratio', position: 'top-right' },
    ],
    goals: [
      { id: 'gear-down', kind: 'gear-down', label: 'Gear the motor down', successMessage: 'You slowed the output and boosted the torque tradeoff.', params: { maxOutputRpm: 45 } },
    ],
    explanation: {
      whatIsHappening: 'Each gear changes how fast the next one turns. Bigger gears usually spin slower but push harder.',
      whatToTryNext: ['Make the middle gear bigger.', 'Try a smaller output gear.', 'See how the ratio changes.'],
      vocabulary: [{ term: 'gear ratio', kidFriendlyMeaning: 'How much one gear changes the speed of another.' }],
    },
  });
}

function conveyorLoaderManifest(): ExperimentManifest {
  return baseManifest({
    slug: 'conveyor-loader',
    family: 'transport',
    metadata: {
      title: 'Conveyor Loader',
      subtitle: 'Move gravel into the hopper',
      shortDescription: 'Feed cargo into the hopper with a conveyor.',
      teachingGoal: 'Throughput depends on speed and release rate working together.',
      difficulty: 'easy',
      tags: ['featured', 'conveyor', 'hopper'],
      starter: true,
      featured: true,
      recipeId: 'conveyor-loader',
      thumbnailPreset: 'conveyor-line',
      createdBy: { source: 'human' },
    },
    primitives: [
      { id: 'pile-1', kind: 'material-pile', label: 'Gravel Pile', config: { x: 180, y: 460, quantity: 20 } },
      { id: 'conv-1', kind: 'conveyor', label: 'Main Conveyor', config: { path: [{ x: 260, y: 460 }, { x: 760, y: 460 }], speed: 55, direction: 'forward' } },
      { id: 'hopper-1', kind: 'hopper', label: 'Main Hopper', config: { x: 860, y: 420, capacity: 20, releaseRate: 1.5, fill: 0 } },
      { id: 'cargo-1', kind: 'cargo-block', label: 'Cargo A', config: { x: 290, y: 460, weight: 1 } },
      { id: 'cargo-2', kind: 'cargo-block', label: 'Cargo B', config: { x: 330, y: 460, weight: 1 } },
      { id: 'cargo-3', kind: 'cargo-block', label: 'Cargo C', config: { x: 370, y: 460, weight: 1 } },
    ],
    behaviors: [
      { id: 'carry-1', kind: 'conveyor-carry', targets: ['conv-1', 'cargo-1', 'cargo-2', 'cargo-3'] },
      { id: 'feed-1', kind: 'hopper-feed', targets: ['conv-1', 'hopper-1'] },
    ],
    controls: [
      { id: 'conv-speed', kind: 'slider', label: 'Conveyor Speed', description: 'Faster belts move more cargo.', bind: { targetId: 'conv-1', path: 'speed' }, defaultValue: 55, min: 20, max: 120, step: 5 },
      { id: 'hopper-rate', kind: 'slider', label: 'Hopper Release', description: 'How fast the hopper accepts material.', bind: { targetId: 'hopper-1', path: 'releaseRate' }, defaultValue: 1.5, min: 0.5, max: 4, step: 0.5 },
    ],
    hud: [
      { id: 'fill', kind: 'readout', label: 'Hopper Fill', metric: 'hopper-fill', units: 'blocks', position: 'top-right' },
      { id: 'throughput', kind: 'readout', label: 'Throughput', metric: 'throughput', units: '/min', position: 'top-right' },
    ],
    goals: [
      { id: 'fill-goal', kind: 'fill-hopper', label: 'Load the hopper', successMessage: 'You loaded enough gravel for the next machine.', params: { targetFill: 8 } },
    ],
    explanation: {
      whatIsHappening: 'The conveyor moves cargo along a path and the hopper counts what makes it to the end.',
      whatToTryNext: ['Speed up the belt.', 'Try slower release for control.', 'Add another conveyor segment in the builder.'],
      vocabulary: [{ term: 'throughput', kidFriendlyMeaning: 'How much stuff moves through a machine over time.' }],
    },
  });
}

function winchCraneManifest(): ExperimentManifest {
  return baseManifest({
    slug: 'winch-crane',
    family: 'lifting',
    metadata: {
      title: 'Winch Crane',
      subtitle: 'Lift and place a steel block',
      shortDescription: 'Raise a hanging load and place it on the platform.',
      teachingGoal: 'Hoisting systems trade speed for control.',
      difficulty: 'medium',
      tags: ['featured', 'winch', 'crane'],
      starter: true,
      featured: true,
      recipeId: 'winch-crane',
      thumbnailPreset: 'hook-lift',
      createdBy: { source: 'human' },
    },
    primitives: [
      { id: 'node-a', kind: 'node', label: 'Tower Base', config: { x: 300, y: 180 } },
      { id: 'node-b', kind: 'node', label: 'Boom Tip', config: { x: 720, y: 180 } },
      { id: 'beam-1', kind: 'beam', label: 'Boom Beam', config: { fromNodeId: 'node-a', toNodeId: 'node-b', stiffness: 0.9 } },
      { id: 'winch-1', kind: 'winch', label: 'Main Winch', config: { x: 320, y: 180, speed: 42, ropeLength: 230 } },
      { id: 'hook-1', kind: 'hook', label: 'Crane Hook', config: { x: 720, y: 410 } },
      { id: 'rope-1', kind: 'rope', label: 'Hoist Line', config: { fromId: 'winch-1', toId: 'hook-1', length: 230 } },
      { id: 'cargo-1', kind: 'cargo-block', label: 'Steel Block', config: { x: 720, y: 445, weight: 2, attachedToId: 'hook-1' } },
    ],
    behaviors: [{ id: 'hoist-1', kind: 'winch-hoist', targets: ['winch-1', 'hook-1', 'cargo-1'] }],
    controls: [
      { id: 'winch-speed', kind: 'slider', label: 'Winch Speed', description: 'How quickly the line moves.', bind: { targetId: 'winch-1', path: 'speed' }, defaultValue: 42, min: 10, max: 80, step: 2 },
      { id: 'rope-length', kind: 'slider', label: 'Hook Height', description: 'Raise or lower the hanging load.', bind: { targetId: 'winch-1', path: 'ropeLength' }, defaultValue: 230, min: 80, max: 300, step: 5 },
    ],
    hud: [{ id: 'hook-height', kind: 'readout', label: 'Hook Height', metric: 'hook-height', units: 'px', position: 'top-right' }],
    goals: [],
    explanation: {
      whatIsHappening: 'The winch reels the rope in and out, changing the height of the load hanging from the hook.',
      whatToTryNext: ['Lower the rope slowly.', 'Try moving the boom nodes in build mode.', 'Add another beam for support.'],
      vocabulary: [{ term: 'winch', kidFriendlyMeaning: 'A machine that winds up a rope to lift or pull something.' }],
    },
  });
}

function railCartLoopManifest(): ExperimentManifest {
  return baseManifest({
    slug: 'rail-cart-loop',
    family: 'transport',
    metadata: {
      title: 'Rail Cart Loop',
      subtitle: 'Route the wagon to the right bay',
      shortDescription: 'Use the switch to send the wagon to the delivery bay.',
      teachingGoal: 'Routing systems depend on timing and path selection.',
      difficulty: 'medium',
      tags: ['featured', 'rail', 'wagon'],
      starter: true,
      featured: true,
      recipeId: 'rail-cart-loop',
      thumbnailPreset: 'rail-loop',
      createdBy: { source: 'human' },
    },
    primitives: [
      { id: 'track-main', kind: 'rail-segment', label: 'Main Line', config: { points: [{ x: 220, y: 430 }, { x: 520, y: 430 }, { x: 740, y: 430 }], segmentType: 'straight' } },
      { id: 'track-branch', kind: 'rail-segment', label: 'Branch Line', config: { points: [{ x: 520, y: 430 }, { x: 700, y: 330 }, { x: 900, y: 330 }], segmentType: 'curve' } },
      { id: 'switch-1', kind: 'rail-switch', label: 'Main Switch', config: { x: 520, y: 430, branch: 'right' } },
      { id: 'loco-1', kind: 'locomotive', label: 'Site Engine', config: { trackId: 'track-main', progress: 0.02, speed: 0.18 } },
      { id: 'wagon-1', kind: 'wagon', label: 'Cargo Wagon', config: { trackId: 'track-main', offset: -0.08, capacity: 6 } },
    ],
    behaviors: [
      { id: 'follow-1', kind: 'rail-follow', targets: ['track-main', 'loco-1', 'wagon-1'] },
      { id: 'route-1', kind: 'rail-switch-route', targets: ['switch-1', 'track-main', 'track-branch', 'loco-1', 'wagon-1'] },
    ],
    controls: [
      { id: 'train-speed', kind: 'slider', label: 'Train Speed', description: 'How fast the locomotive rolls.', bind: { targetId: 'loco-1', path: 'speed' }, defaultValue: 0.18, min: 0.05, max: 0.4, step: 0.01 },
      { id: 'route-toggle', kind: 'toggle', label: 'Send to Bay B', description: 'Toggle the branch switch.', bind: { targetId: 'switch-1', path: 'branch' }, defaultValue: true },
    ],
    hud: [{ id: 'train-speed-hud', kind: 'readout', label: 'Train Speed', metric: 'train-speed', units: 'm/s', position: 'top-right' }],
    goals: [
      { id: 'deliver-goal', kind: 'deliver-wagon', label: 'Deliver the wagon', successMessage: 'The wagon reached the correct bay.', params: { targetBay: 'B' } },
    ],
    explanation: {
      whatIsHappening: 'The switch changes which path the locomotive follows, and the wagon trails behind it on the same route.',
      whatToTryNext: ['Slow the train for tighter routing.', 'Try the other branch.', 'Add another rail segment in build mode.'],
      vocabulary: [{ term: 'switch', kidFriendlyMeaning: 'A track part that sends a train one way or another.' }],
    },
  });
}

export function getFeaturedMachines(): SavedExperimentRecord[] {
  const now = new Date().toISOString();
  return [gearTrainManifest(), conveyorLoaderManifest(), winchCraneManifest(), railCartLoopManifest()].map((experiment) => ({
    recordId: experiment.experimentId,
    experiment,
    featured: true,
    createdAt: now,
    updatedAt: now,
    labEntry: {
      whatBuilt: experiment.metadata.shortDescription,
      whatLearned: experiment.metadata.teachingGoal,
      difficulty: experiment.metadata.difficulty,
    },
  }));
}

export function getStarterBlueprints(): SavedBlueprintRecord[] {
  const now = new Date().toISOString();

  const blueprints: MachineBlueprint[] = [
    baseBlueprint({
      blueprintId: 'tracked-chassis-mk1',
      category: 'chassis',
      title: 'Tracked Chassis Mk1',
      summary: 'A low, stable chassis core for loaders, cranes, and yard haulers.',
      tags: ['starter', 'chassis', 'mobile'],
      ports: [
        { portId: 'mount-main', kind: 'mount', label: 'Top Mount', compatibleWith: ['mount'] },
        { portId: 'power-in', kind: 'power-in', label: 'Drive Input', compatibleWith: ['power-out', 'mount'] },
      ],
      fragment: {
        primitives: [
          { id: 'node-front', kind: 'node', label: 'Front Support', config: { x: 260, y: 360 } },
          { id: 'node-rear', kind: 'node', label: 'Rear Support', config: { x: 420, y: 360 } },
          { id: 'beam-main', kind: 'beam', label: 'Chassis Rail', config: { fromNodeId: 'node-front', toNodeId: 'node-rear', stiffness: 0.9 } },
          { id: 'wheel-left', kind: 'wheel', label: 'Drive Wheel', config: { x: 285, y: 400, radius: 30, traction: 0.95 } },
          { id: 'wheel-right', kind: 'wheel', label: 'Support Wheel', config: { x: 395, y: 400, radius: 30, traction: 0.95 } },
          { id: 'motor-core', kind: 'motor', label: 'Drive Core', config: { x: 340, y: 340, rpm: 50, torque: 1.4, powerState: true } },
        ],
        behaviors: [],
        controls: [],
        hud: [],
      },
    }),
    baseBlueprint({
      blueprintId: 'wheeled-chassis-mk1',
      category: 'chassis',
      title: 'Wheeled Chassis Mk1',
      summary: 'Four-wheel carrier for forklifts, carts, and light-duty site machines.',
      tags: ['starter', 'chassis', 'wheels'],
      ports: [
        { portId: 'mount-main', kind: 'mount', label: 'Top Mount', compatibleWith: ['mount'] },
        { portId: 'power-in', kind: 'power-in', label: 'Drive Input', compatibleWith: ['power-out', 'mount'] },
      ],
      fragment: {
        primitives: [
          { id: 'node-left', kind: 'node', label: 'Left Frame', config: { x: 260, y: 340 } },
          { id: 'node-right', kind: 'node', label: 'Right Frame', config: { x: 460, y: 340 } },
          { id: 'beam-main', kind: 'beam', label: 'Frame Beam', config: { fromNodeId: 'node-left', toNodeId: 'node-right', stiffness: 0.85 } },
          { id: 'wheel-1', kind: 'wheel', label: 'Wheel 1', config: { x: 280, y: 395, radius: 24, traction: 0.88 } },
          { id: 'wheel-2', kind: 'wheel', label: 'Wheel 2', config: { x: 340, y: 395, radius: 24, traction: 0.88 } },
          { id: 'wheel-3', kind: 'wheel', label: 'Wheel 3', config: { x: 400, y: 395, radius: 24, traction: 0.88 } },
          { id: 'wheel-4', kind: 'wheel', label: 'Wheel 4', config: { x: 460, y: 395, radius: 24, traction: 0.88 } },
        ],
        behaviors: [],
        controls: [],
        hud: [],
      },
    }),
    baseBlueprint({
      blueprintId: 'rail-cart-mk1',
      category: 'transport',
      title: 'Rail Cart Mk1',
      summary: 'A starter wagon module for loading lines and delivery loops.',
      tags: ['starter', 'rail', 'transport'],
      ports: [
        { portId: 'mount-main', kind: 'mount', label: 'Rail Mount', compatibleWith: ['mount'] },
        { portId: 'material-in', kind: 'material-in', label: 'Load In', compatibleWith: ['material-out', 'mount'] },
        { portId: 'material-out', kind: 'material-out', label: 'Unload Out', compatibleWith: ['material-in', 'mount'] },
      ],
      fragment: {
        primitives: [
          { id: 'track-main', kind: 'rail-segment', label: 'Cart Rail', config: { points: [{ x: 250, y: 390 }, { x: 520, y: 390 }], segmentType: 'straight' } },
          { id: 'wagon-main', kind: 'wagon', label: 'Cart Wagon', config: { trackId: 'track-main', offset: 0, capacity: 6 } },
        ],
        behaviors: [],
        controls: [],
        hud: [],
      },
    }),
    baseBlueprint({
      blueprintId: 'gear-drive-mk1',
      category: 'drivetrain',
      title: 'Gear Drive Mk1',
      summary: 'A compact motor and gear pair for conveyors, hoists, and demos.',
      tags: ['starter', 'power', 'gears'],
      ports: [
        { portId: 'mount-main', kind: 'mount', label: 'Drive Mount', compatibleWith: ['mount'] },
        { portId: 'power-out', kind: 'power-out', label: 'Output Shaft', compatibleWith: ['power-in', 'mount'] },
      ],
      fragment: {
        primitives: [
          { id: 'motor-main', kind: 'motor', label: 'Drive Motor', config: { x: 260, y: 340, rpm: 70, torque: 1.2, powerState: true } },
          { id: 'gear-a', kind: 'gear', label: 'Input Gear', config: { x: 390, y: 340, teeth: 22, input: true, color: '#47c5a5' } },
          { id: 'gear-b', kind: 'gear', label: 'Output Gear', config: { x: 520, y: 340, teeth: 40, input: false, color: '#fec84b' } },
          { id: 'axle-main', kind: 'axle', label: 'Output Axle', config: { x: 520, y: 340 } },
        ],
        behaviors: [],
        controls: [],
        hud: [],
      },
    }),
    baseBlueprint({
      blueprintId: 'winch-hoist-mk1',
      category: 'tool-head',
      title: 'Winch Hoist Mk1',
      summary: 'A ready-made hoist for cranes, lift bays, and cargo grabs.',
      tags: ['starter', 'lifting', 'hoist'],
      ports: [
        { portId: 'mount-main', kind: 'mount', label: 'Boom Mount', compatibleWith: ['mount'] },
        { portId: 'power-in', kind: 'power-in', label: 'Drive Input', compatibleWith: ['power-out', 'mount'] },
      ],
      fragment: {
        primitives: [
          { id: 'node-base', kind: 'node', label: 'Hoist Base', config: { x: 260, y: 220 } },
          { id: 'node-tip', kind: 'node', label: 'Hoist Tip', config: { x: 460, y: 220 } },
          { id: 'beam-main', kind: 'beam', label: 'Hoist Beam', config: { fromNodeId: 'node-base', toNodeId: 'node-tip', stiffness: 0.92 } },
          { id: 'winch-main', kind: 'winch', label: 'Winch', config: { x: 280, y: 220, speed: 34, ropeLength: 180 } },
          { id: 'hook-main', kind: 'hook', label: 'Hook', config: { x: 460, y: 380 } },
          { id: 'rope-main', kind: 'rope', label: 'Rope', config: { fromId: 'winch-main', toId: 'hook-main', length: 180 } },
        ],
        behaviors: [],
        controls: [],
        hud: [],
      },
    }),
    baseBlueprint({
      blueprintId: 'bucket-arm-mk1',
      category: 'tool-head',
      title: 'Bucket Arm Mk1',
      summary: 'A simple lifting arm that can transfer cargo like a rough loader head.',
      tags: ['starter', 'tool-head', 'arm'],
      ports: [
        { portId: 'mount-main', kind: 'mount', label: 'Arm Mount', compatibleWith: ['mount'] },
        { portId: 'material-out', kind: 'material-out', label: 'Drop Point', compatibleWith: ['material-in', 'mount'] },
      ],
      fragment: {
        primitives: [
          { id: 'node-base', kind: 'node', label: 'Arm Base', config: { x: 250, y: 300 } },
          { id: 'node-mid', kind: 'node', label: 'Arm Mid', config: { x: 370, y: 250 } },
          { id: 'node-tip', kind: 'node', label: 'Arm Tip', config: { x: 500, y: 220 } },
          { id: 'beam-a', kind: 'beam', label: 'Inner Arm', config: { fromNodeId: 'node-base', toNodeId: 'node-mid', stiffness: 0.84 } },
          { id: 'beam-b', kind: 'beam', label: 'Outer Arm', config: { fromNodeId: 'node-mid', toNodeId: 'node-tip', stiffness: 0.84 } },
          { id: 'hook-main', kind: 'hook', label: 'Bucket Hook', config: { x: 500, y: 300 } },
          { id: 'cargo-main', kind: 'cargo-block', label: 'Bucket Load', config: { x: 500, y: 330, weight: 1.5, attachedToId: 'hook-main' } },
        ],
        behaviors: [],
        controls: [],
        hud: [],
      },
    }),
    baseBlueprint({
      blueprintId: 'fork-mast-mk1',
      category: 'tool-head',
      title: 'Fork Mast Mk1',
      summary: 'A vertical lift head for pallet stacking and careful cargo placement.',
      tags: ['starter', 'fork', 'lifting'],
      ports: [
        { portId: 'mount-main', kind: 'mount', label: 'Mast Mount', compatibleWith: ['mount'] },
        { portId: 'material-out', kind: 'material-out', label: 'Fork Output', compatibleWith: ['material-in', 'mount'] },
      ],
      fragment: {
        primitives: [
          { id: 'node-bottom', kind: 'node', label: 'Mast Base', config: { x: 300, y: 380 } },
          { id: 'node-top', kind: 'node', label: 'Mast Top', config: { x: 300, y: 220 } },
          { id: 'beam-main', kind: 'beam', label: 'Mast', config: { fromNodeId: 'node-bottom', toNodeId: 'node-top', stiffness: 0.95 } },
          { id: 'hook-main', kind: 'hook', label: 'Fork Carriage', config: { x: 360, y: 320 } },
          { id: 'cargo-main', kind: 'cargo-block', label: 'Practice Pallet', config: { x: 360, y: 350, weight: 1 } },
        ],
        behaviors: [],
        controls: [],
        hud: [],
      },
    }),
    baseBlueprint({
      blueprintId: 'conveyor-section-mk1',
      category: 'transport',
      title: 'Conveyor Section Mk1',
      summary: 'A straight transfer section for feeding hoppers, wagons, and sort bays.',
      tags: ['starter', 'conveyor', 'transport'],
      ports: [
        { portId: 'mount-main', kind: 'mount', label: 'Support Mount', compatibleWith: ['mount'] },
        { portId: 'material-in', kind: 'material-in', label: 'Feed In', compatibleWith: ['material-out', 'mount'] },
        { portId: 'material-out', kind: 'material-out', label: 'Feed Out', compatibleWith: ['material-in', 'mount'] },
      ],
      fragment: {
        primitives: [
          { id: 'node-left', kind: 'node', label: 'Support A', config: { x: 260, y: 330 } },
          { id: 'node-right', kind: 'node', label: 'Support B', config: { x: 520, y: 330 } },
          { id: 'beam-main', kind: 'beam', label: 'Support Beam', config: { fromNodeId: 'node-left', toNodeId: 'node-right', stiffness: 0.8 } },
          { id: 'conv-main', kind: 'conveyor', label: 'Conveyor', config: { path: [{ x: 240, y: 370 }, { x: 540, y: 370 }], speed: 50, direction: 'forward' } },
        ],
        behaviors: [],
        controls: [],
        hud: [],
      },
    }),
    baseBlueprint({
      blueprintId: 'hopper-feeder-mk1',
      category: 'flow-system',
      title: 'Hopper Feeder Mk1',
      summary: 'A feed hopper for batching cargo into belts, carts, and site stations.',
      tags: ['starter', 'hopper', 'flow'],
      ports: [
        { portId: 'mount-main', kind: 'mount', label: 'Floor Mount', compatibleWith: ['mount'] },
        { portId: 'material-in', kind: 'material-in', label: 'Load In', compatibleWith: ['material-out', 'mount'] },
        { portId: 'material-out', kind: 'material-out', label: 'Release Out', compatibleWith: ['material-in', 'mount'] },
      ],
      fragment: {
        primitives: [
          { id: 'hopper-main', kind: 'hopper', label: 'Feeder Hopper', config: { x: 360, y: 280, capacity: 16, releaseRate: 1.4, fill: 4 } },
          { id: 'cargo-a', kind: 'cargo-block', label: 'Feed Block A', config: { x: 340, y: 270, weight: 1 } },
          { id: 'cargo-b', kind: 'cargo-block', label: 'Feed Block B', config: { x: 375, y: 260, weight: 1 } },
        ],
        behaviors: [],
        controls: [],
        hud: [],
      },
    }),
    baseBlueprint({
      blueprintId: 'pump-station-mk1',
      category: 'flow-system',
      title: 'Pump Station Mk1',
      summary: 'A transfer station stand-in for moving material through a processing line.',
      tags: ['starter', 'flow', 'processing'],
      ports: [
        { portId: 'mount-main', kind: 'mount', label: 'Station Mount', compatibleWith: ['mount'] },
        { portId: 'material-in', kind: 'material-in', label: 'Feed In', compatibleWith: ['material-out', 'mount'] },
        { portId: 'material-out', kind: 'material-out', label: 'Discharge', compatibleWith: ['material-in', 'mount'] },
      ],
      fragment: {
        primitives: [
          { id: 'pile-main', kind: 'material-pile', label: 'Source Pile', config: { x: 260, y: 380, quantity: 10 } },
          { id: 'conv-main', kind: 'conveyor', label: 'Transfer Belt', config: { path: [{ x: 300, y: 380 }, { x: 540, y: 320 }], speed: 42, direction: 'forward' } },
          { id: 'hopper-main', kind: 'hopper', label: 'Receiving Hopper', config: { x: 600, y: 280, capacity: 12, releaseRate: 1.2, fill: 0 } },
        ],
        behaviors: [],
        controls: [],
        hud: [],
      },
    }),
  ];

  return blueprints.map((blueprint) => ({
    recordId: blueprint.blueprintId,
    blueprint,
    starter: true,
    createdAt: now,
    updatedAt: now,
  }));
}

export function getStarterJobs(
  machines: SavedExperimentRecord[],
  blueprints: SavedBlueprintRecord[],
): SiteJobDefinition[] {
  const blueprintIds = blueprints.map((blueprint) => blueprint.recordId);

  return [
    {
      jobId: 'load-the-hopper',
      tier: 1,
      title: 'Load the Hopper',
      summary: 'Move enough cargo into the hopper to start the line.',
      teachingGoal: 'Throughput comes from belt speed and feed rate working together.',
      startingRecipeIds: ['conveyor-loader'],
      recommendedMachineIds: [machines.find((machine) => machine.experiment.metadata.recipeId === 'conveyor-loader')!.recordId],
      goalType: 'fill-hopper',
      hints: ['Start with the conveyor speed around the middle.', 'If the fill is too slow, increase both the belt and hopper rate.'],
      objective: 'Reach a hopper fill of 8 blocks.',
      playable: true,
    },
    {
      jobId: 'gear-down-the-motor',
      tier: 1,
      title: 'Gear Down the Motor',
      summary: 'Slow the output while keeping the machine turning smoothly.',
      teachingGoal: 'Gear ratios trade speed for force.',
      startingRecipeIds: ['gear-train-lab'],
      recommendedMachineIds: [machines.find((machine) => machine.experiment.metadata.recipeId === 'gear-train-lab')!.recordId],
      goalType: 'gear-down',
      hints: ['Try increasing the tooth count of the middle gear.', 'Watch the output speed readout as you tweak the setup.'],
      objective: 'Get the output under 45 RPM.',
      playable: true,
    },
    {
      jobId: 'deliver-the-wagon',
      tier: 1,
      title: 'Deliver the Wagon',
      summary: 'Use the rail switch to send the wagon to Bay B.',
      teachingGoal: 'Routing systems depend on timing and path selection.',
      startingRecipeIds: ['rail-cart-loop'],
      recommendedMachineIds: [machines.find((machine) => machine.experiment.metadata.recipeId === 'rail-cart-loop')!.recordId],
      goalType: 'deliver-wagon',
      hints: ['Send the switch to Bay B before the locomotive reaches the branch.', 'Slower train speed makes the route easier to control.'],
      objective: 'Deliver the wagon to Bay B.',
      playable: true,
    },
    {
      jobId: 'stack-the-pallets',
      tier: 2,
      title: 'Stack the Pallets',
      summary: 'Lift and place two pallets on marked platforms.',
      teachingGoal: 'Balance and lifting geometry change how stable the load feels.',
      startingRecipeIds: ['winch-crane'],
      recommendedMachineIds: [machines.find((machine) => machine.experiment.metadata.recipeId === 'winch-crane')!.recordId],
      recommendedBlueprintIds: ['fork-mast-mk1', 'winch-hoist-mk1'],
      allowedFamilies: ['lifting', 'machine-combos'],
      goalType: 'deliver-wagon',
      hints: ['Use a steady lift before you move sideways.', 'A saved fork or hoist module will make this easier later.'],
      objective: 'Place two cargo blocks on the marked platforms.',
      playable: true,
    },
    {
      jobId: 'fill-one-wagon-only',
      tier: 2,
      title: 'Fill One Wagon Only',
      summary: 'Batch one wagon from a hopper without overloading the line.',
      teachingGoal: 'Controlled release matters as much as raw throughput.',
      startingRecipeIds: ['conveyor-loader', 'rail-cart-loop'],
      recommendedMachineIds: [machines.find((machine) => machine.experiment.metadata.recipeId === 'conveyor-loader')!.recordId],
      recommendedBlueprintIds: ['hopper-feeder-mk1', 'rail-cart-mk1'],
      allowedFamilies: ['transport', 'flow-and-processing', 'machine-combos'],
      goalType: 'fill-hopper',
      hints: ['Think in batches, not maximum speed.', 'A wagon only helps if the feed is controlled.'],
      objective: 'Load exactly one wagon and keep spill low.',
      playable: true,
    },
    {
      jobId: 'pump-the-slurry',
      tier: 2,
      title: 'Pump the Slurry',
      summary: 'Move site material from one processing station to another.',
      teachingGoal: 'Flow systems need control points, not just motion.',
      startingRecipeIds: ['conveyor-loader'],
      recommendedMachineIds: [machines.find((machine) => machine.experiment.metadata.recipeId === 'conveyor-loader')!.recordId],
      recommendedBlueprintIds: ['pump-station-mk1'],
      allowedFamilies: ['flow-and-processing', 'machine-combos'],
      goalType: 'fill-hopper',
      hints: ['Build a transfer line before you try to speed it up.', 'Think about where material enters and leaves the station.'],
      objective: 'Move site material from Tank A to Tank B.',
      playable: true,
    },
    {
      jobId: 'build-a-mobile-crane',
      tier: 3,
      title: 'Build a Mobile Crane',
      summary: 'Mount a lifting head onto a rolling base and keep it stable.',
      teachingGoal: 'Reusable modules become stronger when the base and tool fit each other.',
      startingRecipeIds: ['winch-crane'],
      recommendedMachineIds: [machines.find((machine) => machine.experiment.metadata.recipeId === 'winch-crane')!.recordId],
      recommendedBlueprintIds: ['tracked-chassis-mk1', 'winch-hoist-mk1'],
      allowedFamilies: ['lifting', 'machine-combos'],
      goalType: 'deliver-wagon',
      hints: ['Start with a stable chassis.', 'Mount the lift head near the center of the base.'],
      objective: 'Combine a rolling base and a lifting module into one useful machine.',
      playable: false,
    },
    {
      jobId: 'dig-load-haul',
      tier: 3,
      title: 'Dig, Load, Haul',
      summary: 'Move material from pit to wagon to dump zone with a chain of machines.',
      teachingGoal: 'Yard logistics means linking several machines into one flow.',
      startingRecipeIds: ['conveyor-loader', 'rail-cart-loop'],
      recommendedMachineIds: [machines.find((machine) => machine.experiment.metadata.recipeId === 'conveyor-loader')!.recordId],
      recommendedBlueprintIds: ['bucket-arm-mk1', 'rail-cart-mk1', 'conveyor-section-mk1'],
      allowedFamilies: ['earthworks', 'transport', 'machine-combos'],
      goalType: 'fill-hopper',
      hints: ['Think in steps: dig, transfer, haul.', 'A wagon only helps if the line can feed it.'],
      objective: 'Move site material from a pit into a wagon and then to a dump zone.',
      playable: false,
    },
    {
      jobId: 'sort-the-yard',
      tier: 3,
      title: 'Sort the Yard',
      summary: 'Route two material flows to two different destinations.',
      teachingGoal: 'Branching systems are really about decisions at the right point.',
      startingRecipeIds: ['rail-cart-loop', 'conveyor-loader'],
      recommendedMachineIds: [machines.find((machine) => machine.experiment.metadata.recipeId === 'rail-cart-loop')!.recordId],
      recommendedBlueprintIds: ['conveyor-section-mk1', 'hopper-feeder-mk1'],
      allowedFamilies: ['transport', 'flow-and-processing', 'machine-combos'],
      goalType: 'deliver-wagon',
      hints: ['Use routes to split work, not just speed.', 'Think about the handoff between one module and the next.'],
      objective: 'Send two material types to two different destinations.',
      playable: false,
    },
    {
      jobId: 'build-the-frame',
      tier: 4,
      title: 'Build the Frame',
      summary: 'Deliver steel blocks and place them onto a tall frame without dropping them.',
      teachingGoal: 'Construction jobs get interesting when transport and lifting must work together.',
      startingRecipeIds: ['winch-crane', 'rail-cart-loop'],
      recommendedMachineIds: [machines.find((machine) => machine.experiment.metadata.recipeId === 'winch-crane')!.recordId],
      recommendedBlueprintIds: ['winch-hoist-mk1', 'rail-cart-mk1'],
      allowedFamilies: ['structures', 'lifting', 'transport', 'machine-combos'],
      goalType: 'deliver-wagon',
      hints: ['Bring the load to the frame first.', 'Control matters more than maximum speed.'],
      objective: 'Place steel blocks onto a simple tower frame.',
      playable: false,
    },
    {
      jobId: 'run-the-loading-yard',
      tier: 4,
      title: 'Run the Loading Yard',
      summary: 'Keep the yard moving without starving one machine or flooding another.',
      teachingGoal: 'Throughput problems usually come from one weak link in the chain.',
      startingRecipeIds: ['conveyor-loader', 'rail-cart-loop'],
      recommendedMachineIds: [
        machines.find((machine) => machine.experiment.metadata.recipeId === 'conveyor-loader')!.recordId,
        machines.find((machine) => machine.experiment.metadata.recipeId === 'rail-cart-loop')!.recordId,
      ],
      recommendedBlueprintIds: ['conveyor-section-mk1', 'hopper-feeder-mk1', 'rail-cart-mk1'],
      allowedFamilies: ['transport', 'flow-and-processing', 'machine-combos'],
      goalType: 'fill-hopper',
      hints: ['Watch for the slowest part in the chain.', 'A perfect machine can still bottleneck a bad yard layout.'],
      objective: 'Keep a hopper, conveyor, wagon, and switch yard running at target throughput.',
      playable: false,
    },
    {
      jobId: 'kitbash-a-new-machine',
      tier: 4,
      title: 'Kitbash a New Machine',
      summary: 'Use saved modules to invent a machine that solves a real site delivery problem.',
      teachingGoal: 'New machine ideas come from recombining old good parts.',
      startingRecipeIds: ['gear-train-lab', 'conveyor-loader', 'winch-crane', 'rail-cart-loop'],
      recommendedMachineIds: machines.slice(0, 4).map((machine) => machine.recordId),
      recommendedBlueprintIds: blueprintIds.slice(0, 5),
      allowedFamilies: ['machine-combos', 'lifting', 'transport', 'power-and-drivetrain'],
      goalType: 'deliver-wagon',
      hints: ['Start with two modules you already trust.', 'The job does not care if the machine looks strange if it works.'],
      objective: 'Combine at least two saved blueprints into a new useful machine and finish a delivery task.',
      playable: false,
    },
  ];
}

export function createDraftFromMachine(machine: SavedExperimentRecord): DraftRecord {
  return {
    draftId: nanoid(),
    sourceMachineId: machine.recordId,
    manifest: structuredClone(machine.experiment),
    updatedAt: new Date().toISOString(),
  };
}

export function createDraftFromBlueprint(blueprint: SavedBlueprintRecord): DraftRecord {
  const mounted = mountBlueprintToManifest(createEmptyManifest(), blueprint.blueprint);

  return {
    draftId: nanoid(),
    sourceBlueprintId: blueprint.recordId,
    manifest: {
      ...mounted,
      metadata: {
        ...mounted.metadata,
        title: `${blueprint.blueprint.title} Draft`,
        shortDescription: blueprint.blueprint.summary,
        tags: Array.from(new Set([...mounted.metadata.tags, ...blueprint.blueprint.tags])),
      },
    },
    updatedAt: new Date().toISOString(),
  };
}

export function createEmptyDraft(): DraftRecord {
  return {
    draftId: nanoid(),
    manifest: createEmptyManifest(),
    updatedAt: new Date().toISOString(),
  };
}
