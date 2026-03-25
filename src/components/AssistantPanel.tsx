import { useState } from 'react';
import type { EditExperimentResult, ExperimentManifest, GenerateExperimentResult } from '../lib/types';

interface AssistantPanelProps {
  manifest: ExperimentManifest | null;
  busy: boolean;
  onGenerate: (prompt: string) => Promise<GenerateExperimentResult>;
  onEdit: (prompt: string) => Promise<EditExperimentResult>;
  onExplain: (prompt: string) => Promise<string>;
}

export function AssistantPanel({ manifest, busy, onGenerate, onEdit, onExplain }: AssistantPanelProps) {
  const canEditCurrentMachine = Boolean(manifest?.metadata.recipeId && manifest.primitives.length > 0);
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([
    {
      role: 'assistant',
      content:
        "I'm your Lab Assistant. Ask me to build one of the yard machines, tweak the current one, or explain how it works.",
    },
  ]);

  async function handleGenerate() {
    if (!prompt.trim()) {
      return;
    }

    const userPrompt = prompt.trim();
    setMessages((current) => [...current, { role: 'user', content: userPrompt }]);
    setPrompt('');
    try {
      const result = await onGenerate(userPrompt);
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: `Built "${result.experiment.metadata.title}". ${result.experiment.explanation.whatIsHappening}`,
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        { role: 'assistant', content: error instanceof Error ? error.message : 'The lab assistant hit a snag.' },
      ]);
    }
  }

  async function handleEdit() {
    if (!prompt.trim() || !manifest) {
      return;
    }

    const userPrompt = prompt.trim();
    setMessages((current) => [...current, { role: 'user', content: userPrompt }]);
    setPrompt('');
    try {
      const result = await onEdit(userPrompt);
      setMessages((current) => [...current, { role: 'assistant', content: result.summary }]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        { role: 'assistant', content: error instanceof Error ? error.message : 'The edit did not stick.' },
      ]);
    }
  }

  async function handleExplain() {
    if (!manifest) {
      return;
    }
    const userPrompt = prompt.trim() || 'Explain how this machine works.';
    setMessages((current) => [...current, { role: 'user', content: userPrompt }]);
    setPrompt('');
    try {
      const explanation = await onExplain(userPrompt);
      setMessages((current) => [...current, { role: 'assistant', content: explanation }]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        { role: 'assistant', content: error instanceof Error ? error.message : 'I could not explain that clearly.' },
      ]);
    }
  }

  return (
    <section className="panel assistant-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Lab Assistant</p>
          <h2>Build, tweak, explain</h2>
        </div>
        <span className="badge">{busy ? 'Working' : 'Ready'}</span>
      </div>

      <div className="message-list">
        {messages.map((message, index) => (
          <article key={`${message.role}-${index}`} className={`message message-${message.role}`}>
            <p className="message-role">{message.role === 'assistant' ? 'Assistant' : 'Mason'}</p>
            <p>{message.content}</p>
          </article>
        ))}
      </div>

      <div className="assistant-actions">
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder='Try "Build a conveyor that feeds a hopper" or "Make the train slower."'
          rows={5}
          disabled={busy}
        />
        <div className="button-row">
          <button type="button" onClick={handleGenerate} disabled={busy}>
            Create
          </button>
          <button type="button" onClick={handleEdit} disabled={busy || !canEditCurrentMachine}>
            Edit
          </button>
          <button type="button" onClick={handleExplain} disabled={busy || !canEditCurrentMachine}>
            Explain
          </button>
        </div>
      </div>
    </section>
  );
}
