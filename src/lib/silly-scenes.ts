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
    id: 'station-shuttle',
    title: 'Station Shuttle',
    description: 'A motor-boosted train loads cargo at one station and dumps it into a hopper at the other.',
    emoji: '🚉',
    reliability: 'low-risk',
    createParts: () => [
      {
        id: 'track-station',
        kind: 'rail-segment',
        label: 'Station Rail',
        config: { points: [{ x: 180, y: 280 }, { x: 780, y: 280 }], segmentType: 'straight' },
      },
      {
        id: 'loco-station',
        kind: 'locomotive',
        label: 'Station Loco',
        config: { trackId: 'track-station', progress: 0, speed: 0.18 },
      },
      {
        id: 'wagon-station',
        kind: 'wagon',
        label: 'Cargo Wagon',
        config: { trackId: 'track-station', offset: -0.08, capacity: 4 },
      },
      { kind: 'motor', label: 'Track Motor', config: { x: 210, y: 210, rpm: 90, torque: 1, powerState: true } },
      { kind: 'station-zone', label: 'Load Station', config: { x: 230, y: 320, width: 140, height: 130, action: 'load' } },
      { kind: 'station-zone', label: 'Unload Station', config: { x: 720, y: 340, width: 150, height: 180, action: 'unload' } },
      { kind: 'cargo-block', config: { x: 206, y: 316, weight: 1 } },
      { kind: 'cargo-block', config: { x: 232, y: 316, weight: 1 } },
      { kind: 'cargo-block', config: { x: 258, y: 316, weight: 1 } },
      { kind: 'hopper', config: { x: 720, y: 430, capacity: 10, releaseRate: 0, fill: 0 } },
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
      { kind: 'ramp', config: { x: 300, y: 340, width: 340, angle: -10 } },
      { kind: 'ramp', config: { x: 650, y: 460, width: 280, angle: 8 } },
      { kind: 'wall', config: { x: 110, y: 400, height: 240 } },
      { kind: 'wall', config: { x: 850, y: 400, height: 240 } },
      { kind: 'ball', config: { x: 180, y: 200, radius: 16 } },
      { kind: 'ball', config: { x: 280, y: 180, radius: 12 } },
      { kind: 'ball', config: { x: 380, y: 190, radius: 14 } },
      { kind: 'cargo-block', config: { x: 500, y: 200, weight: 1 } },
      { kind: 'cargo-block', config: { x: 600, y: 190, weight: 0.8 } },
      { kind: 'rock', config: { x: 700, y: 200 } },
    ],
  },
  {
    id: 'trampoline-park',
    title: 'Trampoline Park',
    description: 'Falling parts ricochet between springy pads instead of dying on the floor.',
    emoji: '🤸',
    reliability: 'low-risk',
    createParts: () => [
      { kind: 'trampoline', config: { x: 280, y: 500, width: 180 } },
      { kind: 'trampoline', config: { x: 620, y: 460, width: 160 } },
      { kind: 'wall', config: { x: 110, y: 430, height: 180 } },
      { kind: 'wall', config: { x: 850, y: 390, height: 240 } },
      { kind: 'ball', config: { x: 250, y: 120, radius: 16 } },
      { kind: 'ball', config: { x: 430, y: 80, radius: 12 } },
      { kind: 'cargo-block', config: { x: 560, y: 120, weight: 1 } },
      { kind: 'rock', config: { x: 700, y: 100 } },
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
  {
    id: 'pulley-playground',
    title: 'Pulley Playground',
    description: 'A rope reroutes through pulleys while a flywheel spins beside it.',
    emoji: '🪢',
    reliability: 'safe',
    createParts: () => [
      { id: 'pulley-playground-motor', kind: 'motor', label: 'Drive Motor', config: { x: 170, y: 150, rpm: 100, torque: 1, powerState: true } },
      { id: 'pulley-playground-drive', kind: 'pulley', label: 'Drive Pulley', config: { x: 250, y: 150, radius: 28 } },
      { id: 'pulley-playground-idler', kind: 'pulley', label: 'Idler Pulley', config: { x: 390, y: 120, radius: 24 } },
      { id: 'pulley-playground-flywheel', kind: 'flywheel', label: 'Flywheel', config: { x: 540, y: 150, radius: 38, mass: 6 } },
      { id: 'pulley-playground-belt', kind: 'belt-link', label: 'Drive Belt', config: { fromId: 'pulley-playground-drive', viaIds: ['pulley-playground-idler'], toId: 'pulley-playground-flywheel', length: 330 } },
      { id: 'pulley-playground-winch', kind: 'winch', label: 'Winch', config: { x: 170, y: 250, speed: 30, ropeLength: 220 } },
      { id: 'pulley-playground-rope-idler', kind: 'pulley', label: 'Rope Pulley', config: { x: 360, y: 190, radius: 28 } },
      { id: 'pulley-playground-bucket', kind: 'bucket', label: 'Bucket', config: { x: 620, y: 360, width: 42, depth: 30 } },
      { id: 'pulley-playground-rope', kind: 'rope', label: 'Bucket Rope', config: { fromId: 'pulley-playground-winch', viaIds: ['pulley-playground-rope-idler'], toId: 'pulley-playground-bucket', length: 360 } },
      { kind: 'cargo-block', config: { x: 620, y: 320, weight: 1 } },
      { kind: 'hopper', config: { x: 760, y: 420, capacity: 8, releaseRate: 0, fill: 0 } },
    ],
  },
  {
    id: 'crane-carnival',
    title: 'Crane Carnival',
    description: 'A prebuilt powered crane arm swings cargo toward a waiting hopper.',
    emoji: '🎡',
    reliability: 'low-risk',
    createParts: () => [
      { id: 'crane-carnival-motor', kind: 'motor', label: 'Crane Motor', config: { x: 170, y: 255, rpm: 90, torque: 1, powerState: true } },
      { id: 'crane-carnival-base', kind: 'chassis', label: 'Crane Base', config: { x: 320, y: 360, width: 220, height: 24 } },
      { id: 'crane-carnival-arm', kind: 'crane-arm', label: 'Crane Arm', config: { x: 320, y: 340, length: 190 } },
      { id: 'crane-carnival-counterweight', kind: 'counterweight', label: 'Counterweight', config: { x: 250, y: 340, mass: 7, attachedToId: 'crane-carnival-arm' } },
      {
        id: 'crane-carnival-hinge',
        kind: 'powered-hinge-link',
        label: 'Powered Hinge',
        config: {
          fromId: 'crane-carnival-base',
          toId: 'crane-carnival-arm',
          pivotX: 320,
          pivotY: 340,
          fromLocalX: 0,
          fromLocalY: -18,
          toLocalX: -95,
          toLocalY: 0,
          minAngle: -55,
          maxAngle: 65,
          motorId: 'crane-carnival-motor',
          targetAngle: 38,
          enabled: true,
        },
      },
      { kind: 'cargo-block', config: { x: 560, y: 340, weight: 1 } },
      { kind: 'cargo-block', config: { x: 596, y: 340, weight: 1 } },
      { kind: 'hopper', config: { x: 770, y: 390, capacity: 10, releaseRate: 0, fill: 0 } },
    ],
  },
  {
    id: 'spring-circus',
    title: 'Spring Circus',
    description: 'Three launch springs send balls and cargo into a chaotic juggling act.',
    emoji: '🎪',
    reliability: 'safe',
    createParts: () => [
      { kind: 'platform', config: { x: 240, y: 385, width: 220 } },
      { kind: 'platform', config: { x: 480, y: 345, width: 220 } },
      { kind: 'platform', config: { x: 720, y: 385, width: 220 } },
      { kind: 'spring-linear', config: { x: 180, y: 320, orientation: 'vertical', restLength: 58, stiffness: 0.22 } },
      { kind: 'spring-linear', config: { x: 480, y: 275, orientation: 'vertical', restLength: 64, stiffness: 0.25 } },
      { kind: 'spring-linear', config: { x: 760, y: 320, orientation: 'vertical', restLength: 58, stiffness: 0.22 } },
      { kind: 'ball', config: { x: 180, y: 180, radius: 14 } },
      { kind: 'ball', config: { x: 480, y: 150, radius: 12 } },
      { kind: 'cargo-block', config: { x: 760, y: 180, weight: 1 } },
      { kind: 'bucket', config: { x: 620, y: 200, width: 42, depth: 28 } },
    ],
  },
  {
    id: 'silo-spill',
    title: 'Silo Spill',
    description: 'A loaded silo is ready to dump the moment you open the floor gate.',
    emoji: '🏺',
    reliability: 'low-risk',
    createParts: () => [
      { id: 'silo-spill-bin', kind: 'silo-bin', label: 'Silo Bin', config: { x: 330, y: 280, width: 90, height: 150, gateOpen: false } },
      { kind: 'material-pile', config: { x: 330, y: 170, quantity: 16 } },
      { kind: 'chute', config: { x: 470, y: 380, length: 140, angle: 28 } },
      { kind: 'hopper', config: { x: 650, y: 430, capacity: 12, releaseRate: 0, fill: 0 } },
      { kind: 'cargo-block', config: { x: 250, y: 430, weight: 1 } },
      { kind: 'cargo-block', config: { x: 290, y: 430, weight: 1 } },
      { kind: 'trampoline', config: { x: 810, y: 500, width: 140 } },
      { kind: 'ball', config: { x: 770, y: 150, radius: 14 } },
    ],
  },
  {
    id: 'tunnel-trouble',
    title: 'Tunnel Trouble',
    description: 'Balls race down mismatched ramps and try to survive the tunnel maze.',
    emoji: '🚇',
    reliability: 'safe',
    createParts: () => [
      { kind: 'ramp', config: { x: 190, y: 400, width: 220, angle: -20 } },
      { kind: 'tunnel', config: { x: 430, y: 305, width: 180, angle: -6 } },
      { kind: 'chute', config: { x: 650, y: 270, length: 120, angle: -26 } },
      { kind: 'platform', config: { x: 820, y: 390, width: 160 } },
      { kind: 'wall', config: { x: 560, y: 350, height: 140 } },
      { kind: 'ball', config: { x: 120, y: 280, radius: 16 } },
      { kind: 'ball', config: { x: 170, y: 230, radius: 12 } },
      { kind: 'rock', config: { x: 250, y: 240 } },
    ],
  },
  {
    id: 'flywheel-fair',
    title: 'Flywheel Fair',
    description: 'One motor spins a belt-fed flywheel while cargo cruises toward a hopper.',
    emoji: '🛞',
    reliability: 'safe',
    createParts: () => [
      { id: 'flywheel-fair-motor', kind: 'motor', label: 'Fair Motor', config: { x: 180, y: 245, rpm: 110, torque: 1, powerState: true } },
      { id: 'flywheel-fair-pulley', kind: 'pulley', label: 'Drive Pulley', config: { x: 260, y: 245, radius: 28 } },
      { id: 'flywheel-fair-flywheel', kind: 'flywheel', label: 'Flywheel', config: { x: 430, y: 245, radius: 40, mass: 8 } },
      { id: 'flywheel-fair-belt', kind: 'belt-link', label: 'Drive Belt', config: { fromId: 'flywheel-fair-pulley', toId: 'flywheel-fair-flywheel', length: 180 } },
      { kind: 'conveyor', config: { path: [{ x: 220, y: 360 }, { x: 760, y: 360 }], speed: 50, direction: 'forward' } },
      { kind: 'hopper', config: { x: 790, y: 420, capacity: 10, releaseRate: 0, fill: 0 } },
      { kind: 'cargo-block', config: { x: 310, y: 340, weight: 1 } },
      { kind: 'cargo-block', config: { x: 360, y: 340, weight: 1 } },
      { kind: 'cargo-block', config: { x: 410, y: 340, weight: 1 } },
    ],
  },
  {
    id: 'bucket-brigade',
    title: 'Bucket Brigade',
    description: 'A bucket hoist starts loaded and ready for a clumsy delivery run.',
    emoji: '🧺',
    reliability: 'safe',
    createParts: () => [
      { id: 'bucket-brigade-motor', kind: 'motor', label: 'Hoist Motor', config: { x: 170, y: 150, rpm: 95, torque: 1, powerState: true } },
      { id: 'bucket-brigade-winch', kind: 'winch', label: 'Winch', config: { x: 220, y: 160, speed: 30, ropeLength: 210 } },
      { id: 'bucket-brigade-bucket', kind: 'bucket', label: 'Bucket', config: { x: 250, y: 330, width: 46, depth: 30 } },
      { id: 'bucket-brigade-rope', kind: 'rope', label: 'Bucket Rope', config: { fromId: 'bucket-brigade-winch', toId: 'bucket-brigade-bucket', length: 210 } },
      { kind: 'cargo-block', config: { x: 250, y: 300, weight: 1 } },
      { kind: 'cargo-block', config: { x: 280, y: 300, weight: 1 } },
      { kind: 'platform', config: { x: 240, y: 420, width: 220 } },
      { kind: 'platform', config: { x: 720, y: 420, width: 220 } },
      { kind: 'hopper', config: { x: 760, y: 390, capacity: 10, releaseRate: 0, fill: 0 } },
    ],
  },
  {
    id: 'gear-garden',
    title: 'Gear Garden',
    description: 'Meshed gears, pulleys, and a flywheel all bloom around one busy motor.',
    emoji: '🌻',
    reliability: 'safe',
    createParts: () => [
      { id: 'gear-garden-motor', kind: 'motor', config: { x: 200, y: 220, rpm: 100, torque: 1, powerState: true } },
      { id: 'gear-garden-gear-a', kind: 'gear', config: { x: 280, y: 220, teeth: 22, input: true, color: '#f4b942' } },
      { id: 'gear-garden-gear-b', kind: 'gear', config: { x: 350, y: 220, teeth: 34, input: false, color: '#67b7d1' } },
      { id: 'gear-garden-pulley', kind: 'pulley', config: { x: 430, y: 220, radius: 28 } },
      { id: 'gear-garden-sprocket', kind: 'chain-sprocket', config: { x: 510, y: 220, radius: 26 } },
      { id: 'gear-garden-flywheel', kind: 'flywheel', config: { x: 610, y: 220, radius: 42, mass: 8 } },
      { kind: 'belt-link', config: { fromId: 'gear-garden-pulley', toId: 'gear-garden-flywheel', length: 220 } },
      { kind: 'platform', config: { x: 430, y: 390, width: 500 } },
      { kind: 'ball', config: { x: 710, y: 140, radius: 14 } },
    ],
  },
  {
    id: 'wagon-wash',
    title: 'Wagon Wash',
    description: 'A little train shuttles cargo past a giant water tank and down the line.',
    emoji: '🫧',
    reliability: 'low-risk',
    createParts: () => [
      { id: 'wagon-wash-track', kind: 'rail-segment', label: 'Wash Rail', config: { points: [{ x: 140, y: 270 }, { x: 820, y: 270 }], segmentType: 'straight' } },
      { id: 'wagon-wash-loco', kind: 'locomotive', label: 'Locomotive', config: { trackId: 'wagon-wash-track', progress: 0.04, speed: 0.35, enabled: true } },
      { id: 'wagon-wash-wagon', kind: 'wagon', label: 'Wagon', config: { trackId: 'wagon-wash-track', offset: -0.08, capacity: 4 } },
      { kind: 'motor', config: { x: 180, y: 205, rpm: 95, torque: 1, powerState: true } },
      { kind: 'station-zone', config: { x: 220, y: 320, width: 140, height: 120, action: 'load' } },
      { kind: 'station-zone', config: { x: 700, y: 320, width: 150, height: 140, action: 'unload' } },
      { kind: 'cargo-block', config: { x: 206, y: 316, weight: 1 } },
      { kind: 'cargo-block', config: { x: 232, y: 316, weight: 1 } },
      { kind: 'water', config: { x: 480, y: 395, width: 260, height: 150, density: 1.1 } },
      { kind: 'hopper', config: { x: 720, y: 420, capacity: 10, releaseRate: 0, fill: 0 } },
    ],
  },
  {
    id: 'trampoline-mailroom',
    title: 'Trampoline Mailroom',
    description: 'Mailballs bounce across spring pads, bank off a wall, and try to hit the bucket.',
    emoji: '📬',
    reliability: 'safe',
    createParts: () => [
      { kind: 'trampoline', config: { x: 220, y: 500, width: 170 } },
      { kind: 'trampoline', config: { x: 500, y: 455, width: 160 } },
      { kind: 'trampoline', config: { x: 760, y: 410, width: 150 } },
      { kind: 'wall', config: { x: 640, y: 300, height: 180 } },
      { kind: 'bucket', config: { x: 860, y: 270, width: 42, depth: 28 } },
      { kind: 'ball', config: { x: 180, y: 120, radius: 16 } },
      { kind: 'ball', config: { x: 260, y: 90, radius: 12 } },
      { kind: 'ball', config: { x: 340, y: 140, radius: 14 } },
    ],
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
