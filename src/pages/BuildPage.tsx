import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AssistantPanel } from '../components/AssistantPanel';
import { ControlPanel } from '../components/ControlPanel';
import { InspectorPanel } from '../components/InspectorPanel';
import { MachineCanvas } from '../components/MachineCanvas';
import { PartPalette } from '../components/PartPalette';
import { editExperiment, explainExperiment, generateExperiment } from '../lib/api';
import { createBlueprintFromExperiment, mountBlueprintToManifest } from '../lib/blueprints';
import { db } from '../lib/db';
import { addPrimitive, connectPrimitives, deletePrimitive, movePrimitive, updatePrimitive } from '../lib/editor';
import { isJobComplete } from '../lib/jobs';
import { createDraftFromBlueprint, createDraftFromMachine, createEmptyDraft } from '../lib/seed-data';
import { useMachineSimulation } from '../lib/simulation';
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

  useEffect(() => {
    async function bootstrapDraft() {
      if (draft) {
        setManifest(draft.manifest);
        setControlValues(
          Object.fromEntries(
            draft.manifest.controls.map((control) => [control.id, control.defaultValue ?? false]),
          ),
        );
        return;
      }

      if (!draftId && machineFromQuery) {
        const nextDraft = createDraftFromMachine(machineFromQuery);
        await db.drafts.put(nextDraft);
        navigate(`/build/${nextDraft.draftId}${jobId ? `?job=${jobId}` : ''}`, { replace: true });
        return;
      }

      if (!draftId && blueprintFromQuery) {
        const nextDraft = createDraftFromBlueprint(blueprintFromQuery);
        await db.drafts.put(nextDraft);
        navigate(`/build/${nextDraft.draftId}${jobId ? `?job=${jobId}` : ''}`, { replace: true });
        return;
      }

      if (!draftId) {
        const nextDraft = createEmptyDraft();
        await db.drafts.put(nextDraft);
        navigate(`/build/${nextDraft.draftId}${jobId ? `?job=${jobId}` : ''}`, { replace: true });
      }
    }

    void bootstrapDraft();
  }, [blueprintFromQuery, draft, draftId, jobId, machineFromQuery, navigate]);

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

  useEffect(() => {
    if (!job || !jobComplete) {
      return;
    }
    void db.jobProgress.put({
      id: job.jobId,
      jobId: job.jobId,
      completed: true,
      lastPlayedAt: new Date().toISOString(),
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

  async function handleSaveMachine() {
    if (!manifest) {
      return;
    }
    const recordId = crypto.randomUUID();
    await db.machines.put({
      recordId,
      experiment: {
        ...manifest,
        experimentId: crypto.randomUUID(),
        status: 'saved',
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      labEntry: {
        whatBuilt: manifest.metadata.shortDescription,
        whatLearned: manifest.metadata.teachingGoal,
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
          <Link to="/">Back to Yard</Link>
        </div>
      </div>

      {job ? (
        <section className={`job-banner ${jobComplete ? 'complete' : ''}`}>
          <div>
            <p className="eyebrow">Active Job</p>
            <strong>{job.title}</strong>
            <p>{job.objective}</p>
          </div>
          <div className="badge">{jobComplete ? 'Completed' : 'In Progress'}</div>
        </section>
      ) : null}

      <div className="build-layout">
        <div className="left-rail">
          <AssistantPanel
            manifest={manifest}
            busy={busy}
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

        <div className="canvas-column">
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
    </div>
  );
}
