import { describe, expect, it } from 'vitest';
import { mountBlueprintToManifest } from '../lib/blueprints';
import { createEmptyManifest, getStarterBlueprints } from '../lib/seed-data';

describe('blueprint mounting', () => {
  it('mounts a starter blueprint into a draft and records an assembly', () => {
    const draft = createEmptyManifest();
    const blueprint = getStarterBlueprints()[0].blueprint;

    const mounted = mountBlueprintToManifest(draft, blueprint, { x: 500, y: 320 });

    expect(mounted.primitives.length).toBeGreaterThan(draft.primitives.length);
    expect(mounted.assemblies).toHaveLength(1);
    expect(mounted.assemblies[0]?.source).toEqual({
      type: 'blueprint',
      blueprintId: blueprint.blueprintId,
    });
  });
});
