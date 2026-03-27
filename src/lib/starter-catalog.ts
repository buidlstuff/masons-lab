import { baseManifest } from './manifest-factories';
import type { SavedBlueprintRecord, SavedExperimentRecord, SiteJobDefinition } from './types';

function spinGearsShowcaseManifest() {
  return baseManifest({
    slug: 'spin-the-gears-demo',
    family: 'power-and-drivetrain',
    metadata: {
      title: 'Spin the Gears Demo',
      subtitle: 'Power, reach, and meshing',
      shortDescription: 'A small honest gear train you can remix by hand.',
      teachingGoal: 'Motors only matter when a gear is close enough to pick up the motion.',
      difficulty: 'easy',
      tags: ['showcase', 'gears', 'honest'],
      starter: true,
      featured: true,
      thumbnailPreset: 'gear-closeup',
      createdBy: { source: 'human' },
    },
    primitives: [
      { id: 'motor-demo', kind: 'motor', label: 'Drive Motor', config: { x: 220, y: 360, rpm: 75, torque: 1.4, powerState: true } },
      { id: 'gear-a', kind: 'gear', label: 'Input Gear', config: { x: 380, y: 360, teeth: 24, input: true, color: '#47c5a5' } },
      { id: 'gear-b', kind: 'gear', label: 'Driven Gear', config: { x: 520, y: 360, teeth: 40, input: false, color: '#fec84b' } },
    ],
    controls: [
      {
        id: 'motor-rpm',
        kind: 'slider',
        label: 'Motor RPM',
        description: 'Higher RPM spins the whole train faster.',
        bind: { targetId: 'motor-demo', path: 'rpm' },
        defaultValue: 75,
        min: 20,
        max: 140,
        step: 5,
      },
    ],
    hud: [
      { id: 'input-rpm', kind: 'readout', label: 'Input Speed', metric: 'input-rpm', units: 'RPM', position: 'top-right' },
      { id: 'output-rpm', kind: 'readout', label: 'Output Speed', metric: 'output-rpm', units: 'RPM', position: 'top-right' },
      { id: 'ratio', kind: 'readout', label: 'Gear Ratio', metric: 'gear-ratio', position: 'top-right' },
    ],
    explanation: {
      whatIsHappening: 'The motor only drives gears inside its reach, and touching gears pass the spin along.',
      whatToTryNext: ['Drag a gear out of reach and watch it stop.', 'Change the gear teeth.', 'Add another meshed gear.'],
      vocabulary: [{ term: 'mesh', kidFriendlyMeaning: 'When gear teeth touch and transfer the spin.' }],
    },
  });
}

function feedHopperShowcaseManifest() {
  return baseManifest({
    slug: 'feed-the-hopper-demo',
    family: 'flow-and-processing',
    metadata: {
      title: 'Feed the Hopper Demo',
      subtitle: 'Flow, cargo, and a target',
      shortDescription: 'A small conveyor line that only fills when cargo truly reaches the hopper.',
      teachingGoal: 'A conveyor setup is only working if the cargo really reaches the destination.',
      difficulty: 'easy',
      tags: ['showcase', 'conveyor', 'hopper', 'honest'],
      starter: true,
      featured: true,
      thumbnailPreset: 'conveyor-line',
      createdBy: { source: 'human' },
    },
    primitives: [
      { id: 'conv-demo', kind: 'conveyor', label: 'Main Conveyor', config: { path: [{ x: 240, y: 420 }, { x: 720, y: 420 }], speed: 45, direction: 'forward' } },
      { id: 'hopper-demo', kind: 'hopper', label: 'Receiving Hopper', config: { x: 800, y: 360, capacity: 10, releaseRate: 1.2, fill: 0 } },
      { id: 'cargo-a', kind: 'cargo-block', label: 'Cargo A', config: { x: 280, y: 410, weight: 1 } },
      { id: 'cargo-b', kind: 'cargo-block', label: 'Cargo B', config: { x: 320, y: 410, weight: 1 } },
      { id: 'cargo-c', kind: 'cargo-block', label: 'Cargo C', config: { x: 360, y: 410, weight: 1 } },
    ],
    explanation: {
      whatIsHappening: 'The cargo rides the conveyor and only counts if it really lands in the hopper zone.',
      whatToTryNext: ['Move the hopper away and watch the fill stop.', 'Add more cargo.', 'Park a motor near the belt.'],
      vocabulary: [{ term: 'throughput', kidFriendlyMeaning: 'How much cargo makes it through the machine over time.' }],
    },
  });
}

