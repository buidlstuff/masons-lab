import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ControlPanel } from '../components/ControlPanel';
import { ChallengeToast } from '../components/ChallengeToast';
import { HudOverlay } from '../components/HudOverlay';
import { StarterOverlay } from '../components/StarterOverlay';
import { InspectorPanel } from '../components/InspectorPanel';
import { MachineCanvas } from '../components/MachineCanvas';
import { PartPalette } from '../components/PartPalette';
import { RouteSkeleton } from '../components/RouteSkeleton';
import { createBlueprintFromExperiment, mountBlueprintToManifest } from '../lib/blueprints';
import { useAppBoot } from '../lib/app-boot';
import { db } from '../lib/db';
import { addPrimitive, connectPrimitives, deletePrimitive, movePrimitive, updatePrimitive } from '../lib/editor';
import {
  ACTIVE_CHALLENGE_LIMIT,
  CHALLENGES,
  createChallengeScratchState,
  evaluateChallengeCompletion,
  type ChallengeDefinition,
} from '../lib/challenges';
import {
  countActiveCargo,
  countActiveGearPairs,
  countPoweredConveyors,
  evaluateProject,
  getGoalProgress,
} from '../lib/jobs';
import {
  ensureDraftPlayState,
  latchProjectSteps,
  latestCheckpointForJob,
  START_CHECKPOINT_ID,
  toggleDiagnostics,
} from '../lib/play-state';
import { markPerformance, measurePerformance } from '../lib/perf';
import {
  createDraftFromBlueprint,
  createDraftFromMachine,
  createDraftFromProject,
  createEmptyDraft,
  createEmptyManifest,
  createDraftFromSillyScene,
} from '../lib/seed-data';
import { useMachineSimulation, type RuntimeSnapshot } from '../lib/simulation';
import { getRandomSillyScene, SILLY_SCENES } from '../lib/silly-scenes';
import { playUiTone } from '../lib/sfx';
import { awardJobXp, TIER_NAMES } from '../lib/xp';
import type {
  BuildTelemetry,
  ChallengeProgressRecord,
  DraftPlayState,
  DraftRecord,
  EditExperimentResult,
  ExperimentManifest,
  GenerateExperimentResult,
  PrimitiveConfig,
  PrimitiveKind,
  PrimitiveInstance,
  SavedBlueprintRecord,
} from '../lib/types';

const LazyAssistantPanel = lazy(async () => {
  const module = await import('../components/AssistantPanel');
  return { default: module.AssistantPanel };
});

const LazyChallengePanel = lazy(async () => {
  const module = await import('../components/ChallengePanel');
  return { default: module.ChallengePanel };
});

const LazySillySceneSelector = lazy(async () => {
  const module = await import('../components/SillySceneSelector');
  return { default: module.SillySceneSelector };
});

async function loadAssistantApi() {
  return import('../lib/api');
}

function averagePoint(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) {
    return { x: 0, y: 0 };
  }
  const total = points.reduce(
    (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
    { x: 0, y: 0 },
  );
  return { x: total.x / points.length, y: total.y / points.length };
}

function getPrimitiveAnchor(
  primitive: PrimitiveInstance,
  manifest: ExperimentManifest,
  visited = new Set<string>(),
): { x: number; y: number } {
  if (visited.has(primitive.id)) {
    return { x: 0, y: 0 };
  }
  const nextVisited = new Set(visited).add(primitive.id);
  if ('x' in primitive.config && 'y' in primitive.config) {
    return { x: primitive.config.x, y: primitive.config.y };
  }
  if ('path' in primitive.config) {
    return averagePoint((primitive.config as { path: Array<{ x: number; y: number }> }).path);
  }
  if ('points' in primitive.config) {
    return averagePoint((primitive.config as { points: Array<{ x: number; y: number }> }).points);
  }
  if (primitive.kind === 'locomotive' || primitive.kind === 'wagon') {
    const track = manifest.primitives.find(
      (item) => item.id === (primitive.config as { trackId?: string }).trackId && item.kind === 'rail-segment',
    );
    if (track?.kind === 'rail-segment') {
      return averagePoint((track.config as { points: Array<{ x: number; y: number }> }).points);
    }
  }
  if (primitive.kind === 'rope' || primitive.kind === 'belt-link' || primitive.kind === 'chain-link') {
    const cfg = primitive.config as { fromId: string; toId: string; viaIds?: string[] };
    const ids = [cfg.fromId, ...(cfg.viaIds ?? []), cfg.toId];
    const points: Array<{ x: number; y: number }> = ids
      .map((id) => manifest.primitives.find((item) => item.id === id))
      .filter((item): item is PrimitiveInstance => Boolean(item))
      .map((item) => getPrimitiveAnchor(item, manifest, nextVisited));
    if (points.length > 0) {
      return averagePoint(points);
    }
  }
  return { x: 0, y: 0 };
}

function findNearestPrimitive(
  manifest: ExperimentManifest,
  source: PrimitiveInstance,
  predicate: (primitive: PrimitiveInstance) => boolean,
) {
  const sourceAnchor = getPrimitiveAnchor(source, manifest);
  return manifest.primitives
    .filter((primitive) => primitive.id !== source.id)
    .filter(predicate)
    .sort((a, b) => {
      const aAnchor = getPrimitiveAnchor(a, manifest);
      const bAnchor = getPrimitiveAnchor(b, manifest);
      return Math.hypot(aAnchor.x - sourceAnchor.x, aAnchor.y - sourceAnchor.y)
        - Math.hypot(bAnchor.x - sourceAnchor.x, bAnchor.y - sourceAnchor.y);
    })[0];
}

function hasConnectorBetween(
  manifest: ExperimentManifest,
  leftId: string,
  rightId: string,
  connectorKinds: PrimitiveKind[],
) {
  return manifest.primitives.some((primitive) => {
    if (!connectorKinds.includes(primitive.kind)) return false;
    const config = primitive.config as { fromId?: string; toId?: string };
    return (
      (config.fromId === leftId && config.toId === rightId)
      || (config.fromId === rightId && config.toId === leftId)
    );
  });
}

function findNearestPrimitivePair(
  manifest: ExperimentManifest,
  leftCandidates: PrimitiveInstance[],
  rightCandidates: PrimitiveInstance[],
  blocked?: (left: PrimitiveInstance, right: PrimitiveInstance) => boolean,
) {
  let best: { left: PrimitiveInstance; right: PrimitiveInstance; dist: number } | null = null;
  for (const left of leftCandidates) {
    const leftAnchor = getPrimitiveAnchor(left, manifest);
    for (const right of rightCandidates) {
      if (left.id === right.id) continue;
      if (blocked?.(left, right)) continue;
      const rightAnchor = getPrimitiveAnchor(right, manifest);
      const dist = Math.hypot(rightAnchor.x - leftAnchor.x, rightAnchor.y - leftAnchor.y);
      if (!best || dist < best.dist) {
        best = { left, right, dist };
      }
    }
  }
  return best;
}

function createInitialRuntimeSnapshot(): RuntimeSnapshot {
  return {
    time: 0,
    rotations: {},
    cargoProgress: {},
    hookY: 0,
    trainProgress: 0,
    trainDelivered: false,
    hopperFill: 0,
    throughput: 0,
    telemetry: {},
    cargoStates: {},
    beltPowered: false,
    lostCargoCount: 0,
    stableCargoSpawns: {},
    wagonLoads: {},
    wagonCargo: {},
    pistonExtensions: {},
    bucketContents: {},
    bucketStates: {},
    springCompressions: {},
    sandParticlePositions: [],
    bodyPositions: {},
  };
}

