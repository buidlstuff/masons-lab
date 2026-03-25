import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { editExperimentWithAi, explainExperimentWithAi, generateExperimentWithAi } from './ai';
import { validateExperimentManifest } from '../src/lib/validation';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    mode: process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'fallback',
    model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5',
  });
});

app.post('/api/generateExperiment', async (req, res) => {
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
});

app.post('/api/editExperiment', async (req, res) => {
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
});

app.post('/api/explainExperiment', async (req, res) => {
  try {
    const prompt = String(req.body?.prompt ?? '');
    const experiment = req.body?.experiment;
    const validation = validateExperimentManifest(experiment);
    if (!validation.ok) {
      res.status(400).json({ error: `Current machine is invalid. ${validation.errors.join(' ')}` });
      return;
    }
    const result = await explainExperimentWithAi(prompt, validation.manifest);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to explain experiment.' });
  }
});

app.post('/api/composeMachine', async (_req, res) => {
  res.status(501).json({
    error: 'Blueprint composition is scaffolded in the schema and data model, but the UI and runtime are deferred to stage 2.',
  });
});

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => {
  console.log(`Mason Lab server listening on http://localhost:${port}`);
});
