import { useEffect, useRef, useState } from 'react';
import type p5 from 'p5';
import type { BuildTelemetry, ExperimentManifest, PrimitiveInstance, PrimitiveKind } from '../lib/types';
import { findPrimitiveById, type RuntimeSnapshot } from '../lib/simulation';

// Mirrors physics-engine.ts — kept in sync with that constant.
const teethToRadius = (teeth: number) => Math.max(24, teeth * 1.4);
const MOTOR_RANGE = 220;       // px — must match physics-engine motorGearMap distance
const CONVEYOR_MOTOR_RANGE = 300; // px — must match physics-engine conveyorMotorRpm distance
const FLASH_DURATION_MS = 900; // how long a connection flash glows

function isRotatingKind(kind: PrimitiveKind | null | undefined): kind is PrimitiveKind {
  return kind === 'gear'
    || kind === 'wheel'
    || kind === 'pulley'
    || kind === 'chain-sprocket'
    || kind === 'flywheel';
}

function rotatingRadiusFromKind(kind: PrimitiveKind, config: unknown): number {
  switch (kind) {
    case 'gear':
      return teethToRadius(Number((config as { teeth?: number }).teeth ?? 24));
    case 'wheel':
    case 'pulley':
    case 'chain-sprocket':
      return Number((config as { radius?: number }).radius ?? 28);
    case 'flywheel':
      return Number((config as { radius?: number }).radius ?? 36);
    default:
      return 20;
  }
}

function rotatingRadiusForPrimitive(primitive: PrimitiveInstance): number {
  return rotatingRadiusFromKind(primitive.kind, primitive.config);
}

function placementRadiusForKind(kind: PrimitiveKind): number {
  if (kind === 'gear') return teethToRadius(20);
  if (kind === 'wheel' || kind === 'pulley' || kind === 'chain-sprocket') return 28;
  if (kind === 'flywheel') return 36;
  return 20;
}

interface MachineCanvasProps {
  manifest: ExperimentManifest;
  runtime: RuntimeSnapshot;
  selectedPrimitiveId?: string;
  placingKind?: PrimitiveKind | null;
  diagnosticsEnabled?: boolean;
  activeJobHint?: string;
  projectGuide?: {
    title: string;
    detail: string;
    line?: Array<{ x: number; y: number }>;
    circle?: { x: number; y: number; r: number };
    rect?: { x: number; y: number; w: number; h: number };
    marker?: { x: number; y: number; label: string };
  } | null;
  onPlacePrimitive: (x: number, y: number) => void;
  onSelectPrimitive: (primitiveId?: string) => void;
  onMovePrimitive: (primitiveId: string, x: number, y: number) => void;
  onTelemetry: (telemetry: BuildTelemetry) => void;
  onConnectionFlash?: (ids: string[]) => void;
  onTogglePower?: (primitiveId: string) => void;
  onCanvasReady?: () => void;
}