function buildLoaderShowcaseManifest() {
  return baseManifest({
    slug: 'build-the-loader-demo',
    family: 'machine-combos',
    metadata: {
      title: 'Build the Loader Demo',
      subtitle: 'Power plus flow',
      shortDescription: 'A powered conveyor line that loads faster when the motor is actually near the belt.',
      teachingGoal: 'A motor should only speed up a conveyor when it is really in range of the machine.',
      difficulty: 'medium',
      tags: ['showcase', 'loader', 'honest'],
      starter: true,
      featured: true,
      thumbnailPreset: 'conveyor-line',
      createdBy: { source: 'human' },
    },
    primitives: [
      { id: 'motor-demo', kind: 'motor', label: 'Drive Motor', config: { x: 200, y: 420, rpm: 80, torque: 1.2, powerState: true } },
      { id: 'conv-demo', kind: 'conveyor', label: 'Loader Conveyor', config: { path: [{ x: 260, y: 420 }, { x: 720, y: 420 }], speed: 45, direction: 'forward' } },
      { id: 'hopper-demo', kind: 'hopper', label: 'Loader Hopper', config: { x: 800, y: 360, capacity: 12, releaseRate: 1.5, fill: 0 } },
      { id: 'cargo-a', kind: 'cargo-block', label: 'Cargo A', config: { x: 300, y: 410, weight: 1 } },
      { id: 'cargo-b', kind: 'cargo-block', label: 'Cargo B', config: { x: 340, y: 410, weight: 1 } },
      { id: 'cargo-c', kind: 'cargo-block', label: 'Cargo C', config: { x: 380, y: 410, weight: 1 } },
      { id: 'cargo-d', kind: 'cargo-block', label: 'Cargo D', config: { x: 420, y: 410, weight: 1 } },
    ],
    controls: [
      {
        id: 'motor-rpm',
        kind: 'slider',
        label: 'Motor RPM',
        description: 'Move the conveyor faster by changing real motor speed.',
        bind: { targetId: 'motor-demo', path: 'rpm' },
        defaultValue: 80,
        min: 30,
        max: 140,
        step: 5,
      },
    ],
    explanation: {
      whatIsHappening: 'The nearby motor boosts the belt because it is actually close enough to drive the conveyor.',
      whatToTryNext: ['Move the motor away and watch the boost disappear.', 'Add more cargo.', 'Adjust the motor RPM.'],
      vocabulary: [{ term: 'powered loader', kidFriendlyMeaning: 'A loading machine where power and material flow work together.' }],
    },
  });
}