export function BuildPage() {
  const { draftId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const boot = useAppBoot();
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

  const [manifest, setManifest] = useState<ExperimentManifest | null>(null);
  const [playState, setPlayState] = useState<DraftPlayState | null>(null);
  const [selectedPrimitiveId, setSelectedPrimitiveId] = useState<string>();
  const [placingKind, setPlacingKind] = useState<PrimitiveKind | null>(null);
  const [controlValues, setControlValues] = useState<Record<string, string | number | boolean>>({});
  const [telemetry, setTelemetry] = useState<BuildTelemetry>({});
  const [busy, setBusy] = useState(false);
  const [statusNotice, setStatusNotice] = useState<{ tone: NoticeTone; message: string } | null>(null);
  const [saveModal, setSaveModal] = useState<{ title: string; learned: string } | null>(null);
  const [xpToast, setXpToast] = useState<{ gained: number; newXp: number; tierName?: string } | null>(null);
  const [flashToast, setFlashToast] = useState(false);
  const [stepCelebrating, setStepCelebrating] = useState(false);
  const [assistantPromptSeed, setAssistantPromptSeed] = useState<string | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [adultToolsOpen, setAdultToolsOpen] = useState(false);
  const [challengePanelOpen, setChallengePanelOpen] = useState(false);
  const [sceneShelfOpen, setSceneShelfOpen] = useState(false);
  const [workshopShelfOpen, setWorkshopShelfOpen] = useState(false);
  const [canvasReady, setCanvasReady] = useState(false);
  const [challengeToast, setChallengeToast] = useState<ChallengeDefinition | null>(null);
  const flashCountRef = useRef(0);
  const undoStackRef = useRef<Array<{ manifest: ExperimentManifest; playState: DraftPlayState | null }>>([]);
  const jobCompletedRef = useRef(false);
  const previousHopperFillRef = useRef(0);
  const statusTimeoutRef = useRef<number | undefined>(undefined);
  const currentManifestRef = useRef<ExperimentManifest | null>(null);
  const currentPlayStateRef = useRef<DraftPlayState | null>(null);
  const runtimeSnapshotRef = useRef<RuntimeSnapshot>(createInitialRuntimeSnapshot());
  const challengeScratchRef = useRef(createChallengeScratchState());
  const completedChallengeIdsRef = useRef(new Set<string>());
  const challengeLastEvalAtRef = useRef<number>(Date.now());
  const builderMeasureRef = useRef(false);
  const shouldLoadBlueprints = assistantOpen || workshopShelfOpen;
  const blueprints = useLiveQuery<SavedBlueprintRecord[]>(
    () => (shouldLoadBlueprints
      ? db.blueprints.orderBy('updatedAt').reverse().limit(8).toArray()
      : []),
    [shouldLoadBlueprints],
  );
  const challengeProgress = useLiveQuery<ChallengeProgressRecord[]>(
    () => db.challengeProgress.toArray(),
    [],
  ) ?? [];

  const showStatus = useCallback((message: string, tone: NoticeTone = 'info') => {
    window.clearTimeout(statusTimeoutRef.current);
    setStatusNotice({ message, tone });
    statusTimeoutRef.current = window.setTimeout(() => setStatusNotice(null), 4200);
  }, []);

  useEffect(() => {
    currentManifestRef.current = manifest;
  }, [manifest]);

  useEffect(() => {
    currentPlayStateRef.current = playState;
  }, [playState]);

  useEffect(() => {
    markPerformance('build-route-entered');
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
        setPlayState(ensureDraftPlayState(draft.playState, jobId ?? draft.playState?.jobId, draft.manifest));
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
          newDraft.playState = ensureDraftPlayState(newDraft.playState, jobId ?? undefined, decoded);
          await db.drafts.put(newDraft);
          setManifest(decoded);
          setPlayState(newDraft.playState);
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
        setPlayState(ensureDraftPlayState(nextDraft.playState, jobId ?? nextDraft.playState?.jobId, nextDraft.manifest));
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
      nextDraft.playState = ensureDraftPlayState(nextDraft.playState, jobId ?? undefined, nextDraft.manifest);
      await db.drafts.put(nextDraft);
      applyDraft(nextDraft);
    }

    void bootstrapDraft();
  }, [blueprintFromQuery, draft, draftId, job, jobId, machineFromQuery, navigate, shareParam]);

  const runtime = useMachineSimulation(
    manifest,
    controlValues,
    {
      stableCargoSpawns: playState?.lastStableCargoSpawns,
      enabled: Boolean(manifest),
    },
  );
  const runtimeSnapshot = runtime.snapshot;
  const simulationStatus = runtime.status;
  const completedChallengeIds = useMemo(
    () => challengeProgress
      .filter((record) => record.completed)
      .map((record) => record.challengeId),
    [challengeProgress],
  );
  const activeChallenges = useMemo(
    () => CHALLENGES
      .filter((challenge) => !completedChallengeIds.includes(challenge.id))
      .slice(0, ACTIVE_CHALLENGE_LIMIT),
    [completedChallengeIds],
  );

  useEffect(() => {
    runtimeSnapshotRef.current = runtimeSnapshot;
  }, [runtimeSnapshot]);

  useEffect(() => {
    completedChallengeIdsRef.current = new Set(completedChallengeIds);
  }, [completedChallengeIds]);

  useEffect(() => {
    challengeScratchRef.current = createChallengeScratchState();
    challengeLastEvalAtRef.current = Date.now();
  }, [manifest]);

  useEffect(() => {
    if (!manifest) return undefined;

    const interval = window.setInterval(() => {
      const currentManifest = currentManifestRef.current;
      const currentRuntime = runtimeSnapshotRef.current;
      if (!currentManifest || simulationStatus !== 'ready') return;

      const now = Date.now();
      const deltaSeconds = Math.min(2, Math.max(0.25, (now - challengeLastEvalAtRef.current) / 1000));
      challengeLastEvalAtRef.current = now;

      const completedIds = new Set(completedChallengeIdsRef.current);
      const pendingChallenges = CHALLENGES
        .filter((challenge) => !completedIds.has(challenge.id))
        .slice(0, ACTIVE_CHALLENGE_LIMIT);
      const newlyCompleted = pendingChallenges.filter((challenge) =>
        evaluateChallengeCompletion(
          challenge,
          currentManifest,
          currentRuntime,
          challengeScratchRef.current,
          deltaSeconds,
        ),
      );

      if (newlyCompleted.length === 0) return;

      newlyCompleted.forEach((challenge) => completedIds.add(challenge.id));
      completedChallengeIdsRef.current = completedIds;
      setChallengeToast((current) => current ?? newlyCompleted[0]);
      void Promise.all(newlyCompleted.map((challenge) => db.challengeProgress.put({
        challengeId: challenge.id,
        completed: true,
        completedAt: Date.now(),
      }))).catch(() => {});
    }, 500);

    return () => window.clearInterval(interval);
  }, [manifest, simulationStatus]);

  const selectedPrimitive = useMemo<PrimitiveInstance | undefined>(
    () => manifest?.primitives.find((primitive) => primitive.id === selectedPrimitiveId),
    [manifest, selectedPrimitiveId],
  );

  const projectState = useMemo(
    () => (job && manifest ? evaluateProject(job, manifest, runtimeSnapshot, playState) : null),
    [job, manifest, playState, runtimeSnapshot],
  );
  const projectUnlocked = projectState?.unlockedAllParts ?? true;
  const activeProjectStep = projectState?.currentStep ?? null;
  const jobComplete = projectState?.complete ?? false;
  // Reset once-per-session flag if the job changes
  useEffect(() => {
    jobCompletedRef.current = false;
  }, [jobId]);

  useEffect(() => {
    const currentFill = runtimeSnapshot.hopperFill ?? 0;
    if (currentFill > previousHopperFillRef.current) {
      playUiTone('capture');
    }
    previousHopperFillRef.current = currentFill;
  }, [runtimeSnapshot.hopperFill]);

  useEffect(() => {
    if (!manifest || !canvasReady || simulationStatus !== 'ready' || builderMeasureRef.current) {
      return;
    }

    markPerformance('canvas-ready');
    measurePerformance('build-ready-duration', 'build-route-entered', 'canvas-ready');
    builderMeasureRef.current = true;
  }, [canvasReady, manifest, simulationStatus]);

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
    async (
      nextManifest: ExperimentManifest,
      nextPlayStateArg?: DraftPlayState | null,
      options?: { recordHistory?: boolean },
    ) => {
      const currentManifest = currentManifestRef.current;
      const currentPlayState = currentPlayStateRef.current;
      const nextPlayState = normalizePlayStateForManifest(
        nextManifest,
        ensureDraftPlayState(nextPlayStateArg ?? currentPlayState ?? undefined, jobId ?? currentPlayState?.jobId, nextManifest),
      );

      if (options?.recordHistory && currentManifest) {
        undoStackRef.current = [
          ...undoStackRef.current.slice(-19),
          {
            manifest: structuredClone(currentManifest),
            playState: currentPlayState ? structuredClone(currentPlayState) : null,
          },
        ];
      }

      setManifest(nextManifest);
      setPlayState(nextPlayState);
      if (!draftId) {
        return;
      }
      const nextDraft: DraftRecord = {
        draftId,
        sourceMachineId: draft?.sourceMachineId,
        sourceBlueprintId: draft?.sourceBlueprintId,
        manifest: nextManifest,
        playState: nextPlayState,
        updatedAt: new Date().toISOString(),
      };
      await db.drafts.put(nextDraft);
    },
    [draft?.sourceBlueprintId, draft?.sourceMachineId, draftId, jobId],
  );

  useEffect(() => {
    if (!projectState || !playState || !manifest || !job) {
      return;
    }

    const newlyLatched = projectState.steps.filter((step) => step.liveCompleted && !step.latched);
    if (newlyLatched.length === 0) {
      return;
    }

    const nextPlayState = latchProjectSteps(
      ensureDraftPlayState(playState, job.jobId, manifest),
      newlyLatched.map((step) => step.stepId),
      manifest,
    );
    const nextProjectState = evaluateProject(job, manifest, runtimeSnapshot, nextPlayState);
    const latestStep = newlyLatched[newlyLatched.length - 1];

    setStepCelebrating(true);
    setTimeout(() => setStepCelebrating(false), 1800);
    playUiTone('success');
    void persistDraft(manifest, nextPlayState);

    if (latestStep) {
      if (nextProjectState?.complete) {
        setPlacingKind(null);
        showStatus(latestStep.successCopy, 'success');
      } else {
        const nextKind = nextProjectState?.currentStep?.allowedPartKinds[0] ?? null;
        setSelectedPrimitiveId(undefined);
        setPlacingKind(nextKind);
        showStatus(
          `${latestStep.successCopy}${nextProjectState?.currentStep ? ` Next: ${nextProjectState.currentStep.instruction}` : ''}`,
          'success',
        );
      }
    }
  }, [job, manifest, persistDraft, playState, projectState, runtimeSnapshot, showStatus]);

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
    const nextManifest = structuredClone({
      ...manifest,
      experimentId: crypto.randomUUID(),
      metadata: {
        ...manifest.metadata,
        title: `${manifest.metadata.title} Remix`,
        remixOfExperimentId: manifest.experimentId,
      },
    });
    const newDraft: DraftRecord = {
      draftId: crypto.randomUUID(),
      manifest: nextManifest,
      playState: ensureDraftPlayState(playState ?? undefined, jobId ?? playState?.jobId, nextManifest),
      updatedAt: new Date().toISOString(),
      sourceMachineId: draft?.sourceMachineId,
      sourceBlueprintId: draft?.sourceBlueprintId,
    };
    await db.drafts.put(newDraft);
    navigate(`/build/${newDraft.draftId}`);
  }

  const handleLoadSillyScene = useCallback(async (sceneId?: string) => {
    const scene = sceneId ? SILLY_SCENES.find((candidate) => candidate.id === sceneId) : getRandomSillyScene();
    if (!scene) {
      showStatus('Could not find that scene right now.', 'warning');
      return;
    }
    const nextDraft = createDraftFromSillyScene(scene.id);
    if (!nextDraft) {
      showStatus('Could not build that scene draft.', 'warning');
      return;
    }
    await db.drafts.put(nextDraft);
    navigate(`/build/${nextDraft.draftId}`);
    showStatus(`Loaded ${scene.title}.`, 'success');
  }, [navigate, showStatus]);

  async function applyGenerated(result: GenerateExperimentResult) {
    const nextManifest = result.experiment;
    setControlValues(
      Object.fromEntries(nextManifest.controls.map((control) => [control.id, control.defaultValue ?? false])),
    );
    await persistDraft(nextManifest, undefined, { recordHistory: true });
  }

  async function applyEdited(result: EditExperimentResult) {
    const nextManifest = result.experiment;
    await persistDraft(nextManifest, undefined, { recordHistory: true });
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

  const projectGuide = useMemo(
    () => (
      manifest && activeProjectStep
        ? deriveProjectGuide(manifest, activeProjectStep, placingKind ?? activeProjectStep.allowedPartKinds[0] ?? null)
        : null
    ),
    [activeProjectStep, manifest, placingKind],
  );
  const activeJobHint = simulationStatus !== 'ready'
    ? 'Loading the live machine engine.'
    : projectGuide?.detail ?? activeProjectStep?.instruction ?? (jobComplete ? job?.hints[0] : undefined);
  const machineActivity = manifest
    ? deriveMachineActivity(manifest, runtimeSnapshot)
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
      setAssistantOpen(true);
      showStatus('Loaded a prompt into the assistant.', 'info');
    },
    [showStatus],
  );

  const handlePlacePrimitive = useCallback(
    (x: number, y: number) => {
      if (!manifest || !placingKind) {
        return;
      }

      const guidedPlacement = activeProjectStep
        ? deriveGuidedPlacement(manifest, activeProjectStep, placingKind, x, y)
        : null;
      const nextPosition = guidedPlacement ?? { x, y };
      let nextManifest = addPrimitive(manifest, placingKind, nextPosition.x, nextPosition.y);
      let placedPrimitive = nextManifest.primitives[nextManifest.primitives.length - 1];
      if (guidedPlacement?.configOverride && placedPrimitive) {
        nextManifest = updatePrimitive(nextManifest, placedPrimitive.id, guidedPlacement.configOverride);
        placedPrimitive = nextManifest.primitives[nextManifest.primitives.length - 1];
      }
      void persistDraft(nextManifest, undefined, { recordHistory: true });
      setSelectedPrimitiveId(placedPrimitive?.id);
      setPlacingKind(null);
      playUiTone('place');

      const placementFeedback = guidedPlacement?.feedback ?? describePlacedPrimitive(manifest, placingKind, nextPosition.x, nextPosition.y);
      showStatus(placementFeedback.message, placementFeedback.tone);
    },
    [activeProjectStep, manifest, persistDraft, placingKind, showStatus],
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

    void persistDraft(connectPrimitives(manifest, source.id, target.id), undefined, { recordHistory: true });
    showStatus('Connected the winch to the hook.', 'success');
  }, [manifest, persistDraft, selectedPrimitiveId, showStatus]);

  const handleCreateConnectorShortcut = useCallback((kind: 'rope' | 'belt-link' | 'chain-link') => {
    if (!manifest) {
      return;
    }

    if (kind === 'rope') {
      const winches = manifest.primitives.filter((primitive) => primitive.kind === 'winch');
      const hooks = manifest.primitives.filter((primitive) => primitive.kind === 'hook');
      const pair = findNearestPrimitivePair(
        manifest,
        winches,
        hooks,
        (left, right) => hasConnectorBetween(manifest, left.id, right.id, ['rope']),
      );
      if (!pair) {
        showStatus('Place both a winch and a hook first, then Rope can link them.', 'warning');
        return;
      }
      void persistDraft(connectPrimitives(manifest, pair.left.id, pair.right.id), undefined, { recordHistory: true });
      showStatus('Created a rope between the nearest winch and hook.', 'success');
      return;
    }

    if (kind === 'belt-link') {
      const beltKinds: PrimitiveKind[] = ['wheel', 'pulley', 'flywheel'];
      const candidates = manifest.primitives.filter((primitive) => beltKinds.includes(primitive.kind));
      const pair = findNearestPrimitivePair(
        manifest,
        candidates,
        candidates,
        (left, right) => hasConnectorBetween(manifest, left.id, right.id, ['belt-link', 'chain-link', 'rope']),
      );
      if (!pair) {
        showStatus('Place two wheels, pulleys, or flywheels first, then Belt can link them.', 'warning');
        return;
      }
      void persistDraft(connectPrimitives(manifest, pair.left.id, pair.right.id), undefined, { recordHistory: true });
      showStatus('Created a drive belt between the nearest matching parts.', 'success');
      return;
    }

    const sprockets = manifest.primitives.filter((primitive) => primitive.kind === 'chain-sprocket');
    const pair = findNearestPrimitivePair(
      manifest,
      sprockets,
      sprockets,
      (left, right) => hasConnectorBetween(manifest, left.id, right.id, ['belt-link', 'chain-link', 'rope']),
    );
    if (!pair) {
      showStatus('Place two chain sprockets first, then Chain can link them.', 'warning');
      return;
    }
    void persistDraft(connectPrimitives(manifest, pair.left.id, pair.right.id), undefined, { recordHistory: true });
    showStatus('Created a chain link between the nearest sprockets.', 'success');
  }, [manifest, persistDraft, showStatus]);

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

    void persistDraft(connectPrimitives(manifest, selectedPrimitiveId, target.id), undefined, { recordHistory: true });
    showStatus('Connected the two nodes with a beam.', 'success');
  }, [manifest, persistDraft, selectedPrimitiveId, showStatus]);

  const handleMountWheelToChassis = useCallback(() => {
    if (!manifest || !selectedPrimitive) return;
    const wheel = selectedPrimitive.kind === 'wheel'
      ? selectedPrimitive
      : findNearestPrimitive(
          manifest,
          selectedPrimitive,
          (primitive) => primitive.kind === 'wheel' && (primitive.config as { attachedToId?: string }).attachedToId !== selectedPrimitive.id,
        );
    const chassis = selectedPrimitive.kind === 'chassis'
      ? selectedPrimitive
      : findNearestPrimitive(manifest, selectedPrimitive, (primitive) => primitive.kind === 'chassis');
    if (!wheel || !chassis) {
      showStatus('Place both a wheel and a chassis, then Quick Connect can mount them together.', 'warning');
      return;
    }
    void persistDraft(connectPrimitives(manifest, wheel.id, chassis.id), undefined, { recordHistory: true });
    showStatus('Mounted the wheel onto the chassis.', 'success');
  }, [manifest, persistDraft, selectedPrimitive, showStatus]);

  const handleMountMotorToChassis = useCallback(() => {
    if (!manifest || !selectedPrimitive) return;
    const motor = selectedPrimitive.kind === 'motor'
      ? selectedPrimitive
      : findNearestPrimitive(
          manifest,
          selectedPrimitive,
          (primitive) => primitive.kind === 'motor' && (primitive.config as { attachedToId?: string }).attachedToId !== selectedPrimitive.id,
        );
    const chassis = selectedPrimitive.kind === 'chassis'
      ? selectedPrimitive
      : findNearestPrimitive(manifest, selectedPrimitive, (primitive) => primitive.kind === 'chassis');
    if (!motor || !chassis) {
      showStatus('Place both a motor and a chassis, then Quick Connect can mount the motor to the frame.', 'warning');
      return;
    }
    void persistDraft(connectPrimitives(manifest, motor.id, chassis.id), undefined, { recordHistory: true });
    showStatus('Mounted the motor onto the chassis.', 'success');
  }, [manifest, persistDraft, selectedPrimitive, showStatus]);

  const handleMountAssemblyToChassis = useCallback(() => {
    if (!manifest || !selectedPrimitive) return;
    const mountKinds: PrimitiveKind[] = ['gear', 'pulley', 'chain-sprocket', 'flywheel', 'winch', 'crane-arm'];
    const mountable = mountKinds.includes(selectedPrimitive.kind)
      ? selectedPrimitive
      : findNearestPrimitive(
          manifest,
          selectedPrimitive,
          (primitive) => mountKinds.includes(primitive.kind) && (primitive.config as { attachedToId?: string }).attachedToId !== selectedPrimitive.id,
        );
    const chassis = selectedPrimitive.kind === 'chassis'
      ? selectedPrimitive
      : findNearestPrimitive(manifest, selectedPrimitive, (primitive) => primitive.kind === 'chassis');
    if (!mountable || !chassis) {
      showStatus('Place both a chassis and a rotary part, winch, or crane arm first.', 'warning');
      return;
    }
    void persistDraft(connectPrimitives(manifest, mountable.id, chassis.id), undefined, { recordHistory: true });
    showStatus(`Mounted the ${(mountable.label ?? mountable.kind).toLowerCase()} onto the chassis.`, 'success');
  }, [manifest, persistDraft, selectedPrimitive, showStatus]);

  const handleAttachArmLoad = useCallback((loadKind: 'bucket' | 'counterweight') => {
    if (!manifest || !selectedPrimitive) return;
    const arm = selectedPrimitive.kind === 'crane-arm'
      ? selectedPrimitive
      : findNearestPrimitive(manifest, selectedPrimitive, (primitive) => primitive.kind === 'crane-arm');
    const load = selectedPrimitive.kind === loadKind
      ? selectedPrimitive
      : findNearestPrimitive(
          manifest,
          selectedPrimitive,
          (primitive) => primitive.kind === loadKind && (primitive.config as { attachedToId?: string }).attachedToId !== arm?.id,
        );
    if (!arm || !load) {
      showStatus(`Place both a crane arm and a ${loadKind === 'bucket' ? 'bucket' : 'counterweight'} first.`, 'warning');
      return;
    }
    void persistDraft(connectPrimitives(manifest, arm.id, load.id), undefined, { recordHistory: true });
    showStatus(`Attached the ${loadKind === 'bucket' ? 'bucket' : 'counterweight'} to the crane arm.`, 'success');
  }, [manifest, persistDraft, selectedPrimitive, showStatus]);

  const handleHookCargo = useCallback(() => {
    if (!manifest || !selectedPrimitive) return;
    const hook = selectedPrimitive.kind === 'hook'
      ? selectedPrimitive
      : findNearestPrimitive(manifest, selectedPrimitive, (primitive) => primitive.kind === 'hook');
    const cargo = selectedPrimitive.kind === 'cargo-block'
      ? selectedPrimitive
      : findNearestPrimitive(manifest, selectedPrimitive, (primitive) => primitive.kind === 'cargo-block');
    if (!hook || !cargo) {
      showStatus('Place both a hook and a cargo block first, then Quick Connect can clip them together.', 'warning');
      return;
    }
    void persistDraft(connectPrimitives(manifest, hook.id, cargo.id), undefined, { recordHistory: true });
    showStatus('Attached the cargo block to the hook.', 'success');
  }, [manifest, persistDraft, selectedPrimitive, showStatus]);

  const handleConnectBelt = useCallback(() => {
    if (!manifest || !selectedPrimitive) return;
    const beltKinds: PrimitiveKind[] = ['wheel', 'pulley', 'chain-sprocket', 'flywheel'];
    if (!beltKinds.includes(selectedPrimitive.kind)) {
      return;
    }
    const target = findNearestPrimitive(
      manifest,
      selectedPrimitive,
      (primitive) => beltKinds.includes(primitive.kind)
        && !manifest.primitives.some(
          (item) => (item.kind === 'belt-link' || item.kind === 'chain-link' || item.kind === 'rope')
            && (
              ((item.config as { fromId: string; toId: string }).fromId === selectedPrimitive.id
                && (item.config as { fromId: string; toId: string }).toId === primitive.id)
              || ((item.config as { fromId: string; toId: string }).fromId === primitive.id
                && (item.config as { fromId: string; toId: string }).toId === selectedPrimitive.id)
            ),
        ),
    );
    if (!target) {
      showStatus('Place another wheel, pulley, sprocket, or flywheel nearby first.', 'warning');
      return;
    }
    void persistDraft(connectPrimitives(manifest, selectedPrimitive.id, target.id), undefined, { recordHistory: true });
    showStatus('Connected the rotating parts with a visible drive link.', 'success');
  }, [manifest, persistDraft, selectedPrimitive, showStatus]);

  const handleConnectLocomotiveDrive = useCallback(() => {
    if (!manifest || !selectedPrimitive) return;
    const driveKinds: PrimitiveKind[] = ['gear', 'wheel', 'pulley', 'chain-sprocket', 'flywheel'];
    const locomotiveHasTrack = (primitive: PrimitiveInstance) => primitive.kind === 'locomotive'
      && manifest.primitives.some(
        (item) => item.kind === 'rail-segment' && item.id === (primitive.config as { trackId?: string }).trackId,
      );
    const locomotive = selectedPrimitive.kind === 'locomotive'
      ? selectedPrimitive
      : findNearestPrimitive(manifest, selectedPrimitive, locomotiveHasTrack);
    if (locomotive && !locomotiveHasTrack(locomotive)) {
      showStatus('Set the locomotive trackId to a real rail segment first.', 'warning');
      return;
    }
    const driver = driveKinds.includes(selectedPrimitive.kind)
      ? selectedPrimitive
      : findNearestPrimitive(manifest, selectedPrimitive, (primitive) => driveKinds.includes(primitive.kind));
    if (!locomotive || !driver) {
      showStatus('Place both a locomotive and a rotating driver first.', 'warning');
      return;
    }
    void persistDraft(connectPrimitives(manifest, locomotive.id, driver.id), undefined, { recordHistory: true });
    showStatus(`Linked the locomotive to the ${driver.label ?? driver.kind}.`, 'success');
  }, [manifest, persistDraft, selectedPrimitive, showStatus]);

  const handleRouteDriveLinkThroughIdler = useCallback(() => {
    if (!manifest || !selectedPrimitive) return;
    const beltIdlerKinds: PrimitiveKind[] = ['wheel', 'pulley', 'flywheel'];
    const chainIdlerKinds: PrimitiveKind[] = ['chain-sprocket'];
    const selectedKind = selectedPrimitive.kind;
    const isBeltIdler = beltIdlerKinds.includes(selectedKind);
    const isChainIdler = chainIdlerKinds.includes(selectedKind);
    if (!isBeltIdler && !isChainIdler) return;

    const idler = selectedPrimitive;
    const idlerAnchor = getPrimitiveAnchor(idler, manifest);
    const connector = manifest.primitives
      .filter((primitive) => primitive.kind === (isChainIdler ? 'chain-link' : 'belt-link'))
      .filter((primitive) => {
        const config = primitive.config as { fromId: string; toId: string; viaIds?: string[] };
        return config.fromId !== idler.id
          && config.toId !== idler.id
          && !(config.viaIds ?? []).includes(idler.id);
      })
      .sort((a, b) => {
        const aAnchor = getPrimitiveAnchor(a, manifest);
        const bAnchor = getPrimitiveAnchor(b, manifest);
        return Math.hypot(aAnchor.x - idlerAnchor.x, aAnchor.y - idlerAnchor.y)
          - Math.hypot(bAnchor.x - idlerAnchor.x, bAnchor.y - idlerAnchor.y);
      })[0];

    if (!connector) {
      showStatus(
        isChainIdler
          ? 'Place a chain link first, then Quick Connect can route it through this sprocket.'
          : 'Place a belt link first, then Quick Connect can route it through this idler.',
        'warning',
      );
      return;
    }

    const config = connector.config as { fromId: string; toId: string; length: number; viaIds?: string[] };
    const nextViaIds = [...new Set([...(config.viaIds ?? []), idler.id])];
    const ids = [config.fromId, ...nextViaIds, config.toId];
    const nextLength = ids.reduce((total, id, index) => {
      if (index === 0) return 0;
      const current = manifest.primitives.find((primitive) => primitive.id === id);
      const previous = manifest.primitives.find((primitive) => primitive.id === ids[index - 1]);
      if (!current || !previous) return total;
      const currentAnchor = getPrimitiveAnchor(current, manifest);
      const previousAnchor = getPrimitiveAnchor(previous, manifest);
      return total + Math.hypot(currentAnchor.x - previousAnchor.x, currentAnchor.y - previousAnchor.y);
    }, 0);

    void persistDraft(
      updatePrimitive(manifest, connector.id, {
        ...config,
        viaIds: nextViaIds,
        length: Math.max(config.length, nextLength),
      }),
      undefined,
      { recordHistory: true },
    );
    showStatus(
      isChainIdler
        ? 'Routed the chain link through the sprocket.'
        : 'Routed the drive link through the idler.',
      'success',
    );
  }, [manifest, persistDraft, selectedPrimitive, showStatus]);

  const handleRouteRopeThroughPulley = useCallback(() => {
    if (!manifest || !selectedPrimitive) return;
    const pulley = selectedPrimitive.kind === 'pulley'
      ? selectedPrimitive
      : findNearestPrimitive(manifest, selectedPrimitive, (primitive) => primitive.kind === 'pulley');
    const rope = selectedPrimitive.kind === 'winch'
      ? manifest.primitives.find(
          (primitive) => primitive.kind === 'rope' && (primitive.config as { fromId?: string }).fromId === selectedPrimitive.id,
        )
      : selectedPrimitive.kind === 'hook'
        ? manifest.primitives.find(
            (primitive) => primitive.kind === 'rope' && (primitive.config as { toId?: string }).toId === selectedPrimitive.id,
          )
        : manifest.primitives.find(
            (primitive) => primitive.kind === 'rope' && !(primitive.config as { viaIds?: string[] }).viaIds?.includes(pulley?.id ?? ''),
          );

    if (!pulley || !rope) {
      showStatus('Place a pulley and a winch rope first, then Quick Connect can route the rope through it.', 'warning');
      return;
    }

    const ropeConfig = rope.config as { fromId: string; toId: string; length: number; viaIds?: string[] };
    const nextViaIds = [...new Set([...(ropeConfig.viaIds ?? []), pulley.id])];
    const prevIds = [ropeConfig.fromId, ...(ropeConfig.viaIds ?? []), ropeConfig.toId];
    const nextIds = [ropeConfig.fromId, ...nextViaIds, ropeConfig.toId];
    const measurePath = (ids: string[]) => ids.reduce((total, id, index) => {
      if (index === 0) return 0;
      const current = manifest.primitives.find((primitive) => primitive.id === id);
      const previous = manifest.primitives.find((primitive) => primitive.id === ids[index - 1]);
      if (!current || !previous) return total;
      const currentAnchor = getPrimitiveAnchor(current, manifest);
      const previousAnchor = getPrimitiveAnchor(previous, manifest);
      return total + Math.hypot(currentAnchor.x - previousAnchor.x, currentAnchor.y - previousAnchor.y);
    }, 0);
    const nextLength = ropeConfig.length + Math.max(0, measurePath(nextIds) - measurePath(prevIds));
    void persistDraft(
      updatePrimitive(manifest, rope.id, {
        ...ropeConfig,
        viaIds: nextViaIds,
        length: nextLength,
      }),
      undefined,
      { recordHistory: true },
    );
    showStatus('Routed the rope through the pulley.', 'success');
  }, [manifest, persistDraft, selectedPrimitive, showStatus]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // Don't intercept when typing in inputs/textareas
      const tag = (event.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (event.key === 'Escape') {
        if (placingKind) {
          setPlacingKind(null);
          showStatus('Placement cancelled. You are back in select mode.', 'info');
          return;
        }
        if (selectedPrimitiveId) {
          setSelectedPrimitiveId(undefined);
          showStatus('Selection cleared.', 'info');
        }
        return;
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedPrimitiveId && manifest) {
        event.preventDefault();
        void persistDraft(deletePrimitive(manifest, selectedPrimitiveId), undefined, { recordHistory: true });
        setSelectedPrimitiveId(undefined);
        showStatus('Part removed.', 'info');
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [manifest, persistDraft, placingKind, selectedPrimitiveId, showStatus]);

  useEffect(() => {
    function handleAdultToolsToggle() {
      setAdultToolsOpen((current) => !current);
    }

    window.addEventListener('mason:toggle-adult-tools', handleAdultToolsToggle);
    return () => window.removeEventListener('mason:toggle-adult-tools', handleAdultToolsToggle);
  }, []);

  const handleUndo = useCallback(() => {
    const previous = undoStackRef.current.pop();
    if (!previous) {
      showStatus('Nothing to undo yet.', 'warning');
      return;
    }

    setSelectedPrimitiveId(undefined);
    void persistDraft(previous.manifest, previous.playState);
    showStatus('Undid the last change.', 'info');
  }, [persistDraft, showStatus]);

  const handleResetStep = useCallback(() => {
    if (!job || !playState) {
      showStatus('This draft is not in a guided project.', 'warning');
      return;
    }

    const checkpoint = latestCheckpointForJob(playState, job);
    if (!checkpoint) {
      showStatus('No tutorial checkpoint saved yet.', 'warning');
      return;
    }

    setSelectedPrimitiveId(undefined);
    setPlacingKind(job.steps?.[playState.latchedStepIds.length]?.allowedPartKinds[0] ?? null);
    void persistDraft(checkpoint, playState);
    showStatus('Restored the latest working tutorial checkpoint.', 'success');
  }, [job, persistDraft, playState, showStatus]);

  const handleResetDraft = useCallback(() => {
    if (!manifest) {
      return;
    }

    const resetManifest = playState?.stepCheckpointManifest[START_CHECKPOINT_ID]
      ? structuredClone(playState.stepCheckpointManifest[START_CHECKPOINT_ID])
      : createEmptyManifest();
    const resetPlayState = ensureDraftPlayState(undefined, jobId ?? playState?.jobId, resetManifest);
    undoStackRef.current = [];
    setSelectedPrimitiveId(undefined);
    setPlacingKind(job?.steps?.[0]?.allowedPartKinds[0] ?? null);
    void persistDraft(resetManifest, resetPlayState);
    showStatus('Reset the draft back to the project start.', 'success');
  }, [job?.steps, jobId, manifest, persistDraft, playState, showStatus]);

  const handleToggleDiagnostics = useCallback(() => {
    if (!manifest) {
      return;
    }
    const nextPlayState = toggleDiagnostics(
      ensureDraftPlayState(playState ?? undefined, jobId ?? playState?.jobId, manifest),
    );
    void persistDraft(manifest, nextPlayState);
    showStatus(nextPlayState.diagnosticsEnabled ? 'Diagnostics ON.' : 'Diagnostics OFF.', 'info');
  }, [jobId, manifest, persistDraft, playState, showStatus]);

  const handleClearLocalData = useCallback(async () => {
    await db.delete();
    window.localStorage.removeItem('mason-beginner-mode');
    window.location.assign('/');
  }, []);

  if (!manifest) {
    return (
      <div className="page page-build">
        {boot.status === 'degraded' ? (
          <p className="builder-status builder-status-warning">
            {boot.message ?? 'Storage is limited, so the yard is loading in reduced mode.'}
          </p>
        ) : null}
        <RouteSkeleton variant="build" />
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
  const isSillyScene = manifest.metadata.tags.includes('silly-scene');
  const goalProgress = job ? getGoalProgress(job, manifest, runtimeSnapshot, playState) : null;
  const goalPct = goalProgress ? Math.min(100, goalProgress.target > 0 ? (goalProgress.current / goalProgress.target) * 100 : 0) : 0;
  const primaryStepKind = activeProjectStep?.allowedPartKinds[0] ?? null;
  const recoveryHint = isSillyScene
    ? 'Scene parts stay where physics leaves them. Use Reset Scene any time you want the original setup back.'
    : runtimeSnapshot.lostCargoCount > 0
      ? `${runtimeSnapshot.lostCargoCount} cargo recovery${runtimeSnapshot.lostCargoCount === 1 ? '' : 'ies'} happened automatically.`
      : runtimeSnapshot.beltPowered
        ? 'The loader is powered. Keep testing the flow.'
        : 'Undo, reset, and respawn are ready if the build gets messy.';

  const buildReadiness: 'loading-engine' | 'ready' = simulationStatus !== 'ready' || !canvasReady
    ? 'loading-engine'
    : 'ready';

  return (
    <div className="page page-build">
      <div className="build-header">
        <div>
          <p className="eyebrow">Sunny Yard</p>
          <h1>{manifest.metadata.title}</h1>
          <p>{manifest.metadata.shortDescription}</p>
          {buildReadiness === 'loading-engine' ? (
            <p className="builder-status builder-status-info">
              Loading the live engine and stage renderer.
            </p>
          ) : null}
          {statusNotice ? (
            <p className={`builder-status builder-status-${statusNotice.tone}`}>{statusNotice.message}</p>
          ) : null}
        </div>
        <div className="hero-actions build-header-actions">
          <button type="button" className="primary-link" onClick={handleSaveMachine}>
            Save to Shelf
          </button>
          <button type="button" onClick={() => setAssistantOpen((current) => !current)}>
            {assistantOpen ? 'Hide Help' : 'Help'}
          </button>
          <Link to="/">Back to Yard</Link>
        </div>
      </div>

      <section className="panel task-ribbon">
        <div className="task-ribbon-copy">
          <div>
            <p className="eyebrow">{job ? `Project ${job.tier}` : 'Free Build'}</p>
            <h2>{activeProjectStep?.title ?? builderFocus.title}</h2>
          </div>
          <p>{activeProjectStep?.instruction ?? builderFocus.description}</p>
        </div>

          <div className="task-ribbon-metrics">
            <span className={`builder-chip ${placingKind ? 'is-active' : ''}`}>{builderModeLabel}</span>
            <span className={`builder-chip is-${machineActivity.tone}`}>{machineActivity.label}</span>
          <span className={`builder-chip ${runtimeSnapshot.beltPowered ? 'is-success' : ''}`}>
            {runtimeSnapshot.beltPowered ? 'Powered belt' : 'Coasting belt'}
          </span>
          <span className="builder-chip">Flow: {Math.round(runtimeSnapshot.throughput ?? 0)}/s</span>
          <span className="builder-chip">Canvas: {manifest.primitives.length} part{manifest.primitives.length === 1 ? '' : 's'}</span>
          <span className="builder-chip">Challenges: {completedChallengeIds.length}/{CHALLENGES.length}</span>
        </div>

        <div className="builder-step-strip task-ribbon-steps">
          {buildSteps.map((step) => (
            <div key={step.label} className={`builder-step builder-step-${step.state}`}>
              <span className="builder-step-dot" />
              <span>{step.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel recovery-strip">
        <div className="recovery-strip-copy">
          <p className="eyebrow">{isSillyScene ? 'Scene Tools' : 'Recovery'}</p>
          <strong>{isSillyScene ? 'Reset the setup or add a public connector shortcut to remix the scene.' : contextualConnectPrompt}</strong>
          <p className="muted">{recoveryHint}</p>
        </div>
        <div className="hero-actions recovery-strip-actions">
          {primaryStepKind && !placingKind ? (
            <button type="button" className="primary-link" onClick={() => handleSelectKind(primaryStepKind)}>
              Place {labelForPrimitive(primaryStepKind)}
            </button>
          ) : null}
          {!activeProjectStep && manifest.primitives.length === 0 && !placingKind ? (
            <button type="button" className="primary-link" onClick={() => handleSelectKind('motor')}>
              Start with Motor
            </button>
          ) : null}
          {placingKind ? (
            <button type="button" onClick={() => setPlacingKind(null)}>
              Cancel Placement
            </button>
          ) : null}
          {selectedPrimitive ? (
            <button type="button" onClick={() => setSelectedPrimitiveId(undefined)}>
              Clear Selection
            </button>
          ) : null}
          <button type="button" onClick={handleUndo}>
            Undo
          </button>
          {job ? (
            <button type="button" onClick={handleResetStep}>
              Reset Step
            </button>
          ) : null}
          {!job && isSillyScene ? (
            <button type="button" onClick={handleResetDraft}>
              Reset Scene
            </button>
          ) : null}
          <button type="button" onClick={() => openAssistantWithPrompt(builderFocus.assistantPrompt)}>
            Ask for Help
          </button>
        </div>
      </section>

      {goalProgress && job ? (
        <section className={`job-banner ${jobComplete ? 'complete' : ''} ${stepCelebrating ? 'step-celebrating' : ''}`}>
          <div className="job-banner-info">
            <p className="eyebrow">Progress</p>
            <strong>{job.title}</strong>
            <p>{activeProjectStep ? activeProjectStep.instruction : job.objective}</p>
          </div>
          <div className="job-goal-block">
            <div className="job-goal-label">
              <span>
                {activeProjectStep
                  ? `Step ${(projectState?.currentStepIndex ?? 0) + 1} of ${projectState?.steps.length ?? 0}: ${goalProgress.label}`
                  : goalProgress.label}
              </span>
              <span className="job-goal-value">
                {goalProgress.met ? 'Done' : `${goalProgress.current}${goalProgress.unit ? ` ${goalProgress.unit}` : ''} / ${goalProgress.target}${goalProgress.unit ? ` ${goalProgress.unit}` : ''}`}
              </span>
            </div>
            <div className="job-goal-bar">
              <div className="job-goal-fill" style={{ width: `${goalPct}%` }} />
            </div>
          </div>
          <div className={`badge ${jobComplete ? 'badge-success' : ''}`}>
            {jobComplete ? 'Complete' : 'In Progress'}
          </div>
        </section>
      ) : null}

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

      {assistantOpen ? (
        <section className="panel build-help-drawer">
          <Suspense
            fallback={(
              <div className="assistant-panel assistant-skeleton" aria-hidden="true">
                <div className="skeleton-line skeleton-line-eyebrow" />
                <div className="skeleton-line skeleton-line-title" />
                <div className="skeleton-line skeleton-line-copy" />
                <div className="skeleton-line skeleton-line-copy" />
                <div className="skeleton-line skeleton-line-copy short" />
              </div>
            )}
          >
            <LazyAssistantPanel
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
                void persistDraft(mountBlueprintToManifest(manifest, blueprintRecord.blueprint), undefined, { recordHistory: true });
                showStatus(`Mounted ${blueprintRecord.blueprint.title}.`, 'success');
              }}
              onGenerate={async (prompt) => {
                setBusy(true);
                try {
                  const { generateExperiment } = await loadAssistantApi();
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
                  const { editExperiment } = await loadAssistantApi();
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
                  const { explainExperiment } = await loadAssistantApi();
                  const result = await explainExperiment(prompt, manifest);
                  return result.explanation.whatIsHappening;
                } finally {
                  setBusy(false);
                }
              }}
            />
          </Suspense>
        </section>
      ) : null}

      {adultToolsOpen ? (
        <section className="panel adult-tools-panel">
          <div className="panel-header compact">
            <div>
              <p className="eyebrow">Adult Tools</p>
              <h3>Reset and diagnostics</h3>
            </div>
            <button type="button" className="ghost-button" onClick={() => setAdultToolsOpen(false)}>
              Hide
            </button>
          </div>
          <div className="hero-actions">
            <button type="button" onClick={handleResetStep} disabled={!job}>
              Reset Tutorial
            </button>
            <button type="button" onClick={handleResetDraft}>
              Reset Draft
            </button>
            <button type="button" onClick={handleToggleDiagnostics}>
              {playState?.diagnosticsEnabled ? 'Hide Diagnostics' : 'Show Diagnostics'}
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
            <button type="button" className="danger-button" onClick={() => void handleClearLocalData()}>
              Clear Local Data
            </button>
          </div>
        </section>
      ) : null}

      <div className="build-layout build-layout-compact">
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
          <ChallengeToast challenge={challengeToast} onDismiss={() => setChallengeToast(null)} />
          {stepCelebrating && !jobComplete && (
            <div className="step-complete-toast">
              <span className="step-complete-star">★</span>
              Step complete!
            </div>
          )}
          <MachineCanvas
            manifest={manifest}
            runtime={runtimeSnapshot}
            selectedPrimitiveId={selectedPrimitiveId}
            placingKind={placingKind}
            activeJobHint={activeJobHint}
            projectGuide={projectGuide}
            onPlacePrimitive={handlePlacePrimitive}
            onSelectPrimitive={handleSelectPrimitive}
            onMovePrimitive={(primitiveId, x, y) => {
              void persistDraft(movePrimitive(manifest, primitiveId, x, y), undefined, { recordHistory: true });
            }}
            onTelemetry={setTelemetry}
            diagnosticsEnabled={Boolean(playState?.diagnosticsEnabled)}
            onConnectionFlash={() => {
              if (flashCountRef.current >= 3) return; // stop after 3 toasts
              flashCountRef.current += 1;
              setFlashToast(true);
              setTimeout(() => setFlashToast(false), 2000);
            }}
            onTogglePower={(primitiveId) => {
              const prim = manifest.primitives.find((p) => p.id === primitiveId);
              if (!prim || prim.kind !== 'motor') return;
              const current = (prim.config as { powerState?: boolean }).powerState ?? true;
              void persistDraft(updatePrimitive(manifest, primitiveId, { ...prim.config, powerState: !current }), undefined, { recordHistory: true });
              playUiTone('power');
              showStatus(!current ? 'Motor ON.' : 'Motor OFF.', 'info');
            }}
            onCanvasReady={() => setCanvasReady(true)}
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
            onCreateConnector={(kind) => handleCreateConnectorShortcut(kind)}
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
              void persistDraft(deletePrimitive(manifest, primitiveId), undefined, { recordHistory: true });
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
              void persistDraft(updatePrimitive(manifest, primitiveId, { ...primitive.config, [key]: value }), undefined, { recordHistory: true });
              if (key === 'powerState') {
                playUiTone('power');
                showStatus(value ? 'Motor powered ON.' : 'Motor powered OFF.', 'info');
              }
            }}
          />

          <details
            className="panel small-panel disclosure-panel"
            open={challengePanelOpen}
            onToggle={(event) => setChallengePanelOpen(event.currentTarget.open)}
          >
            <summary className="disclosure-summary">
              <div>
                <p className="eyebrow">Challenges</p>
                <h3>Sandbox medals</h3>
              </div>
              <span className="muted">{completedChallengeIds.length}/{CHALLENGES.length}</span>
            </summary>
            <div className="disclosure-content">
              <Suspense fallback={<p className="muted">Loading challenge panel…</p>}>
                <LazyChallengePanel
                  challenges={CHALLENGES}
                  completedChallengeIds={completedChallengeIds}
                  activeChallengeIds={activeChallenges.map((challenge) => challenge.id)}
                />
              </Suspense>
            </div>
          </details>

          {(projectUnlocked || !job) ? (
            <details
              className="panel small-panel disclosure-panel"
              open={sceneShelfOpen}
              onToggle={(event) => setSceneShelfOpen(event.currentTarget.open)}
            >
              <summary className="disclosure-summary">
                <div>
                  <p className="eyebrow">Silly Scenes</p>
                  <h3>Load a playful setup</h3>
                </div>
                <span className="muted">{sceneShelfOpen ? `${SILLY_SCENES.length} ready` : 'Fresh drafts'}</span>
              </summary>
              <div className="disclosure-content">
                <Suspense fallback={<p className="muted">Loading silly scenes…</p>}>
                  <LazySillySceneSelector
                    scenes={SILLY_SCENES}
                    onLoadScene={(sceneId) => {
                      void handleLoadSillyScene(sceneId);
                    }}
                    onSurprise={() => {
                      void handleLoadSillyScene();
                    }}
                  />
                </Suspense>
              </div>
            </details>
          ) : null}

          {(projectUnlocked || !job) ? (
            <details
              className="panel small-panel disclosure-panel"
              open={workshopShelfOpen}
              onToggle={(event) => setWorkshopShelfOpen(event.currentTarget.open)}
            >
              <summary className="disclosure-summary">
                <div>
                  <p className="eyebrow">Workshop Shelf</p>
                  <h3>Mount a saved blueprint</h3>
                </div>
                <span className="muted">{workshopShelfOpen ? `${(blueprints ?? []).length} saved` : 'Load on open'}</span>
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
                        void persistDraft(mountBlueprintToManifest(manifest, blueprintRecord.blueprint), undefined, { recordHistory: true });
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

          {(projectUnlocked || !job) && (
            selectedPrimitive?.kind === 'winch'
            || selectedPrimitive?.kind === 'hook'
            || selectedPrimitive?.kind === 'node'
            || selectedPrimitive?.kind === 'wheel'
            || selectedPrimitive?.kind === 'gear'
            || selectedPrimitive?.kind === 'pulley'
            || selectedPrimitive?.kind === 'chain-sprocket'
            || selectedPrimitive?.kind === 'flywheel'
            || selectedPrimitive?.kind === 'locomotive'
            || selectedPrimitive?.kind === 'chassis'
            || selectedPrimitive?.kind === 'motor'
            || selectedPrimitive?.kind === 'crane-arm'
            || selectedPrimitive?.kind === 'bucket'
            || selectedPrimitive?.kind === 'counterweight'
            || selectedPrimitive?.kind === 'cargo-block'
          ) ? (
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
                : selectedPrimitive.kind === 'hook'
                  ? 'Use this when a winch and hook are already on the canvas.'
                  : selectedPrimitive.kind === 'winch'
                    ? 'Use this to either hang the winch from a hook path or mount it onto a chassis.'
                    : selectedPrimitive.kind === 'pulley'
                      ? 'Use this to route an existing rope or belt through the pulley, or add a drive link between rotating parts.'
                      : selectedPrimitive.kind === 'chain-sprocket'
                        ? 'Use this to add a chain link between rotating parts or route an existing chain through this sprocket.'
                  : 'Use this to mount or attach the selected part to the nearest compatible partner.'}
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
              <button
                type="button"
                disabled={!selectedPrimitiveId || !['wheel', 'pulley', 'chain-sprocket', 'flywheel'].includes(selectedPrimitive.kind)}
                onClick={handleConnectBelt}
              >
                Connect Rotating Parts with Drive Link
              </button>
              <button
                type="button"
                disabled={!selectedPrimitiveId || !['locomotive', 'gear', 'wheel', 'pulley', 'chain-sprocket', 'flywheel'].includes(selectedPrimitive.kind)}
                onClick={handleConnectLocomotiveDrive}
              >
                Drive Locomotive from Rotating Part
              </button>
              <button
                type="button"
                disabled={!selectedPrimitiveId || !['pulley', 'winch', 'hook'].includes(selectedPrimitive.kind)}
                onClick={handleRouteRopeThroughPulley}
              >
                Route Rope Through Pulley
              </button>
              <button
                type="button"
                disabled={!selectedPrimitiveId || !['wheel', 'pulley', 'flywheel', 'chain-sprocket'].includes(selectedPrimitive.kind)}
                onClick={handleRouteDriveLinkThroughIdler}
              >
                Route Drive Link Through Idler
              </button>
              <button
                type="button"
                disabled={!selectedPrimitiveId || !['wheel', 'chassis'].includes(selectedPrimitive.kind)}
                onClick={handleMountWheelToChassis}
              >
                Mount Wheel to Chassis
              </button>
              <button
                type="button"
                disabled={!selectedPrimitiveId || !['motor', 'chassis'].includes(selectedPrimitive.kind)}
                onClick={handleMountMotorToChassis}
              >
                Mount Motor to Chassis
              </button>
              <button
                type="button"
                disabled={!selectedPrimitiveId || !['gear', 'pulley', 'chain-sprocket', 'flywheel', 'winch', 'crane-arm', 'chassis'].includes(selectedPrimitive.kind)}
                onClick={handleMountAssemblyToChassis}
              >
                Mount Rotary/Tool to Chassis
              </button>
              <button
                type="button"
                disabled={!selectedPrimitiveId || !['crane-arm', 'bucket'].includes(selectedPrimitive.kind)}
                onClick={() => handleAttachArmLoad('bucket')}
              >
                Attach Arm to Bucket
              </button>
              <button
                type="button"
                disabled={!selectedPrimitiveId || !['crane-arm', 'counterweight'].includes(selectedPrimitive.kind)}
                onClick={() => handleAttachArmLoad('counterweight')}
              >
                Attach Arm to Counterweight
              </button>
              <button
                type="button"
                disabled={!selectedPrimitiveId || !['hook', 'cargo-block'].includes(selectedPrimitive.kind)}
                onClick={handleHookCargo}
              >
                Hook Cargo Block
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

interface ProjectCanvasGuide {
  title: string;
  detail: string;
  line?: Array<{ x: number; y: number }>;
  circle?: { x: number; y: number; r: number };
  rect?: { x: number; y: number; w: number; h: number };
  marker?: { x: number; y: number; label: string };
}

interface GuidedPlacement {
  x: number;
  y: number;
  configOverride?: PrimitiveConfig;
  feedback?: { message: string; tone: NoticeTone };
  guide?: ProjectCanvasGuide;
}

function normalizePlayStateForManifest(
  manifest: ExperimentManifest,
  playState: DraftPlayState,
): DraftPlayState {
  const cargoSpawns = Object.fromEntries(
    manifest.primitives
      .filter((primitive) => primitive.kind === 'cargo-block')
      .map((primitive) => {
        const cfg = primitive.config as { x: number; y: number };
        return [primitive.id, { x: cfg.x, y: cfg.y }];
      }),
  );

  return {
    ...playState,
    stepCheckpointManifest: playState.stepCheckpointManifest[START_CHECKPOINT_ID]
      ? { ...playState.stepCheckpointManifest }
      : {
          ...playState.stepCheckpointManifest,
          [START_CHECKPOINT_ID]: structuredClone(manifest),
        },
    lastStableCargoSpawns: {
      ...playState.lastStableCargoSpawns,
      ...cargoSpawns,
    },
  };
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

  if (runtime.beltPowered) {
    return {
      active: true,
      label: `Loader powered at ${Math.round(runtime.throughput ?? 0)}/s`,
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

function deriveProjectGuide(
  manifest: ExperimentManifest,
  step: { successCheck: string; title: string; instruction: string },
  preferredKind: PrimitiveKind | null,
): ProjectCanvasGuide | null {
  if (!preferredKind) {
    return null;
  }

  const placement = deriveGuidedPlacement(manifest, step, preferredKind, 0, 0);
  return placement?.guide ?? null;
}

function deriveGuidedPlacement(
  manifest: ExperimentManifest,
  step: { successCheck: string; title: string; instruction: string },
  kind: PrimitiveKind,
  x: number,
  y: number,
): GuidedPlacement | null {
  const primaryMotor = manifest.primitives.find((primitive) => primitive.kind === 'motor');
  const gears = manifest.primitives.filter((primitive) => primitive.kind === 'gear');
  const conveyor = manifest.primitives.find((primitive) => primitive.kind === 'conveyor');
  const gearCount = gears.length;

  switch (step.successCheck) {
    case 'has-motor':
      if (kind !== 'motor') return null;
      return {
        x: clamp(x || 260, 180, 760),
        y: 360,
        guide: {
          title: 'Place the motor',
          detail: 'Click anywhere. The motor will snap onto the work line so the next gear placement makes sense.',
          circle: { x: clamp(x || 260, 180, 760), y: 360, r: 34 },
          marker: { x: clamp(x || 260, 180, 760), y: 360, label: 'Motor spot' },
        },
        feedback: {
          message: 'Motor placed on the work line. Next, drop a gear into the green motor ring.',
          tone: 'success',
        },
      };
    case 'first-gear-live':
      if (kind !== 'gear' || !primaryMotor) return null;
      return placeFirstGuidedGear(primaryMotor);
    case 'gear-train-live':
      if (kind !== 'gear') return null;
      if (gearCount === 0 && primaryMotor) {
        return placeFirstGuidedGear(primaryMotor);
      }
      if (gears[0]) {
        const guide = placeMeshedGear(gears[0]);
        if (guide) return guide;
      }
      return null;
    case 'has-conveyor':
      if (kind !== 'conveyor') return null;
      return placeStarterConveyor(x, y, step.title);
    case 'cargo-on-conveyor':
      if (kind !== 'cargo-block' || !conveyor) return null;
      return placeCargoOnStarterConveyor(conveyor, manifest.primitives.filter((primitive) => primitive.kind === 'cargo-block').length);
    case 'has-hopper':
    case 'hopper-catching-cargo':
      if (kind === 'hopper' && conveyor) {
        return placeHopperAtConveyorOutput(conveyor);
      }
      if (kind === 'cargo-block' && conveyor) {
        return placeCargoOnStarterConveyor(conveyor, manifest.primitives.filter((primitive) => primitive.kind === 'cargo-block').length);
      }
      return null;
    case 'motor-near-conveyor':
      if (kind !== 'motor' || !conveyor) return null;
      return placeMotorNearConveyor(conveyor);
    case 'powered-loader-target':
      if (kind === 'cargo-block' && conveyor) {
        return placeCargoOnStarterConveyor(conveyor, manifest.primitives.filter((primitive) => primitive.kind === 'cargo-block').length);
      }
      if (kind === 'motor' && conveyor) {
        return placeMotorNearConveyor(conveyor);
      }
      if (kind === 'hopper' && conveyor) {
        return placeHopperAtConveyorOutput(conveyor);
      }
      return null;
    default:
      return null;
  }
}

function placeFirstGuidedGear(motor: PrimitiveInstance): GuidedPlacement {
  const motorConfig = motor.config as { x: number; y: number };
  const x = motorConfig.x + 150;
  const y = motorConfig.y;

  return {
    x,
    y,
    guide: {
      title: 'Drop the first gear into the motor ring',
      detail: 'Click anywhere. The first gear will snap into the motor reach ring so it spins immediately.',
      circle: { x, y, r: 34 },
      marker: { x, y, label: 'First live gear' },
    },
    feedback: {
      message: 'Gear snapped into the motor ring. You should see it spin right away.',
      tone: 'success',
    },
  };
}

function placeMeshedGear(gear: PrimitiveInstance): GuidedPlacement | null {
  const gearConfig = gear.config as { x: number; y: number; teeth?: number };
  const baseRadius = Math.max(24, Number(gearConfig.teeth ?? 24) * 1.4);
  const nextRadius = Math.max(24, 24 * 1.4);
  const x = gearConfig.x + baseRadius + nextRadius + 8;
  const y = gearConfig.y;

  return {
    x,
    y,
    guide: {
      title: 'Mesh the next gear',
      detail: 'Click anywhere. The new gear will snap beside the live gear so the teeth mesh cleanly.',
      circle: { x, y, r: 34 },
      marker: { x, y, label: 'Mesh here' },
    },
    feedback: {
      message: 'Second gear snapped into the mesh zone. The gear train should now read clearly.',
      tone: 'success',
    },
  };
}

function placeStarterConveyor(x: number, _y: number, title: string): GuidedPlacement {
  const centerX = clamp(x || 420, 240, 660);
  // Belt at y=300 — high enough that cargo falling off the right end will drop
  // naturally into a hopper placed below it.
  const centerY = 300;
  const path = [
    { x: centerX - 180, y: centerY },
    { x: centerX + 180, y: centerY },
  ];

  return {
    x: centerX,
    y: centerY,
    configOverride: {
      path,
      speed: 45,
      direction: 'forward',
    },
    guide: {
      title,
      detail: 'Click anywhere. The belt snaps to a lane where cargo will fall cleanly into a hopper at the output.',
      line: path,
      marker: { x: centerX, y: centerY - 26, label: 'Belt lane' },
    },
    feedback: {
      message: 'Conveyor placed. Now add cargo — it will ride the belt and drop into the hopper at the end.',
      tone: 'success',
    },
  };
}

function placeCargoOnStarterConveyor(conveyor: PrimitiveInstance, existingCargoCount: number): GuidedPlacement {
  const path = (conveyor.config as { path: Array<{ x: number; y: number }> }).path;
  const start = path[0];
  const end = path[path.length - 1];
  // Space blocks evenly from 15% to 65% along the belt, leaving the right end clear
  // for the hopper. Place exactly ON the belt (y = belt y) so the anti-gravity
  // surface force catches them immediately.
  const t = Math.min(0.62, 0.15 + existingCargoCount * 0.15);
  const beltX = start.x + (end.x - start.x) * t;
  const beltY = start.y + (end.y - start.y) * t; // on the belt, not above

  return {
    x: beltX,
    y: beltY,
    guide: {
      title: 'Put cargo on the belt',
      detail: 'Click anywhere. The cargo snaps onto the belt and the surface force keeps it there.',
      line: path,
      marker: { x: beltX, y: beltY - 18, label: 'Cargo here' },
    },
    feedback: {
      message: 'Cargo on the belt. Watch it ride to the end and drop into the hopper.',
      tone: 'success',
    },
  };
}

function placeHopperAtConveyorOutput(conveyor: PrimitiveInstance): GuidedPlacement {
  const path = (conveyor.config as { path: Array<{ x: number; y: number }> }).path;
  const output = path[path.length - 1];
  // Place hopper BELOW and just past the belt end so gravity carries cargo into it.
  // output.y is the belt level; hopper mouth opens ~10px above its y position,
  // so placing at output.y + 90 means the mouth is at output.y + 80 — well below
  // the belt level (output.y) so falling cargo enters cleanly.
  const x = output.x + 20;
  const y = output.y + 90;

  return {
    x,
    y,
    guide: {
      title: 'Place the hopper below the belt end',
      detail: 'Click anywhere. The hopper snaps under the conveyor output — cargo falls off the belt and drops right in.',
      line: path,
      rect: { x: output.x - 20, y: output.y + 10, w: 100, h: 140 },
      marker: { x, y: y - 20, label: 'Hopper here' },
    },
    feedback: {
      message: 'Hopper placed below the belt end. Watch cargo slide off the conveyor and fall in.',
      tone: 'success',
    },
  };
}

function placeMotorNearConveyor(conveyor: PrimitiveInstance): GuidedPlacement {
  const path = (conveyor.config as { path: Array<{ x: number; y: number }> }).path;
  const start = path[0];
  const x = start.x - 100;
  const y = start.y - 18; // slightly above belt so motor ring visibly overlaps it

  return {
    x,
    y,
    guide: {
      title: 'Power the conveyor',
      detail: 'Click anywhere. The motor will snap near the conveyor so the power boost is obvious and reliable.',
      line: path,
      circle: { x, y, r: 34 },
      marker: { x, y: y - 34, label: 'Motor boost spot' },
    },
    feedback: {
      message: 'Motor snapped into power range. The conveyor should now feel stronger.',
      tone: 'success',
    },
  };
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
    case 'station-zone':
      return {
        message: 'Station zone placed. Set it to load or unload in the Inspector, then run a wagon through it.',
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
    case 'trampoline':
      return {
        message: 'Trampoline placed. Drop a ball, rock, or cargo block onto it to see the bounce.',
        tone: 'success',
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
      return 'Rails are the track. Locomotives still need their trackId set, and can later be linked to a rotating driver.';
    case 'station-zone':
      return 'Stations turn passing wagons into deliberate load or unload moments.';
    case 'trampoline':
      return 'Trampolines are clearest when something can fall straight onto them.';
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
      return 'Point this at a real rail segment first. Locomotives can also be driven by a wheel, gear, pulley, sprocket, or flywheel.';
    case 'station-zone':
      return 'Set the station to load or unload, then run a wagon through its rectangle to see the transfer.';
    case 'trampoline':
      return 'Trampolines bounce loose parts best when something can drop onto the springy strip from above.';
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
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
    case 'station-zone':
      return 'Station';
    case 'cargo-block':
      return 'Cargo';
    case 'trampoline':
      return 'Trampoline';
    case 'material-pile':
      return 'Material Pile';
    default:
      return kind
        .split('-')
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(' ');
  }
}
