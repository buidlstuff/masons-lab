import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateExperimentWithAi } from '../server/ai';
import { validateExperimentManifest } from '../src/lib/validation';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const prompt = String(req.body?.prompt ?? '');
    const result = await generateExperimentWithAi(prompt);
    const validation = validateExperimentManifest(result.experiment);
    if (!validation.ok) {
      res.status(400).json({ error: validation.errors.join(' ') });
      return;
    }
    res.json({ ...result, experiment: validation.manifest });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to generate experiment.' });
  }
}
