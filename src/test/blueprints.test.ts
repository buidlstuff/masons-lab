import { describe, expect, it } from 'vitest';
import { mountBlueprintToManifest } from '../lib/blueprints';
import { createEmptyManifest } from '../lib/seed-data';
import type { MachineBlueprint } from '../lib/types';

describe('blueprint mounting', () => {
  it('mounts a starter blueprint into a draft and records an assembly', () => {
    const draft = createEmptyManifest();
    const blueprint: MachineBlueprint = {
      blueprintId: 'test-gear-pack',
      category: 'drivetrain',
      title: 'Test Gear Pack',
      summary: 'A small test blueprint with a motor and gear.',
      tags: ['test'],
      ports: [],
      fragment: {
        primitives: [
          { id: 'motor-a', kind: 'motor', label: 'Motor', config: { x: 0, y: 0, rpm: 60, torque: 1, powerState: true } },
          { id: 'gear-a', kind: 'gear', label: 'Gear', config: { x: 120, y: 0, teeth: 24, input: false, color: '#47c5a5' } },
        ],
        behaviors: [],
        controls: [],
        hud: [],
      },
    };

    const mounted = mountBlueprintToManifest(draft, blueprint, { x: 500, y: 320 });

    expect(mounted.primitives.length).toBeGreaterThan(draft.primitives.length);
    expect(mounted.assemblies).toHaveLength(1);
    expect(mounted.assemblies[0]?.source).toEqual({
      type: 'blueprint',
      blueprintId: blueprint.blueprintId,
    });
  });

  it('remaps powered hinge connector ids, controls, and pivot offsets when mounting', () => {
    const draft = createEmptyManifest();
    const blueprint: MachineBlueprint = {
      blueprintId: 'test-powered-hinge',
      category: 'tool-head',
      title: 'Powered Hinge Test',
      summary: 'Checks remapping for powered hinge assemblies.',
      tags: ['test'],
      ports: [],
      fragment: {
        primitives: [
          { id: 'base', kind: 'chassis', label: 'Base', config: { x: 100, y: 200, width: 160, height: 24 } },
          { id: 'motor', kind: 'motor', label: 'Motor', config: { x: 60, y: 150, rpm: 90, torque: 1, powerState: true } },
          { id: 'arm', kind: 'crane-arm', label: 'Arm', config: { x: 100, y: 180, length: 140 } },
          {
            id: 'joint',
            kind: 'powered-hinge-link',
            label: 'Powered Hinge',
            config: {
              fromId: 'base',
              toId: 'arm',
              pivotX: 100,
              pivotY: 180,
              fromLocalX: 0,
              fromLocalY: -12,
              toLocalX: -70,
              toLocalY: 0,
              minAngle: -45,
              maxAngle: 45,
              motorId: 'motor',
              targetAngle: 20,
              enabled: true,
            },
          },
        ],
        behaviors: [],
        controls: [
          {
            id: 'joint-enabled',
            kind: 'toggle',
            label: 'Run',
            bind: { targetId: 'joint', path: 'enabled' },
            defaultValue: true,
          },
          {
            id: 'joint-target',
            kind: 'slider',
            label: 'Angle',
            bind: { targetId: 'joint', path: 'targetAngle' },
            defaultValue: 20,
            min: -45,
            max: 45,
            step: 5,
          },
        ],
        hud: [],
      },
    };

    const mounted = mountBlueprintToManifest(draft, blueprint, { x: 500, y: 320 });
    const mountedConnector = mounted.primitives.find((primitive) => primitive.kind === 'powered-hinge-link');

    expect(mountedConnector).toBeTruthy();
    expect(mountedConnector?.id).not.toBe('joint');
    expect((mountedConnector?.config as { fromId: string }).fromId).not.toBe('base');
    expect((mountedConnector?.config as { toId: string }).toId).not.toBe('arm');
    expect((mountedConnector?.config as { motorId: string }).motorId).not.toBe('motor');
    expect((mountedConnector?.config as { pivotX: number }).pivotX).not.toBe(100);
    expect((mountedConnector?.config as { pivotY: number }).pivotY).not.toBe(180);
    expect(mounted.controls.every((control) => control.bind?.targetId === mountedConnector?.id)).toBe(true);
  });
});
