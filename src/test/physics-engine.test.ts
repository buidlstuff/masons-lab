import Matter from 'matter-js';
import { describe, expect, it } from 'vitest';
import { buildMatterWorld } from '../lib/physics-engine';
import { createEmptyManifest } from '../lib/seed-data';

function normalizeAngle(angle: number) {
  let next = angle;
  while (next > Math.PI) next -= Math.PI * 2;
  while (next < -Math.PI) next += Math.PI * 2;
  return next;
}

function stepWorld(
  world: ReturnType<typeof buildMatterWorld>,
  frames: number,
) {
  let rotations: Record<string, number> = {};
  let hookY = 0;
  let hopperFill = 0;
  let trainProgress = 0;
  let frame = world.tick(0, rotations, hookY, hopperFill, trainProgress);

  for (let index = 0; index < frames; index += 1) {
    Matter.Engine.update(world.engine, 1000 / 60);
    frame = world.tick(1 / 60, rotations, hookY, hopperFill, trainProgress);
    rotations = frame.rotations;
    hookY = frame.hookY ?? hookY;
    hopperFill = frame.hopperFill ?? hopperFill;
    trainProgress = frame.trainProgress;
  }

  return frame;
}

describe('physics engine conveyor flow', () => {
  it('applies world physics overrides once after the world is built', () => {
    const manifest = createEmptyManifest();
    manifest.world.physicsOverrides = {
      gravityY: 0.2,
      globalRestitution: 0.81,
      globalFriction: 0.005,
    };
    manifest.primitives = [
      {
        id: 'ball-1',
        kind: 'ball',
        label: 'Ball',
        config: { x: 240, y: 180, radius: 14 },
      },
    ];

    const world = buildMatterWorld(manifest);
    const ball = Matter.Composite.allBodies(world.engine.world).find((body) => body.label === 'ball-1');

    expect(world.engine.gravity.y).toBeCloseTo(0.2);
    expect(ball).toBeTruthy();
    expect(ball?.restitution).toBeCloseTo(0.81);
    expect(ball?.friction).toBeCloseTo(0.005);
    expect(ball?.frictionStatic).toBeCloseTo(0.005);
    world.cleanup();
  });

  it('powers the belt and captures cargo into the hopper', () => {
    const manifest = createEmptyManifest();
    manifest.primitives = [
      {
        id: 'conv-1',
        kind: 'conveyor',
        label: 'Conveyor',
        config: { path: [{ x: 220, y: 300 }, { x: 560, y: 300 }], speed: 45, direction: 'forward' },
      },
      {
        id: 'hopper-1',
        kind: 'hopper',
        label: 'Hopper',
        config: { x: 580, y: 390, capacity: 10, releaseRate: 1.5, fill: 0 },
      },
      {
        id: 'motor-1',
        kind: 'motor',
        label: 'Motor',
        config: { x: 170, y: 282, rpm: 90, torque: 1, powerState: true },
      },
      {
        id: 'cargo-1',
        kind: 'cargo-block',
        label: 'Cargo',
        config: { x: 280, y: 288, weight: 1 },
      },
    ];

    const world = buildMatterWorld(manifest, {
      stableCargoSpawns: { 'cargo-1': { x: 280, y: 288 } },
    });
    const frame = stepWorld(world, 240);

    expect(frame.beltPowered).toBe(true);
    expect(frame.hopperFill ?? 0).toBeGreaterThanOrEqual(1);
    expect(frame.cargoStates['cargo-1']).toBe('collected');
    world.cleanup();
  });

  it('does not auto-respawn settled cargo in silly scenes', () => {
    const manifest = createEmptyManifest();
    manifest.metadata.tags = [...manifest.metadata.tags, 'silly-scene'];
    manifest.primitives = [
      {
        id: 'cargo-1',
        kind: 'cargo-block',
        label: 'Cargo',
        config: { x: 480, y: 535, weight: 1 },
      },
    ];

    const world = buildMatterWorld(manifest, {
      stableCargoSpawns: { 'cargo-1': { x: 480, y: 535 } },
    });
    const frame = stepWorld(world, 180);

    expect(frame.lostCargoCount).toBe(0);
    expect(frame.bodyPositions['cargo-1']?.y).toBeGreaterThan(520);
    world.cleanup();
  });

  it('launches a ball upward when it lands on a trampoline', () => {
    const manifest = createEmptyManifest();
    manifest.primitives = [
      {
        id: 'trampoline-1',
        kind: 'trampoline',
        label: 'Trampoline',
        config: { x: 360, y: 430, width: 180 },
      },
      {
        id: 'ball-1',
        kind: 'ball',
        label: 'Ball',
        config: { x: 360, y: 320, radius: 14 },
      },
    ];

    const world = buildMatterWorld(manifest);
    const ballBody = Matter.Composite.allBodies(world.engine.world).find((body) => body.label === 'ball-1');
    expect(ballBody).toBeTruthy();

    let rotations: Record<string, number> = {};
    let hookY = 0;
    let hopperFill = 0;
    let trainProgress = 0;
    let sawBounce = false;

    for (let index = 0; index < 180; index += 1) {
      Matter.Engine.update(world.engine, 1000 / 60);
      const frame = world.tick(1 / 60, rotations, hookY, hopperFill, trainProgress);
      rotations = frame.rotations;
      hookY = frame.hookY ?? hookY;
      hopperFill = frame.hopperFill ?? hopperFill;
      trainProgress = frame.trainProgress;
      if ((ballBody?.velocity.y ?? 0) < -6) {
        sawBounce = true;
        break;
      }
    }

    expect(sawBounce).toBe(true);
    world.cleanup();
  });

  it('respawns cargo that falls irrecoverably out of bounds', () => {
    const manifest = createEmptyManifest();
    manifest.primitives = [
      {
        id: 'conv-1',
        kind: 'conveyor',
        label: 'Conveyor',
        config: { path: [{ x: 220, y: 300 }, { x: 560, y: 300 }], speed: 45, direction: 'forward' },
      },
      {
        id: 'cargo-1',
        kind: 'cargo-block',
        label: 'Cargo',
        config: { x: 1500, y: 900, weight: 1 },
      },
    ];

    const world = buildMatterWorld(manifest, {
      stableCargoSpawns: { 'cargo-1': { x: 260, y: 288 } },
    });
    const frame = stepWorld(world, 4);

    expect(frame.lostCargoCount).toBeGreaterThanOrEqual(1);
    expect(frame.bodyPositions['cargo-1']?.x).toBeLessThan(400);
    expect(frame.bodyPositions['cargo-1']?.y).toBeLessThan(360);
    expect(['respawned', 'supported', 'airborne']).toContain(frame.cargoStates['cargo-1']);
    world.cleanup();
  });

  it('keeps belt transmission working when routed through an idler', () => {
    const manifest = createEmptyManifest();
    manifest.primitives = [
      {
        id: 'motor-1',
        kind: 'motor',
        label: 'Motor',
        config: { x: 180, y: 220, rpm: 120, torque: 1, powerState: true },
      },
      {
        id: 'pulley-a',
        kind: 'pulley',
        label: 'Drive Pulley',
        config: { x: 230, y: 220, radius: 28 },
      },
      {
        id: 'pulley-idler',
        kind: 'pulley',
        label: 'Idler Pulley',
        config: { x: 340, y: 170, radius: 24 },
      },
      {
        id: 'flywheel-1',
        kind: 'flywheel',
        label: 'Flywheel',
        config: { x: 470, y: 220, radius: 36, mass: 5 },
      },
      {
        id: 'belt-1',
        kind: 'belt-link',
        label: 'Drive Belt',
        config: { fromId: 'pulley-a', toId: 'flywheel-1', viaIds: ['pulley-idler'], length: 280 },
      },
    ];

    const world = buildMatterWorld(manifest);
    const frame = stepWorld(world, 120);

    expect(Math.abs(frame.rotations['pulley-a'] ?? 0)).toBeGreaterThan(0.01);
    expect(Math.abs(frame.rotations['flywheel-1'] ?? 0)).toBeGreaterThan(0.01);
    world.cleanup();
  });

  it('shortens a rope to lift a bucket endpoint', () => {
    const manifest = createEmptyManifest();
    manifest.primitives = [
      {
        id: 'motor-1',
        kind: 'motor',
        label: 'Motor',
        config: { x: 140, y: 110, rpm: 90, torque: 1, powerState: true },
      },
      {
        id: 'winch-1',
        kind: 'winch',
        label: 'Winch',
        config: { x: 180, y: 120, speed: 30, ropeLength: 180 },
      },
      {
        id: 'bucket-1',
        kind: 'bucket',
        label: 'Bucket',
        config: { x: 180, y: 260, width: 40, depth: 30 },
      },
      {
        id: 'rope-1',
        kind: 'rope',
        label: 'Bucket Rope',
        config: { fromId: 'winch-1', toId: 'bucket-1', length: 180 },
      },
    ];

    const world = buildMatterWorld(manifest);
    const initial = stepWorld(world, 0);
    const frame = stepWorld(world, 180);

    expect(frame.bodyPositions['bucket-1']?.y).toBeLessThan((initial.bodyPositions['bucket-1']?.y ?? 999) - 10);
    world.cleanup();
  });

  it('lets a rope pull on a crane-arm tip', () => {
    const manifest = createEmptyManifest();
    manifest.primitives = [
      {
        id: 'motor-1',
        kind: 'motor',
        label: 'Motor',
        config: { x: 120, y: 120, rpm: 90, torque: 1, powerState: true },
      },
      {
        id: 'winch-1',
        kind: 'winch',
        label: 'Winch',
        config: { x: 160, y: 130, speed: 30, ropeLength: 230 },
      },
      {
        id: 'arm-1',
        kind: 'crane-arm',
        label: 'Crane Arm',
        config: { x: 220, y: 280, length: 140 },
      },
      {
        id: 'rope-1',
        kind: 'rope',
        label: 'Arm Rope',
        config: { fromId: 'winch-1', toId: 'arm-1', length: 230 },
      },
    ];

    const world = buildMatterWorld(manifest);
    const initial = stepWorld(world, 0);
    const frame = stepWorld(world, 180);
    const initialArm = initial.bodyPositions['arm-1'];
    const currentArm = frame.bodyPositions['arm-1'];

    expect(currentArm).toBeTruthy();
    expect(initialArm).toBeTruthy();
    expect(
      Math.hypot(
        (currentArm?.x ?? 0) - (initialArm?.x ?? 0),
        (currentArm?.y ?? 0) - (initialArm?.y ?? 0),
      ),
    ).toBeGreaterThan(10);
    world.cleanup();
  });

  it('keeps bolted parts rigidly aligned', () => {
    const manifest = createEmptyManifest();
    manifest.primitives = [
      {
        id: 'platform-1',
        kind: 'platform',
        label: 'Platform',
        config: { x: 220, y: 320, width: 140 },
      },
      {
        id: 'cargo-1',
        kind: 'cargo-block',
        label: 'Cargo',
        config: { x: 280, y: 320, weight: 1 },
      },
      {
        id: 'bolt-1',
        kind: 'bolt-link',
        label: 'Bolt Link',
        config: { fromId: 'platform-1', toId: 'cargo-1', offsetX: 60, offsetY: 0, angleOffset: 0 },
      },
    ];

    const world = buildMatterWorld(manifest);
    const frame = stepWorld(world, 90);

    expect(Math.abs((frame.bodyPositions['cargo-1']?.x ?? 0) - (frame.bodyPositions['platform-1']?.x ?? 0) - 60)).toBeLessThan(1);
    expect(Math.abs((frame.bodyPositions['cargo-1']?.y ?? 0) - (frame.bodyPositions['platform-1']?.y ?? 0))).toBeLessThan(1);
    world.cleanup();
  });

  it('drives a powered hinge toward its target angle', () => {
    const manifest = createEmptyManifest();
    manifest.primitives = [
      {
        id: 'motor-1',
        kind: 'motor',
        label: 'Motor',
        config: { x: 150, y: 220, rpm: 100, torque: 1, powerState: true },
      },
      {
        id: 'base-1',
        kind: 'chassis',
        label: 'Base',
        config: { x: 260, y: 300, width: 180, height: 24 },
      },
      {
        id: 'arm-1',
        kind: 'crane-arm',
        label: 'Arm',
        config: { x: 260, y: 280, length: 150 },
      },
      {
        id: 'hinge-1',
        kind: 'powered-hinge-link',
        label: 'Powered Hinge',
        config: {
          fromId: 'base-1',
          toId: 'arm-1',
          pivotX: 260,
          pivotY: 280,
          fromLocalX: 0,
          fromLocalY: -20,
          toLocalX: -75,
          toLocalY: 0,
          minAngle: -55,
          maxAngle: 65,
          motorId: 'motor-1',
          targetAngle: 35,
          enabled: true,
        },
      },
    ];
    manifest.controls = [
      {
        id: 'hinge-run',
        kind: 'toggle',
        label: 'Run',
        bind: { targetId: 'hinge-1', path: 'enabled' },
        defaultValue: true,
      },
      {
        id: 'hinge-target',
        kind: 'slider',
        label: 'Angle',
        bind: { targetId: 'hinge-1', path: 'targetAngle' },
        defaultValue: 35,
        min: -55,
        max: 65,
        step: 5,
      },
    ];

    const world = buildMatterWorld(manifest);
    const armBody = Matter.Composite.allBodies(world.engine.world).find((body) => body.label === 'arm-1');
    const frame = stepWorld(world, 180);
    const relativeAngle = normalizeAngle(
      (frame.bodyPositions['arm-1']?.angle ?? 0) - (frame.bodyPositions['base-1']?.angle ?? 0),
    );

    expect(relativeAngle).toBeCloseTo((35 * Math.PI) / 180, 1);
    expect(Math.abs(armBody?.angularVelocity ?? 0)).toBeLessThan(0.15);
    world.cleanup();
  });

  it('propels a simple wheeled chassis when the motor is mounted on it', () => {
    const manifest = createEmptyManifest();
    manifest.primitives = [
      {
        id: 'chassis-1',
        kind: 'chassis',
        label: 'Chassis',
        config: { x: 260, y: 470, width: 180, height: 24 },
      },
      {
        id: 'wheel-left',
        kind: 'wheel',
        label: 'Left Wheel',
        config: {
          x: 220,
          y: 494,
          radius: 28,
          traction: 0.9,
          attachedToId: 'chassis-1',
          attachOffsetX: -40,
          attachOffsetY: 24,
        },
      },
      {
        id: 'wheel-right',
        kind: 'wheel',
        label: 'Right Wheel',
        config: {
          x: 300,
          y: 494,
          radius: 28,
          traction: 0.9,
          attachedToId: 'chassis-1',
          attachOffsetX: 40,
          attachOffsetY: 24,
        },
      },
      {
        id: 'motor-1',
        kind: 'motor',
        label: 'Motor',
        config: {
          x: 260,
          y: 442,
          rpm: 90,
          torque: 1,
          powerState: true,
          attachedToId: 'chassis-1',
          attachOffsetX: 0,
          attachOffsetY: -10,
        },
      },
    ];

    const world = buildMatterWorld(manifest);
    const frame = stepWorld(world, 180);

    expect(frame.bodyPositions['chassis-1']?.x ?? 0).toBeGreaterThan(300);
    world.cleanup();
  });

  it('propels a wagon body when wheels and a motor are mounted onto it off rail', () => {
    const manifest = createEmptyManifest();
    manifest.primitives = [
      {
        id: 'wagon-1',
        kind: 'wagon',
        label: 'Wagon',
        config: { x: 260, y: 470, capacity: 6 },
      },
      {
        id: 'wheel-left',
        kind: 'wheel',
        label: 'Left Wheel',
        config: {
          x: 220,
          y: 494,
          radius: 28,
          traction: 0.9,
          attachedToId: 'wagon-1',
          attachOffsetX: -34,
          attachOffsetY: 24,
        },
      },
      {
        id: 'wheel-right',
        kind: 'wheel',
        label: 'Right Wheel',
        config: {
          x: 300,
          y: 494,
          radius: 28,
          traction: 0.9,
          attachedToId: 'wagon-1',
          attachOffsetX: 34,
          attachOffsetY: 24,
        },
      },
      {
        id: 'motor-1',
        kind: 'motor',
        label: 'Motor',
        config: {
          x: 260,
          y: 442,
          rpm: 90,
          torque: 1,
          powerState: true,
          attachedToId: 'wagon-1',
          attachOffsetX: 0,
          attachOffsetY: -10,
        },
      },
    ];

    const world = buildMatterWorld(manifest);
    const frame = stepWorld(world, 180);

    expect(Math.abs((frame.bodyPositions['wagon-1']?.x ?? 0) - 260)).toBeGreaterThan(20);
    world.cleanup();
  });

  it('lets a wagon cruise along rail even without a locomotive', () => {
    const manifest = createEmptyManifest();
    manifest.primitives = [
      {
        id: 'track-1',
        kind: 'rail-segment',
        label: 'Rail',
        config: { points: [{ x: 180, y: 250 }, { x: 760, y: 250 }], segmentType: 'straight' },
      },
      {
        id: 'wagon-1',
        kind: 'wagon',
        label: 'Wagon',
        config: { trackId: 'track-1', progress: 0.05, capacity: 4 },
      },
    ];

    const world = buildMatterWorld(manifest);
    const frame = stepWorld(world, 180);

    expect(frame.bodyPositions['wagon-1']?.x ?? 0).toBeGreaterThan(300);
    world.cleanup();
  });

  it('keeps bolted cargo attached to a rail-bound locomotive while it moves', () => {
    const manifest = createEmptyManifest();
    manifest.primitives = [
      {
        id: 'track-1',
        kind: 'rail-segment',
        label: 'Rail',
        config: { points: [{ x: 180, y: 250 }, { x: 760, y: 250 }], segmentType: 'straight' },
      },
      {
        id: 'loco-1',
        kind: 'locomotive',
        label: 'Locomotive',
        config: { trackId: 'track-1', progress: 0.05, speed: 0.5, enabled: true },
      },
      {
        id: 'cargo-1',
        kind: 'cargo-block',
        label: 'Cargo',
        config: { x: 240, y: 250, weight: 1 },
      },
      {
        id: 'bolt-1',
        kind: 'bolt-link',
        label: 'Bolt Link',
        config: { fromId: 'loco-1', toId: 'cargo-1', offsetX: 34, offsetY: 0, angleOffset: 0 },
      },
    ];

    const world = buildMatterWorld(manifest);
    const frame = stepWorld(world, 180);
    const locoX = frame.bodyPositions['loco-1']?.x ?? 0;
    const cargoX = frame.bodyPositions['cargo-1']?.x ?? 0;

    expect(locoX).toBeGreaterThan(300);
    expect(Math.abs((cargoX - locoX) - 34)).toBeLessThan(10);
    world.cleanup();
  });

  it('loads wagon cargo and unloads it into a hopper downstream', () => {
    const manifest = createEmptyManifest();
    manifest.primitives = [
      {
        id: 'track-1',
        kind: 'rail-segment',
        label: 'Rail',
        config: { points: [{ x: 180, y: 250 }, { x: 640, y: 250 }], segmentType: 'straight' },
      },
      {
        id: 'loco-1',
        kind: 'locomotive',
        label: 'Locomotive',
        config: { trackId: 'track-1', progress: 0, speed: 0.65 },
      },
      {
        id: 'wagon-1',
        kind: 'wagon',
        label: 'Wagon',
        config: { trackId: 'track-1', offset: 0, capacity: 4 },
      },
      {
        id: 'hopper-1',
        kind: 'hopper',
        label: 'Hopper',
        config: { x: 560, y: 390, capacity: 10, releaseRate: 1.5, fill: 0 },
      },
      {
        id: 'cargo-1',
        kind: 'cargo-block',
        label: 'Cargo',
        config: { x: 180, y: 250, weight: 1 },
      },
    ];

    const world = buildMatterWorld(manifest, {
      stableCargoSpawns: { 'cargo-1': { x: 180, y: 250 } },
    });
    const frame = stepWorld(world, 300);

    expect(frame.hopperFill ?? 0).toBeGreaterThanOrEqual(1);
    expect(frame.wagonLoads['wagon-1'] ?? 0).toBe(0);
    expect(frame.cargoStates['cargo-1']).toBe('collected');
    world.cleanup();
  });

  it('lets a nearby powered motor boost locomotive speed on the track', () => {
    const manifest = createEmptyManifest();
    manifest.primitives = [
      {
        id: 'track-1',
        kind: 'rail-segment',
        label: 'Rail',
        config: { points: [{ x: 180, y: 260 }, { x: 780, y: 260 }], segmentType: 'straight' },
      },
      {
        id: 'loco-1',
        kind: 'locomotive',
        label: 'Locomotive',
        config: { trackId: 'track-1', progress: 0, speed: 0 },
      },
      {
        id: 'motor-1',
        kind: 'motor',
        label: 'Motor',
        config: { x: 220, y: 210, rpm: 90, torque: 1, powerState: true },
      },
    ];

    const world = buildMatterWorld(manifest);
    const frame = stepWorld(world, 180);

    expect(frame.trainProgress).toBeGreaterThan(0.2);
    world.cleanup();
  });

  it('loads wagon cargo at a station zone and unloads it at a later station', () => {
    const manifest = createEmptyManifest();
    manifest.primitives = [
      {
        id: 'track-1',
        kind: 'rail-segment',
        label: 'Rail',
        config: { points: [{ x: 180, y: 280 }, { x: 780, y: 280 }], segmentType: 'straight' },
      },
      {
        id: 'loco-1',
        kind: 'locomotive',
        label: 'Locomotive',
        config: { trackId: 'track-1', progress: 0, speed: 0.55 },
      },
      {
        id: 'wagon-1',
        kind: 'wagon',
        label: 'Wagon',
        config: { trackId: 'track-1', offset: 0, capacity: 4 },
      },
      {
        id: 'station-load',
        kind: 'station-zone',
        label: 'Load Station',
        config: { x: 230, y: 320, width: 140, height: 130, action: 'load' },
      },
      {
        id: 'station-unload',
        kind: 'station-zone',
        label: 'Unload Station',
        config: { x: 720, y: 340, width: 150, height: 180, action: 'unload' },
      },
      {
        id: 'cargo-1',
        kind: 'cargo-block',
        label: 'Cargo',
        config: { x: 230, y: 316, weight: 1 },
      },
    ];

    const world = buildMatterWorld(manifest, {
      stableCargoSpawns: { 'cargo-1': { x: 230, y: 316 } },
    });
    const frame = stepWorld(world, 300);

    expect(frame.wagonLoads['wagon-1'] ?? 0).toBe(0);
    expect(frame.wagonCargo['wagon-1'] ?? []).toHaveLength(0);
    expect(frame.bodyPositions['cargo-1']?.x).toBeGreaterThan(650);
    world.cleanup();
  });

  it('treats water as a floaty low-gravity zone instead of losing cargo', () => {
    const manifest = createEmptyManifest();
    manifest.primitives = [
      {
        id: 'water-1',
        kind: 'water',
        label: 'Water',
        config: { x: 480, y: 410, width: 320, height: 180, density: 1.1 },
      },
      {
        id: 'cargo-1',
        kind: 'cargo-block',
        label: 'Cargo',
        config: { x: 480, y: 360, weight: 1 },
      },
    ];

    const world = buildMatterWorld(manifest, {
      stableCargoSpawns: { 'cargo-1': { x: 480, y: 360 } },
    });
    const frame = stepWorld(world, 240);

    expect(frame.lostCargoCount).toBe(0);
    expect(frame.cargoStates['cargo-1']).not.toBe('respawned');
    expect(frame.bodyPositions['cargo-1']?.y ?? 0).toBeGreaterThan(200);
    expect(frame.bodyPositions['cargo-1']?.y ?? 999).toBeLessThan(540);
    world.cleanup();
  });

  it('routes a locomotive onto the selected rail-switch branch', () => {
    const manifest = createEmptyManifest();
    manifest.primitives = [
      {
        id: 'track-main',
        kind: 'rail-segment',
        label: 'Main Track',
        config: { points: [{ x: 180, y: 260 }, { x: 500, y: 260 }], segmentType: 'straight' },
      },
      {
        id: 'switch-1',
        kind: 'rail-switch',
        label: 'Switch',
        config: { x: 500, y: 260, branch: 'right' },
      },
      {
        id: 'track-left',
        kind: 'rail-segment',
        label: 'Left Branch',
        config: { points: [{ x: 500, y: 260 }, { x: 760, y: 190 }], segmentType: 'straight' },
      },
      {
        id: 'track-right',
        kind: 'rail-segment',
        label: 'Right Branch',
        config: { points: [{ x: 500, y: 260 }, { x: 760, y: 340 }], segmentType: 'straight' },
      },
      {
        id: 'loco-1',
        kind: 'locomotive',
        label: 'Locomotive',
        config: { trackId: 'track-main', progress: 0, speed: 0.95, enabled: true },
      },
      {
        id: 'wagon-1',
        kind: 'wagon',
        label: 'Wagon',
        config: { trackId: 'track-main', offset: -0.08, capacity: 4 },
      },
    ];
    manifest.controls = [
      {
        id: 'switch-1-branch-right',
        kind: 'toggle',
        label: 'Right Branch',
        bind: { targetId: 'switch-1', path: 'branchRight' },
        defaultValue: true,
      },
      {
        id: 'loco-1-enabled',
        kind: 'toggle',
        label: 'Run',
        bind: { targetId: 'loco-1', path: 'enabled' },
        defaultValue: true,
      },
    ];

    const leftWorld = buildMatterWorld(manifest);
    leftWorld.applyControls({ 'switch-1-branch-right': false, 'loco-1-enabled': true });
    const leftFrame = stepWorld(leftWorld, 180);

    expect(leftFrame.trainTrackId).toBe('track-left');
    expect(leftFrame.bodyPositions['loco-1']?.y ?? 999).toBeLessThan(250);
    leftWorld.cleanup();

    const rightWorld = buildMatterWorld(manifest);
    rightWorld.applyControls({ 'switch-1-branch-right': true, 'loco-1-enabled': true });
    const rightFrame = stepWorld(rightWorld, 180);

    expect(rightFrame.trainTrackId).toBe('track-right');
    expect(rightFrame.bodyPositions['loco-1']?.y ?? 0).toBeGreaterThan(280);
    rightWorld.cleanup();
  });
});

