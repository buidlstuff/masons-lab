import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ControlPanel } from '../components/ControlPanel';
import { ChallengeToast } from '../components/ChallengeToast';
import { HudOverlay } from '../components/HudOverlay';
import { InspectorPanel } from '../components/InspectorPanel';
import { MachineCanvas } from '../components/MachineCanvas';
import { PartPalette } from '../components/PartPalette';
import { RouteSkeleton } from '../components/RouteSkeleton';
import { createBlueprintFromExperiment, mountBlueprintToManifest } from '../lib/blueprints';
import { useAppBoot } from '../lib/app-boot';
import {
  type ConnectorKind,
  getPrimitiveAnchor as getConnectorAnchor,
  isMechanicalJointEndpointKind,
  isRopeEndpointKind,
} from '../lib/connectors';
import { db } from '../lib/db';
import { ENGINEERING_RECIPES, getEngineeringRecipeBlueprints } from '../lib/engineering-recipes';
import { addPrimitive, connectPrimitives, deletePrimitive, movePrimitive, updatePrimitive } from '../lib/editor';
import {
  createChallengeScratchState,
  evaluateChallengeCompletion,
  getActiveChallenges,
  shouldEvaluateSandboxChallenges,
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
  replaceStartCheckpoint,
  START_CHECKPOINT_ID,
  toggleDiagnostics,
} from '../lib/play-state';
import { markPerformance, measurePerformance } from '../lib/perf';
import {
  createDraftFromBlueprint,
  createDraftFromMachine,
  createDraftFromPuzzleChallenge,
  createDraftFromProject,
  createEmptyDraft,
  createEmptyManifest,
  createDraftFromSillyScene,
} from '../lib/seed-data';
import { findBoundControl, getMergedControls, readControlValue } from '../lib/live-controls';
import { getPuzzleChallenge, getPuzzleChallengeForManifest } from '../lib/puzzle-challenges';
import { useMachineSimulation, type RuntimeSnapshot } from '../lib/simulation';
import { playUiTone } from '../lib/sfx';
import { awardJobXp, TIER_NAMES } from '../lib/xp';
import type {
  BuildTelemetry,
  ChallengeProgressRecord,
  DraftPlayState,
  DraftRecord,
  ExperimentManifest,
  PrimitiveConfig,
  PrimitiveKind,
  PrimitiveInstance,
  PuzzleChallengeProgressRecord,
} from '../lib/types';

type BuilderConnectionKind = ConnectorKind | 'beam';
type BuildUtilityPanel = 'inspector' | 'controls';
type QuickControlAction = {
  id: string;
  label: string;
  active?: boolean;
  onPress: () => void;
};

const BUILDER_CONNECTION_OPTIONS: Array<{
  kind: BuilderConnectionKind;
  label: string;
  hint: string;
}> = [
  { kind: 'bolt-link', label: 'Bolt', hint: 'Rigid connection for parts that should move together.' },
  { kind: 'hinge-link', label: 'Hinge', hint: 'Free pivot between two parts.' },
  { kind: 'powered-hinge-link', label: 'Powered Hinge', hint: 'Motor-driven hinge for controlled swinging.' },
  { kind: 'rope', label: 'Rope', hint: 'Connect a winch to a hook, bucket, crane arm, or cargo block.' },
  { kind: 'belt-link', label: 'Belt', hint: 'Drive two rotating parts together.' },
  { kind: 'chain-link', label: 'Chain', hint: 'Toothed drive link, best with sprockets.' },
  { kind: 'beam', label: 'Beam', hint: 'Turns two nodes into a support beam.' },
];

function labelForBuilderConnection(kind: BuilderConnectionKind) {
  return BUILDER_CONNECTION_OPTIONS.find((option) => option.kind === kind)?.label ?? 'Connector';
}

function isValidConnectionEndpoint(kind: BuilderConnectionKind, primitive: PrimitiveInstance) {
  switch (kind) {
    case 'rope':
      return primitive.kind === 'winch' || isRopeEndpointKind(primitive.kind);
    case 'belt-link':
    case 'chain-link':
      return ['wheel', 'pulley', 'chain-sprocket', 'flywheel'].includes(primitive.kind);
    case 'bolt-link':
    case 'hinge-link':
    case 'powered-hinge-link':
      return isMechanicalJointEndpointKind(primitive.kind);
    case 'beam':
      return primitive.kind === 'node';
    default:
      return false;
  }
}

function invalidConnectionMessage(kind: BuilderConnectionKind) {
  switch (kind) {
    case 'rope':
      return 'Rope needs a winch plus a hook, bucket, crane arm, or cargo block.';
    case 'belt-link':
      return 'Belt needs two rotating parts such as wheels, pulleys, sprockets, or flywheels.';
    case 'chain-link':
      return 'Chain needs two rotating parts, usually chain sprockets.';
    case 'bolt-link':
      return 'Bolt needs two body-backed parts or structural bases.';
    case 'hinge-link':
      return 'Hinge needs two body-backed parts or structural bases.';
    case 'powered-hinge-link':
      return 'Powered Hinge needs two body-backed parts and a motor somewhere on the canvas.';
    case 'beam':
      return 'Beam needs two nodes.';
    default:
      return 'That connector does not fit those two parts.';
  }
}

