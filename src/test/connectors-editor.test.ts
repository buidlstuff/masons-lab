import { describe, expect, it } from 'vitest';
import { addPrimitive, connectPrimitives, deletePrimitive, movePrimitive } from '../lib/editor';
import { createEmptyManifest } from '../lib/seed-data';

describe('editor connector flows', () => {
  it('creates ropes to bucket endpoints', () => {
    const manifest = createEmptyManifest();
    manifest.primitives = [
      { id: 'winch-1', kind: 'winch', label: 'Winch', config: { x: 180, y: 120, speed: 30, ropeLength: 180 } },
      { id: 'bucket-1', kind: 'bucket', label: 'Bucket', config: { x: 180, y: 260, width: 40, depth: 30 } },
    ];

    const connected = connectPrimitives(manifest, 'winch-1', 'bucket-1', { forceKind: 'rope' });
    const rope = connected.primitives.find((primitive) => primitive.kind === 'rope');

    expect(rope).toBeTruthy();
    expect((rope?.config as { fromId: string }).fromId).toBe('winch-1');
    expect((rope?.config as { toId: string }).toId).toBe('bucket-1');
  });

  it('creates ropes to ball and rock endpoints', () => {
    const manifest = createEmptyManifest();
    manifest.primitives = [
      { id: 'winch-1', kind: 'winch', label: 'Winch', config: { x: 180, y: 120, speed: 30, ropeLength: 180 } },
      { id: 'ball-1', kind: 'ball', label: 'Ball', config: { x: 180, y: 280, radius: 16 } },
      { id: 'rock-1', kind: 'rock', label: 'Rock', config: { x: 300, y: 280 } },
    ];

    const withBallRope = connectPrimitives(manifest, 'winch-1', 'ball-1', { forceKind: 'rope' });
    const ballRope = withBallRope.primitives.find((p) => p.kind === 'rope');
    expect(ballRope).toBeTruthy();
    expect((ballRope?.config as { toId: string }).toId).toBe('ball-1');

    // Add a second winch for the rock rope
    withBallRope.primitives.push(
      { id: 'winch-2', kind: 'winch', label: 'Winch 2', config: { x: 300, y: 120, speed: 30, ropeLength: 180 } },
    );
    const withRockRope = connectPrimitives(withBallRope, 'winch-2', 'rock-1', { forceKind: 'rope' });
    const rockRope = withRockRope.primitives.find((p) => p.kind === 'rope' && (p.config as { toId: string }).toId === 'rock-1');
    expect(rockRope).toBeTruthy();
  });

  it('moves bolted islands together', () => {
    const manifest = createEmptyManifest();
    manifest.primitives = [
      { id: 'platform-1', kind: 'platform', label: 'Platform', config: { x: 200, y: 320, width: 120 } },
      { id: 'cargo-1', kind: 'cargo-block', label: 'Cargo', config: { x: 260, y: 320, weight: 1 } },
      {
        id: 'bolt-1',
        kind: 'bolt-link',
        label: 'Bolt Link',
        config: { fromId: 'platform-1', toId: 'cargo-1', offsetX: 60, offsetY: 0, angleOffset: 0 },
      },
    ];

    const moved = movePrimitive(manifest, 'platform-1', 320, 360);
    const platform = moved.primitives.find((primitive) => primitive.id === 'platform-1');
    const cargo = moved.primitives.find((primitive) => primitive.id === 'cargo-1');

    expect((platform?.config as { x: number }).x).toBe(320);
    expect((platform?.config as { y: number }).y).toBe(360);
    expect((cargo?.config as { x: number }).x).toBe(380);
    expect((cargo?.config as { y: number }).y).toBe(360);
  });

  it('deletes powered hinge connectors and bound controls when the motor is removed', () => {
    const manifest = createEmptyManifest();
    manifest.primitives = [
      { id: 'motor-1', kind: 'motor', label: 'Motor', config: { x: 120, y: 180, rpm: 90, torque: 1, powerState: true } },
      { id: 'base-1', kind: 'chassis', label: 'Base', config: { x: 220, y: 260, width: 160, height: 24 } },
      { id: 'arm-1', kind: 'crane-arm', label: 'Arm', config: { x: 220, y: 240, length: 140 } },
    ];

    const connected = connectPrimitives(manifest, 'base-1', 'arm-1', {
      forceKind: 'powered-hinge-link',
      motorId: 'motor-1',
    });
    const connector = connected.primitives.find((primitive) => primitive.kind === 'powered-hinge-link');
    expect(connector).toBeTruthy();
    expect(connected.controls).toHaveLength(2);

    const cleaned = deletePrimitive(connected, 'motor-1');

    expect(cleaned.primitives.some((primitive) => primitive.kind === 'powered-hinge-link')).toBe(false);
    expect(cleaned.controls).toHaveLength(0);
  });

  it('snaps rail vehicles onto nearby track when they are placed', () => {
    const manifest = createEmptyManifest();
    manifest.primitives = [
      {
        id: 'track-1',
        kind: 'rail-segment',
        label: 'Rail',
        config: { points: [{ x: 160, y: 260 }, { x: 640, y: 260 }], segmentType: 'straight' },
      },
    ];

    const withLocomotive = addPrimitive(manifest, 'locomotive', 320, 272);
    const locomotive = withLocomotive.primitives.find((primitive) => primitive.kind === 'locomotive');
    expect((locomotive?.config as { trackId?: string }).trackId).toBe('track-1');
    expect((locomotive?.config as { progress?: number }).progress ?? 0).toBeGreaterThan(0.25);
    expect((locomotive?.config as { progress?: number }).progress ?? 0).toBeLessThan(0.4);

    const withWagon = addPrimitive(withLocomotive, 'wagon', 520, 250);
    const wagon = withWagon.primitives.find((primitive) => primitive.kind === 'wagon');
    expect((wagon?.config as { trackId?: string }).trackId).toBe('track-1');
    expect((wagon?.config as { progress?: number }).progress ?? 0).toBeGreaterThan(0.7);
  });

  it('lets snapped wagons drag back off the rail into free-body mode', () => {
    const manifest = createEmptyManifest();
    manifest.primitives = [
      {
        id: 'track-1',
        kind: 'rail-segment',
        label: 'Rail',
        config: { points: [{ x: 160, y: 260 }, { x: 640, y: 260 }], segmentType: 'straight' },
      },
      {
        id: 'wagon-1',
        kind: 'wagon',
        label: 'Wagon',
        config: { trackId: 'track-1', progress: 0.5, capacity: 6 },
      },
    ];

    const moved = movePrimitive(manifest, 'wagon-1', 120, 180);
    const wagon = moved.primitives.find((primitive) => primitive.id === 'wagon-1');

    expect((wagon?.config as { trackId?: string }).trackId).toBeUndefined();
    expect((wagon?.config as { x?: number }).x).toBe(120);
    expect((wagon?.config as { y?: number }).y).toBe(180);
  });
});
