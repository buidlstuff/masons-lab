import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AssistantPanel } from '../components/AssistantPanel';
import { ControlPanel } from '../components/ControlPanel';
import { HudOverlay } from '../components/HudOverlay';
import { InspectorPanel } from '../components/InspectorPanel';
import { MachineCanvas } from '../components/MachineCanvas';
import { PartPalette } from '../components/PartPalette';
import { editExperiment, explainExperiment, generateExperiment } from '../lib/api';
import { createBlueprintFromExperiment, mountBlueprintToManifest } from '../lib/blueprints';
import { db } from '../lib/db';
import { addPrimitive, connectPrimitives, deletePrimitive, movePrimitive, updatePrimitive } from '../lib/editor';
import { getGoalProgress, isJobComplete } from '../lib/jobs';
import { createDraftFromBlueprint, createDraftFromMachine, createEmptyDraft } from '../lib/seed-data';
import { useMachineSimulation } from '../lib/simulation';
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
  const [statusMessage, setStatusMessage] = useState<string>();
  const [saveModal, setSaveModal] = useState<{ title: string; learned: string } | null>(null);
  const [xpToast, setXpToast] = useState<{ gained: number; newXp: number; tierName?: string } | null>(null);
  const jobCompletedRef = useRef(false);

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

      const nextDraft = createEmptyDraft();
      await db.drafts.put(nextDraft);
      applyDraft(nextDraft);
    }

    void bootstrapDraft();
  }, [blueprintFromQuery, draft, draftId, jobId, machineFromQuery, navigate, shareParam]);

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

  const jobComplete = isJobComplete(job, telemetry);
  // Reset once-per-session flag if the job changes
  useEffect(() => { jobCompletedRef.current = false; }, [jobId]);

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
    setStatusMessage('Saved machine to the yard.');
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
    setStatusMessage(`Saved blueprint "${blueprint.title}".`);
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
        setStatusMessage('Share link copied to clipboard!');
      });
    } catch {
      setStatusMessage('Could not copy link.');
    }
  }

  if (!manifest) {
    return (
      <div className="page centered-page">
        <h1>Preparing the yard...</h1>
        <p>If you opened a featured machine, the draft is being cloned now.</p>
      </div>
    );
  }

  return (
    <div className="page page-build">
      <div className="build-header">
        <div>
          <p className="eyebrow">Builder</p>
          <h1>{manifest.metadata.title}</h1>
          <p>{manifest.metadata.shortDescription}</p>
          {statusMessage ? <p className="muted">{statusMessage}</p> : null}
        </div>
        <div className="hero-actions">
          <button type="button" className="primary-link" onClick={handleSaveMachine}>
            Save Machine
          </button>
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
          <Link to="/">Back to Yard</Link>
        </div>
      </div>

      {job ? (() => {
        const gp = getGoalProgress(job, telemetry);
        const pct = Math.min(100, gp.target > 0 ? (gp.current / gp.target) * 100 : 0);
        return (
          <section className={`job-banner ${jobComplete ? 'complete' : ''}`}>
            <div className="job-banner-info">
              <p className="eyebrow">Active Job — Tier {job.tier}</p>
              <strong>{job.title}</strong>
              <p>{job.objective}</p>
            </div>
            <div className="job-goal-block">
              <div className="job-goal-label">
                <span>{gp.label}</span>
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
            <h2>Job Done, Mason!</h2>
            <p>You completed <strong>{job.title}</strong>.</p>
            <p className="muted">{job.hints[0] ?? 'Great work — try pushing the controls to see what else it can do!'}</p>
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
        <div className="left-rail">
          <AssistantPanel
            manifest={manifest}
            busy={busy}
            blueprints={blueprints ?? []}
            onMount={(blueprintRecord) => {
              void persistDraft(mountBlueprintToManifest(manifest, blueprintRecord.blueprint));
              setStatusMessage(`Mounted ${blueprintRecord.blueprint.title}.`);
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
          <MachineCanvas
            manifest={manifest}
            runtime={runtime}
            selectedPrimitiveId={selectedPrimitiveId}
            placingKind={placingKind}
            onPlacePrimitive={(x, y) => {
              void persistDraft(addPrimitive(manifest, placingKind ?? 'node', x, y));
              setPlacingKind(null);
            }}
            onSelectPrimitive={(primitiveId) => setSelectedPrimitiveId(primitiveId)}
            onMovePrimitive={(primitiveId, x, y) => {
              void persistDraft(movePrimitive(manifest, primitiveId, x, y));
            }}
            onTelemetry={setTelemetry}
          />
        </div>

        <div className="right-rail">
          <PartPalette selectedKind={placingKind} onSelectKind={setPlacingKind} />
          <ControlPanel
            controls={manifest.controls}
            values={controlValues}
            onChange={(controlId, value) => {
              setControlValues((current) => ({ ...current, [controlId]: value }));
            }}
          />
          <InspectorPanel
            primitive={selectedPrimitive}
            manifest={manifest}
            onDelete={(primitiveId) => {
              void persistDraft(deletePrimitive(manifest, primitiveId));
              if (selectedPrimitiveId === primitiveId) {
                setSelectedPrimitiveId(undefined);
              }
            }}
            onUpdateNumber={(primitiveId, key, value) => {
              const primitive = manifest.primitives.find((item) => item.id === primitiveId);
              if (!primitive) {
                return;
              }
              void persistDraft(updatePrimitive(manifest, primitiveId, { ...primitive.config, [key]: value }));
            }}
          />

          <section className="panel small-panel">
            <div className="panel-header compact">
              <div>
                <p className="eyebrow">Blueprint Library</p>
                <h3>Mount reusable modules</h3>
              </div>
            </div>
            <div className="blueprint-list">
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
                      setStatusMessage(`Mounted ${blueprintRecord.blueprint.title}.`);
                    }}
                  >
                    Mount
                  </button>
                </article>
              ))}
            </div>
          </section>

          <section className="panel small-panel">
            <div className="panel-header compact">
              <div>
                <p className="eyebrow">Quick Connect</p>
                <h3>Approved pairings</h3>
              </div>
            </div>
            <p className="muted">Select a source part, then use the quick connectors below.</p>
            <div className="button-row vertical">
              <button
                type="button"
                disabled={!selectedPrimitiveId}
                onClick={() => {
                  const target = manifest.primitives.find(
                    (primitive) => primitive.id !== selectedPrimitiveId && primitive.kind === 'hook',
                  );
                  if (selectedPrimitiveId && target) {
                    void persistDraft(connectPrimitives(manifest, selectedPrimitiveId, target.id));
                  }
                }}
              >
                Connect Winch to Hook
              </button>
              <button
                type="button"
                disabled={!selectedPrimitiveId}
                onClick={() => {
                  const source = selectedPrimitiveId;
                  const target = manifest.primitives.find(
                    (primitive) => primitive.id !== source && primitive.kind === 'node',
                  );
                  if (source && target) {
                    void persistDraft(connectPrimitives(manifest, source, target.id));
                  }
                }}
              >
                Connect Nodes with Beam
              </button>
            </div>
          </section>
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
