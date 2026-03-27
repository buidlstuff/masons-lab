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
    expect(frame.throughput).toBeGreaterThan(0);
    expect(frame.cargoStates['cargo-1']).toBe('collected');
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
});
