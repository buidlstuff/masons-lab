import { useEffect, useMemo, useRef, useState } from 'react';
import type { EditExperimentResult, ExperimentManifest, GenerateExperimentResult, SavedBlueprintRecord } from '../lib/types';

interface AssistantPanelProps {
  manifest: ExperimentManifest | null;
  busy: boolean;
  promptSeed?: string | null;
  onPromptSeedConsumed?: () => void;
  blueprints?: SavedBlueprintRecord[];
  onGenerate: (prompt: string) => Promise<GenerateExperimentResult>;
  onEdit: (prompt: string) => Promise<EditExperimentResult>;
  onExplain: (prompt: string) => Promise<string>;
  onMount?: (blueprint: SavedBlueprintRecord) => void;
}

export function AssistantPanel({
  manifest,
  busy,
  promptSeed,
  onPromptSeedConsumed,
  blueprints,
  onGenerate,
  onEdit,
  onExplain,
  onMount,
}: AssistantPanelProps) {
  const canEditCurrentMachine = Boolean(manifest?.metadata.recipeId && manifest.primitives.length > 0);
  const [mode, setMode] = useState<'chat' | 'compose'>('chat');
  const [prompt, setPrompt] = useState('');
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([
    {
      role: 'assistant',
      content:
        "I'm your Lab Assistant. Ask me to build one of the yard machines, tweak the current one, or explain how it works.",
    },
  ]);
  const quickPrompts = useMemo(() => deriveQuickPrompts(manifest), [manifest]);

  useEffect(() => {
    if (!promptSeed) {
      return;
    }

    setMode('chat');
    setPrompt(promptSeed);
    requestAnimationFrame(() => {
      promptRef.current?.focus();
      promptRef.current?.setSelectionRange(promptSeed.length, promptSeed.length);
    });
    onPromptSeedConsumed?.();
  }, [onPromptSeedConsumed, promptSeed]);

  async function handleGenerate(nextPrompt = prompt) {
    if (!nextPrompt.trim()) {
      return;
    }

    const userPrompt = nextPrompt.trim();
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

  async function handleEdit(nextPrompt = prompt) {
    if (!nextPrompt.trim() || !manifest) {
      return;
    }

    const userPrompt = nextPrompt.trim();
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

  async function handleExplain(nextPrompt = prompt) {
    if (!manifest) {
      return;
    }
    const userPrompt = nextPrompt.trim() || 'Explain how this machine works.';
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

  const recentBlueprints = (blueprints ?? []).slice(0, 5);

  return (
    <section className="panel assistant-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Lab Assistant</p>
          <h2>Build, tweak, explain</h2>
        </div>
        <span className="badge">{busy ? 'Working' : 'Ready'}</span>
      </div>

      <div className="assistant-tabs">
        <button
          type="button"
          className={`tab-btn ${mode === 'chat' ? 'active' : ''}`}
          onClick={() => setMode('chat')}
        >
          Chat
        </button>
        <button
          type="button"
          className={`tab-btn ${mode === 'compose' ? 'active' : ''}`}
          onClick={() => setMode('compose')}
        >
          Compose
        </button>
      </div>

      {mode === 'chat' ? (
        <>
          <div className="assistant-quick-row">
            {quickPrompts.map((quickPrompt) => (
              <button
                key={quickPrompt.label}
                type="button"
                className="assistant-quick-btn"
                disabled={busy}
                onClick={() => {
                  if (quickPrompt.action === 'generate') {
                    void handleGenerate(quickPrompt.prompt);
                    return;
                  }
                  if (quickPrompt.action === 'edit') {
                    void handleEdit(quickPrompt.prompt);
                    return;
                  }
                  void handleExplain(quickPrompt.prompt);
                }}
              >
                {quickPrompt.label}
              </button>
            ))}
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
              ref={promptRef}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder='Try "Build a conveyor that feeds a hopper" or "Make the train slower."'
              rows={5}
              disabled={busy}
            />
            <div className="button-row">
              <button type="button" onClick={() => void handleGenerate()} disabled={busy}>
                Create
              </button>
              <button type="button" onClick={() => void handleEdit()} disabled={busy || !canEditCurrentMachine}>
                Edit
              </button>
              <button type="button" onClick={() => void handleExplain()} disabled={busy || !canEditCurrentMachine}>
                Explain
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="compose-panel">
          <p className="compose-hint">Mount a saved blueprint onto the current machine.</p>
          {recentBlueprints.length === 0 ? (
            <p className="muted compose-empty">No blueprints saved yet. Build and save a machine first.</p>
          ) : (
            <ul className="compose-list">
              {recentBlueprints.map((rec) => (
                <li key={rec.recordId} className="compose-row">
                  <div className="compose-row-info">
                    <strong>{rec.blueprint.title}</strong>
                    <span className="compose-category">{rec.blueprint.category.replaceAll('-', ' ')}</span>
                    <p className="muted">{rec.blueprint.summary}</p>
                  </div>
                  <button
                    type="button"
                    className="compose-mount-btn"
                    disabled={!manifest}
                    onClick={() => onMount?.(rec)}
                    title={manifest ? 'Mount this blueprint' : 'No machine loaded'}
                  >
                    Mount
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function deriveQuickPrompts(manifest: ExperimentManifest | null) {
  if (!manifest || manifest.primitives.length === 0) {
    return [
      {
        label: 'Build a starter gear train',
        prompt: 'Build a motor with two gears so I can learn by dragging parts around.',
        action: 'generate' as const,
      },
      {
        label: 'Build a hopper loader',
        prompt: 'Build a conveyor and hopper setup that shows cargo moving right away.',
        action: 'generate' as const,
      },
      {
        label: 'Show me a rail demo',
        prompt: 'Build a simple rail setup and explain what I need to tune to make the train move.',
        action: 'generate' as const,
      },
    ];
  }

  return [
    {
      label: 'Explain this build',
      prompt: 'Explain what is happening in this machine and what I should try next.',
      action: 'explain' as const,
    },
    {
      label: 'Why is it stuck?',
      prompt: 'Explain why this machine is not doing anything visible yet and suggest one concrete fix.',
      action: 'explain' as const,
    },
    {
      label: 'Add the next useful part',
      prompt: 'Edit this machine by adding the next part that will create visible feedback quickly.',
      action: 'edit' as const,
    },
  ];
}
