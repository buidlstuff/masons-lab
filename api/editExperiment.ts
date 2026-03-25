import type { VercelRequest, VercelResponse } from '@vercel/node';
import { editExperimentWithAi } from '../server/ai';
import { validateExperimentManifest } from '../src/lib/validation';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const prompt = String(req.body?.prompt ?? '');
    const experiment = req.body?.experiment;
    const validation = validateExperimentManifest(experiment);
    if (!validation.ok) {
      res.status(400).json({ error: `Current machine is invalid. ${validation.errors.join(' ')}` });
      return;
    }
    const result = await editExperimentWithAi(prompt, validation.manifest);
    const nextValidation = validateExperimentManifest(result.experiment);
    if (!nextValidation.ok) {
      res.status(400).json({ error: nextValidation.errors.join(' ') });
      return;
    }
    res.json({ ...result, experiment: nextValidation.manifest });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to edit experiment.' });
  }
}