export function MachineCanvas({
  manifest,
  runtime,
  selectedPrimitiveId,
  placingKind,
  diagnosticsEnabled,
  activeJobHint,
  projectGuide,
  onPlacePrimitive,
  onSelectPrimitive,
  onMovePrimitive,
  onTelemetry,
  onConnectionFlash,
  onTogglePower,
  onCanvasReady,
}: MachineCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [canvasReady, setCanvasReady] = useState(false);

  // Refs keep the sketch alive while props change
  const manifestRef = useRef(manifest);
  const runtimeRef = useRef(runtime);
  const selectedRef = useRef(selectedPrimitiveId);
  const placingRef = useRef(placingKind);
  const projectGuideRef = useRef(projectGuide);
  const onPlaceRef = useRef(onPlacePrimitive);
  const onSelectRef = useRef(onSelectPrimitive);
  const onMoveRef = useRef(onMovePrimitive);
  const onTelemetryRef = useRef(onTelemetry);
  const onConnectionFlashRef = useRef(onConnectionFlash);
  const onTogglePowerRef = useRef(onTogglePower);
  const onCanvasReadyRef = useRef(onCanvasReady);
  const diagnosticsRef = useRef(diagnosticsEnabled ?? false);
  const draggingIdRef = useRef<string | undefined>(undefined);
  const hoveredIdRef = useRef<string | undefined>(undefined);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  // Buffer drag moves — only fire onMovePrimitive on mouse release to prevent
  // per-frame physics world rebuilds that reset all simulation state mid-drag.
  const dragBufferRef = useRef<{ id: string; x: number; y: number } | null>(null);
  // Track press position to distinguish click (no move) from drag
  const pressPositionRef = useRef<{ x: number; y: number } | null>(null);

  // Flash state: partId → timestamp when connection was first detected
  const flashTimesRef = useRef<Record<string, number>>({});
  // Previous motorDrives snapshot for change detection
  const prevDrivesRef = useRef<Record<string, string[]>>({});

  useEffect(() => {
    manifestRef.current = manifest;
    runtimeRef.current = runtime;
    selectedRef.current = selectedPrimitiveId;
    placingRef.current = placingKind;
    projectGuideRef.current = projectGuide;
    onPlaceRef.current = onPlacePrimitive;
    onSelectRef.current = onSelectPrimitive;
    onMoveRef.current = onMovePrimitive;
    onTelemetryRef.current = onTelemetry;
    onConnectionFlashRef.current = onConnectionFlash;
    onTogglePowerRef.current = onTogglePower;
    onCanvasReadyRef.current = onCanvasReady;
    diagnosticsRef.current = diagnosticsEnabled ?? false;
  }, [
    onCanvasReady,
    diagnosticsEnabled,
    manifest,
    onConnectionFlash,
    onMovePrimitive,
    onPlacePrimitive,
    onSelectPrimitive,
    onTelemetry,
    onTogglePower,
    placingKind,
    projectGuide,
    runtime,
    selectedPrimitiveId,
  ]);

  useEffect(() => {
    if (!hostRef.current) return;

    let sketch: p5 | null = null;
    let cancelled = false;
    setCanvasReady(false);

    void import('../lib/p5-lite').then(({ default: P5 }) => {
      if (cancelled || !hostRef.current) {
        return;
      }

      sketch = new P5((instance) => {
        instance.setup = () => {
          instance.createCanvas(960, 560);
          instance.frameRate(60);
          setCanvasReady(true);
          onCanvasReadyRef.current?.();
        };

        instance.draw = () => {
          // ── Connection flash detection ────────────────────────────────
          const curDrives = runtimeRef.current.motorDrives ?? {};
          const prev = prevDrivesRef.current;
          const newlyConnected: string[] = [];
          for (const [mId, ids] of Object.entries(curDrives)) {
            for (const id of ids) {
              if (!(prev[mId] ?? []).includes(id)) newlyConnected.push(id);
            }
          }
          if (newlyConnected.length > 0) {
            const now = Date.now();
            for (const id of newlyConnected) flashTimesRef.current[id] = now;
            onConnectionFlashRef.current?.(newlyConnected);
          }
          prevDrivesRef.current = curDrives;

          const dragBuf = dragBufferRef.current;
          const displayManifest = dragBuf
            ? applyDragToManifest(manifestRef.current, dragBuf)
            : manifestRef.current;

          drawScene(
            instance,
            displayManifest,
            runtimeRef.current,
            selectedRef.current,
            hoveredIdRef.current,
            draggingIdRef.current,
            placingRef.current,
            projectGuideRef.current,
            flashTimesRef.current,
            diagnosticsRef.current,
          );
          onTelemetryRef.current(runtimeRef.current.telemetry);

          const hoveredPrimitive = hoveredIdRef.current
            ? manifestRef.current.primitives.find((primitive) => primitive.id === hoveredIdRef.current)
            : undefined;
          if (placingRef.current) {
            instance.cursor('crosshair');
          } else if (draggingIdRef.current) {
            instance.cursor('grabbing');
          } else if (hoveredPrimitive && isDraggablePrimitive(hoveredPrimitive)) {
            instance.cursor('grab');
          } else if (hoveredPrimitive) {
            instance.cursor('pointer');
          } else {
            instance.cursor('default');
          }
        };

        instance.mousePressed = () => {
          const x = instance.mouseX;
          const y = instance.mouseY;
          if (x < 0 || x > instance.width || y < 0 || y > instance.height) return;

          if (placingRef.current) {
            onPlaceRef.current(x, y);
            return;
          }

          const hit = hitTest(
            manifestRef.current.primitives,
            x,
            y,
            runtimeRef.current,
          );
          const anchor = hit ? getPrimitiveAnchor(hit, manifestRef.current.primitives, runtimeRef.current) : undefined;
          dragOffsetRef.current = anchor
            ? { x: anchor.x - x, y: anchor.y - y }
            : { x: 0, y: 0 };
          draggingIdRef.current = hit && isDraggablePrimitive(hit) ? hit.id : undefined;
          dragBufferRef.current = null;
          pressPositionRef.current = { x, y };
          onSelectRef.current(hit?.id);
        };

        instance.mouseDragged = () => {
          const id = draggingIdRef.current;
          if (!id) return;
          const nx = instance.mouseX + dragOffsetRef.current.x;
          const ny = instance.mouseY + dragOffsetRef.current.y;
          dragBufferRef.current = { id, x: nx, y: ny };
        };

        instance.mouseReleased = () => {
          const pressPos = pressPositionRef.current;
          const releaseX = instance.mouseX;
          const releaseY = instance.mouseY;
          const moved = pressPos
            ? Math.hypot(releaseX - pressPos.x, releaseY - pressPos.y) > 5
            : false;

          if (draggingIdRef.current && dragBufferRef.current && moved) {
            onMoveRef.current(
              dragBufferRef.current.id,
              dragBufferRef.current.x,
              dragBufferRef.current.y,
            );
          } else if (!moved && draggingIdRef.current && onTogglePowerRef.current) {
            const prim = manifestRef.current.primitives.find((p) => p.id === draggingIdRef.current);
            if (prim?.kind === 'motor') {
              onTogglePowerRef.current(prim.id);
            }
          }

          draggingIdRef.current = undefined;
          dragBufferRef.current = null;
          pressPositionRef.current = null;
        };

        instance.mouseMoved = () => {
          hoveredIdRef.current = hitTest(
            manifestRef.current.primitives,
            instance.mouseX,
            instance.mouseY,
            runtimeRef.current,
          )?.id;
        };
      }, hostRef.current);
    });

    return () => {
      cancelled = true;
      sketch?.remove();
    };
  }, []); // intentionally empty

  const hint = (() => {
    if (placingKind) return `Click canvas to place ${labelFor(placingKind)}`;
    const sel = manifest.primitives.find((p) => p.id === selectedPrimitiveId);
    if (!sel) return 'Click a part to select · Drag to reposition';
    switch (sel.kind) {
      case 'motor':    return 'Motor — place a rotating part inside the green ring to drive it';
      case 'gear':     return 'Gear — place another rotating part touching this one to mesh it';
      case 'wheel':    return 'Wheel — inside Motor range it spins · touching a rotating part it meshes';
      case 'pulley':
      case 'chain-sprocket':
        return 'Rotating part — place it in a motor ring or touching another rotating part to wake it up';
      case 'flywheel':
        return 'Flywheel — feed it from a motor or gear train to store motion';
      case 'gearbox':
        return 'Gearbox — place rotating parts on both sides to transmit a ratio change';
      case 'conveyor': return 'Conveyor — place Cargo Blocks on it · Motor within 300px boosts speed';
      case 'hopper':   return 'Hopper — drop Cargo Blocks above it to fill up';
      case 'winch':    return 'Winch — place a Hook below, then Quick Connect → Winch to Hook';
      case 'node':     return 'Node — place another Node then Quick Connect → Beam';
      case 'hook':     return 'Hook — Quick Connect to attach it to a Winch';
      case 'locomotive': return 'Locomotive — place Rail Segment, set its trackId in the Inspector';
      default:         return `${sel.label ?? sel.kind} — drag to move · Inspector to adjust`;
    }
  })();

  const sunnyStatus = 'Sunny Workyard';

  return (
    <div className="machine-canvas-shell">
      <div className="machine-canvas-toolbar">
        <div className="canvas-toolbar-main">
          <span>{sunnyStatus}</span>
          <span className={`canvas-mode-pill ${placingKind ? 'placing' : selectedPrimitiveId ? 'selected' : 'idle'}`}>
            {placingKind ? `Place ${labelFor(placingKind)}` : selectedPrimitiveId ? 'Selected part' : 'Select and drag'}
          </span>
        </div>
        <span className="canvas-hint">{hint}</span>
      </div>
      {activeJobHint && (
        <div className="canvas-job-hint">
          <span className="canvas-job-hint-icon">→</span>
          {activeJobHint}
        </div>
      )}
      <div className="machine-canvas" ref={hostRef}>
        {!canvasReady ? (
          <div className="machine-canvas-loading" aria-hidden="true">
            <div className="machine-canvas-loading-grid" />
            <div className="machine-canvas-loading-copy">
              <div className="skeleton-line skeleton-line-eyebrow" />
              <div className="skeleton-line skeleton-line-copy" />
              <div className="skeleton-line skeleton-line-copy short" />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─── Scene ────────────────────────────────────────────────────────────────────

function drawScene(
  instance: p5,
  manifest: ExperimentManifest,
  runtime: RuntimeSnapshot,
  selectedPrimitiveId: string | undefined,
  hoveredPrimitiveId: string | undefined,
  draggingPrimitiveId: string | undefined,
  placingKind: PrimitiveKind | null | undefined,
  projectGuide: MachineCanvasProps['projectGuide'],
  flashTimes: Record<string, number>,
  diagnosticsEnabled: boolean,
) {
  drawBackdrop(instance);
  drawGrid(instance);
  drawProjectGuide(instance, projectGuide);
  drawConnectionOverlay(instance, manifest, runtime, selectedPrimitiveId, placingKind);

  for (const primitive of manifest.primitives) {
    const selected = primitive.id === selectedPrimitiveId;
    const hovered = primitive.id === hoveredPrimitiveId && primitive.id !== draggingPrimitiveId;
    drawPrimitive(instance, primitive, runtime, selected, hovered, manifest.primitives, flashTimes);
  }

  if (
    placingKind &&
    instance.mouseX >= 0 &&
    instance.mouseX <= instance.width &&
    instance.mouseY >= 0 &&
    instance.mouseY <= instance.height
  ) {
    drawPlacingPreview(instance, manifest, placingKind, instance.mouseX, instance.mouseY);
  }

  drawInteractionOverlay(
    instance,
    manifest,
    runtime,
    selectedPrimitiveId,
    hoveredPrimitiveId,
    draggingPrimitiveId,
    placingKind,
    instance.mouseX,
    instance.mouseY,
  );

  if (diagnosticsEnabled) {
    drawDiagnostics(instance, manifest, runtime);
  }
}

// ─── Connection overlay ───────────────────────────────────────────────────────

function drawConnectionOverlay(
  instance: p5,
  manifest: ExperimentManifest,
  runtime: RuntimeSnapshot,
  selectedPrimitiveId: string | undefined,
  placingKind: PrimitiveKind | null | undefined,
) {
  instance.push();
  const ctx = instance.drawingContext as CanvasRenderingContext2D;
  const isPlacingRotating = isRotatingKind(placingKind);

  for (const prim of manifest.primitives) {
    // ── Motor ───────────────────────────────────────────────────────────────
    if (prim.kind === 'motor') {
      const { x, y } = prim.config as { x: number; y: number };
      const isSelected = prim.id === selectedPrimitiveId;
      const drivenIds = runtime.motorDrives?.[prim.id] ?? [];
      const hasDriven = drivenIds.length > 0;

      // Drive-range ring: always visible, brighter when selected or placing a driven part
      const ringAlpha = isPlacingRotating ? 200
        : isSelected ? 110
        : hasDriven ? 55
        : 42;
      instance.noFill();
      instance.stroke(71, 197, 165, ringAlpha);
      instance.strokeWeight(isPlacingRotating ? 2 : 1);
      if (isPlacingRotating) { ctx.setLineDash([6, 4]); }
      instance.circle(x, y, MOTOR_RANGE * 2);
      ctx.setLineDash([]);

      // Label the ring when placing a gear/wheel so the rule is unmissable
      if (isPlacingRotating) {
        instance.noStroke();
        instance.fill(71, 197, 165, 180);
        instance.textSize(11);
        instance.textAlign(instance.CENTER, instance.BOTTOM);
        instance.text(`Motor reach — drop ${placingKind} inside`, x, y - MOTOR_RANGE - 4);
      }

      // Lines from motor to each driven part
      for (const drivenId of drivenIds) {
        const driven = manifest.primitives.find((p) => p.id === drivenId);
        if (!driven) continue;
        const dPos = getLivePos(driven, runtime);
        const isWheel = driven.kind === 'wheel';
        ctx.setLineDash([4, 6]);
        instance.stroke(isWheel ? 96 : 71, isWheel ? 165 : 197, isWheel ? 234 : 165, 90);
        instance.strokeWeight(1);
        instance.line(x, y, dPos.x, dPos.y);
        ctx.setLineDash([]);
        instance.fill(isWheel ? 96 : 71, isWheel ? 165 : 197, isWheel ? 234 : 165, 90);
        instance.noStroke();
        instance.circle(dPos.x, dPos.y, 8);
      }

      // Conveyor boost-range ring (amber, always faint)
      const nearConveyor = manifest.primitives.some((p) => {
        if (p.kind !== 'conveyor') return false;
        const cCfg = p.config as { path: Array<{ x: number; y: number }> };
        return distanceToPolyline(cCfg.path, x, y) < CONVEYOR_MOTOR_RANGE;
      });
      if (nearConveyor || isSelected) {
        instance.noFill();
        instance.stroke(245, 158, 11, 22);
        instance.strokeWeight(1);
        ctx.setLineDash([3, 10]);
        instance.circle(x, y, CONVEYOR_MOTOR_RANGE * 2);
        ctx.setLineDash([]);
      }

      if (drivenIds.length === 0 && !isPlacingRotating) {
        instance.noStroke();
        instance.fill(71, 197, 165, 120);
        instance.textSize(11);
        instance.textAlign(instance.CENTER, instance.TOP);
        instance.text('Place a rotating part in this ring', x, y + 26);
      }

      // Show power-off hint when motor is off and selected
      const motorOff = !(prim.config as { powerState?: boolean }).powerState;
      if (motorOff && isSelected) {
        instance.noStroke();
        instance.fill(251, 191, 36, 200);
        instance.textSize(11);
        instance.textAlign(instance.CENTER, instance.BOTTOM);
        instance.text('Motor is OFF — click to power on', x, y - 24);
      }
    }

    // ── Winch ───────────────────────────────────────────────────────────────
    if (prim.kind === 'winch') {
      const { x, y } = prim.config as { x: number; y: number };
      const isSelected = prim.id === selectedPrimitiveId;
      const hasRope = manifest.primitives.some(
        (p) => p.kind === 'rope' && (p.config as { fromId: string }).fromId === prim.id,
      );
      if (!hasRope && isSelected) {
        instance.stroke(245, 158, 11, 65);
        instance.strokeWeight(1);
        ctx.setLineDash([4, 6]);
        instance.line(x, y, x, y + 220);
        ctx.setLineDash([]);
        instance.noStroke();
        instance.fill(245, 158, 11, 130);
        instance.textSize(11);
        instance.textAlign(instance.CENTER, instance.TOP);
        instance.text('Place a Hook here, then Quick Connect', x, y + 230);
      }
    }

    // ── Conveyor endpoint zones ─────────────────────────────────────────────
    if (prim.kind === 'conveyor' && prim.id === selectedPrimitiveId) {
      const cCfg = prim.config as { path: Array<{ x: number; y: number }> };
      if (cCfg.path.length >= 2) {
        instance.noFill();
        instance.stroke(245, 158, 11, 35);
        instance.strokeWeight(CONVEYOR_MOTOR_RANGE / 20);
        for (let index = 0; index < cCfg.path.length - 1; index += 1) {
          instance.line(cCfg.path[index].x, cCfg.path[index].y, cCfg.path[index + 1].x, cCfg.path[index + 1].y);
        }
      }
    }

    // ── Gear / Wheel mesh lines ─────────────────────────────────────────────
    if (isRotatingKind(prim.kind)) {
      const pos = getLivePos(prim, runtime);
      for (const meshId of runtime.gearMeshes?.[prim.id] ?? []) {
        const meshPart = manifest.primitives.find((p) => p.id === meshId);
        if (!meshPart || prim.id >= meshId) continue;
        const mPos = getLivePos(meshPart, runtime);
        const mixed = prim.kind !== meshPart.kind;
        instance.stroke(mixed ? 96 : 94, mixed ? 165 : 234, mixed ? 234 : 212, 70);
        instance.strokeWeight(1);
        instance.line(pos.x, pos.y, mPos.x, mPos.y);
      }

      // When placing a gear/wheel, show the meshing zone around existing ones
      if (isPlacingRotating) {
        const existingRadius = rotatingRadiusForPrimitive(prim);
        const newRadius = placementRadiusForKind(placingKind);
        const meshZone = existingRadius + newRadius + 16;
        instance.noFill();
        instance.stroke(94, 234, 212, 50);
        instance.strokeWeight(1);
        ctx.setLineDash([3, 5]);
        instance.circle(pos.x, pos.y, meshZone * 2);
        ctx.setLineDash([]);
        instance.noStroke();
        instance.fill(94, 234, 212, 80);
        instance.textSize(10);
        instance.textAlign(instance.CENTER, instance.BOTTOM);
        instance.text('Mesh zone', pos.x, pos.y - existingRadius - 3);
      }
    }
  }

  instance.pop();
}

// ─── Placement preview (ghost part at cursor) ─────────────────────────────────

function drawPlacingPreview(
  instance: p5,
  manifest: ExperimentManifest,
  placingKind: PrimitiveKind,
  mx: number,
  my: number,
) {
  const assessment = getPlacementAssessment(manifest, placingKind, mx, my);
  const tone = toneColor(assessment.tone);

  instance.push();
  instance.stroke(tone.stroke[0], tone.stroke[1], tone.stroke[2], 210);
  instance.fill(tone.fill[0], tone.fill[1], tone.fill[2], 38);
  instance.strokeWeight(2);

  switch (placingKind) {
    case 'gear': {
      const radius = teethToRadius(20);
      instance.circle(mx, my, radius * 2);
      for (let i = 0; i < 20; i += 1) {
        const angle = (Math.PI * 2 * i) / 20;
        instance.line(
          Math.cos(angle) * radius + mx,
          Math.sin(angle) * radius + my,
          Math.cos(angle) * (radius + 7) + mx,
          Math.sin(angle) * (radius + 7) + my,
        );
      }
      break;
    }
    case 'wheel': {
      const radius = 28;
      instance.circle(mx, my, radius * 2);
      instance.line(mx - radius, my, mx + radius, my);
      instance.line(mx, my - radius, mx, my + radius);
      break;
    }
    case 'pulley':
    case 'chain-sprocket': {
      const radius = 28;
      instance.circle(mx, my, radius * 2);
      instance.line(mx - radius, my, mx + radius, my);
      instance.line(mx, my - radius, mx, my + radius);
      if (placingKind === 'chain-sprocket') {
        for (let i = 0; i < 12; i += 1) {
          const angle = (Math.PI * 2 * i) / 12;
          instance.line(
            Math.cos(angle) * radius + mx,
            Math.sin(angle) * radius + my,
            Math.cos(angle) * (radius + 6) + mx,
            Math.sin(angle) * (radius + 6) + my,
          );
        }
      }
      break;
    }
    case 'flywheel': {
      const radius = 36;
      instance.circle(mx, my, radius * 2);
      instance.circle(mx, my, radius * 1.35);
      instance.line(mx - radius, my, mx + radius, my);
      instance.line(mx, my - radius, mx, my + radius);
      break;
    }
    case 'gearbox':
      instance.rect(mx - 24, my - 16, 48, 32, 8);
      instance.circle(mx - 10, my, 12);
      instance.circle(mx + 10, my, 12);
      break;
    case 'motor':
      instance.rect(mx - 28, my - 18, 56, 36, 10);
      instance.noFill();
      instance.circle(mx, my, MOTOR_RANGE * 2);
      break;
    case 'conveyor':
      instance.strokeWeight(8);
      instance.line(mx - 80, my, mx + 80, my);
      break;
    case 'hopper':
      instance.quad(mx - 40, my - 10, mx + 40, my - 10, mx + 24, my + 60, mx - 24, my + 60);
      break;
    case 'rail-segment':
      instance.strokeWeight(4);
      instance.line(mx - 80, my, mx + 80, my);
      for (let offset = -72; offset <= 72; offset += 24) {
        instance.line(mx + offset, my - 8, mx + offset, my + 8);
      }
      break;
    case 'winch':
      instance.rect(mx - 20, my - 20, 40, 40, 8);
      instance.circle(mx, my, 16);
      break;
    case 'hook':
      instance.line(mx, my - 24, mx, my);
      instance.arc(mx, my + 10, 24, 28, 0, Math.PI);
      break;
    case 'node':
      instance.circle(mx, my, 16);
      break;
    case 'cargo-block':
      instance.rect(mx - 12, my - 12, 24, 24, 4);
      break;
    case 'ramp':
    case 'platform':
      instance.push();
      instance.translate(mx, my);
      instance.rotate(placingKind === 'ramp' ? Math.PI / 9 : 0);
      instance.rectMode(instance.CENTER);
      instance.rect(0, 0, 120, 12, 2);
      instance.pop();
      break;
    case 'wall':
      instance.push();
      instance.translate(mx, my);
      instance.rectMode(instance.CENTER);
      instance.rect(0, 0, 12, 80, 2);
      instance.pop();
      break;
    case 'ball':
      instance.circle(mx, my, 24);
      break;
    case 'rock':
      instance.circle(mx, my, 32);
      break;
    case 'locomotive':
      instance.rect(mx - 22, my - 18, 44, 24, 6);
      break;
    case 'wagon':
      instance.rect(mx - 18, my - 16, 36, 20, 6);
      break;
    default:
      instance.circle(mx, my, 18);
  }

  instance.pop();
  drawPreviewCard(instance, mx, my, assessment.title, assessment.detail, assessment.tone);
}

function drawProjectGuide(
  instance: p5,
  guide: MachineCanvasProps['projectGuide'],
) {
  if (!guide) {
    return;
  }

  const pulse = 0.7 + Math.sin(Date.now() / 180) * 0.18;

  instance.push();
  instance.noFill();
  instance.stroke(94, 234, 212, 90 + pulse * 60);
  instance.strokeWeight(guide.line ? 12 : 3);

  if (guide.line && guide.line.length >= 2) {
    for (let index = 0; index < guide.line.length - 1; index += 1) {
      instance.line(guide.line[index].x, guide.line[index].y, guide.line[index + 1].x, guide.line[index + 1].y);
    }
  }

  if (guide.circle) {
    instance.strokeWeight(2);
    instance.circle(guide.circle.x, guide.circle.y, guide.circle.r * 2);
  }

  if (guide.rect) {
    instance.strokeWeight(2);
    instance.rect(guide.rect.x, guide.rect.y, guide.rect.w, guide.rect.h, 18);
  }

  if (guide.marker) {
    instance.noStroke();
    instance.fill(94, 234, 212, 220);
    instance.circle(guide.marker.x, guide.marker.y, 12);
    instance.fill(241, 245, 249, 240);
    instance.textSize(11);
    instance.textAlign(instance.CENTER, instance.BOTTOM);
    instance.text(guide.marker.label, guide.marker.x, guide.marker.y - 10);
  }
  instance.pop();

  drawPreviewCard(instance, 24, 88, guide.title, guide.detail, 'good');
}

function drawInteractionOverlay(
  instance: p5,
  manifest: ExperimentManifest,
  runtime: RuntimeSnapshot,
  selectedPrimitiveId: string | undefined,
  hoveredPrimitiveId: string | undefined,
  draggingPrimitiveId: string | undefined,
  placingKind: PrimitiveKind | null | undefined,
  mouseX: number,
  mouseY: number,
) {
  const modeText = placingKind
    ? `Place ${labelFor(placingKind)}`
    : draggingPrimitiveId
      ? 'Dragging part'
      : selectedPrimitiveId
        ? 'Part selected'
        : 'Select mode';
  drawModeChip(instance, 16, 16, modeText, placingKind ? 'good' : selectedPrimitiveId ? 'info' : 'warn');

  if (placingKind && mouseX >= 0 && mouseX <= instance.width && mouseY >= 0 && mouseY <= instance.height) {
    return;
  }

  const hoveredPrimitive = hoveredPrimitiveId
    ? manifest.primitives.find((primitive) => primitive.id === hoveredPrimitiveId)
    : undefined;

  if (!hoveredPrimitive || draggingPrimitiveId) {
    return;
  }

  const hoverDetail = isDraggablePrimitive(hoveredPrimitive)
    ? 'Click to select. Drag to reposition.'
    : 'Click to inspect. Use the Inspector for tuning.';
  const anchor = getPrimitiveAnchor(hoveredPrimitive, manifest.primitives, runtime);
  drawPreviewCard(
    instance,
    anchor.x,
    anchor.y,
    labelFor(hoveredPrimitive.kind),
    hoverDetail,
    hoveredPrimitive.id === selectedPrimitiveId ? 'good' : 'info',
  );
}

function drawModeChip(
  instance: p5,
  x: number,
  y: number,
  text: string,
  tone: 'good' | 'info' | 'warn',
) {
  const color = toneColor(tone);
  instance.push();
  instance.textSize(12);
  const width = instance.textWidth(text) + 24;
  instance.noStroke();
  instance.fill(color.fill[0], color.fill[1], color.fill[2], 180);
  instance.rect(x, y, width, 28, 999);
  instance.fill(241, 245, 249, 240);
  instance.textAlign(instance.LEFT, instance.CENTER);
  instance.text(text, x + 12, y + 15);
  instance.pop();
}

function drawPreviewCard(
  instance: p5,
  anchorX: number,
  anchorY: number,
  title: string,
  detail: string,
  tone: 'good' | 'info' | 'warn',
) {
  const color = toneColor(tone);
  const width = 250;
  const height = 62;
  const x = Math.min(instance.width - width - 16, Math.max(16, anchorX + 18));
  const y = Math.min(instance.height - height - 16, Math.max(52, anchorY - height - 10));

  instance.push();
  instance.noStroke();
  instance.fill(6, 14, 20, 228);
  instance.rect(x, y, width, height, 14);
  instance.fill(color.fill[0], color.fill[1], color.fill[2], 255);
  instance.rect(x, y, 6, height, 14, 0, 0, 14);
  instance.fill(241, 245, 249, 255);
  instance.textAlign(instance.LEFT, instance.TOP);
  instance.textSize(12);
  instance.text(title, x + 16, y + 12);
  instance.fill(148, 163, 184, 255);
  instance.textSize(10);
  instance.text(detail, x + 16, y + 30, width - 28);
  instance.pop();
}

function getPlacementAssessment(
  manifest: ExperimentManifest,
  placingKind: PrimitiveKind,
  x: number,
  y: number,
): { tone: 'good' | 'info' | 'warn'; title: string; detail: string } {
  switch (placingKind) {
    case 'gear':
    case 'pulley':
    case 'chain-sprocket':
    case 'flywheel':
      return canWakeRotatingPart(manifest, placingKind, x, y)
        ? {
            tone: 'good',
            title: 'Good placement',
            detail: 'This rotating part is close enough to power or mesh right away.',
          }
        : {
            tone: 'warn',
            title: 'Likely idle here',
            detail: 'Move it inside a motor ring or touching another rotating part if you want motion.',
          };
    case 'wheel':
      return canWakeRotatingPart(manifest, placingKind, x, y)
        ? {
            tone: 'good',
            title: 'Good placement',
            detail: 'This wheel should be able to pick up visible motion.',
          }
        : {
            tone: 'warn',
            title: 'Needs a driver',
            detail: 'Wheels need a motor ring or a gear contact to feel alive.',
          };
    case 'gearbox':
      return {
        tone: 'info',
        title: 'Bridge two sides',
        detail: 'Gearboxes work best when rotating parts sit on both the left and right side.',
      };
    case 'conveyor':
      return hasNearbyMotor(manifest, x, y)
        ? {
            tone: 'good',
            title: 'Ready for throughput',
            detail: 'This conveyor is already near power. Add cargo and a hopper next.',
          }
        : {
            tone: 'info',
            title: 'Good base',
            detail: 'Still fine to place here. Add cargo, a hopper, and maybe a motor nearby.',
          };
    case 'hook':
      return hasKind(manifest, 'winch')
        ? {
            tone: 'good',
            title: 'Ready to hoist',
            detail: 'Use Quick Connect once the hook is where you want it.',
          }
        : {
            tone: 'warn',
            title: 'No winch yet',
            detail: 'This hook will need a winch before it can do much.',
          };
    case 'locomotive':
    case 'wagon':
      return hasKind(manifest, 'rail-segment')
        ? {
            tone: 'warn',
            title: 'Track needs one more step',
            detail: 'After placing, set trackId in the Inspector so it matches a real rail segment.',
          }
        : {
            tone: 'warn',
            title: 'No rail yet',
            detail: 'Place rail first. Then set trackId in the Inspector so this can move.',
          };
    default:
      return {
        tone: 'info',
        title: `Place ${labelFor(placingKind)}`,
        detail: 'Drop it, then test the reaction right away.',
      };
  }
}

function toneColor(tone: 'good' | 'info' | 'warn') {
  switch (tone) {
    case 'good':
      return { stroke: [71, 197, 165] as const, fill: [16, 76, 63] as const };
    case 'warn':
      return { stroke: [251, 191, 36] as const, fill: [87, 55, 12] as const };
    default:
      return { stroke: [96, 165, 250] as const, fill: [24, 50, 84] as const };
  }
}

// ─── Grid ─────────────────────────────────────────────────────────────────────

function drawBackdrop(instance: p5) {
  const ctx = instance.drawingContext as CanvasRenderingContext2D;
  const sky = ctx.createLinearGradient(0, 0, 0, instance.height);
  sky.addColorStop(0, '#dff6ff');
  sky.addColorStop(0.58, '#f9fbef');
  sky.addColorStop(1, '#f3e7c8');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, instance.width, instance.height);

  instance.noStroke();
  instance.fill(255, 245, 196, 170);
  instance.circle(instance.width - 110, 92, 128);
  instance.fill(197, 229, 208, 255);
  instance.rect(-20, instance.height - 130, instance.width + 40, 170);
}

function drawGrid(instance: p5) {
  instance.stroke(58, 118, 134, 42);
  instance.strokeWeight(1);
  for (let x = 0; x < instance.width; x += 32) instance.line(x, 0, x, instance.height);
  for (let y = 0; y < instance.height; y += 32) instance.line(0, y, instance.width, y);
  instance.stroke(255, 255, 255, 70);
  instance.strokeWeight(2);
  instance.line(0, instance.height - 128, instance.width, instance.height - 128);
}

function drawDiagnostics(
  instance: p5,
  manifest: ExperimentManifest,
  runtime: RuntimeSnapshot,
) {
  instance.push();
  instance.textAlign(instance.LEFT, instance.CENTER);
  instance.textSize(10);
  for (const primitive of manifest.primitives) {
    if (primitive.kind !== 'cargo-block') continue;
    const pos = getLivePos(primitive, runtime);
    const state = runtime.cargoStates[primitive.id] ?? 'spawned';
    instance.noStroke();
    instance.fill(15, 23, 42, 180);
    instance.rect(pos.x + 14, pos.y - 22, 74, 18, 8);
    instance.fill(248, 250, 252, 255);
    instance.text(state, pos.x + 22, pos.y - 13);
  }
  instance.pop();
}

// ─── Primitive drawing ────────────────────────────────────────────────────────

function drawPrimitive(
  instance: p5,
  primitive: PrimitiveInstance,
  runtime: RuntimeSnapshot,
  selected: boolean,
  hovered: boolean,
  primitives: PrimitiveInstance[],
  flashTimes: Record<string, number>,
) {
  const highlight = selected ? '#f8fafc' : hovered ? '#8ee4d2' : '#1d4f5f';
  const accent = selected ? '#fbbf24' : hovered ? '#8ee4d2' : '#5eead4';

  // Connection flash ring (expanding circle when part first gets driven)
  const flashStart = flashTimes[primitive.id];
  if (flashStart) {
    const age = Date.now() - flashStart;
    if (age < FLASH_DURATION_MS) {
      const t = age / FLASH_DURATION_MS; // 0→1
      instance.push();
      const pos = getLivePos(primitive, runtime);
      const baseR = isRotatingKind(primitive.kind) ? rotatingRadiusForPrimitive(primitive) : 20;
      const flashR = baseR + t * 40;
      instance.noFill();
      instance.stroke(71, 197, 165, Math.round((1 - t) * 200));
      instance.strokeWeight(2);
      instance.circle(pos.x, pos.y, flashR * 2);
      // Second ring slightly behind
      if (t > 0.2) {
        const t2 = t - 0.2;
        instance.stroke(71, 197, 165, Math.round((1 - t2) * 120));
        instance.circle(pos.x, pos.y, (baseR + t2 * 40) * 2);
      }
      instance.pop();
    }
  }

  instance.push();
  instance.stroke(highlight);
  instance.strokeWeight(selected ? 3 : 2);

  switch (primitive.kind) {
    case 'node': {
      const { x, y } = getLivePos(primitive, runtime);
      instance.fill(accent);
      instance.circle(x, y, 14);
      if (selected) {
        instance.noFill();
        instance.stroke('#fbbf24');
        instance.circle(x, y, 28);
      }
      break;
    }
    case 'beam': {
      const { fromNodeId, toNodeId } = primitive.config as { fromNodeId: string; toNodeId: string };
      const from = findPrimitiveById(primitives, fromNodeId);
      const to = findPrimitiveById(primitives, toNodeId);
      if (from && to) {
        const posA = getLivePos(from, runtime);
        const posB = getLivePos(to, runtime);
        instance.stroke(selected ? '#fbbf24' : '#5eead4');
        instance.strokeWeight(selected ? 4 : 3);
        instance.line(posA.x, posA.y, posB.x, posB.y);
      }
      break;
    }
    case 'motor': {
      const { x, y } = primitive.config as { x: number; y: number };
      const on = (primitive.config as { powerState?: boolean }).powerState;
      instance.fill(selected ? '#1a6a63' : on ? '#134e4a' : '#0f2a27');
      instance.stroke(selected ? '#fbbf24' : highlight);
      instance.rect(x - 28, y - 18, 56, 36, 10);
      instance.noStroke();
      instance.fill(on ? '#e2e8f0' : '#4a5568');
      instance.textAlign(instance.CENTER, instance.CENTER);
      instance.textSize(14);
      instance.text('M', x, y + 1);
      // Power indicator dot
      instance.fill(on ? '#47c5a5' : '#334155');
      instance.circle(x + 16, y - 10, 6);
      break;
    }
    case 'gear': {
      const cfgGear = primitive.config as { x: number; y: number; teeth: number; color: string };
      const { teeth, color } = cfgGear;
      const { x, y } = getLivePos(primitive, runtime);
      const radius = teethToRadius(teeth);
      const angVel = Math.abs(runtime.rotations[primitive.id] ?? 0);
      const isSpinning = angVel > 0.01;
      instance.push();
      instance.translate(x, y);
      instance.rotate(runtime.rotations[primitive.id] ?? 0);
      instance.stroke(selected ? '#fbbf24' : color);
      instance.strokeWeight(selected ? 2.5 : 1.5);
      instance.noFill();
      instance.circle(0, 0, radius * 2);
      for (let i = 0; i < teeth; i += 1) {
        const angle = (Math.PI * 2 * i) / teeth;
        const x1 = Math.cos(angle) * radius;
        const y1 = Math.sin(angle) * radius;
        instance.line(x1, y1, Math.cos(angle) * (radius + 8), Math.sin(angle) * (radius + 8));
      }
      instance.fill(selected ? '#fbbf24' : color);
      instance.noStroke();
      instance.circle(0, 0, 10);
      // Spinning label
      if (isSpinning) {
        instance.fill(255, 255, 255, 120);
        instance.textSize(9);
        instance.textAlign(instance.CENTER, instance.CENTER);
        instance.text('●', 0, 0);
      }
      instance.pop();
      break;
    }
    case 'pulley':
    case 'chain-sprocket': {
      const { x, y } = getLivePos(primitive, runtime);
      const radius = rotatingRadiusForPrimitive(primitive);
      const teeth = primitive.kind === 'chain-sprocket' ? 14 : 0;
      instance.push();
      instance.translate(x, y);
      instance.rotate(runtime.rotations[primitive.id] ?? 0);
      instance.stroke(selected ? '#fbbf24' : '#94a3b8');
      instance.noFill();
      instance.circle(0, 0, radius * 2);
      instance.line(-radius, 0, radius, 0);
      instance.line(0, -radius, 0, radius);
      if (teeth > 0) {
        for (let i = 0; i < teeth; i += 1) {
          const angle = (Math.PI * 2 * i) / teeth;
          instance.line(
            Math.cos(angle) * radius,
            Math.sin(angle) * radius,
            Math.cos(angle) * (radius + 6),
            Math.sin(angle) * (radius + 6),
          );
        }
      }
      instance.pop();
      break;
    }
    case 'flywheel': {
      const { x, y } = getLivePos(primitive, runtime);
      const radius = rotatingRadiusForPrimitive(primitive);
      instance.push();
      instance.translate(x, y);
      instance.rotate(runtime.rotations[primitive.id] ?? 0);
      instance.stroke(selected ? '#fbbf24' : '#64748b');
      instance.strokeWeight(selected ? 3 : 2);
      instance.noFill();
      instance.circle(0, 0, radius * 2);
      instance.circle(0, 0, radius * 1.3);
      instance.line(-radius, 0, radius, 0);
      instance.line(0, -radius, 0, radius);
      instance.pop();
      break;
    }
    case 'gearbox': {
      const { x, y } = primitive.config as { x: number; y: number };
      instance.fill(selected ? '#fbbf24' : '#475569');
      instance.stroke(selected ? '#fbbf24' : highlight);
      instance.rect(x - 24, y - 16, 48, 32, 8);
      instance.noFill();
      instance.circle(x - 10, y, 12);
      instance.circle(x + 10, y, 12);
      break;
    }
    case 'wheel': {
      const cfgWheel = primitive.config as { radius: number };
      const { x: wx, y: wy } = getLivePos(primitive, runtime);
      const wRadius = cfgWheel.radius ?? 28;
      instance.push();
      instance.translate(wx, wy);
      instance.rotate(runtime.rotations[primitive.id] ?? 0);
      instance.stroke(selected ? '#fbbf24' : '#94a3b8');
      instance.noFill();
      instance.circle(0, 0, wRadius * 2);
      instance.line(-wRadius, 0, wRadius, 0);
      instance.line(0, -wRadius, 0, wRadius);
      instance.line(-wRadius * 0.7, -wRadius * 0.7, wRadius * 0.7, wRadius * 0.7);
      instance.line(-wRadius * 0.7, wRadius * 0.7, wRadius * 0.7, -wRadius * 0.7);
      instance.pop();
      break;
    }
    case 'axle': {
      const { x, y } = getLivePos(primitive, runtime);
      instance.fill(selected ? '#fbbf24' : '#64748b');
      instance.stroke(selected ? '#fbbf24' : '#94a3b8');
      instance.circle(x, y, 10);
      instance.strokeWeight(3);
      instance.line(x - 18, y, x + 18, y);
      break;
    }
    case 'conveyor': {
      const { path, speed } = primitive.config as { path: Array<{ x: number; y: number }>; speed: number };
      // Belt track
      instance.stroke(selected ? '#fbbf24' : '#3dd5a1');
      instance.strokeWeight(selected ? 10 : 8);
      for (let i = 0; i < path.length - 1; i += 1) {
        instance.line(path[i].x, path[i].y, path[i + 1].x, path[i + 1].y);
      }
      // Animated chevrons showing belt motion — spacing and offset driven by time
      if (path.length >= 2) {
        const ctx2 = instance.drawingContext as CanvasRenderingContext2D;
        const effectiveSpeed = Math.max(0, speed);
        const chevronSpacing = 38;
        const animOffset = ((Date.now() * effectiveSpeed * 0.0015) % chevronSpacing);
        instance.push();
        for (let i = 0; i < path.length - 1; i += 1) {
          const ax = path[i].x;
          const ay = path[i].y;
          const bx = path[i + 1].x;
          const by = path[i + 1].y;
          const segLen = Math.hypot(bx - ax, by - ay);
          const ux = (bx - ax) / segLen;
          const uy = (by - ay) / segLen;
          // perpendicular
          const px2 = -uy;
          const py2 = ux;
          let along = animOffset;
          while (along < segLen) {
            const cx2 = ax + ux * along;
            const cy2 = ay + uy * along;
            // chevron: two short lines meeting at a point
            const size = 5;
            ctx2.setLineDash([]);
            instance.stroke(selected ? '#b45309' : '#1a4a3c');
            instance.strokeWeight(2);
            instance.line(cx2 - ux * size - px2 * size, cy2 - uy * size - py2 * size, cx2, cy2);
            instance.line(cx2, cy2, cx2 - ux * size + px2 * size, cy2 - uy * size + py2 * size);
            along += chevronSpacing;
          }
        }
        instance.pop();
      }
      // Speed label when selected
      if (selected) {
        instance.noStroke();
        instance.fill(61, 213, 161, 180);
        instance.textSize(10);
        instance.textAlign(instance.CENTER, instance.BOTTOM);
        const mid = path[Math.floor(path.length / 2)];
        instance.text(`speed: ${speed}`, mid.x, mid.y - 8);
      }
      break;
    }
    case 'hopper': {
      const { x, y } = primitive.config as { x: number; y: number };
      const fill = runtime.hopperFill;
      instance.stroke(selected ? '#fbbf24' : '#fec84b');
      instance.strokeWeight(selected ? 3 : 2);
      instance.noFill();
      instance.quad(x - 40, y - 10, x + 40, y - 10, x + 24, y + 60, x - 24, y + 60);
      // Fill level
      instance.noStroke();
      instance.fill(254, 200, 75, 160);
      instance.rect(x - 24, y + 60 - Math.min(48, fill * 5), 48, Math.min(48, fill * 5));
      // Fill count
      instance.fill(254, 200, 75, 220);
      instance.textSize(fill > 0 ? 12 : 10);
      instance.textAlign(instance.CENTER, instance.CENTER);
      instance.text(fill > 0 ? `${Math.round(fill)}` : 'empty', x, y + 35);
      break;
    }
    case 'cargo-block': {
      const progress = runtime.cargoProgress[primitive.id];
      const cargoState = runtime.cargoStates[primitive.id] ?? 'spawned';
      let cx: number;
      let cy: number;
      if (progress !== undefined) {
        cx = 260 + 500 * progress;
        cy = 460;
      } else {
        const pos = getLivePos(primitive, runtime);
        cx = pos.x;
        cy = pos.y;
      }
      const cargoFill = cargoState === 'collected'
        ? '#f59e0b'
        : cargoState === 'respawned'
          ? '#93c5fd'
          : cargoState === 'supported'
            ? '#f8fafc'
            : '#cbd5e1';
      instance.fill(selected ? '#fbbf24' : cargoFill);
      instance.stroke(selected ? '#fbbf24' : highlight);
      instance.rect(cx - 12, cy - 12, 24, 24, 4);
      break;
    }
    case 'winch': {
      const { x, y } = primitive.config as { x: number; y: number };
      instance.fill(selected ? '#374151' : '#1f2937');
      instance.stroke(selected ? '#fbbf24' : highlight);
      instance.rect(x - 20, y - 20, 40, 40, 8);
      instance.stroke('#f59e0b');
      instance.noFill();
      instance.circle(x, y, 16);
      instance.fill('#f59e0b');
      instance.noStroke();
      instance.circle(x, y, 6);
      break;
    }
    case 'hook': {
      const config = primitive.config as { x: number; y: number };
      const phys = runtime.bodyPositions?.[primitive.id];
      const hx = phys ? phys.x : config.x;
      const hy = phys ? phys.y : (runtime.hookY || config.y);
      const winchPrim = primitives.find((p) => p.kind === 'winch');
      const wx = winchPrim ? (winchPrim.config as { x: number }).x : config.x;
      const wy = winchPrim ? (winchPrim.config as { y: number }).y : config.y;
      instance.stroke('#f59e0b');
      instance.strokeWeight(2);
      instance.line(wx, wy, hx, hy);
      instance.noFill();
      instance.stroke(selected ? '#fbbf24' : '#94a3b8');
      instance.strokeWeight(selected ? 3 : 2);
      instance.arc(hx, hy, 24, 28, 0, Math.PI);
      break;
    }
    case 'rope': {
      const config = primitive.config as { fromId: string; toId: string };
      const from = findPrimitiveById(primitives, config.fromId);
      const to = findPrimitiveById(primitives, config.toId);
      if (from && to) {
        const posA = getLivePos(from, runtime);
        const phys = runtime.bodyPositions?.[to.id];
        const toY = to.kind === 'hook' ? (phys?.y ?? runtime.hookY) : getLivePos(to, runtime).y;
        const toX = to.kind === 'hook' ? (phys?.x ?? getLivePos(to, runtime).x) : getLivePos(to, runtime).x;
        instance.stroke(selected ? '#fbbf24' : '#f8fafc');
        instance.strokeWeight(selected ? 3 : 1.5);
        instance.line(posA.x, posA.y, toX, toY);
      }
      break;
    }
    case 'rail-segment': {
      const { points } = primitive.config as { points: Array<{ x: number; y: number }> };
      instance.stroke(selected ? '#fbbf24' : '#475569');
      instance.strokeWeight(4);
      for (let i = 0; i < points.length - 1; i += 1) {
        const steps = 6;
        for (let t = 0; t <= steps; t += 1) {
          const fx = points[i].x + (points[i + 1].x - points[i].x) * (t / steps);
          const fy = points[i].y + (points[i + 1].y - points[i].y) * (t / steps);
          const angle = Math.atan2(points[i + 1].y - points[i].y, points[i + 1].x - points[i].x) + Math.PI / 2;
          instance.line(
            fx + Math.cos(angle) * 8, fy + Math.sin(angle) * 8,
            fx - Math.cos(angle) * 8, fy - Math.sin(angle) * 8,
          );
        }
      }
      instance.stroke(selected ? '#fbbf24' : '#94a3b8');
      instance.strokeWeight(6);
      for (let i = 0; i < points.length - 1; i += 1) {
        instance.line(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y);
      }
      break;
    }
    case 'rail-switch': {
      const { x, y, branch } = primitive.config as { x: number; y: number; branch: 'left' | 'right' };
      const color = branch === 'right' ? '#60a5fa' : '#f59e0b';
      instance.fill(selected ? '#fbbf24' : color);
      instance.stroke(selected ? '#fbbf24' : highlight);
      instance.circle(x, y, 20);
      instance.noStroke();
      instance.fill('#0f172a');
      instance.textSize(10);
      instance.textAlign(instance.CENTER, instance.CENTER);
      instance.text(branch === 'right' ? '→' : '←', x, y);
      break;
    }
    case 'locomotive': {
      const track = primitives.find((item) => item.id === (primitive.config as { trackId: string }).trackId);
      const point = getTrackPoint(track, runtime.trainProgress);
      instance.fill(selected ? '#fbbf24' : '#ef7b45');
      instance.stroke(selected ? '#fbbf24' : highlight);
      instance.rect(point.x - 22, point.y - 18, 44, 24, 6);
      instance.noStroke();
      instance.fill('#0f172a');
      instance.textSize(10);
      instance.textAlign(instance.CENTER, instance.CENTER);
      instance.text('🚂', point.x, point.y);
      break;
    }
    case 'wagon': {
      const track = primitives.find((item) => item.id === (primitive.config as { trackId: string }).trackId);
      const offset = (primitive.config as { offset: number }).offset;
      const point = getTrackPoint(track, Math.max(0, runtime.trainProgress + offset));
      instance.fill(selected ? '#fbbf24' : '#94a3b8');
      instance.stroke(selected ? '#fbbf24' : highlight);
      instance.rect(point.x - 18, point.y - 16, 36, 20, 6);
      break;
    }
    case 'material-pile': {
      const { x, y, quantity } = primitive.config as { x: number; y: number; quantity: number };
      instance.noStroke();
      instance.fill(selected ? '#fbbf2488' : '#64748b');
      instance.triangle(x - 50, y + 30, x, y - 30, x + 50, y + 30);
      instance.stroke(selected ? '#fbbf24' : '#94a3b8');
      instance.strokeWeight(1);
      instance.noFill();
      instance.triangle(x - 50, y + 30, x, y - 30, x + 50, y + 30);
      if (selected) {
        instance.noStroke();
        instance.fill('#fbbf24');
        instance.textSize(10);
        instance.textAlign(instance.CENTER, instance.CENTER);
        instance.text(`qty: ${quantity}`, x, y + 20);
      }
      break;
    }
    // ---- NEW PARTS (Phase 1) ----
    case 'ramp':
    case 'platform': {
      const cfg = primitive.config as { x: number; y: number; width?: number; angle?: number };
      instance.push();
      instance.translate(cfg.x, cfg.y);
      instance.rotate(((cfg.angle ?? 0) * Math.PI) / 180);
      instance.fill(selected ? 100 : 140, 110, 80);
      instance.stroke(selected ? '#fbbf24' : highlight);
      instance.rectMode(instance.CENTER);
      instance.rect(0, 0, cfg.width ?? 120, 12, 2);
      instance.pop();
      break;
    }
    case 'wall': {
      const cfg = primitive.config as { x: number; y: number; height?: number };
      instance.push();
      instance.translate(cfg.x, cfg.y);
      instance.fill(selected ? 100 : 120, 110, 100);
      instance.stroke(selected ? '#fbbf24' : highlight);
      instance.rectMode(instance.CENTER);
      instance.rect(0, 0, 12, cfg.height ?? 80, 2);
      instance.pop();
      break;
    }
    case 'ball': {
      const pos = runtime.bodyPositions?.[primitive.id] ?? (primitive.config as { x: number; y: number });
      const radius = (primitive.config as { radius?: number }).radius ?? 12;
      instance.fill(selected ? 200 : 220, 80, 60);
      instance.stroke(selected ? '#fbbf24' : highlight);
      instance.circle(pos.x, pos.y, radius * 2);
      break;
    }
    case 'rock': {
      const pos = runtime.bodyPositions?.[primitive.id] ?? (primitive.config as { x: number; y: number });
      instance.fill(selected ? 160 : 100, 95, 90);
      instance.stroke(selected ? '#fbbf24' : highlight);
      instance.circle(pos.x, pos.y, 32);
      break;
    }
    default:
      if ('x' in primitive.config && 'y' in primitive.config) {
        const { x: dx, y: dy } = getLivePos(primitive, runtime);
        instance.fill(accent);
        instance.circle(dx, dy, 16);
      }
  }

  instance.pop();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getLivePos(primitive: PrimitiveInstance, runtime: RuntimeSnapshot): { x: number; y: number } {
  const phys = runtime.bodyPositions?.[primitive.id];
  if (phys) return { x: phys.x, y: phys.y };
  if ('x' in primitive.config && 'y' in primitive.config) {
    return {
      x: (primitive.config as { x: number; y: number }).x,
      y: (primitive.config as { x: number; y: number }).y,
    };
  }
  return { x: 0, y: 0 };
}

function getTrackPoint(track: PrimitiveInstance | undefined, progress: number) {
  if (!track || track.kind !== 'rail-segment') return { x: 0, y: 0 };
  const points = (track.config as { points: Array<{ x: number; y: number }> }).points;
  if (points.length < 2) return points[0] ?? { x: 0, y: 0 };
  const clamped = Math.max(0, Math.min(0.999, progress));
  const seg = Math.min(points.length - 2, Math.floor(clamped * (points.length - 1)));
  const t = clamped * (points.length - 1) - seg;
  const a = points[seg];
  const b = points[seg + 1];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function hitTest(
  primitives: PrimitiveInstance[],
  x: number,
  y: number,
  runtime: RuntimeSnapshot,
) {
  return [...primitives].reverse().find((primitive) => {
    switch (primitive.kind) {
      case 'beam':
      case 'rope':
        return false;
      case 'rail-segment': {
        const points = (primitive.config as { points: Array<{ x: number; y: number }> }).points;
        return distanceToPolyline(points, x, y) < 26;
      }
      case 'conveyor': {
        const path = (primitive.config as { path: Array<{ x: number; y: number }> }).path;
        return distanceToPolyline(path, x, y) < 26;
      }
      case 'locomotive': {
        const track = primitives.find((item) => item.id === (primitive.config as { trackId: string }).trackId);
        const point = getTrackPoint(track, runtime.trainProgress);
        return Math.abs(point.x - x) < 26 && Math.abs(point.y - y) < 22;
      }
      case 'wagon': {
        const track = primitives.find((item) => item.id === (primitive.config as { trackId: string }).trackId);
        const offset = (primitive.config as { offset: number }).offset;
        const point = getTrackPoint(track, Math.max(0, runtime.trainProgress + offset));
        return Math.abs(point.x - x) < 22 && Math.abs(point.y - y) < 20;
      }
      default: {
        const phys = runtime.bodyPositions?.[primitive.id];
        const px = phys ? phys.x : ('x' in primitive.config ? (primitive.config as { x: number }).x : null);
        const py = phys ? phys.y : ('y' in primitive.config ? (primitive.config as { y: number }).y : null);
        if (px === null || py === null) return false;
        return Math.hypot(px - x, py - y) < 36;
      }
    }
  });
}

function getPrimitiveAnchor(
  primitive: PrimitiveInstance,
  primitives: PrimitiveInstance[],
  runtime: RuntimeSnapshot,
) {
  if ('x' in primitive.config && 'y' in primitive.config) {
    return getLivePos(primitive, runtime);
  }
  if ('path' in primitive.config) {
    const path = (primitive.config as { path: Array<{ x: number; y: number }> }).path;
    return averagePoint(path);
  }
  if ('points' in primitive.config) {
    const points = (primitive.config as { points: Array<{ x: number; y: number }> }).points;
    return averagePoint(points);
  }
  if (primitive.kind === 'locomotive') {
    const track = primitives.find((item) => item.id === (primitive.config as { trackId: string }).trackId);
    return getTrackPoint(track, runtime.trainProgress);
  }
  if (primitive.kind === 'wagon') {
    const track = primitives.find((item) => item.id === (primitive.config as { trackId: string }).trackId);
    const offset = (primitive.config as { offset: number }).offset;
    return getTrackPoint(track, Math.max(0, runtime.trainProgress + offset));
  }
  return { x: 0, y: 0 };
}

function isDraggablePrimitive(primitive: PrimitiveInstance) {
  return 'x' in primitive.config && 'y' in primitive.config
    || 'path' in primitive.config
    || 'points' in primitive.config;
}

function distanceToPolyline(points: Array<{ x: number; y: number }>, x: number, y: number) {
  if (points.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  if (points.length === 1) {
    return Math.hypot(points[0].x - x, points[0].y - y);
  }

  let closest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length - 1; index += 1) {
    closest = Math.min(closest, distanceToSegment(points[index], points[index + 1], x, y));
  }
  return closest;
}

function distanceToSegment(
  start: { x: number; y: number },
  end: { x: number; y: number },
  x: number,
  y: number,
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  if (dx === 0 && dy === 0) {
    return Math.hypot(x - start.x, y - start.y);
  }

  const t = Math.max(0, Math.min(1, ((x - start.x) * dx + (y - start.y) * dy) / (dx * dx + dy * dy)));
  const px = start.x + dx * t;
  const py = start.y + dy * t;
  return Math.hypot(px - x, py - y);
}

// ─── Drag shadow manifest ─────────────────────────────────────────────────────
// Creates a lightweight clone of the manifest with the dragging part's position
// updated to the buffered cursor position. All drawing uses this so the part
// tracks the cursor without triggering a physics world rebuild per frame.
function applyDragToManifest(
  manifest: ExperimentManifest,
  drag: { id: string; x: number; y: number },
): ExperimentManifest {
  return {
    ...manifest,
    primitives: manifest.primitives.map((p) => {
      if (p.id !== drag.id) return p;
      if ('x' in p.config && 'y' in p.config) {
        return { ...p, config: { ...p.config, x: drag.x, y: drag.y } };
      }
      if ('path' in p.config) {
        const path = (p.config as { path: Array<{ x: number; y: number }> }).path;
        const anchor = averagePoint(path);
        const dx = drag.x - anchor.x;
        const dy = drag.y - anchor.y;
        return { ...p, config: { ...p.config, path: path.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })) } };
      }
      if ('points' in p.config) {
        const points = (p.config as { points: Array<{ x: number; y: number }> }).points;
        const anchor = averagePoint(points);
        const dx = drag.x - anchor.x;
        const dy = drag.y - anchor.y;
        return { ...p, config: { ...p.config, points: points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })) } };
      }
      return p;
    }),
  };
}