function connectionSuccessHint(kind: PrimitiveKind | BuilderConnectionKind) {
  switch (kind) {
    case 'rope':
      return 'Use the selected tool controls to lift or lower it.';
    case 'belt-link':
    case 'chain-link':
      return 'Turn on a nearby motor or spin one side so the link has visible motion to carry.';
    case 'powered-hinge-link':
      return 'Use the quick controls or Machine Controls to run the hinge and change its angle.';
    case 'hinge-link':
      return 'Drag the connected part to see the free pivot.';
    case 'bolt-link':
      return 'Drag either connected part and the rigid assembly should move together.';
    case 'beam':
      return 'Add more nodes and beams if you want a larger frame.';
    default:
      return 'Run the machine and watch for the visible reaction.';
  }
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
    return getConnectorAnchor(primitive, 'general', manifest.primitives);
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
  if (
    primitive.kind === 'rope'
    || primitive.kind === 'belt-link'
    || primitive.kind === 'chain-link'
    || primitive.kind === 'bolt-link'
    || primitive.kind === 'hinge-link'
    || primitive.kind === 'powered-hinge-link'
  ) {
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

function createInitialRuntimeSnapshot(): RuntimeSnapshot {
  return {
    time: 0,
    rotations: {},
    cargoProgress: {},
    hookY: 0,
    trainProgress: 0,
    trainDelivered: false,
    trainTrackId: undefined,
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
    switchStates: {},
  };
}

export function BuildPage() {
  const { draftId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const boot = useAppBoot();
  const sourceMachineId = searchParams.get('machine');
  const sourceBlueprintId = searchParams.get('blueprint');
  const sourceSceneId = searchParams.get('scene');
  const sourcePuzzleChallengeId = searchParams.get('challengeLevel');
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
  const starterBlueprintFromQuery = useMemo(
    () => (sourceBlueprintId
      ? getEngineeringRecipeBlueprints().find((record) => record.recordId === sourceBlueprintId)
      : undefined),
    [sourceBlueprintId],
  );

  const [manifest, setManifest] = useState<ExperimentManifest | null>(null);
  const [playState, setPlayState] = useState<DraftPlayState | null>(null);
  const [selectedPrimitiveId, setSelectedPrimitiveId] = useState<string>();
  const [placingKind, setPlacingKind] = useState<PrimitiveKind | null>(null);
  const [controlValues, setControlValues] = useState<Record<string, string | number | boolean>>({});
  const [telemetry, setTelemetry] = useState<BuildTelemetry>({});
  const [statusNotice, setStatusNotice] = useState<{ tone: NoticeTone; message: string } | null>(null);
  const [saveModal, setSaveModal] = useState<{ title: string; learned: string } | null>(null);
  const [xpToast, setXpToast] = useState<{ gained: number; newXp: number; tierName?: string } | null>(null);
  const [flashToast, setFlashToast] = useState(false);
  const [stepCelebrating, setStepCelebrating] = useState(false);
  const [adultToolsOpen, setAdultToolsOpen] = useState(false);
  const [recipeShelfOpen, setRecipeShelfOpen] = useState(false);
  const [handbookOpen, setHandbookOpen] = useState(false);
  const [connectMenuOpen, setConnectMenuOpen] = useState(false);
  const [tabletPartsOpen, setTabletPartsOpen] = useState(false);
  const [connectionKind, setConnectionKind] = useState<BuilderConnectionKind | null>(null);
  const [connectionSourceId, setConnectionSourceId] = useState<string | null>(null);
  const [connectionViaIds, setConnectionViaIds] = useState<string[]>([]);
  const [openUtilityPanel, setOpenUtilityPanel] = useState<BuildUtilityPanel | null>(null);
  const [canvasReady, setCanvasReady] = useState(false);
  const [challengeToast, setChallengeToast] = useState<ChallengeDefinition | null>(null);
  const [puzzleToast, setPuzzleToast] = useState<{ title: string; message: string } | null>(null);
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
  const announcedChallengeIdsRef = useRef(new Set<string>());
  const challengeLastEvalAtRef = useRef<number>(Date.now());
  const builderMeasureRef = useRef(false);
  const challengeProgressQuery = useLiveQuery<ChallengeProgressRecord[]>(
    () => db.challengeProgress.toArray(),
    [],
  );
  const puzzleChallengeProgressQuery = useLiveQuery<PuzzleChallengeProgressRecord[]>(
    () => db.puzzleChallengeProgress.toArray(),
    [],
  );
  const challengeProgress = useMemo(
    () => challengeProgressQuery ?? [],
    [challengeProgressQuery],
  );
  const challengeProgressHydrated = challengeProgressQuery !== undefined;
  const puzzleChallengeProgress = useMemo(
    () => puzzleChallengeProgressQuery ?? [],
    [puzzleChallengeProgressQuery],
  );
  const mergedControls = useMemo(
    () => getMergedControls(manifest),
    [manifest],
  );
  const runtimeManifest = useMemo(
    () => (manifest ? { ...manifest, controls: mergedControls } : null),
    [manifest, mergedControls],
  );
  const taggedPuzzleChallenge = useMemo(
    () => (manifest ? getPuzzleChallengeForManifest(manifest) : null),
    [manifest],
  );
  const activePuzzleChallenge = useMemo(
    () => getPuzzleChallenge(sourcePuzzleChallengeId ?? taggedPuzzleChallenge?.id ?? ''),
    [sourcePuzzleChallengeId, taggedPuzzleChallenge],
  );

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
      function buildDraftQuery() {
        const params = new URLSearchParams();
        if (jobId) {
          params.set('job', jobId);
        }
        if (sourcePuzzleChallengeId) {
          params.set('challengeLevel', sourcePuzzleChallengeId);
        }
        const query = params.toString();
        return query ? `?${query}` : '';
      }

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
          newDraft.playState = replaceStartCheckpoint(
            ensureDraftPlayState(newDraft.playState, jobId ?? undefined, decoded),
            decoded,
          );
          await db.drafts.put(newDraft);
          setManifest(decoded);
          setPlayState(newDraft.playState);
          setControlValues(
            Object.fromEntries(decoded.controls.map((c) => [c.id, c.defaultValue ?? false])),
          );
          navigate(`/build/${newDraft.draftId}${buildDraftQuery()}`, { replace: true });
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
        navigate(`/build/${nextDraft.draftId}${buildDraftQuery()}`, { replace: true });
      }

      if (machineFromQuery) {
        const nextDraft = createDraftFromMachine(machineFromQuery);
        await db.drafts.put(nextDraft);
        applyDraft(nextDraft);
        return;
      }

      if (blueprintFromQuery ?? starterBlueprintFromQuery) {
        const nextDraft = createDraftFromBlueprint(blueprintFromQuery ?? starterBlueprintFromQuery!);
        await db.drafts.put(nextDraft);
        applyDraft(nextDraft);
        return;
      }

      if (sourceSceneId) {
        const nextDraft = createDraftFromSillyScene(sourceSceneId);
        if (nextDraft) {
          await db.drafts.put(nextDraft);
          applyDraft(nextDraft);
          return;
        }
      }

      if (sourcePuzzleChallengeId) {
        const nextDraft = createDraftFromPuzzleChallenge(sourcePuzzleChallengeId);
        if (nextDraft) {
          await db.drafts.put(nextDraft);
          applyDraft(nextDraft);
          return;
        }
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
  }, [
    blueprintFromQuery,
    draft,
    draftId,
    job,
    jobId,
    machineFromQuery,
    navigate,
    shareParam,
    sourcePuzzleChallengeId,
    sourceSceneId,
    starterBlueprintFromQuery,
  ]);

  const runtime = useMachineSimulation(
    runtimeManifest,
    controlValues,
    {
      stableCargoSpawns: playState?.lastStableCargoSpawns,
      enabled: Boolean(runtimeManifest),
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
  const sandboxChallengeRuntimeEnabled = useMemo(
    () => shouldEvaluateSandboxChallenges({
      challengeProgressHydrated,
      hasActivePuzzleChallenge: Boolean(activePuzzleChallenge),
      jobId,
      manifest,
      simulationStatus,
    }),
    [activePuzzleChallenge, challengeProgressHydrated, jobId, manifest, simulationStatus],
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
    if (!manifest || !sandboxChallengeRuntimeEnabled) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      const currentManifest = currentManifestRef.current;
      const currentRuntime = runtimeSnapshotRef.current;
      if (!currentManifest) return;

      const now = Date.now();
      const deltaSeconds = Math.min(2, Math.max(0.25, (now - challengeLastEvalAtRef.current) / 1000));
      challengeLastEvalAtRef.current = now;

      const completedIds = new Set(completedChallengeIdsRef.current);
      const pendingChallenges = getActiveChallenges(completedIds);
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
      const nextNotice = newlyCompleted.find((challenge) => !announcedChallengeIdsRef.current.has(challenge.id));
      if (nextNotice) {
        announcedChallengeIdsRef.current.add(nextNotice.id);
        setChallengeToast((current) => current ?? nextNotice);
      }
      void Promise.all(newlyCompleted.map((challenge) => db.challengeProgress.put({
        challengeId: challenge.id,
        completed: true,
        completedAt: Date.now(),
      }))).catch(() => {});
    }, 500);

    return () => window.clearInterval(interval);
  }, [manifest, sandboxChallengeRuntimeEnabled]);

  useEffect(() => {
    if (!sandboxChallengeRuntimeEnabled) {
      setChallengeToast(null);
    }
  }, [sandboxChallengeRuntimeEnabled]);

  const completedPuzzleChallengeIds = useMemo(
    () => new Set(
      puzzleChallengeProgress
        .filter((record) => record.completed)
        .map((record) => record.puzzleChallengeId),
    ),
    [puzzleChallengeProgress],
  );

  const puzzleComplete = activePuzzleChallenge
    ? completedPuzzleChallengeIds.has(activePuzzleChallenge.id)
    : false;

  useEffect(() => {
    if (!activePuzzleChallenge || puzzleComplete || simulationStatus !== 'ready') {
      return undefined;
    }

    const interval = window.setInterval(() => {
      const currentManifest = currentManifestRef.current;
      const currentRuntime = runtimeSnapshotRef.current;
      if (!currentManifest) {
        return;
      }

      if (!activePuzzleChallenge.successCheck(currentManifest, currentRuntime)) {
        return;
      }

      window.clearInterval(interval);
      setPuzzleToast({
        title: `${activePuzzleChallenge.title} solved`,
        message: activePuzzleChallenge.objective,
      });
      showStatus(`Puzzle solved: ${activePuzzleChallenge.title}.`, 'success');
      void db.puzzleChallengeProgress.put({
        puzzleChallengeId: activePuzzleChallenge.id,
        completed: true,
        completedAt: Date.now(),
      }).catch(() => {});
    }, 300);

    return () => window.clearInterval(interval);
  }, [activePuzzleChallenge, puzzleComplete, showStatus, simulationStatus]);

  const selectedPrimitive = useMemo<PrimitiveInstance | undefined>(
    () => manifest?.primitives.find((primitive) => primitive.id === selectedPrimitiveId),
    [manifest, selectedPrimitiveId],
  );
  const setBoundControlValue = useCallback((
    targetId: string,
    path: string,
    nextValue: string | number | boolean | ((currentValue: string | number | boolean) => string | number | boolean),
    fallbackValue: string | number | boolean,
  ) => {
    const control = findBoundControl(mergedControls, targetId, path);
    if (!control) {
      return false;
    }

    setControlValues((current) => {
      const currentValue = current[control.id] ?? control.defaultValue ?? fallbackValue;
      const resolvedValue = typeof nextValue === 'function'
        ? nextValue(currentValue)
        : nextValue;
      return {
        ...current,
        [control.id]: resolvedValue,
      };
    });
    return true;
  }, [mergedControls]);
  const selectedQuickControls = useMemo(() => {
    if (!selectedPrimitive) {
      return null;
    }

    const actions: QuickControlAction[] = [];
    const title = selectedPrimitive.label ?? labelForPrimitive(selectedPrimitive.kind);
    let subtitle: string | undefined;

    switch (selectedPrimitive.kind) {
      case 'motor': {
        const powered = Boolean(readControlValue(
          mergedControls,
          controlValues,
          selectedPrimitive.id,
          'powerState',
          Boolean((selectedPrimitive.config as { powerState?: boolean }).powerState ?? true),
        ));
        const rpm = Number(readControlValue(
          mergedControls,
          controlValues,
          selectedPrimitive.id,
          'rpm',
          Number((selectedPrimitive.config as { rpm?: number }).rpm ?? 60),
        ));
        subtitle = `Drives nearby gears and wheels. Current speed ${Math.round(rpm)} rpm.`;
        actions.push({
          id: 'motor-run',
          label: powered ? 'Power OFF' : 'Power ON',
          active: powered,
          onPress: () => {
            setBoundControlValue(selectedPrimitive.id, 'powerState', !powered, powered);
            playUiTone('power');
          },
        });
        actions.push({
          id: 'motor-slower',
          label: 'Slower',
          onPress: () => {
            setBoundControlValue(
              selectedPrimitive.id,
              'rpm',
              (current) => clamp(Number(current) - 15, 0, 160),
              rpm,
            );
          },
        });
        actions.push({
          id: 'motor-faster',
          label: 'Faster',
          onPress: () => {
            setBoundControlValue(
              selectedPrimitive.id,
              'rpm',
              (current) => clamp(Number(current) + 15, 0, 160),
              rpm,
            );
          },
        });
        break;
      }
      case 'winch': {
        const ropeLength = Number(readControlValue(
          mergedControls,
          controlValues,
          selectedPrimitive.id,
          'ropeLength',
          Number((selectedPrimitive.config as { ropeLength?: number }).ropeLength ?? 180),
        ));
        subtitle = `Shorter rope lifts. Longer rope lowers. Current length ${Math.round(ropeLength)}.`;
        actions.push({
          id: 'winch-up',
          label: 'Up',
          onPress: () => {
            setBoundControlValue(
              selectedPrimitive.id,
              'ropeLength',
              (current) => clamp(Number(current) - 20, 60, 280),
              ropeLength,
            );
          },
        });
        actions.push({
          id: 'winch-down',
          label: 'Down',
          onPress: () => {
            setBoundControlValue(
              selectedPrimitive.id,
              'ropeLength',
              (current) => clamp(Number(current) + 20, 60, 280),
              ropeLength,
            );
          },
        });
        break;
      }
      case 'powered-hinge-link': {
        const enabled = Boolean(readControlValue(
          mergedControls,
          controlValues,
          selectedPrimitive.id,
          'enabled',
          Boolean((selectedPrimitive.config as { enabled?: boolean }).enabled ?? true),
        ));
        const angle = Number(readControlValue(
          mergedControls,
          controlValues,
          selectedPrimitive.id,
          'targetAngle',
          Number((selectedPrimitive.config as { targetAngle?: number }).targetAngle ?? 45),
        ));
        const config = selectedPrimitive.config as { minAngle?: number; maxAngle?: number };
        subtitle = `Powered swing. Target angle ${Math.round(angle)}°.`;
        actions.push({
          id: 'hinge-run',
          label: enabled ? 'Power OFF' : 'Power ON',
          active: enabled,
          onPress: () => {
            setBoundControlValue(selectedPrimitive.id, 'enabled', !enabled, enabled);
            playUiTone('power');
          },
        });
        actions.push({
          id: 'hinge-down',
          label: 'Down',
          onPress: () => {
            setBoundControlValue(
              selectedPrimitive.id,
              'targetAngle',
              (current) => clamp(Number(current) - 15, Number(config.minAngle ?? -75), Number(config.maxAngle ?? 75)),
              angle,
            );
          },
        });
        actions.push({
          id: 'hinge-up',
          label: 'Up',
          onPress: () => {
            setBoundControlValue(
              selectedPrimitive.id,
              'targetAngle',
              (current) => clamp(Number(current) + 15, Number(config.minAngle ?? -75), Number(config.maxAngle ?? 75)),
              angle,
            );
          },
        });
        break;
      }
      case 'locomotive': {
        const enabled = Boolean(readControlValue(
          mergedControls,
          controlValues,
          selectedPrimitive.id,
          'enabled',
          Boolean((selectedPrimitive.config as { enabled?: boolean }).enabled ?? true),
        ));
        const speed = Number(readControlValue(
          mergedControls,
          controlValues,
          selectedPrimitive.id,
          'speed',
          Number((selectedPrimitive.config as { speed?: number }).speed ?? 0.18),
        ));
        subtitle = typeof (selectedPrimitive.config as { trackId?: string }).trackId === 'string'
          ? `Snapped to rail ${runtimeSnapshot.trainTrackId ?? (selectedPrimitive.config as { trackId?: string }).trackId}. Speed ${speed.toFixed(2)}.`
          : 'Free body. Bolt on tools or add wheels and a motor if you want to drive it off rail.';
        actions.push({
          id: 'loco-run',
          label: enabled ? 'Power OFF' : 'Power ON',
          active: enabled,
          onPress: () => {
            setBoundControlValue(selectedPrimitive.id, 'enabled', !enabled, enabled);
            playUiTone('power');
          },
        });
        actions.push({
          id: 'loco-slower',
          label: 'Slower',
          onPress: () => {
            setBoundControlValue(
              selectedPrimitive.id,
              'speed',
              (current) => clamp(Number(current) - 0.1, 0, 1.2),
              speed,
            );
          },
        });
        actions.push({
          id: 'loco-faster',
          label: 'Faster',
          onPress: () => {
            setBoundControlValue(
              selectedPrimitive.id,
              'speed',
              (current) => clamp(Number(current) + 0.1, 0, 1.2),
              speed,
            );
          },
        });
        break;
      }
      case 'rail-switch': {
        const branchRight = Boolean(readControlValue(
          mergedControls,
          controlValues,
          selectedPrimitive.id,
          'branchRight',
          ((selectedPrimitive.config as { branch?: string }).branch ?? 'right') === 'right',
        ));
        subtitle = `The train will take the ${branchRight ? 'right' : 'left'} branch when it reaches this switch.`;
        actions.push({
          id: 'switch-left',
          label: 'Left',
          active: !branchRight,
          onPress: () => {
            setBoundControlValue(selectedPrimitive.id, 'branchRight', false, branchRight);
          },
        });
        actions.push({
          id: 'switch-right',
          label: 'Right',
          active: branchRight,
          onPress: () => {
            setBoundControlValue(selectedPrimitive.id, 'branchRight', true, branchRight);
          },
        });
        break;
      }
      case 'silo-bin': {
        const gateOpen = Boolean(readControlValue(
          mergedControls,
          controlValues,
          selectedPrimitive.id,
          'gateOpen',
          Boolean((selectedPrimitive.config as { gateOpen?: boolean }).gateOpen ?? false),
        ));
        subtitle = gateOpen
          ? 'The floor gate is open, so stored material can fall out.'
          : 'The floor gate is closed, so stored material stays inside.';
        actions.push({
          id: 'silo-open',
          label: 'Open',
          active: gateOpen,
          onPress: () => {
            setBoundControlValue(selectedPrimitive.id, 'gateOpen', true, gateOpen);
          },
        });
        actions.push({
          id: 'silo-close',
          label: 'Close',
          active: !gateOpen,
          onPress: () => {
            setBoundControlValue(selectedPrimitive.id, 'gateOpen', false, gateOpen);
          },
        });
        break;
      }
      default:
        return null;
    }

    return actions.length > 0 ? { title, subtitle, actions } : null;
  }, [controlValues, mergedControls, runtimeSnapshot.trainTrackId, selectedPrimitive, setBoundControlValue]);

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
      options?: { recordHistory?: boolean; replaceBaseline?: boolean },
    ) => {
      const currentManifest = currentManifestRef.current;
      const currentPlayState = currentPlayStateRef.current;
      let nextPlayState = normalizePlayStateForManifest(
        nextManifest,
        ensureDraftPlayState(nextPlayStateArg ?? currentPlayState ?? undefined, jobId ?? currentPlayState?.jobId, nextManifest),
      );
      if (options?.replaceBaseline) {
        nextPlayState = replaceStartCheckpoint(nextPlayState, nextManifest);
      }

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
      setControlValues((current) => (
        Object.fromEntries(
          nextManifest.controls.map((control) => [
            control.id,
            current[control.id] ?? control.defaultValue ?? false,
          ]),
        )
      ));
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
      playState: replaceStartCheckpoint(
        ensureDraftPlayState(playState ?? undefined, jobId ?? playState?.jobId, nextManifest),
        nextManifest,
      ),
      updatedAt: new Date().toISOString(),
      sourceMachineId: draft?.sourceMachineId,
      sourceBlueprintId: draft?.sourceBlueprintId,
    };
    await db.drafts.put(newDraft);
    const params = new URLSearchParams();
    if (jobId) {
      params.set('job', jobId);
    }
    if (activePuzzleChallenge) {
      params.set('challengeLevel', activePuzzleChallenge.id);
    }
    const query = params.toString();
    navigate(`/build/${newDraft.draftId}${query ? `?${query}` : ''}`);
  }

  function handleShare() {
    if (!manifest) return;
    try {
      const encoded = btoa(encodeURIComponent(JSON.stringify(manifest)));
      const params = new URLSearchParams({ share: encoded });
      if (jobId) {
        params.set('job', jobId);
      }
      if (activePuzzleChallenge) {
        params.set('challengeLevel', activePuzzleChallenge.id);
      }
      const url = `${window.location.origin}/build?${params.toString()}`;
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
  const paletteAllowedKinds = useMemo(
    () => activePuzzleChallenge?.allowedKinds ?? (!projectUnlocked ? activeProjectStep?.allowedPartKinds : undefined),
    [activeProjectStep, activePuzzleChallenge, projectUnlocked],
  );
  const activeJobHint = simulationStatus !== 'ready'
    ? 'Loading the live machine engine.'
    : activePuzzleChallenge
      ? (puzzleComplete ? `${activePuzzleChallenge.title} solved. Remix it or load another puzzle.` : `${activePuzzleChallenge.objective} ${activePuzzleChallenge.hint}`)
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
      playUiTone('place');

      const placementFeedback = guidedPlacement?.feedback
        ?? describePlacedPrimitive(manifest, placingKind, nextPosition.x, nextPosition.y, placedPrimitive ?? null);
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
      const restrictedKinds = paletteAllowedKinds;
      if (
        kind
        && restrictedKinds
        && !restrictedKinds.includes(kind)
      ) {
        showStatus(`This build is focused on ${restrictedKinds.map(labelForPrimitive).join(', ')}.`, 'warning');
        return;
      }

      setPlacingKind(kind);
      setTabletPartsOpen(false);
      setConnectionKind(null);
      setConnectionSourceId(null);
      setConnectionViaIds([]);
      setConnectMenuOpen(false);
      setOpenUtilityPanel(null);
      if (kind) {
        setSelectedPrimitiveId(undefined);
        showStatus(`Place ${labelForPrimitive(kind)} on the canvas. Click the same part tile or press Escape to stop placing.`, 'info');
      }
    },
    [paletteAllowedKinds, showStatus],
  );

  const startConnectionMode = useCallback((kind: BuilderConnectionKind) => {
    setConnectMenuOpen(false);
    setTabletPartsOpen(false);
    setHandbookOpen(false);
    setOpenUtilityPanel(null);
    setPlacingKind(null);
    setSelectedPrimitiveId(undefined);
    setConnectionSourceId(null);
    setConnectionViaIds([]);
    setConnectionKind(kind);
    showStatus(`${labelForBuilderConnection(kind)} selected. Click the first part on the canvas.`, 'info');
  }, [showStatus]);

  const cancelConnectionMode = useCallback((message = 'Connect cancelled.') => {
    setConnectionKind(null);
    setConnectionSourceId(null);
    setConnectionViaIds([]);
    setConnectMenuOpen(false);
    if (message) {
      showStatus(message, 'info');
    }
  }, [showStatus]);

  const toggleUtilityPanel = useCallback((panel: BuildUtilityPanel) => {
    if (connectionKind) {
      setConnectionKind(null);
      setConnectionSourceId(null);
      setConnectionViaIds([]);
    }
    setConnectMenuOpen(false);
    setTabletPartsOpen(false);
    setOpenUtilityPanel((current) => (current === panel ? null : panel));
  }, [connectionKind]);

  const toggleConnectChooser = useCallback(() => {
    setHandbookOpen(false);
    setOpenUtilityPanel(null);
    setTabletPartsOpen(false);
    setConnectMenuOpen((current) => !current);
    setPlacingKind(null);
  }, []);

  const toggleTabletParts = useCallback(() => {
    if (connectionKind) {
      cancelConnectionMode('Connect cancelled. Opened the parts shelf.');
    } else {
      setConnectMenuOpen(false);
    }
    setHandbookOpen(false);
    setOpenUtilityPanel(null);
    setTabletPartsOpen((current) => !current);
  }, [cancelConnectionMode, connectionKind]);

  const handleConnectPick = useCallback((primitiveId: string) => {
    if (!manifest || !connectionKind) {
      return;
    }

    const primitive = manifest.primitives.find((item) => item.id === primitiveId);
    if (!primitive) {
      return;
    }

    if (
      connectionKind === 'rope'
      && connectionSourceId
      && primitive.kind === 'pulley'
      && primitive.id !== connectionSourceId
      && !connectionViaIds.includes(primitive.id)
    ) {
      setConnectionViaIds((current) => [...current, primitive.id]);
      setSelectedPrimitiveId(primitive.id);
      showStatus(`Pulley added to the rope path. Click another pulley or finish on the bucket, hook, crane arm, or cargo.`, 'info');
      return;
    }

    if (!isValidConnectionEndpoint(connectionKind, primitive)) {
      showStatus(invalidConnectionMessage(connectionKind), 'warning');
      return;
    }

    if (!connectionSourceId) {
      setConnectionSourceId(primitive.id);
      setConnectionViaIds([]);
      setSelectedPrimitiveId(primitive.id);
      showStatus(
        connectionKind === 'rope'
          ? `${labelForPrimitive(primitive.kind)} selected first. Click any pulley to route the rope, then click the final hanging part.`
          : `${labelForPrimitive(primitive.kind)} selected first. Now click the second part for ${labelForBuilderConnection(connectionKind).toLowerCase()}.`,
        'info',
      );
      return;
    }

    if (primitive.id === connectionSourceId) {
      setConnectionSourceId(null);
      setConnectionViaIds([]);
      setSelectedPrimitiveId(undefined);
      showStatus('First part cleared. Click a different part.', 'info');
      return;
    }

    const source = manifest.primitives.find((item) => item.id === connectionSourceId);
    if (!source || !isValidConnectionEndpoint(connectionKind, source)) {
      setConnectionSourceId(null);
      setConnectionViaIds([]);
      showStatus(invalidConnectionMessage(connectionKind), 'warning');
      return;
    }

    let nextManifest = manifest;
    let connectionLabel = labelForBuilderConnection(connectionKind);
    if (connectionKind === 'beam') {
      nextManifest = connectPrimitives(manifest, source.id, primitive.id);
    } else {
      let motorId: string | undefined;
      if (connectionKind === 'powered-hinge-link') {
        const midpoint = averagePoint([
          getPrimitiveAnchor(source, manifest),
          getPrimitiveAnchor(primitive, manifest),
        ]);
        const nearestMotor = manifest.primitives
          .filter((item) => item.kind === 'motor')
          .sort((left, right) => {
            const leftAnchor = getPrimitiveAnchor(left, manifest);
            const rightAnchor = getPrimitiveAnchor(right, manifest);
            return Math.hypot(leftAnchor.x - midpoint.x, leftAnchor.y - midpoint.y)
              - Math.hypot(rightAnchor.x - midpoint.x, rightAnchor.y - midpoint.y);
          })[0];
        if (!nearestMotor) {
          showStatus(invalidConnectionMessage(connectionKind), 'warning');
          return;
        }
        motorId = nearestMotor.id;
      }
      nextManifest = connectPrimitives(manifest, source.id, primitive.id, {
        forceKind: connectionKind,
        motorId,
        viaIds: connectionKind === 'rope' ? connectionViaIds : undefined,
      });
    }

    if (nextManifest === manifest) {
      showStatus(invalidConnectionMessage(connectionKind), 'warning');
      return;
    }

    const newPrimitive = nextManifest.primitives.find(
      (item) => !manifest.primitives.some((existing) => existing.id === item.id),
    );
    if (newPrimitive?.kind === 'chain-link') {
      connectionLabel = 'Chain';
    } else if (newPrimitive?.kind === 'belt-link') {
      connectionLabel = 'Belt';
    }

    void persistDraft(nextManifest, undefined, { recordHistory: true });
    setSelectedPrimitiveId(newPrimitive?.id ?? primitive.id);
    setConnectionKind(null);
    setConnectionSourceId(null);
    setConnectionViaIds([]);
    setConnectMenuOpen(false);
    showStatus(
      `${connectionLabel} linked the ${labelForPrimitive(source.kind).toLowerCase()} and the ${labelForPrimitive(primitive.kind).toLowerCase()}. ${connectionSuccessHint(newPrimitive?.kind ?? connectionKind)}`,
      'success',
    );
  }, [connectionKind, connectionSourceId, connectionViaIds, manifest, persistDraft, showStatus]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // Don't intercept when typing in inputs/textareas
      const tag = (event.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (event.key === 'Escape') {
        if (connectionKind) {
          cancelConnectionMode('Connect cancelled. You are back in select mode.');
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
  }, [cancelConnectionMode, connectionKind, manifest, persistDraft, placingKind, selectedPrimitiveId, showStatus]);

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

  const handleClearBuild = useCallback(() => {
    if (!manifest || !playState) {
      showStatus('Nothing to clear yet.', 'warning');
      return;
    }

    const baseline = playState.stepCheckpointManifest[START_CHECKPOINT_ID];
    if (!baseline) {
      showStatus('This draft is missing its starter layout checkpoint.', 'warning');
      return;
    }

    if (manifestsMatch(manifest, baseline)) {
      showStatus('Already back at the starter layout.', 'info');
      return;
    }

    setSelectedPrimitiveId(undefined);
    setPlacingKind(null);
    setConnectionKind(null);
    setConnectionSourceId(null);
    setConnectionViaIds([]);
    setConnectMenuOpen(false);
    setTabletPartsOpen(false);
    setOpenUtilityPanel(null);
    setHandbookOpen(false);
    setFlashToast(false);
    setChallengeToast(null);
    setPuzzleToast(null);
    setStepCelebrating(false);
    setSaveModal(null);
    void persistDraft(structuredClone(baseline), playState, { recordHistory: true });
    showStatus('Cleared the build back to its starter layout.', 'success');
  }, [manifest, persistDraft, playState, showStatus]);

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

    const resetManifest = activePuzzleChallenge
      ? createDraftFromPuzzleChallenge(activePuzzleChallenge.id)?.manifest ?? createEmptyManifest()
      : playState?.stepCheckpointManifest[START_CHECKPOINT_ID]
        ? structuredClone(playState.stepCheckpointManifest[START_CHECKPOINT_ID])
        : createEmptyManifest();
    const resetPlayState = ensureDraftPlayState(undefined, jobId ?? playState?.jobId, resetManifest);
    undoStackRef.current = [];
    setSelectedPrimitiveId(undefined);
    setPuzzleToast(null);
    setPlacingKind(activePuzzleChallenge?.allowedKinds[0] ?? job?.steps?.[0]?.allowedPartKinds[0] ?? null);
    void persistDraft(resetManifest, resetPlayState, { replaceBaseline: true });
    showStatus(activePuzzleChallenge ? 'Reset the puzzle back to its starting layout.' : 'Reset the draft back to the project start.', 'success');
  }, [activePuzzleChallenge, job?.steps, jobId, manifest, persistDraft, playState, showStatus]);

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

  const goalProgress = job ? getGoalProgress(job, manifest, runtimeSnapshot, playState) : null;
  const buildReadiness: 'loading-engine' | 'ready' = simulationStatus !== 'ready' || !canvasReady
    ? 'loading-engine'
    : 'ready';
  const visibleRecipes = recipeShelfOpen ? ENGINEERING_RECIPES : ENGINEERING_RECIPES.slice(0, 3);
  const connectionSource = connectionSourceId
    ? manifest.primitives.find((primitive) => primitive.id === connectionSourceId)
    : undefined;
  const builderToolbarHint = connectionKind
    ? connectionSource
      ? `Connecting with ${labelForBuilderConnection(connectionKind)}. First part: ${labelForPrimitive(connectionSource.kind)}. Click the second part on the canvas.`
      : `Connecting with ${labelForBuilderConnection(connectionKind)}. Click the first part on the canvas.`
    : activeProjectStep?.instruction ?? null;
  const builderToolbarTitle = connectionKind
    ? `Connect ${labelForBuilderConnection(connectionKind)}`
    : activeProjectStep?.title
      ?? (placingKind || selectedPrimitive ? builderFocus.title : 'Free Build');
  const builderEyebrow = job
    ? job.kind === 'starter-project'
      ? 'Guided Build'
      : 'Workshop'
    : 'Free Build';
  const compactCompletionHint = jobComplete && job
    ? job.hints[0] ?? 'The machine works. Save it or go back to the yard.'
    : null;
  const toolbarNotice = buildReadiness === 'loading-engine'
    ? { tone: 'info' as const, message: 'Loading the live engine and stage renderer.' }
    : statusNotice;
  const showBuilderTopCopy = Boolean(connectionKind || activeProjectStep || activePuzzleChallenge);
  const showBuilderStatusChips = Boolean(goalProgress || jobComplete);
  const desktopConnectOverlayOpen = connectMenuOpen && !connectionKind;
  const mobileConnectOverlayOpen = connectMenuOpen && !connectionKind;
  const renderConnectChooser = (className: string, id?: string) => (
    <div id={id} className={className}>
      <div className="builder-connect-head">
        <div>
          <p className="eyebrow">Connect Parts</p>
          <strong>Pick the link you want to make</strong>
        </div>
        <button type="button" className="ghost-button" onClick={() => setConnectMenuOpen(false)}>
          Close
        </button>
      </div>
      <div className="builder-connect-field">
        <span>Pick a connector</span>
        <div className="builder-connect-option-row">
          {BUILDER_CONNECTION_OPTIONS.map((option) => (
            <button
              key={option.kind}
              type="button"
              className="builder-connect-option"
              onClick={() => startConnectionMode(option.kind)}
              title={option.hint}
            >
              <strong>{option.label}</strong>
              <small>{option.hint}</small>
            </button>
          ))}
        </div>
      </div>
      <p className="builder-connect-caption">
        Pick the connector first, then click the first part and the second part on the canvas.
      </p>
    </div>
  );

  return (
    <div className="page page-build">
      <section className="panel builder-stage-shell">
        <div className={`builder-stage-topbar${showBuilderTopCopy ? '' : ' is-compact'}`}>
          {showBuilderTopCopy ? (
            <div className="builder-stage-copy">
            <p className="eyebrow">{builderEyebrow}</p>
            <strong>{builderToolbarTitle}</strong>
            {builderToolbarHint ? <p>{builderToolbarHint}</p> : null}
            </div>
          ) : null}

          <div className="builder-stage-actions">
            <button
              type="button"
              className={`builder-connect-cta${connectMenuOpen || connectionKind ? ' is-active' : ''}`}
              aria-pressed={connectMenuOpen || Boolean(connectionKind)}
              onClick={() => {
                if (connectionKind) {
                  cancelConnectionMode('Connect cancelled. You are back in select mode.');
                  return;
                }
                toggleConnectChooser();
              }}
            >
              Connect Parts
            </button>
            {toolbarNotice ? (
              <span
                className={`builder-chip builder-chip-notice builder-chip-notice-${toolbarNotice.tone} builder-stage-inline-notice`}
                role="status"
                aria-live="polite"
                title={toolbarNotice.message}
              >
                {toolbarNotice.message}
              </span>
            ) : null}
            <button
              type="button"
              className={`builder-tablet-parts-button${tabletPartsOpen ? ' is-active' : ''}`}
              aria-expanded={tabletPartsOpen}
              aria-controls="builder-mobile-parts"
              onClick={toggleTabletParts}
            >
              Parts
            </button>
            <button
              type="button"
              aria-pressed={handbookOpen}
              onClick={() => {
                if (connectionKind) {
                  setConnectionKind(null);
                  setConnectionSourceId(null);
                  setConnectionViaIds([]);
                }
                setTabletPartsOpen(false);
                setConnectMenuOpen(false);
                setOpenUtilityPanel(null);
                setHandbookOpen((current) => !current);
              }}
            >
              Workbook
            </button>
            <button
              type="button"
              aria-pressed={openUtilityPanel === 'inspector'}
              onClick={() => toggleUtilityPanel('inspector')}
            >
              Inspector
            </button>
            <button
              type="button"
              aria-pressed={openUtilityPanel === 'controls'}
              disabled={mergedControls.length === 0}
              onClick={() => toggleUtilityPanel('controls')}
            >
              Controls
            </button>
            <button type="button" onClick={handleClearBuild}>
              Clear Build
            </button>
            <button type="button" onClick={handleUndo}>
              Undo
            </button>
            <button type="button" onClick={handleSaveMachine}>
              Save
            </button>
          </div>
        </div>

        {showBuilderStatusChips ? (
          <div className="builder-stage-status">
            {goalProgress && job ? (
              <span className={`builder-chip ${goalProgress.met ? 'is-success' : ''}`}>
                {goalProgress.met ? `${goalProgress.label}: done` : `${goalProgress.label}: ${goalProgress.current} / ${goalProgress.target}`}
              </span>
            ) : null}
            {jobComplete && job ? (
              <span className="builder-chip is-success">{job.title} complete</span>
            ) : null}
          </div>
        ) : null}

        {challengeToast ? (
          <div className="builder-status-slot">
            <ChallengeToast challenge={challengeToast} onDismiss={() => setChallengeToast(null)} />
          </div>
        ) : null}

        {jobComplete && job ? (
          <div className="builder-stage-complete">
            <div className="builder-stage-complete-copy">
              <span className="builder-toolbar-win-star" aria-hidden="true">★</span>
              <div>
                <strong>Project complete</strong>
                <p>{compactCompletionHint}</p>
              </div>
            </div>
            <div className="builder-stage-complete-actions">
              <button type="button" className="primary-link" onClick={handleSaveMachine}>
                Save Machine
              </button>
              <Link to="/">Back to Yard</Link>
            </div>
          </div>
        ) : null}

        {puzzleToast ? (
          <div className="builder-stage-complete builder-stage-puzzle-win">
            <div className="builder-stage-complete-copy">
              <span className="builder-toolbar-win-star" aria-hidden="true">★</span>
              <div>
                <strong>{puzzleToast.title}</strong>
                <p>{puzzleToast.message}</p>
              </div>
            </div>
            <div className="builder-stage-complete-actions">
              <button type="button" className="primary-link" onClick={handleResetDraft}>
                Replay Puzzle
              </button>
              <Link to="/">More Puzzles</Link>
            </div>
          </div>
        ) : null}

        <div className="builder-workbench">
          <div className="canvas-column builder-canvas-panel" style={{ position: 'relative' }}>
            {tabletPartsOpen ? (
              <div id="builder-mobile-parts" className="builder-mobile-overlay builder-mobile-parts-overlay">
                <PartPalette
                  manifest={manifest}
                  selectedPrimitive={selectedPrimitive}
                  selectedKind={placingKind}
                  activeJobHint={activeJobHint}
                  allowedKinds={paletteAllowedKinds}
                  projectTitle={job?.title}
                  projectStepTitle={activeProjectStep?.title}
                  onSelectKind={handleSelectKind}
                />
              </div>
            ) : null}
            {mobileConnectOverlayOpen ? (
              renderConnectChooser('builder-connect-chooser builder-mobile-overlay builder-mobile-connect-overlay', 'builder-mobile-connect')
            ) : null}
            {desktopConnectOverlayOpen ? (
              <div className="builder-desktop-overlay builder-connect-overlay-panel">
                {renderConnectChooser('builder-connect-chooser builder-desktop-connect-overlay')}
              </div>
            ) : null}
            {openUtilityPanel ? (
              <div className="builder-desktop-overlay builder-utility-overlay-panel">
                {openUtilityPanel === 'inspector' ? (
                  <InspectorPanel
                    mode="panel"
                    primitive={selectedPrimitive}
                    manifest={manifest}
                    onClose={() => setOpenUtilityPanel(null)}
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
                        showStatus(value ? 'Motor power ON.' : 'Motor power OFF.', 'info');
                      }
                    }}
                  />
                ) : (
                  <ControlPanel
                    mode="panel"
                    controls={mergedControls}
                    values={controlValues}
                    onClose={() => setOpenUtilityPanel(null)}
                    onChange={(controlId, value) => {
                      setControlValues((current) => ({ ...current, [controlId]: value }));
                    }}
                  />
                )}
              </div>
            ) : null}
            <HudOverlay hud={manifest.hud} telemetry={telemetry} />
            {flashToast && (
              <div className="connection-toast" role="status" aria-live="polite">The machine is responding.</div>
            )}
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
              connectionMode={connectionKind ? { kind: connectionKind, sourceId: connectionSourceId } : null}
              activeJobHint={activeJobHint}
              projectGuide={projectGuide}
              quickControls={selectedQuickControls}
              onPlacePrimitive={handlePlacePrimitive}
              onSelectPrimitive={handleSelectPrimitive}
              onConnectPick={handleConnectPick}
              onMovePrimitive={(primitiveId, x, y) => {
                void persistDraft(movePrimitive(manifest, primitiveId, x, y), undefined, { recordHistory: true });
              }}
              onTelemetry={setTelemetry}
              diagnosticsEnabled={Boolean(playState?.diagnosticsEnabled)}
              onConnectionFlash={() => {
                if (flashCountRef.current >= 3) return;
                flashCountRef.current += 1;
                setFlashToast(true);
                setTimeout(() => setFlashToast(false), 2000);
              }}
              onTogglePower={(primitiveId) => {
                const prim = manifest.primitives.find((p) => p.id === primitiveId);
                if (!prim || prim.kind !== 'motor') return;
                const current = Boolean(readControlValue(
                  mergedControls,
                  controlValues,
                  primitiveId,
                  'powerState',
                  Boolean((prim.config as { powerState?: boolean }).powerState ?? true),
                ));
                setBoundControlValue(primitiveId, 'powerState', !current, current);
                playUiTone('power');
                showStatus(!current ? 'Motor power ON.' : 'Motor power OFF.', 'info');
              }}
              onCanvasReady={() => setCanvasReady(true)}
            />
          </div>

          <aside className="right-rail builder-parts-rail">
            <PartPalette
              manifest={manifest}
              selectedPrimitive={selectedPrimitive}
              selectedKind={placingKind}
              activeJobHint={activeJobHint}
              allowedKinds={paletteAllowedKinds}
              projectTitle={job?.title}
              projectStepTitle={activeProjectStep?.title}
              onSelectKind={handleSelectKind}
            />
          </aside>
        </div>
      </section>

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

      {handbookOpen ? (
        <div className="modal-backdrop handbook-backdrop" onClick={() => setHandbookOpen(false)}>
          <div className="modal-card handbook-modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel-header compact">
              <div>
                <p className="eyebrow">Engineering Workbook</p>
                <h3>Working recipes you can study, mount, and remix</h3>
              </div>
              <div className="button-row">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setRecipeShelfOpen((current) => !current)}
                >
                  {recipeShelfOpen ? 'Show Fewer' : 'Show All'}
                </button>
                <button type="button" onClick={() => setHandbookOpen(false)}>
                  Close
                </button>
              </div>
            </div>
            <div className="blueprint-list handbook-list handbook-modal-list">
              {visibleRecipes.map((recipe) => (
                <article key={recipe.id} className="blueprint-row handbook-row">
                  <div>
                    <strong>{recipe.title}</strong>
                    <p className="muted">{recipe.summary}</p>
                    <p className="muted">Parts: {recipe.partList.join(', ')}</p>
                    <p className="muted">Why it works: {recipe.whyItWorks}</p>
                  </div>
                  <div className="button-row vertical">
                    <button
                      type="button"
                      onClick={() => {
                        void persistDraft(mountBlueprintToManifest(manifest, recipe.blueprintRecord.blueprint), undefined, { recordHistory: true });
                        setHandbookOpen(false);
                        showStatus(`Mounted ${recipe.title}.`, 'success');
                      }}
                    >
                      Mount
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      ) : null}

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

function manifestsMatch(left: ExperimentManifest, right: ExperimentManifest) {
  return JSON.stringify(left) === JSON.stringify(right);
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
  primitive?: PrimitiveInstance | null,
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
            message: 'Winch placed. Press Connect, choose Rope, then click the winch and hook.',
            tone: 'success',
          }
        : {
            message: 'Winch placed. Add a hook below it, then use Connect → Rope.',
            tone: 'info',
          };
    case 'hook':
      return hasPart(manifest, 'winch')
        ? {
            message: 'Hook placed. Press Connect, choose Rope, then click the winch and hook.',
            tone: 'success',
          }
        : {
            message: 'Hook placed. Add a winch above it if you want it to hoist.',
            tone: 'warning',
          };
    case 'node':
      return hasPart(manifest, 'node')
        ? {
            message: 'Node placed. Press Connect, choose Beam, then click both nodes.',
            tone: 'success',
          }
        : {
            message: 'Node placed. Add a second node if you want a beam between them.',
            tone: 'info',
          };
    case 'rail-segment':
      return {
        message: 'Rail placed. Drop a locomotive or wagon near it and the vehicle will snap onto the track automatically.',
        tone: 'info',
      };
    case 'station-zone':
      return {
        message: 'Station zone placed. Set it to load or unload in the Inspector, then run a wagon through it.',
        tone: 'info',
      };
    case 'locomotive':
    case 'wagon':
      return typeof (primitive?.config as { trackId?: string } | undefined)?.trackId === 'string'
        ? {
            message: `${labelForPrimitive(kind)} snapped onto the nearby rail. It can still carry cargo, tools, and bolt-on parts while it rides the line.`,
            tone: 'success',
          }
        : {
            message: `${labelForPrimitive(kind)} placed as a free body. Add rail nearby to snap it on, or bolt on wheels, motors, and tools.`,
            tone: hasPart(manifest, 'rail-segment') ? 'info' : 'warning',
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
      return 'Rails now grab nearby locomotives and wagons automatically when you place or drag them onto the line.';
    case 'station-zone':
      return 'Stations turn passing wagons into deliberate load or unload moments.';
    case 'trampoline':
      return 'Trampolines are clearest when something can fall straight onto them.';
    case 'hook':
      return 'Hooks work best when they sit below a winch so Connect → Rope can link them together.';
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
      return 'Rails drive snapped locomotives and wagons automatically, and switches decide which branch they take.';
    case 'locomotive':
    case 'wagon':
      return 'Drag it onto a rail to snap it into train mode, or leave it free and bolt on wheels, motors, or tools like any other body.';
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
