import { nanoid } from 'nanoid';
import { createEmptyManifest } from './manifest-factories';
import type {
  ExperimentManifest,
  PhysicsOverrides,
  PrimitiveConfig,
  PrimitiveInstance,
  PrimitiveKind,
} from './types';

export type SillySceneReliability = 'safe' | 'low-risk';

interface ScenePrimitiveSeed {
  id?: string;
  kind: PrimitiveKind;
  label?: string;
  config: PrimitiveConfig;
}

export interface SillyScene {
  id: string;
  title: string;
  description: string;
  emoji: string;
  reliability: SillySceneReliability;
  physicsOverrides?: PhysicsOverrides;
  createParts: () => ScenePrimitiveSeed[];
}

function titleCaseKind(kind: PrimitiveKind) {
  return kind
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function createScenePrimitive(seed: ScenePrimitiveSeed): PrimitiveInstance {
  return {
    id: seed.id ?? `${seed.kind}-${nanoid(6)}`,
    kind: seed.kind,
    label: seed.label ?? titleCaseKind(seed.kind),
    config: structuredClone(seed.config),
  };
}

export const SILLY_SCENES: SillyScene[] = [
  {
    id: 'moon-mode',
    title: 'Moon Mode',
    description: 'Low gravity turns a simple ramp drop into a floaty slow-motion mess.',
    emoji: '🌙',
    reliability: 'safe',
    physicsOverrides: { gravityY: 0.2 },
    createParts: () => [
      { kind: 'ramp', label: 'Moon Ramp', config: { x: 250, y: 360, width: 260, angle: -14 } },
      { kind: 'ball', config: { x: 160, y: 190, radius: 16 } },
      { kind: 'cargo-block', config: { x: 250, y: 160, weight: 0.8 } },
      { kind: 'rock', config: { x: 320, y: 170 } },
    ],
  },
  {
    id: 'bowling',
    title: 'Bowling Alley',
    description: 'Roll a heavy ball down a ramp and smash a cargo pyramid.',
    emoji: '🎳',
    reliability: 'safe',
    createParts: () => [
      { kind: 'ramp', config: { x: 160, y: 360, width: 220, angle: -16 } },
      { kind: 'ball', config: { x: 120, y: 280, radius: 16 } },
      ...[0, 1, 2, 3].map((index) => ({
        kind: 'cargo-block' as const,
        config: { x: 660 + index * 28, y: 490, weight: 0.5 },
      })),
      ...[0, 1, 2].map((index) => ({
        kind: 'cargo-block' as const,
        config: { x: 674 + index * 28, y: 464, weight: 0.5 },
      })),
      ...[0, 1].map((index) => ({
        kind: 'cargo-block' as const,
        config: { x: 688 + index * 28, y: 438, weight: 0.5 },
      })),
      { kind: 'cargo-block', config: { x: 702, y: 412, weight: 0.5 } },
    ],
  },
  {
    id: 'bubble-bath',
    title: 'Bubble Bath',
    description: 'Drop floaty balls and sinky rocks into a huge water zone.',
    emoji: '🛁',
    reliability: 'safe',
    createParts: () => [
      { kind: 'water', config: { x: 480, y: 420, width: 860, height: 240, density: 1.2 } },
      ...Array.from({ length: 5 }, (_, index) => ({
        kind: 'ball' as const,
        config: { x: 150 + index * 150, y: 100, radius: 10 + index * 2 },
      })),
      { kind: 'rock', config: { x: 320, y: 80 } },
      { kind: 'rock', config: { x: 620, y: 90 } },
    ],
  },
  {
    id: 'conveyor-madness',
    title: 'Conveyor Madness',
    description: 'Five powered belts bounce cargo down toward a hopper.',
    emoji: '🔄',
    reliability: 'safe',
    createParts: () => [
      ...Array.from({ length: 5 }, (_, index) => ({
        kind: 'conveyor' as const,
        config: {
          path: index % 2 === 0
            ? [{ x: 180, y: 120 + index * 76 }, { x: 760, y: 120 + index * 76 }]
            : [{ x: 760, y: 120 + index * 76 }, { x: 180, y: 120 + index * 76 }],
          speed: 1.5,
          direction: 'forward' as const,
        },
      })),
      { kind: 'motor', config: { x: 470, y: 280, rpm: 60, torque: 10, powerState: true } },
      ...Array.from({ length: 4 }, (_, index) => ({
        kind: 'cargo-block' as const,
        config: { x: 300 + index * 70, y: 80, weight: 1 },
      })),
      { kind: 'hopper', config: { x: 480, y: 500, capacity: 10, releaseRate: 0, fill: 0 } },
    ],
  },
  {
    id: 'bouncy-castle',
    title: 'Bouncy Castle',
    description: 'An enclosed arena where everything rebounds like a rubber toy.',
    emoji: '🏰',
    reliability: 'low-risk',
    physicsOverrides: { gravityY: 1.2, globalRestitution: 0.85 },
    createParts: () => [
      { kind: 'wall', config: { x: 110, y: 280, height: 420 } },
      { kind: 'wall', config: { x: 850, y: 280, height: 420 } },
      { kind: 'platform', config: { x: 480, y: 80, width: 760 } },
      ...Array.from({ length: 12 }, (_, index) => ({
        kind: 'ball' as const,
        config: {
          x: 220 + (index % 4) * 160,
          y: 150 + Math.floor(index / 4) * 80,
          radius: 8 + (index % 5) * 2,
        },
      })),
    ],
  },
  {
    id: 'ice-rink',
    title: 'Ice Rink',
    description: 'Everything becomes slippery, so even a gentle slope feels chaotic.',
    emoji: '⛸️',
    reliability: 'low-risk',
    physicsOverrides: { globalFriction: 0.005 },
    createParts: () => [
      { kind: 'ramp', config: { x: 470, y: 430, width: 460, angle: -6 } },
      { kind: 'ball', config: { x: 280, y: 300, radius: 14 } },
      { kind: 'ball', config: { x: 360, y: 285, radius: 12 } },
      { kind: 'cargo-block', config: { x: 440, y: 292, weight: 1 } },
      { kind: 'rock', config: { x: 520, y: 288 } },
    ],
  },
  {
    id: 'reverse-gravity',
    title: 'Reverse Gravity',
    description: 'Objects launch upward until a ceiling platform catches them.',
    emoji: '🙃',
    reliability: 'low-risk',
    physicsOverrides: { gravityY: -0.8 },
    createParts: () => [
      { kind: 'platform', config: { x: 480, y: 46, width: 760 } },
      { kind: 'ball', config: { x: 260, y: 500, radius: 16 } },
      { kind: 'ball', config: { x: 360, y: 500, radius: 12 } },
      { kind: 'cargo-block', config: { x: 460, y: 500, weight: 1 } },
      { kind: 'rock', config: { x: 560, y: 500 } },
    ],
  },
  {
    id: 'giant-pendulum',
    title: 'Giant Pendulum',
    description: 'A heavy swing smashes through anything left in its path.',
    emoji: '🔔',
    reliability: 'low-risk',
    createParts: () => {
      const anchorId = `axle-${nanoid(6)}`;
      const ballId = `ball-${nanoid(6)}`;
      return [
        { id: anchorId, kind: 'axle', config: { x: 480, y: 70 } },
        { id: ballId, kind: 'ball', label: 'Pendulum Ball', config: { x: 280, y: 300, radius: 40 } },
        { kind: 'beam', label: 'Pendulum Arm', config: { fromNodeId: anchorId, toNodeId: ballId, stiffness: 0.9 } },
        { kind: 'cargo-block', config: { x: 650, y: 500, weight: 1 } },
        { kind: 'cargo-block', config: { x: 678, y: 500, weight: 1 } },
        { kind: 'cargo-block', config: { x: 706, y: 500, weight: 1 } },
      ];
    },
  },
];

export function getSillyScene(sceneId: string) {
  return SILLY_SCENES.find((scene) => scene.id === sceneId);
}

export function getRandomSillyScene() {
  return SILLY_SCENES[Math.floor(Math.random() * SILLY_SCENES.length)] ?? null;
}

export function createSillySceneManifest(sceneId: string): ExperimentManifest | null {
  const scene = getSillyScene(sceneId);
  if (!scene) return null;

  const manifest = createEmptyManifest();
  const world = scene.physicsOverrides
    ? {
        ...manifest.world,
        physicsOverrides: { ...scene.physicsOverrides },
      }
    : manifest.world;

  return {
    ...manifest,
    slug: scene.id,
    family: 'machine-combos',
    metadata: {
      ...manifest.metadata,
      title: scene.title,
      subtitle: 'Silly Scene',
      shortDescription: scene.description,
      teachingGoal: 'Notice how one physics twist changes every part in the sandbox.',
      tags: Array.from(new Set([...manifest.metadata.tags, 'silly-scene', scene.id, scene.reliability])),
      thumbnailPreset: 'yard-draft',
    },
    world,
    primitives: scene.createParts().map(createScenePrimitive),
    explanation: {
      whatIsHappening: scene.description,
      whatToTryNext: [
        'Press play and watch the first reaction.',
        'Add one part of your own and see what changes.',
        'Remix the layout without losing the scene gimmick.',
      ],
      vocabulary: [
        {
          term: 'scene',
          kidFriendlyMeaning: 'A playful setup that starts with parts already arranged for you.',
        },
      ],
    },
  };
}
