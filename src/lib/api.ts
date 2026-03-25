import type {
  EditExperimentResult,
  ExplainExperimentResult,
  ExperimentManifest,
  GenerateExperimentResult,
} from './types';

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? 'Request failed.');
  }

  return (await response.json()) as T;
}

export function generateExperiment(prompt: string) {
  return postJson<GenerateExperimentResult>('/api/generateExperiment', { prompt });
}

export function editExperiment(prompt: string, experiment: ExperimentManifest) {
  return postJson<EditExperimentResult>('/api/editExperiment', { prompt, experiment });
}

export function explainExperiment(prompt: string, experiment: ExperimentManifest) {
  return postJson<ExplainExperimentResult>('/api/explainExperiment', { prompt, experiment });
}