describe('dynamic hook grab', () => {
  it('grabs a ball that falls onto the hook', () => {
    const manifest = createEmptyManifest();
    manifest.primitives = [
      { id: 'hook-1', kind: 'hook', label: 'Hook', config: { x: 300, y: 300 } },
      { id: 'ball-1', kind: 'ball', label: 'Ball', config: { x: 300, y: 260, radius: 14 } },
    ];

    const world = buildMatterWorld(manifest);
    const frame = stepWorld(world, 60);
    expect(frame.hookGrabs['hook-1']).toBe('ball-1');
    world.cleanup();
  });

  it('does not double-grab when hook has static attachedToId cargo', () => {
    const manifest = createEmptyManifest();
    manifest.primitives = [
      { id: 'hook-1', kind: 'hook', label: 'Hook', config: { x: 300, y: 300 } },
      { id: 'cargo-1', kind: 'cargo-block', label: 'Cargo', config: { x: 300, y: 320, weight: 1, attachedToId: 'hook-1' } },
      { id: 'ball-1', kind: 'ball', label: 'Ball', config: { x: 300, y: 260, radius: 14 } },
    ];

    const world = buildMatterWorld(manifest);
    const frame = stepWorld(world, 60);
    // Hook already has cargo attached, should not grab ball
    expect(frame.hookGrabs['hook-1']).toBe('cargo-1');
    world.cleanup();
  });

  it('patchPositions updates body position without rebuild', () => {
    const manifest = createEmptyManifest();
    manifest.primitives = [
      { id: 'ball-1', kind: 'ball', label: 'Ball', config: { x: 200, y: 200, radius: 14 } },
    ];

    const world = buildMatterWorld(manifest);
    const success = world.patchPositions({ 'ball-1': { x: 400, y: 200 } });
    expect(success).toBe(true);

    const body = Matter.Composite.allBodies(world.engine.world).find((b) => b.label === 'ball-1');
    expect(body?.position.x).toBeCloseTo(400);
    world.cleanup();
  });

  it('patchPositions returns false for unknown primitive', () => {
    const manifest = createEmptyManifest();
    manifest.primitives = [
      { id: 'ball-1', kind: 'ball', label: 'Ball', config: { x: 200, y: 200, radius: 14 } },
    ];

    const world = buildMatterWorld(manifest);
    const success = world.patchPositions({ 'nonexistent': { x: 400, y: 200 } });
    expect(success).toBe(false);
    world.cleanup();
  });
});
