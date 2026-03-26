import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AssistantPanel } from '../components/AssistantPanel';
import { ControlPanel } from '../components/ControlPanel';
import { HudOverlay } from '../components/HudOverlay';
import { StarterOverlay } from '../components/StarterOverlay';
import { InspectorPanel } from '../components/InspectorPanel';
import { MachineCanvas } from '../components/MachineCanvas';
import { PartPalette } from '../components/PartPalette';
import { editExperiment, explainExperiment, generateExperiment } from '../lib/api';
import { createBlueprintFromExperiment, mountBlueprintToManifest } from '../lib/blueprints';
import { db } from '../lib/db';
import { addPrimitive, connectPrimitives, deletePrimitive, movePrimitive, updatePrimitive } from '../lib/editor';
import {
  countActiveCargo,
  countActiveGearPairs,
  countPoweredConveyors,
  evaluateProject,
  getGoalProgress,
} from '../lib/jobs';
import { createDraftFromBlueprint, createDraftFromMachine, createDraftFromProject, createEmptyDraft } from '../lib/seed-data';
import { useMachineSimulation, type RuntimeSnapshot } from '../lib/simulation';
import { awardJobXp, TIER_NAMES } from '../lib/xp';
import type {
  BuildTelemetry,
  DraftRecord,
  EditExperimentResult,
  ExperimentManifest,
  GenerateExperimentResult,
  PrimitiveKind,
  PrimitiveInstance,
} from '../lib/types';

