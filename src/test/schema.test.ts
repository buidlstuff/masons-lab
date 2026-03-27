import { describe, expect, it } from 'vitest';
import { getFeaturedMachines } from '../lib/starter-catalog';
import { validateExperimentManifest } from '../lib/validation';

describe('experiment validation', () => {
  it('accepts all featured machines', () => {
    const featured = getFeaturedMachines();
    for (const machine of featured) {
      const result = validateExperimentManifest(machine.experiment);
      expect(result.ok).toBe(true);
    }
  });
});
