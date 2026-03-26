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
});
