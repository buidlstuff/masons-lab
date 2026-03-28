import { describe, expect, it } from 'vitest';
import {
  createPuzzleChallengeManifest,
  PUZZLE_CHALLENGES,
} from '../lib/puzzle-challenges';
import { validateExperimentManifest } from '../lib/validation';

describe('puzzle challenges', () => {
  it('creates valid manifests for every shipped puzzle', () => {
    for (const challenge of PUZZLE_CHALLENGES) {
      const manifest = createPuzzleChallengeManifest(challenge.id);
      expect(manifest).not.toBeNull();
      const result = validateExperimentManifest(manifest!);
      expect(result.ok, `puzzle ${challenge.id} should validate`).toBe(true);
      expect(manifest?.metadata.tags).toContain('puzzle-challenge');
    }
  });

  it('ships solved-case coverage for every authored puzzle', () => {
    for (const challenge of PUZZLE_CHALLENGES) {
      const solved = challenge.createSolvedCase();
      expect(
        challenge.successCheck(solved.manifest, solved.runtime),
        `puzzle ${challenge.id} solved case should pass`,
      ).toBe(true);
      expect(solved.manifest.metadata.tags).toContain(`puzzle-challenge:${challenge.id}`);
      expect(challenge.allowedKinds.length).toBeGreaterThan(0);
    }
  });
});
