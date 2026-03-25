import { createHash } from 'node:crypto';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { experimentManifestSchema } from '../src/lib/schema';
import { getFeaturedMachines } from '../src/lib/seed-data';
import { validateExperimentManifest } from '../src/lib/validation';
import type {
  EditExperimentResult,
  ExplainExperimentResult,
  ExperimentManifest,
  GenerateExperimentResult,
} from '../src/lib/types';

const FEATURED = getFeaturedMachines();

export async function generateExperimentWithAi(prompt: string): Promise<GenerateExperimentResult> {
  const fallback = generateFallback(prompt);
  if (!process.env.ANTHROPIC_API_KEY) {
    return fallback;
  }

  const schema = zodToJsonSchema(experimentManifestSchema as never, 'ExperimentManifest');
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5',
      max_tokens: 4096,
      system:
        'You are Mason’s Lab Assistant. Only produce stage-1 construction yard machines. Stay inside the four allowed recipes: gear-train-lab, conveyor-loader, winch-crane, rail-cart-loop. Return only valid JSON.',
      messages: [
        {
          role: 'user',
          content: `Create one machine for this request: ${prompt}. Use the ExperimentManifest schema.`,
        },
      ],
      output_config: {
        format: {
          type: 'json_schema',
          schema,
        },
      },
    }),
  });

  if (!response.ok) {
    return fallback;
  }

  const payload = (await response.json()) as { content?: Array<{ text?: string }> };
  const text = payload.content?.[0]?.text;
  if (!text) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(text) as ExperimentManifest;
    parsed.metadata.createdBy = {
      source: 'ai',
      modelFamily: 'anthropic',
      modelId: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5',
      promptHash: hashPrompt(prompt),
      generatedAt: new Date().toISOString(),
    };
    const validation = validateExperimentManifest(parsed);
    if (!validation.ok) {
      return fallback;
    }
    return {
      intent: {
        family: parsed.family,
        title: parsed.metadata.title,
        confidence: 0.88,
        suggestedRecipeId: parsed.metadata.recipeId,
      },
      experiment: validation.manifest,
    };
  } catch {
    return fallback;
  }
}

