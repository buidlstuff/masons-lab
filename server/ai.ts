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

type ToolUseBlock<T = Record<string, unknown>> = { type: 'tool_use'; input: T };

function buildExperimentSchema() {
  const raw = zodToJsonSchema(experimentManifestSchema as never) as { $schema?: string; [key: string]: unknown };
  delete raw.$schema;
  return raw;
}

export async function generateExperimentWithAi(prompt: string): Promise<GenerateExperimentResult> {
  const fallback = generateFallback(prompt);
  if (!process.env.ANTHROPIC_API_KEY) {
    return fallback;
  }

  const experimentSchema = buildExperimentSchema();

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
      max_tokens: 4096,
      system:
        "You are Mason's Lab Assistant. Only produce small honest sandbox machines where every visible part truly affects the outcome. Prefer motors, gears, conveyors, hoppers, cargo, wheels, and simple structures. Do not use recipeId or scripted recipe assumptions.",
      messages: [
        {
          role: 'user',
          content: `Create one honest sandbox machine for this request: ${prompt}`,
        },
      ],
      tools: [
        {
          name: 'create_experiment',
          description: "Create one ExperimentManifest for Mason's Lab construction yard.",
          input_schema: {
            type: 'object',
            properties: { experiment: experimentSchema },
            required: ['experiment'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'create_experiment' },
    }),
  });

  if (!response.ok) {
    return fallback;
  }

  const payload = (await response.json()) as { content?: Array<{ type: string; input?: unknown }> };
  const toolBlock = (payload.content ?? []).find(
    (c): c is ToolUseBlock<{ experiment?: unknown }> => c.type === 'tool_use',
  );
  const parsed = toolBlock?.input?.experiment as ExperimentManifest | undefined;

  if (!parsed) {
    return fallback;
  }

  try {
    parsed.metadata.createdBy = {
      source: 'ai',
      modelFamily: 'anthropic',
      modelId: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
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

  const experimentSchema = buildExperimentSchema();

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
      max_tokens: 4096,
      system:
        'You are editing an honest sandbox machine. Preserve stable ids for unchanged parts. Only make bounded edits that keep the machine causal and do not add recipeId or scripted behaviors.',
      messages: [
        {
          role: 'user',
          content: `Prompt: ${prompt}\n\nCurrent machine JSON:\n${JSON.stringify(experiment)}`,
        },
      ],
      tools: [
        {
          name: 'edit_experiment',
          description: 'Return the edited ExperimentManifest.',
          input_schema: {
            type: 'object',
            properties: { experiment: experimentSchema },
            required: ['experiment'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'edit_experiment' },
    }),
  });

  if (!response.ok) {
    return fallback;
  }

  try {
    const payload = (await response.json()) as { content?: Array<{ type: string; input?: unknown }> };
    const toolBlock = (payload.content ?? []).find(
      (c): c is ToolUseBlock<{ experiment?: unknown }> => c.type === 'tool_use',
    );
    const edited = toolBlock?.input?.experiment as ExperimentManifest | undefined;

    if (!edited) {
      return fallback;
    }

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
      model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
      max_tokens: 512,
      system: 'Explain construction machines to a child in plain, honest language.',
      messages: [
        {
          role: 'user',
          content: `${prompt}\n\nMachine JSON:\n${JSON.stringify(experiment)}`,
        },
      ],
      tools: [
        {
          name: 'explain_machine',
          description: 'Return a kid-friendly explanation of the machine.',
          input_schema: {
            type: 'object',
            properties: {
              whatIsHappening: { type: 'string', description: 'Plain-language description of what the machine does.' },
              whatToTryNext: {
                type: 'array',
                items: { type: 'string' },
                description: 'Suggestions for Mason to experiment with.',
              },
              vocabulary: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    term: { type: 'string' },
                    kidFriendlyMeaning: { type: 'string' },
                  },
                  required: ['term', 'kidFriendlyMeaning'],
                },
                description: 'Key terms explained for a child.',
              },
            },
            required: ['whatIsHappening', 'whatToTryNext', 'vocabulary'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'explain_machine' },
    }),
  });

  if (!response.ok) {
    return { explanation: experiment.explanation };
  }

  try {
    type ExplainInput = { whatIsHappening?: string; whatToTryNext?: string[]; vocabulary?: Array<{ term: string; kidFriendlyMeaning: string }> };
    const payload = (await response.json()) as { content?: Array<{ type: string; input?: unknown }> };
    const toolBlock = (payload.content ?? []).find(
      (c): c is ToolUseBlock<ExplainInput> => c.type === 'tool_use',
    );

    if (!toolBlock?.input?.whatIsHappening) {
      return { explanation: experiment.explanation };
    }

    return {
      explanation: {
        whatIsHappening: toolBlock.input.whatIsHappening,
        whatToTryNext: toolBlock.input.whatToTryNext ?? [],
        vocabulary: toolBlock.input.vocabulary ?? [],
      },
    };
  } catch {
    return { explanation: experiment.explanation };
  }
}

function generateFallback(prompt: string): GenerateExperimentResult {
  const text = prompt.toLowerCase();
  const machine =
    FEATURED.find((candidate) =>
      (/spin the gears/i.test(candidate.experiment.metadata.title) && /(gear|rpm|ratio|torque|spin)/.test(text)) ||
      (/feed the hopper/i.test(candidate.experiment.metadata.title) && /(conveyor|hopper|cargo|belt|feed)/.test(text)) ||
      (/build the loader/i.test(candidate.experiment.metadata.title) && /(loader|power|throughput|motor)/.test(text))
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

  if (/(add motor|power it)/.test(lower) && !next.primitives.some((primitive) => primitive.kind === 'motor')) {
    next.primitives.push({
      id: 'motor-added',
      kind: 'motor',
      label: 'Added Motor',
      config: { x: 220, y: 360, rpm: 75, torque: 1.2, powerState: true },
    });
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