export function getFeaturedMachines(): SavedExperimentRecord[] {
  const now = new Date().toISOString();
  return [spinGearsShowcaseManifest(), feedHopperShowcaseManifest(), buildLoaderShowcaseManifest()].map((experiment) => ({
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
  return [];
}

export function getStarterJobs(): SiteJobDefinition[] {
  return [
    {
      jobId: 'spin-the-gears',
      tier: 1,
      title: 'Spin the Gears',
      summary: 'Build the smallest gear train that visibly responds to your placements.',
      teachingGoal: 'Learn motor reach, meshing, and the difference between a dead gear and a live one.',
      startingRecipeIds: [],
      recommendedMachineIds: [],
      goalType: 'spin-gear-train',
      hints: [
        'A gear outside the motor ring will sit still.',
        'Touching gears transfer the motion and spin opposite ways.',
      ],
      objective: 'Place a motor, wake up one gear, then mesh a second live gear.',
      playable: true,
      kind: 'starter-project',
      initialDraft: 'empty',
      steps: [
        {
          stepId: 'place-motor',
          title: 'Place the motor',
          instruction: 'Put one motor on the canvas so the yard has a real power source.',
          allowedPartKinds: ['motor'],
          successCheck: 'has-motor',
          successCopy: 'The yard has power now. Next, give the motor a gear it can actually reach.',
          assistantPrompt: 'I am in Spin the Gears and need help placing the motor. Where should it go and why?',
        },
        {
          stepId: 'wake-first-gear',
          title: 'Wake up the first gear',
          instruction: 'Place a gear inside the motor ring so it starts spinning for real.',
          allowedPartKinds: ['gear'],
          successCheck: 'first-gear-live',
          successCopy: 'That gear is alive. Now make the motion obvious by meshing a second gear.',
          assistantPrompt: 'My first gear is not spinning. Tell me how close it needs to be to the motor and what to look for.',
        },
        {
          stepId: 'mesh-second-gear',
          title: 'Mesh a second gear',
          instruction: 'Add another gear touching the first one so the motion passes through a real gear mesh.',
          allowedPartKinds: ['gear'],
          successCheck: 'gear-train-live',
          successCopy: 'You built a real gear train. Drag the gears around and watch the cause and effect.',
          assistantPrompt: 'I need two gears to mesh and spin. Explain how far apart they should be and why nothing happens if they miss.',
        },
      ],
      playModeUnlockStep: 3,
    },
    {
      jobId: 'feed-the-hopper',
      tier: 1,
      title: 'Feed the Hopper',
      summary: 'Build a conveyor line that only scores when cargo truly reaches the hopper.',
      teachingGoal: 'Learn to read cargo flow instead of trusting fake counters or scripted progress.',
      startingRecipeIds: [],
      recommendedMachineIds: [],
      goalType: 'feed-the-hopper',
      hints: [
        'Put cargo directly on the belt if you want quick feedback.',
        'The hopper only counts blocks that really enter its mouth.',
      ],
      objective: 'Place a conveyor, get cargo moving on it, then catch cargo in a hopper.',
      playable: true,
      kind: 'starter-project',
      initialDraft: 'empty',
      steps: [
        {
          stepId: 'place-conveyor',
          title: 'Place the conveyor',
          instruction: 'Put one conveyor on the floor so cargo has a path to travel.',
          allowedPartKinds: ['conveyor'],
          successCheck: 'has-conveyor',
          successCopy: 'Good. Now the belt exists. Next, give it cargo you can actually watch.',
          assistantPrompt: 'I am starting Feed the Hopper. Tell me where to place the conveyor for the clearest result.',
        },
        {
          stepId: 'add-cargo',
          title: 'Add cargo on the belt',
          instruction: 'Drop a cargo block right onto the conveyor so you can see whether the belt is really moving it.',
          allowedPartKinds: ['cargo-block'],
          successCheck: 'cargo-on-conveyor',
          successCopy: 'The cargo is on the belt. Now add the hopper where the conveyor can actually feed it.',
          assistantPrompt: 'My cargo is not riding the conveyor. Explain where it should sit and how to tell if it is really on the belt.',
        },
        {
          stepId: 'catch-cargo',
          title: 'Catch cargo in the hopper',
          instruction: 'Place the hopper at the conveyor output and watch for real hopper fill.',
          allowedPartKinds: ['hopper', 'cargo-block'],
          successCheck: 'hopper-catching-cargo',
          successCopy: 'The hopper is filling because the cargo really got there. That is an honest conveyor line.',
          assistantPrompt: 'The hopper is not filling yet. Tell me how close it needs to be to the conveyor output and what could still be wrong.',
        },
      ],
      playModeUnlockStep: 3,
    },
    {
      jobId: 'build-the-loader',
      tier: 2,
      title: 'Build the Loader',
      summary: 'Combine flow and power into a conveyor loader that works faster when the motor is genuinely in range.',
      teachingGoal: 'Learn how a powered machine becomes more interesting when motion and cargo flow truly work together.',
      startingRecipeIds: [],
      recommendedMachineIds: [],
      goalType: 'build-the-loader',
      hints: [
        'Get the cargo path working first, then add power.',
        'Moving the motor away should weaken the loader immediately.',
      ],
      objective: 'Build a conveyor loader from scratch, power it with a nearby motor, and reach the fill target.',
      playable: true,
      kind: 'starter-project',
      initialDraft: 'empty',
      steps: [
        {
          stepId: 'place-conveyor',
          title: 'Place the conveyor',
          instruction: 'Start the loader with one conveyor.',
          allowedPartKinds: ['conveyor'],
          successCheck: 'has-conveyor',
          successCopy: 'The loader has a belt. Next, give it somewhere to send the cargo.',
          assistantPrompt: 'I am building the loader. Tell me where to place the conveyor so the rest of the machine will read clearly.',
        },
        {
          stepId: 'place-hopper',
          title: 'Place the hopper',
          instruction: 'Put the hopper at the conveyor output so the line has a real destination.',
          allowedPartKinds: ['hopper'],
          successCheck: 'has-hopper',
          successCopy: 'Now the line has a target. Add cargo so you can see the flow.',
          assistantPrompt: 'Where should the hopper sit relative to the conveyor so the cargo has the best chance to land inside it?',
        },
        {
          stepId: 'add-cargo',
          title: 'Add cargo',
          instruction: 'Drop cargo on the belt so the loader actually has work to do.',
          allowedPartKinds: ['cargo-block'],
          successCheck: 'cargo-on-conveyor',
          successCopy: 'Cargo is moving. Now add a motor close enough to power the conveyor.',
          assistantPrompt: 'My loader has cargo but it still feels weak. Tell me how to place the cargo and what part I should add next.',
        },
        {
          stepId: 'power-the-belt',
          title: 'Power the belt',
          instruction: 'Place a motor near the conveyor so the belt becomes a powered loader, not just a passive line.',
          allowedPartKinds: ['motor'],
          successCheck: 'motor-near-conveyor',
          successCopy: 'The conveyor is powered now. Tune it and reach the fill target.',
          assistantPrompt: 'How close does the motor need to be to the conveyor to power it, and how can I tell the boost is real?',
        },
        {
          stepId: 'reach-fill-target',
          title: 'Reach the fill target',
          instruction: 'Keep the powered loader running until the hopper fills with 3 real cargo blocks.',
          allowedPartKinds: ['motor', 'conveyor', 'hopper', 'cargo-block', 'gear', 'wheel'],
          successCheck: 'powered-loader-target',
          successCopy: 'You built a real powered loader. Now you can play with the design instead of following steps.',
          assistantPrompt: 'My powered loader is still not reaching the target. Explain what to tune next and what is slowing it down.',
        },
      ],
      playModeUnlockStep: 4,
    },
  ];
}