export async function editExperimentWithAi(prompt: string, experiment: ExperimentManifest): Promise<EditExperimentResult> {
  const fallback = editFallback(prompt, experiment);
  if (!process.env.ANTHROPIC_API_KEY) {
    return fallback;
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5',
      max_tokens: 4096,
      system:
        'You are editing a stage-1 construction machine. Preserve stable ids for unchanged parts. Only make bounded edits within the existing recipe family. Return only valid JSON.',
      messages: [
        {
          role: 'user',
          content: `Prompt: ${prompt}\n\nCurrent machine JSON:\n${JSON.stringify(experiment)}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    return fallback;
  }

  try {
    const payload = (await response.json()) as { content?: Array<{ text?: string }> };
    const text = payload.content?.[0]?.text ?? '';
    const firstBrace = text.indexOf('{');
    if (firstBrace < 0) {
      return fallback;
    }
    const edited = JSON.parse(text.slice(firstBrace)) as ExperimentManifest;
    const validation = validateExperimentManifest(edited);
    if (!validation.ok) {
      return repairFallback(validation.errors, fallback);
    }
    return {
      summary: 'Applied a bounded AI edit to the machine.',
      experiment: validation.manifest,
      changedIds: [],
      preservedIds: experiment.primitives.map((primitive) => primitive.id),
    };
  } catch {
    return fallback;
  }
}

export async function explainExperimentWithAi(prompt: string, experiment: ExperimentManifest): Promise<ExplainExperimentResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      explanation: experiment.explanation,
    };
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5',
      max_tokens: 512,
      system: 'Explain construction machines to a child in plain, honest language. Return JSON with whatIsHappening, whatToTryNext, and vocabulary.',
      messages: [
        {
          role: 'user',
          content: `${prompt}\n\nMachine JSON:\n${JSON.stringify(experiment)}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    return { explanation: experiment.explanation };
  }

  try {
    const payload = (await response.json()) as { content?: Array<{ text?: string }> };
    const text = payload.content?.[0]?.text ?? '';
    const firstBrace = text.indexOf('{');
    if (firstBrace < 0) {
      return { explanation: experiment.explanation };
    }
    const explanation = JSON.parse(text.slice(firstBrace)) as ExplainExperimentResult['explanation'];
    return { explanation };
  } catch {
    return { explanation: experiment.explanation };
  }
}

function generateFallback(prompt: string): GenerateExperimentResult {
  const text = prompt.toLowerCase();
  const machine =
    FEATURED.find((candidate) =>
      (candidate.experiment.metadata.recipeId === 'gear-train-lab' && /(gear|rpm|ratio|torque)/.test(text)) ||
      (candidate.experiment.metadata.recipeId === 'conveyor-loader' && /(conveyor|hopper|cargo|load|gravel)/.test(text)) ||
      (candidate.experiment.metadata.recipeId === 'winch-crane' && /(crane|winch|hook|lift)/.test(text)) ||
      (candidate.experiment.metadata.recipeId === 'rail-cart-loop' && /(rail|wagon|train|cart)/.test(text))
    ) ?? FEATURED[0];

  const experiment = structuredClone(machine.experiment);
  experiment.experimentId = crypto.randomUUID();
  experiment.metadata.createdBy = {
    source: 'ai',
    modelFamily: 'fallback',
    modelId: 'local-rule-engine',
    promptHash: hashPrompt(prompt),
    generatedAt: new Date().toISOString(),
  };

  return {
    intent: {
      family: experiment.family,
      title: experiment.metadata.title,
      confidence: 0.78,
      suggestedRecipeId: experiment.metadata.recipeId,
    },
    experiment,
  };
}

function editFallback(prompt: string, experiment: ExperimentManifest): EditExperimentResult {
  const next = structuredClone(experiment);
  const lower = prompt.toLowerCase();

  if (/(faster|more speed|speed up)/.test(lower)) {
    for (const primitive of next.primitives) {
      if (primitive.kind === 'motor' && 'rpm' in primitive.config) {
        primitive.config.rpm = Math.min(180, Number(primitive.config.rpm) + 20);
      }
      if (primitive.kind === 'conveyor' && 'speed' in primitive.config) {
        primitive.config.speed = Math.min(120, Number(primitive.config.speed) + 12);
      }
      if (primitive.kind === 'locomotive' && 'speed' in primitive.config) {
        primitive.config.speed = Math.min(0.4, Number(primitive.config.speed) + 0.04);
      }
    }
  }

  if (/(slower|slow down|less speed)/.test(lower)) {
    for (const primitive of next.primitives) {
      if (primitive.kind === 'motor' && 'rpm' in primitive.config) {
        primitive.config.rpm = Math.max(10, Number(primitive.config.rpm) - 20);
      }
      if (primitive.kind === 'conveyor' && 'speed' in primitive.config) {
        primitive.config.speed = Math.max(20, Number(primitive.config.speed) - 10);
      }
      if (primitive.kind === 'locomotive' && 'speed' in primitive.config) {
        primitive.config.speed = Math.max(0.05, Number(primitive.config.speed) - 0.03);
      }
    }
  }

  if (/(bigger gear|more teeth)/.test(lower)) {
    const target = next.primitives.find((primitive) => primitive.id === 'gear-2' || primitive.kind === 'gear');
    if (target && 'teeth' in target.config) {
      target.config.teeth = Math.min(80, Number(target.config.teeth) + 10);
    }
  }

  if (/(second wagon|add wagon)/.test(lower) && next.metadata.recipeId === 'rail-cart-loop') {
    if (!next.primitives.some((primitive) => primitive.id === 'wagon-2')) {
      next.primitives.push({
        id: 'wagon-2',
        kind: 'wagon',
        label: 'Extra Wagon',
        config: { trackId: 'track-main', offset: -0.16, capacity: 6 },
      });
      next.behaviors = next.behaviors.map((behavior) =>
        behavior.id === 'follow-1'
          ? { ...behavior, targets: [...behavior.targets, 'wagon-2'] }
          : behavior,
      );
    }
  }

  next.metadata.createdBy = {
    source: 'ai',
    modelFamily: 'fallback',
    modelId: 'local-rule-engine',
    promptHash: hashPrompt(prompt),
    generatedAt: new Date().toISOString(),
  };

  return {
    summary: `Updated ${next.metadata.title} with a bounded lab edit.`,
    experiment: next,
    changedIds: [],
    preservedIds: experiment.primitives.map((primitive) => primitive.id),
  };
}

function repairFallback(errors: string[], result: EditExperimentResult): EditExperimentResult {
  return {
    ...result,
    summary: `The AI edit failed validation and the lab kept the safe fallback edit instead. ${errors[0] ?? ''}`.trim(),
  };
}

function hashPrompt(prompt: string) {
  return createHash('sha256').update(prompt).digest('hex').slice(0, 16);
}