function averagePoint(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) {
    return { x: 0, y: 0 };
  }

  const total = points.reduce(
    (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }),
    { x: 0, y: 0 },
  );

  return {
    x: total.x / points.length,
    y: total.y / points.length,
  };
}

function hasKind(manifest: ExperimentManifest, kind: PrimitiveKind) {
  return manifest.primitives.some((primitive) => primitive.kind === kind);
}

function hasNearbyMotor(manifest: ExperimentManifest, x: number, y: number) {
  return manifest.primitives.some((primitive) => {
    if (primitive.kind !== 'motor') {
      return false;
    }
    const config = primitive.config as { x: number; y: number };
    return Math.hypot(config.x - x, config.y - y) < CONVEYOR_MOTOR_RANGE;
  });
}

function canWakeRotatingPart(
  manifest: ExperimentManifest,
  placingKind: PrimitiveKind,
  x: number,
  y: number,
) {
  const nearMotor = manifest.primitives.some((primitive) => {
    if (primitive.kind !== 'motor') {
      return false;
    }
    const config = primitive.config as { x: number; y: number };
    return Math.hypot(config.x - x, config.y - y) < MOTOR_RANGE;
  });

  if (nearMotor) {
    return true;
  }

  return manifest.primitives.some((primitive) => {
    if (!isRotatingKind(primitive.kind)) {
      return false;
    }

    const anchor = primitive.config as { x: number; y: number };
    const radius = rotatingRadiusForPrimitive(primitive);
    const nextRadius = placementRadiusForKind(placingKind);
    return Math.hypot(anchor.x - x, anchor.y - y) <= radius + nextRadius + 16;
  });
}

function labelFor(kind: PrimitiveKind): string {
  switch (kind) {
    case 'rail-segment': return 'Rail';
    case 'rail-switch':  return 'Switch';
    case 'cargo-block':  return 'Cargo Block';
    case 'material-pile': return 'Material Pile';
    default: return kind.split('-').map((s) => s[0].toUpperCase() + s.slice(1)).join(' ');
  }
}