export function BuildPage() {
  const { draftId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const sourceMachineId = searchParams.get('machine');
  const sourceBlueprintId = searchParams.get('blueprint');
  const jobId = searchParams.get('job');
  const shareParam = searchParams.get('share');
  const draft = useLiveQuery(() => (draftId ? db.drafts.get(draftId) : undefined), [draftId]);
  const machineFromQuery = useLiveQuery(
    () => (sourceMachineId ? db.machines.get(sourceMachineId) : undefined),
    [sourceMachineId],
  );
  const blueprintFromQuery = useLiveQuery(
    () => (sourceBlueprintId ? db.blueprints.get(sourceBlueprintId) : undefined),
    [sourceBlueprintId],
  );
  const job = useLiveQuery(() => (jobId ? db.jobs.get(jobId) : undefined), [jobId]);
  const blueprints = useLiveQuery(() => db.blueprints.orderBy('updatedAt').reverse().toArray(), []);

  const [manifest, setManifest] = useState<ExperimentManifest | null>(null);
  const [selectedPrimitiveId, setSelectedPrimitiveId] = useState<string>();
  const [placingKind, setPlacingKind] = useState<PrimitiveKind | null>(null);
  const [controlValues, setControlValues] = useState<Record<string, string | number | boolean>>({});
  const [telemetry, setTelemetry] = useState<BuildTelemetry>({});
  const [busy, setBusy] = useState(false);
  const [statusNotice, setStatusNotice] = useState<{ tone: NoticeTone; message: string } | null>(null);
  const [saveModal, setSaveModal] = useState<{ title: string; learned: string } | null>(null);
  const [xpToast, setXpToast] = useState<{ gained: number; newXp: number; tierName?: string } | null>(null);
  const [flashToast, setFlashToast] = useState(false);
  const [assistantPromptSeed, setAssistantPromptSeed] = useState<string | null>(null);
  const flashCountRef = useRef(0);
  const jobCompletedRef = useRef(false);
  const completedStepIdsRef = useRef<string[]>([]);
  const statusTimeoutRef = useRef<number | undefined>(undefined);
  const assistantRef = useRef<HTMLDivElement | null>(null);

  const showStatus = useCallback((message: string, tone: NoticeTone = 'info') => {
    window.clearTimeout(statusTimeoutRef.current);
    setStatusNotice({ message, tone });
    statusTimeoutRef.current = window.setTimeout(() => setStatusNotice(null), 4200);
  }, []);

  useEffect(
    () => () => {
      window.clearTimeout(statusTimeoutRef.current);
    },
    [],
  );

  useEffect(() => {
    async function bootstrapDraft() {
      // Draft already loaded from DB — apply it.
      if (draft) {
        setManifest(draft.manifest);
        setControlValues(
          Object.fromEntries(
            draft.manifest.controls.map((control) => [control.id, control.defaultValue ?? false]),
          ),
        );
        return;
      }

      // draftId in URL but draft not yet in DB (stale/invalid URL) — fall through to create.
      // draftId in URL and draft still loading — wait (useLiveQuery will re-fire this effect).
      if (draftId) {
        return;
      }

      if (jobId && !job) {
        return;
      }

      // Share param: decode and import manifest directly
      if (shareParam) {
        try {
          const decoded = JSON.parse(decodeURIComponent(atob(shareParam))) as ExperimentManifest;
          const newDraft = createEmptyDraft();
          newDraft.manifest = decoded;
          await db.drafts.put(newDraft);
          setManifest(decoded);
          setControlValues(
            Object.fromEntries(decoded.controls.map((c) => [c.id, c.defaultValue ?? false])),
          );
          navigate(`/build/${newDraft.draftId}`, { replace: true });
          return;
        } catch {
          // Bad share param — fall through to empty draft
        }
      }

      // No draftId yet — create one from machine, blueprint, or empty.
      function applyDraft(nextDraft: ReturnType<typeof createEmptyDraft>) {
        setManifest(nextDraft.manifest);
        setControlValues(
          Object.fromEntries(
            nextDraft.manifest.controls.map((control) => [control.id, control.defaultValue ?? false]),
          ),
        );
        navigate(`/build/${nextDraft.draftId}${jobId ? `?job=${jobId}` : ''}`, { replace: true });
      }

      if (machineFromQuery) {
        const nextDraft = createDraftFromMachine(machineFromQuery);
        await db.drafts.put(nextDraft);
        applyDraft(nextDraft);
        return;
      }

      if (blueprintFromQuery) {
        const nextDraft = createDraftFromBlueprint(blueprintFromQuery);
        await db.drafts.put(nextDraft);
        applyDraft(nextDraft);
        return;
      }

      if (job?.initialDraft === 'empty') {
        const nextDraft = createDraftFromProject(job);
        await db.drafts.put(nextDraft);
        applyDraft(nextDraft);
        return;
      }

      const nextDraft = createEmptyDraft();
      await db.drafts.put(nextDraft);
      applyDraft(nextDraft);
    }

    void bootstrapDraft();
  }, [blueprintFromQuery, draft, draftId, job, jobId, machineFromQuery, navigate, shareParam]);

  const runtime = useMachineSimulation(
    manifest ??
      ({
        world: {
          stage: { width: 1280, height: 720, background: 'lab-dark', grid: 'engineering', boundaryMode: 'contain' },
          camera: { mode: 'fixed', zoom: 1, minZoom: 1, maxZoom: 1, panX: 0, panY: 0 },
          timeline: { paused: false, timeScale: 1, allowPause: true, allowStep: false, allowReset: true },
          randomSeed: 42,
        },
        primitives: [],
        behaviors: [],
        controls: [],
        metadata: { recipeId: undefined },
      } as unknown as ExperimentManifest),
    controlValues,
  );

  const selectedPrimitive = useMemo<PrimitiveInstance | undefined>(
    () => manifest?.primitives.find((primitive) => primitive.id === selectedPrimitiveId),
    [manifest, selectedPrimitiveId],
  );

  const projectState = useMemo(
    () => (job && manifest ? evaluateProject(job, manifest, runtime) : null),
    [job, manifest, runtime],
  );
  const projectUnlocked = projectState?.unlockedAllParts ?? true;
  const activeProjectStep = projectState?.currentStep ?? null;
  const jobComplete = projectState?.complete ?? false;
  // Reset once-per-session flag if the job changes
  useEffect(() => {
    jobCompletedRef.current = false;
    completedStepIdsRef.current = [];
  }, [jobId]);

  useEffect(() => {
    if (!projectState) {
      completedStepIdsRef.current = [];
      return;
    }

    const previousIds = completedStepIdsRef.current;
    const completedSteps = projectState.steps.filter((step) => step.completed);
    const newlyCompleted = completedSteps.filter((step) => !previousIds.includes(step.stepId));
    const latestStep = newlyCompleted[newlyCompleted.length - 1];

    if (latestStep && !projectState.complete) {
      showStatus(latestStep.successCopy, 'success');
    }

    completedStepIdsRef.current = completedSteps.map((step) => step.stepId);
  }, [projectState, showStatus]);

  useEffect(() => {
    if (!job || !jobComplete || jobCompletedRef.current) return;
    jobCompletedRef.current = true;

    void db.jobProgress.put({
      id: job.jobId,
      jobId: job.jobId,
      completed: true,
      lastPlayedAt: new Date().toISOString(),
    });

    void awardJobXp(job.tier).then(({ newXp, oldTier, newTier }) => {
      const gained = [0, 100, 200, 400, 800][job.tier] ?? 100;
      setXpToast({
        gained,
        newXp,
        tierName: newTier > oldTier ? TIER_NAMES[newTier] : undefined,
      });
      setTimeout(() => setXpToast(null), 5000);
    });
  }, [job, jobComplete]);

  const persistDraft = useCallback(
    async (nextManifest: ExperimentManifest) => {
      setManifest(nextManifest);
      if (!draftId) {
        return;
      }
      const nextDraft: DraftRecord = {
        draftId,
        sourceMachineId: draft?.sourceMachineId,
        sourceBlueprintId: draft?.sourceBlueprintId,
        manifest: nextManifest,
        updatedAt: new Date().toISOString(),
      };
      await db.drafts.put(nextDraft);
    },
    [draft?.sourceBlueprintId, draft?.sourceMachineId, draftId],
  );

  function handleSaveMachine() {
    if (!manifest) return;
    // Open the lab notes modal — actual save happens on confirm
    setSaveModal({
      title: manifest.metadata.title,
      learned: '',
    });
  }

  async function confirmSaveMachine(title: string, learned: string) {
    if (!manifest) return;
    setSaveModal(null);
    const recordId = crypto.randomUUID();
    await db.machines.put({
      recordId,
      experiment: {
        ...manifest,
        experimentId: crypto.randomUUID(),
        status: 'saved',
        metadata: { ...manifest.metadata, title: title || manifest.metadata.title },
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      labEntry: {
        whatBuilt: title || manifest.metadata.shortDescription,
        whatLearned: learned || manifest.metadata.teachingGoal,
        difficulty: manifest.metadata.difficulty,
      },
      featured: false,
    });
    showStatus('Saved machine to the yard.', 'success');
    navigate(`/machines/${recordId}`);
  }

  async function handleSaveBlueprint() {
    if (!manifest) {
      return;
    }

    const blueprint = createBlueprintFromExperiment(manifest);
    const now = new Date().toISOString();
    await db.blueprints.put({
      recordId: blueprint.blueprintId,
      blueprint,
      createdAt: now,
      updatedAt: now,
    });
    showStatus(`Saved blueprint "${blueprint.title}".`, 'success');
  }

  async function handleSaveBoth() {
    await handleSaveBlueprint();
    await handleSaveMachine();
  }

  async function handleDuplicateDraft() {
    if (!manifest) {
      return;
    }
    const newDraft: DraftRecord = {
      draftId: crypto.randomUUID(),
      manifest: structuredClone({
        ...manifest,
        experimentId: crypto.randomUUID(),
        metadata: {
          ...manifest.metadata,
          title: `${manifest.metadata.title} Remix`,
          remixOfExperimentId: manifest.experimentId,
        },
      }),
      updatedAt: new Date().toISOString(),
      sourceMachineId: draft?.sourceMachineId,
      sourceBlueprintId: draft?.sourceBlueprintId,
    };
    await db.drafts.put(newDraft);
    navigate(`/build/${newDraft.draftId}`);
  }

  async function applyGenerated(result: GenerateExperimentResult) {
    const nextManifest = result.experiment;
    setControlValues(
      Object.fromEntries(nextManifest.controls.map((control) => [control.id, control.defaultValue ?? false])),
    );
    await persistDraft(nextManifest);
  }

  async function applyEdited(result: EditExperimentResult) {
    const nextManifest = result.experiment;
    await persistDraft(nextManifest);
  }

  function handleShare() {
    if (!manifest) return;
    try {
      const encoded = btoa(encodeURIComponent(JSON.stringify(manifest)));
      const url = `${window.location.origin}/build?share=${encoded}`;
      void navigator.clipboard.writeText(url).then(() => {
        showStatus('Share link copied to clipboard!', 'success');
      });
    } catch {
      showStatus('Could not copy link.', 'warning');
    }
  }

  const activeJobHint = activeProjectStep?.instruction ?? (jobComplete ? job?.hints[0] : undefined);
  const machineActivity = manifest
    ? deriveMachineActivity(manifest, runtime)
    : { active: false, label: 'Preparing the canvas', tone: 'info' as NoticeTone };
  const builderFocus = manifest
    ? deriveBuilderFocus(manifest, placingKind, selectedPrimitive, activeProjectStep, machineActivity)
    : {
        title: 'Preparing the yard',
        description: 'Loading the current draft.',
        assistantPrompt: 'Explain how to get started in Mason\'s Lab.',
      };
  const buildSteps = manifest
    ? job && projectState
      ? deriveProjectSteps(projectState)
      : deriveBuildSteps(manifest, placingKind, machineActivity.active)
    : [];
  const contextualConnectPrompt = selectedPrimitive
    ? `Stuck on ${labelForPrimitive(selectedPrimitive.kind)}? Ask the assistant what it should connect to next.`
    : activeProjectStep?.assistantPrompt ?? 'Need a hand? Load a prompt into the assistant from here instead of hunting for the right tab.';

  const openAssistantWithPrompt = useCallback(
    (prompt: string) => {
      setAssistantPromptSeed(prompt);
      assistantRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      showStatus('Loaded a prompt into the assistant.', 'info');
    },
    [showStatus],
  );

  const handlePlacePrimitive = useCallback(
    (x: number, y: number) => {
      if (!manifest || !placingKind) {
        return;
      }

      const nextManifest = addPrimitive(manifest, placingKind, x, y);
      const placedPrimitive = nextManifest.primitives[nextManifest.primitives.length - 1];
      void persistDraft(nextManifest);
      setSelectedPrimitiveId(placedPrimitive?.id);
      setPlacingKind(null);

      const placementFeedback = describePlacedPrimitive(manifest, placingKind, x, y);
      showStatus(placementFeedback.message, placementFeedback.tone);
    },
    [manifest, persistDraft, placingKind, showStatus],
  );

  const handleSelectPrimitive = useCallback(
    (primitiveId?: string) => {
      setSelectedPrimitiveId(primitiveId);
    },
    [],
  );

  const handleSelectKind = useCallback(
    (kind: PrimitiveKind | null) => {
      if (
        kind
        && activeProjectStep
        && !projectUnlocked
        && !activeProjectStep.allowedPartKinds.includes(kind)
      ) {
        showStatus(`This step is focused on ${activeProjectStep.allowedPartKinds.map(labelForPrimitive).join(', ')}.`, 'warning');
        return;
      }

      setPlacingKind(kind);
      if (kind) {
        setSelectedPrimitiveId(undefined);
        showStatus(`Place ${labelForPrimitive(kind)} on the canvas. Press Escape to cancel.`, 'info');
      }
    },
    [activeProjectStep, projectUnlocked, showStatus],
  );

  const handleConnectWinch = useCallback(() => {
    if (!manifest) {
      return;
    }
    if (!selectedPrimitiveId) {
      showStatus('Select the winch or hook you want to connect first.', 'warning');
      return;
    }

    const selectedPrimitiveRecord = manifest.primitives.find((primitive) => primitive.id === selectedPrimitiveId);
    const source = selectedPrimitiveRecord?.kind === 'winch'
      ? selectedPrimitiveRecord
      : manifest.primitives.find((primitive) => primitive.kind === 'winch');
    const target = selectedPrimitiveRecord?.kind === 'hook'
      ? selectedPrimitiveRecord
      : manifest.primitives.find((primitive) => primitive.kind === 'hook');

    if (!source || !target) {
      showStatus('Add a hook first, then use Quick Connect to hang the rope.', 'warning');
      return;
    }

    void persistDraft(connectPrimitives(manifest, source.id, target.id));
    showStatus('Connected the winch to the hook.', 'success');
  }, [manifest, persistDraft, selectedPrimitiveId, showStatus]);

  const handleConnectNodes = useCallback(() => {
    if (!manifest) {
      return;
    }
    if (!selectedPrimitiveId) {
      showStatus('Select the first node, then use Quick Connect to add a beam.', 'warning');
      return;
    }

    const target = manifest.primitives.find(
      (primitive) => primitive.id !== selectedPrimitiveId && primitive.kind === 'node',
    );

    if (!target) {
      showStatus('Place a second node first so the beam has somewhere to land.', 'warning');
      return;
    }

    void persistDraft(connectPrimitives(manifest, selectedPrimitiveId, target.id));
    showStatus('Connected the two nodes with a beam.', 'success');
  }, [manifest, persistDraft, selectedPrimitiveId, showStatus]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') {
        return;
      }

      if (placingKind) {
        setPlacingKind(null);
        showStatus('Placement cancelled. You are back in select mode.', 'info');
        return;
      }

      if (selectedPrimitiveId) {
        setSelectedPrimitiveId(undefined);
        showStatus('Selection cleared.', 'info');
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [placingKind, selectedPrimitiveId, showStatus]);

  if (!manifest) {
    return (
      <div className="page centered-page">
        <h1>Preparing the yard...</h1>
        <p>If you opened a featured machine, the draft is being cloned now.</p>
      </div>
    );
  }

  const builderModeLabel = placingKind
    ? `Placing ${labelForPrimitive(placingKind)}`
    : selectedPrimitive
      ? `Inspecting ${selectedPrimitive.label ?? labelForPrimitive(selectedPrimitive.kind)}`
      : manifest.primitives.length === 0
        ? 'Start mode'
        : 'Select mode';

  return (
    <div className="page page-build">
      <div className="build-header">
        <div>
          <p className="eyebrow">Builder</p>
          <h1>{manifest.metadata.title}</h1>
          <p>{manifest.metadata.shortDescription}</p>
          {statusNotice ? (
            <p className={`builder-status builder-status-${statusNotice.tone}`}>{statusNotice.message}</p>
          ) : null}
        </div>
        <div className="hero-actions">
          <button type="button" className="primary-link" onClick={handleSaveMachine}>
            Save Machine
          </button>
          {(projectUnlocked || !job) ? (
            <>
              <button type="button" onClick={handleSaveBlueprint}>
                Save Blueprint
              </button>
              <button type="button" onClick={handleSaveBoth}>
                Save Both
              </button>
              <button type="button" onClick={handleDuplicateDraft}>
                Duplicate
              </button>
              <button type="button" onClick={handleShare}>
                Share
              </button>
            </>
          ) : null}
          <Link to="/">Back to Yard</Link>
        </div>
      </div>

      <section className="panel builder-compass">
        <div className="builder-compass-copy">
          <div>
            <p className="eyebrow">Build Loop</p>
            <h2>{builderFocus.title}</h2>
          </div>
          <p>{builderFocus.description}</p>
        </div>

        <div className="builder-chip-row">
          <span className={`builder-chip ${placingKind ? 'is-active' : ''}`}>Mode: {builderModeLabel}</span>
          <span className={`builder-chip is-${machineActivity.tone}`}>{machineActivity.label}</span>
          <span className="builder-chip">Canvas: {manifest.primitives.length} part{manifest.primitives.length === 1 ? '' : 's'}</span>
          {job ? <span className="builder-chip">Project: {job.title}</span> : null}
        </div>

        <div className="builder-step-strip">
          {buildSteps.map((step) => (
            <div key={step.label} className={`builder-step builder-step-${step.state}`}>
              <span className="builder-step-dot" />
              <span>{step.label}</span>
            </div>
          ))}
        </div>

        <div className="builder-compass-actions">
          {manifest.primitives.length === 0 && !placingKind ? (
            <button
              type="button"
              className="primary-link"
              onClick={() => handleSelectKind(activeProjectStep?.allowedPartKinds[0] ?? 'motor')}
            >
              Start with {labelForPrimitive(activeProjectStep?.allowedPartKinds[0] ?? 'motor')}
            </button>
          ) : null}
          {placingKind ? (
            <button type="button" className="primary-link" onClick={() => setPlacingKind(null)}>
              Cancel Placement
            </button>
          ) : null}
          {selectedPrimitive ? (
            <button type="button" onClick={() => setSelectedPrimitiveId(undefined)}>
              Clear Selection
            </button>
          ) : null}
          <button type="button" onClick={() => openAssistantWithPrompt(builderFocus.assistantPrompt)}>
            Ask Assistant
          </button>
        </div>

        <div className="builder-assistant-prompt">
          <strong>Fast help:</strong>
          <span>{contextualConnectPrompt}</span>
        </div>
      </section>

      {job ? (() => {
        const gp = getGoalProgress(job, manifest, runtime);
        const pct = Math.min(100, gp.target > 0 ? (gp.current / gp.target) * 100 : 0);
        return (
          <section className={`job-banner ${jobComplete ? 'complete' : ''}`}>
            <div className="job-banner-info">
              <p className="eyebrow">Active Project — Tier {job.tier}</p>
              <strong>{job.title}</strong>
              <p>{activeProjectStep ? activeProjectStep.instruction : job.objective}</p>
            </div>
            <div className="job-goal-block">
              <div className="job-goal-label">
                <span>
                  {activeProjectStep
                    ? `Step ${(projectState?.currentStepIndex ?? 0) + 1} of ${projectState?.steps.length ?? 0}: ${gp.label}`
                    : gp.label}
                </span>
                <span className="job-goal-value">
                  {gp.met ? '✓ Done' : `${gp.current}${gp.unit ? ` ${gp.unit}` : ''} / ${gp.target}${gp.unit ? ` ${gp.unit}` : ''}`}
                </span>
              </div>
              <div className="job-goal-bar">
                <div className="job-goal-fill" style={{ width: `${pct}%` }} />
              </div>
            </div>
            <div className={`badge ${jobComplete ? 'badge-success' : ''}`}>
              {jobComplete ? '★ Complete' : 'In Progress'}
            </div>
          </section>
        );
      })() : null}

      {jobComplete && job ? (
        <section className="job-complete-card">
          <div className="job-complete-star">★</div>
          <div className="job-complete-content">
            <h2>Project Complete</h2>
            <p>You finished <strong>{job.title}</strong> with real machine feedback.</p>
            <p className="muted">{job.hints[0] ?? 'Keep playing with the machine now that it works honestly.'}</p>
          </div>
          <div className="job-complete-actions">
            <button type="button" className="primary-link" onClick={handleSaveMachine}>
              Save Machine
            </button>
            <Link to="/">Back to Yard</Link>
          </div>
        </section>
      ) : null}

      <div className="build-layout">
        <div className="left-rail" ref={assistantRef}>
          <AssistantPanel
            manifest={manifest}
            busy={busy}
            project={job ? {
              title: job.title,
              unlocked: projectUnlocked,
              currentStepTitle: activeProjectStep?.title,
              currentStepInstruction: activeProjectStep?.instruction,
              assistantPrompt: activeProjectStep?.assistantPrompt,
            } : undefined}
            promptSeed={assistantPromptSeed}
            onPromptSeedConsumed={() => setAssistantPromptSeed(null)}
            blueprints={blueprints ?? []}
            onMount={(blueprintRecord) => {
              void persistDraft(mountBlueprintToManifest(manifest, blueprintRecord.blueprint));
              showStatus(`Mounted ${blueprintRecord.blueprint.title}.`, 'success');
            }}
            onGenerate={async (prompt) => {
              setBusy(true);
              try {
                const result = await generateExperiment(prompt);
                await applyGenerated(result);
                return result;
              } finally {
                setBusy(false);
              }
            }}
            onEdit={async (prompt) => {
              setBusy(true);
              try {
                const result = await editExperiment(prompt, manifest);
                await applyEdited(result);
                return result;
              } finally {
                setBusy(false);
              }
            }}
            onExplain={async (prompt) => {
              setBusy(true);
              try {
                const result = await explainExperiment(prompt, manifest);
                return result.explanation.whatIsHappening;
              } finally {
                setBusy(false);
              }
            }}
          />
        </div>

        <div className="canvas-column" style={{ position: 'relative' }}>
          <HudOverlay hud={manifest.hud} telemetry={telemetry} />
          <StarterOverlay
            visible={manifest.primitives.length === 0 && !placingKind}
            title={job?.title}
            summary={job?.summary}
            steps={job?.steps?.map((step) => ({
              num: String((job.steps?.findIndex((candidate) => candidate.stepId === step.stepId) ?? 0) + 1),
              kind: step.allowedPartKinds[0],
              label: step.title,
              desc: step.instruction,
            }))}
            onSelectKind={handleSelectKind}
          />
          {flashToast && (
            <div className="connection-toast">The machine is responding.</div>
          )}
          <MachineCanvas
            manifest={manifest}
            runtime={runtime}
            selectedPrimitiveId={selectedPrimitiveId}
            placingKind={placingKind}
            activeJobHint={activeJobHint}
            onPlacePrimitive={handlePlacePrimitive}
            onSelectPrimitive={handleSelectPrimitive}
            onMovePrimitive={(primitiveId, x, y) => {
              void persistDraft(movePrimitive(manifest, primitiveId, x, y));
            }}
            onTelemetry={setTelemetry}
            onConnectionFlash={() => {
              if (flashCountRef.current >= 3) return; // stop after 3 toasts
              flashCountRef.current += 1;
              setFlashToast(true);
              setTimeout(() => setFlashToast(false), 2000);
            }}
          />
        </div>

        <div className="right-rail">
          <PartPalette
            manifest={manifest}
            selectedPrimitive={selectedPrimitive}
            selectedKind={placingKind}
            activeJobHint={activeJobHint}
            allowedKinds={!projectUnlocked ? activeProjectStep?.allowedPartKinds : undefined}
            projectTitle={job?.title}
            projectStepTitle={activeProjectStep?.title}
            onSelectKind={handleSelectKind}
          />
          {manifest.controls.length > 0 ? (
            <ControlPanel
              controls={manifest.controls}
              values={controlValues}
              onChange={(controlId, value) => {
                setControlValues((current) => ({ ...current, [controlId]: value }));
              }}
            />
          ) : null}
          <InspectorPanel
            primitive={selectedPrimitive}
            manifest={manifest}
            onDelete={(primitiveId) => {
              void persistDraft(deletePrimitive(manifest, primitiveId));
              if (selectedPrimitiveId === primitiveId) {
                setSelectedPrimitiveId(undefined);
              }
              showStatus('Part removed from the canvas.', 'info');
            }}
            onUpdateValue={(primitiveId, key, value) => {
              const primitive = manifest.primitives.find((item) => item.id === primitiveId);
              if (!primitive) {
                return;
              }
              void persistDraft(updatePrimitive(manifest, primitiveId, { ...primitive.config, [key]: value }));
            }}
          />

          {(projectUnlocked || !job) ? (
            <details className="panel small-panel disclosure-panel">
              <summary className="disclosure-summary">
                <div>
                  <p className="eyebrow">Workshop Shelf</p>
                  <h3>Mount a saved blueprint</h3>
                </div>
                <span className="muted">{(blueprints ?? []).length} saved</span>
              </summary>
              <div className="blueprint-list disclosure-content">
                {(blueprints ?? []).slice(0, 8).map((blueprintRecord) => (
                  <article key={blueprintRecord.recordId} className="blueprint-row">
                    <div>
                      <strong>{blueprintRecord.blueprint.title}</strong>
                      <p className="muted">{blueprintRecord.blueprint.summary}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        void persistDraft(mountBlueprintToManifest(manifest, blueprintRecord.blueprint));
                        showStatus(`Mounted ${blueprintRecord.blueprint.title}.`, 'success');
                      }}
                    >
                      Mount
                    </button>
                  </article>
                ))}
              </div>
            </details>
          ) : null}

          {(projectUnlocked || !job) && (selectedPrimitive?.kind === 'winch' || selectedPrimitive?.kind === 'hook' || selectedPrimitive?.kind === 'node') ? (
            <section className="panel small-panel">
            <div className="panel-header compact">
              <div>
                <p className="eyebrow">Quick Connect</p>
                <h3>Approved pairings</h3>
              </div>
            </div>
            <p className="muted">
              {selectedPrimitive.kind === 'node'
                ? 'Use this when two nodes should become a beam.'
                : 'Use this when a winch and hook are already on the canvas.'}
            </p>
            <div className="button-row vertical">
              <button
                type="button"
                disabled={!selectedPrimitiveId || (selectedPrimitive.kind !== 'winch' && selectedPrimitive.kind !== 'hook')}
                onClick={handleConnectWinch}
              >
                Connect Winch to Hook
              </button>
              <button
                type="button"
                disabled={!selectedPrimitiveId || selectedPrimitive.kind !== 'node'}
                onClick={handleConnectNodes}
              >
                Connect Nodes with Beam
              </button>
            </div>
          </section>
          ) : null}
        </div>
      </div>

      {xpToast && (
        <div className="xp-toast">
          <span className="xp-toast-gained">+{xpToast.gained} XP</span>
          <span className="xp-toast-total">{xpToast.newXp} total</span>
          {xpToast.tierName && (
            <span className="xp-toast-tier">Tier unlocked: {xpToast.tierName}!</span>
          )}
        </div>
      )}

      {saveModal !== null && (
        <div className="modal-backdrop" onClick={() => setSaveModal(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <p className="eyebrow">Lab Notebook</p>
            <h2>Save this machine</h2>
            <label className="field">
              <span>Machine name</span>
              <input
                type="text"
                value={saveModal.title}
                onChange={(e) => setSaveModal({ ...saveModal, title: e.target.value })}
                placeholder={manifest?.metadata.title}
              />
            </label>
            <label className="field">
              <span>What did you learn? <span className="muted">(optional)</span></span>
              <textarea
                rows={3}
                value={saveModal.learned}
                onChange={(e) => setSaveModal({ ...saveModal, learned: e.target.value })}
                placeholder="e.g. Bigger gears slow things down but add more force."
              />
            </label>
            <div className="modal-actions">
              <button type="button" className="primary-link" onClick={() => void confirmSaveMachine(saveModal.title, saveModal.learned)}>
                Save Machine
              </button>
              <button type="button" onClick={() => setSaveModal(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type NoticeTone = 'info' | 'success' | 'warning';

interface MachineActivity {
  active: boolean;
  label: string;
  tone: NoticeTone;
}

interface BuilderFocus {
  title: string;
  description: string;
  assistantPrompt: string;
}

interface BuilderStep {
  label: string;
  state: 'active' | 'done' | 'upcoming';
}

function deriveMachineActivity(
  manifest: ExperimentManifest,
  runtime: RuntimeSnapshot,
): MachineActivity {
  const liveGearPairs = countActiveGearPairs(manifest, runtime);
  if (liveGearPairs > 0) {
    return {
      active: true,
      label: `${liveGearPairs} live gear mesh${liveGearPairs === 1 ? '' : 'es'}`,
      tone: 'success',
    };
  }

  const poweredConveyors = countPoweredConveyors(manifest);
  const activeCargo = countActiveCargo(manifest, runtime);
  if (activeCargo > 0) {
    return {
      active: true,
      label: `${activeCargo} cargo block${activeCargo === 1 ? '' : 's'} riding the conveyor`,
      tone: 'success',
    };
  }

  const hopperFill = runtime.hopperFill ?? 0;
  if (hopperFill > 0) {
    return {
      active: true,
      label: `Hopper fill at ${Math.round(hopperFill)}`,
      tone: 'success',
    };
  }

  if (poweredConveyors > 0) {
    return {
      active: true,
      label: `${poweredConveyors} powered conveyor${poweredConveyors === 1 ? '' : 's'} ready`,
      tone: 'success',
    };
  }

  if ((runtime.telemetry.trainSpeed ?? 0) > 0) {
    return {
      active: true,
      label: `Train moving at ${runtime.telemetry.trainSpeed}`,
      tone: 'success',
    };
  }

  if (manifest.primitives.length === 0) {
    return {
      active: false,
      label: 'Empty canvas',
      tone: 'info',
    };
  }

  return {
    active: false,
    label: 'Nothing moving yet',
    tone: 'warning',
  };
}

function deriveBuilderFocus(
  manifest: ExperimentManifest,
  placingKind: PrimitiveKind | null,
  selectedPrimitive: PrimitiveInstance | undefined,
  activeProjectStep: { title: string; instruction: string; assistantPrompt: string } | null,
  machineActivity: MachineActivity,
): BuilderFocus {
  if (placingKind) {
    return {
      title: `Place ${labelForPrimitive(placingKind)}`,
      description: placementInstructionForKind(placingKind),
      assistantPrompt: `I am placing a ${labelForPrimitive(placingKind)}. Tell me where it should go and what I should add next.`,
    };
  }

  if (activeProjectStep) {
    return {
      title: activeProjectStep.title,
      description: activeProjectStep.instruction,
      assistantPrompt: activeProjectStep.assistantPrompt,
    };
  }

  if (manifest.primitives.length === 0) {
    return {
      title: 'Build one thing that moves in under 30 seconds',
      description: 'Start with a motor, then drop a gear or wheel inside its green ring so the canvas gives you immediate feedback.',
      assistantPrompt: 'Build a simple motor and gear demo I can remix by hand.',
    };
  }

  if (selectedPrimitive) {
    return {
      title: `Tune ${selectedPrimitive.label ?? labelForPrimitive(selectedPrimitive.kind)}`,
      description: selectedInstructionForKind(selectedPrimitive.kind),
      assistantPrompt: `Explain how a ${labelForPrimitive(selectedPrimitive.kind)} should behave in this machine and what I should connect to it next.`,
    };
  }

  if (machineActivity.active) {
    return {
      title: 'The machine is alive',
      description: 'Now tune it, extend it, or save it while the current idea is still working.',
      assistantPrompt: 'Explain why this machine works and suggest the most useful next improvement.',
    };
  }

  return {
    title: 'Pick the next useful part',
    description: 'Use the recommended drawer on the right. It now responds to what is already on the canvas.',
    assistantPrompt: 'Look at my current machine and tell me the next part that will make it do something visible.',
  };
}

function deriveBuildSteps(
  manifest: ExperimentManifest,
  placingKind: PrimitiveKind | null,
  machineIsActive: boolean,
): BuilderStep[] {
  const hasParts = manifest.primitives.length > 0;

  return [
    {
      label: 'Pick a part',
      state: placingKind || hasParts ? 'done' : 'active',
    },
    {
      label: 'Place it on the canvas',
      state: hasParts ? 'done' : placingKind ? 'active' : 'upcoming',
    },
    {
      label: 'Test and tune',
      state: machineIsActive ? 'done' : hasParts && !placingKind ? 'active' : 'upcoming',
    },
  ];
}

function deriveProjectSteps(projectState: NonNullable<ReturnType<typeof evaluateProject>>): BuilderStep[] {
  return projectState.steps.map((step, index) => ({
    label: step.title,
    state: step.completed
      ? 'done'
      : index === projectState.currentStepIndex
        ? 'active'
        : 'upcoming',
  }));
}

function describePlacedPrimitive(
  manifest: ExperimentManifest,
  kind: PrimitiveKind,
  x: number,
  y: number,
): { message: string; tone: NoticeTone } {
  switch (kind) {
    case 'motor':
      return {
        message: 'Motor placed. Drop a gear or wheel inside its green ring to make something move.',
        tone: 'success',
      };
    case 'gear':
      return isDrivenPlacement(manifest, kind, x, y)
        ? {
            message: 'Gear placed where it can spin right away. Add another touching gear if you want visible meshing.',
            tone: 'success',
          }
        : {
            message: 'Gear placed. It still needs a nearby motor or another gear to do anything visible.',
            tone: 'warning',
          };
    case 'wheel':
      return isDrivenPlacement(manifest, kind, x, y)
        ? {
            message: 'Wheel placed where it can pick up motion right away.',
            tone: 'success',
          }
        : {
            message: 'Wheel placed. Move it inside a motor ring or against a gear if nothing happens.',
            tone: 'warning',
          };
    case 'conveyor':
      return hasNearbyMotor(manifest, x, y)
        ? {
            message: 'Conveyor placed near a motor. Add cargo and a hopper to see throughput.',
            tone: 'success',
          }
        : {
            message: 'Conveyor placed. Add cargo and a hopper next, or park a motor nearby for speed.',
            tone: 'info',
          };
    case 'hopper':
      return hasPart(manifest, 'conveyor')
        ? {
            message: 'Hopper placed. Put it at the conveyor end, then add cargo to watch it fill.',
            tone: 'success',
          }
        : {
            message: 'Hopper placed. It will make more sense once a conveyor is feeding it.',
            tone: 'warning',
          };
    case 'cargo-block':
      return hasPart(manifest, 'conveyor')
        ? {
            message: 'Cargo placed. Drop it onto the conveyor to see it travel.',
            tone: 'success',
          }
        : {
            message: 'Cargo placed. Add a conveyor or hopper if you want it to do more than sit still.',
            tone: 'warning',
          };
    case 'winch':
      return hasPart(manifest, 'hook')
        ? {
            message: 'Winch placed. Use Quick Connect to attach it to the hook.',
            tone: 'success',
          }
        : {
            message: 'Winch placed. Add a hook below it, then use Quick Connect.',
            tone: 'info',
          };
    case 'hook':
      return hasPart(manifest, 'winch')
        ? {
            message: 'Hook placed. Use Quick Connect to hang it from the winch.',
            tone: 'success',
          }
        : {
            message: 'Hook placed. Add a winch above it if you want it to hoist.',
            tone: 'warning',
          };
    case 'node':
      return hasPart(manifest, 'node')
        ? {
            message: 'Node placed. Quick Connect can turn it into a beam with another node.',
            tone: 'success',
          }
        : {
            message: 'Node placed. Add a second node if you want a beam between them.',
            tone: 'info',
          };
    case 'rail-segment':
      return {
        message: 'Rail placed. Add a locomotive, then set its trackId in the Inspector so it matches this rail.',
        tone: 'info',
      };
    case 'locomotive':
    case 'wagon':
      return hasPart(manifest, 'rail-segment')
        ? {
            message: `${labelForPrimitive(kind)} placed. Set its trackId in the Inspector so it points at a real rail segment.`,
            tone: 'warning',
          }
        : {
            message: `${labelForPrimitive(kind)} placed. Add rail first, then set its trackId in the Inspector.`,
            tone: 'warning',
          };
    default:
      return {
        message: `${labelForPrimitive(kind)} placed. Drag it to reposition or use the Inspector for safe edits.`,
        tone: 'info',
      };
  }
}

function placementInstructionForKind(kind: PrimitiveKind) {
  switch (kind) {
    case 'gear':
      return 'Drop it inside a motor ring or touching another gear if you want instant feedback.';
    case 'wheel':
      return 'Wheels respond best inside a motor ring or pressed against a powered gear.';
    case 'conveyor':
      return 'Conveyors come alive once cargo, a hopper, and a nearby motor join the setup.';
    case 'rail-segment':
      return 'Rails are the track. Locomotives still need their trackId set in the Inspector afterward.';
    case 'hook':
      return 'Hooks are most useful when they sit below a winch so Quick Connect can rope them together.';
    default:
      return 'Place it on the canvas, then test what it changed right away.';
  }
}

function selectedInstructionForKind(kind: PrimitiveKind) {
  switch (kind) {
    case 'motor':
      return 'Motors only feel satisfying when a gear, wheel, or conveyor can actually pick up their power.';
    case 'gear':
      return 'Gears need either motor reach or contact with another gear. Bigger gears trade speed for force.';
    case 'wheel':
      return 'Wheels can be powered directly by a motor or indirectly by a gear mesh.';
    case 'conveyor':
      return 'Conveyors are best tested with cargo on top and a hopper waiting at the far end.';
    case 'rail-segment':
      return 'Rails define the path, but locomotives and wagons still need the right trackId to follow them.';
    case 'locomotive':
    case 'wagon':
      return 'Use the Inspector to point this train part at a real rail segment. Otherwise it has nowhere to go.';
    default:
      return 'Drag it to reposition it, or change its safe numeric fields in the Inspector.';
  }
}

function hasPart(manifest: ExperimentManifest, kind: PrimitiveKind) {
  return manifest.primitives.some((primitive) => primitive.kind === kind);
}

function hasNearbyMotor(manifest: ExperimentManifest, x: number, y: number) {
  return manifest.primitives.some((primitive) => {
    if (primitive.kind !== 'motor') {
      return false;
    }

    const config = primitive.config as { x: number; y: number };
    return Math.hypot(config.x - x, config.y - y) < 300;
  });
}

function isDrivenPlacement(
  manifest: ExperimentManifest,
  kind: PrimitiveKind,
  x: number,
  y: number,
) {
  const nearMotor = manifest.primitives.some((primitive) => {
    if (primitive.kind !== 'motor') {
      return false;
    }

    const config = primitive.config as { x: number; y: number };
    return Math.hypot(config.x - x, config.y - y) < 220;
  });

  if (nearMotor) {
    return true;
  }

  return manifest.primitives.some((primitive) => {
    if (primitive.kind !== 'gear' && primitive.kind !== 'wheel') {
      return false;
    }

    const config = primitive.config as { x: number; y: number; teeth?: number; radius?: number };
    const radius = primitive.kind === 'gear'
      ? Math.max(24, Number(config.teeth ?? 24) * 1.4)
      : Number(config.radius ?? 28);
    const nextRadius = kind === 'gear' ? Math.max(24, 20 * 1.4) : 28;
    return Math.hypot(config.x - x, config.y - y) <= radius + nextRadius + 20;
  });
}

function labelForPrimitive(kind: PrimitiveKind) {
  switch (kind) {
    case 'rail-segment':
      return 'Rail';
    case 'rail-switch':
      return 'Switch';
    case 'cargo-block':
      return 'Cargo';
    case 'material-pile':
      return 'Material Pile';
    default:
      return kind
        .split('-')
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(' ');
  }
}
