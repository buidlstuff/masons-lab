import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.json({
    ok: true,
    mode: process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'fallback',
    model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
  });
}
