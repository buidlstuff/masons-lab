import { describe, expect, it } from 'vitest';
import { createSillySceneManifest, SILLY_SCENES } from '../lib/silly-scenes';
import { validateExperimentManifest } from '../lib/validation';

describe('silly scenes', () => {
  it('creates valid manifests for every shipped scene', () => {
    for (const scene of SILLY_SCENES) {
      const manifest = createSillySceneManifest(scene.id);
      expect(manifest).not.toBeNull();
      const result = validateExperimentManifest(manifest);
      expect(result.ok, `scene ${scene.id} should validate`).toBe(true);
    }
  });
});
