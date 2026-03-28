import Matter from 'matter-js';
import { describe, expect, it } from 'vitest';
import { buildMatterWorld } from '../lib/physics-engine';
import { createEmptyManifest } from '../lib/seed-data';

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
});
