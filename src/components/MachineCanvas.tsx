import { useEffect, useRef } from 'react';
import p5 from 'p5';
import type { BuildTelemetry, ExperimentManifest, PrimitiveInstance, PrimitiveKind } from '../lib/types';
import { findPrimitiveById, type RuntimeSnapshot } from '../lib/simulation';

// Mirrors physics-engine.ts — kept in sync with that constant.
const teethToRadius = (teeth: number) => Math.max(24, teeth * 1.4);
const MOTOR_RANGE = 220;       // px — must match physics-engine motorGearMap distance
const CONVEYOR_MOTOR_RANGE = 300; // px — must match physics-engine conveyorMotorRpm distance
const FLASH_DURATION_MS = 900; // how long a connection flash glows

interface MachineCanvasProps {
  manifest: ExperimentManifest;
  runtime: RuntimeSnapshot;
  selectedPrimitiveId?: string;
  placingKind?: PrimitiveKind | null;
  activeJobHint?: string;
  onPlacePrimitive: (x: number, y: number) => void;
  onSelectPrimitive: (primitiveId?: string) => void;
  onMovePrimitive: (primitiveId: string, x: number, y: number) => void;
  onTelemetry: (telemetry: BuildTelemetry) => void;
  onConnectionFlash?: (ids: string[]) => void;
}

export function MachineCanvas({
  manifest,
  runtime,
  selectedPrimitiveId,
  placingKind,
  activeJobHint,
  onPlacePrimitive,
  onSelectPrimitive,
  onMovePrimitive,
  onTelemetry,
  onConnectionFlash,
}: MachineCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  // Refs keep the sketch alive while props change
  const manifestRef = useRef(manifest);
  const runtimeRef = useRef(runtime);
  const selectedRef = useRef(selectedPrimitiveId);
  const placingRef = useRef(placingKind);
  const onPlaceRef = useRef(onPlacePrimitive);
  const onSelectRef = useRef(onSelectPrimitive);
  const onMoveRef = useRef(onMovePrimitive);
  const onTelemetryRef = useRef(onTelemetry);
  const onConnectionFlashRef = useRef(onConnectionFlash);
  const draggingIdRef = useRef<string | undefined>(undefined);

  // Flash state: partId → timestamp when connection was first detected
  const flashTimesRef = useRef<Record<string, number>>({});
  // Previous motorDrives snapshot for change detection
  const prevDrivesRef = useRef<Record<string, string[]>>({});

  // Sync all refs every render (cheap, no extra effect)
  manifestRef.current = manifest;
  runtimeRef.current = runtime;
  selectedRef.current = selectedPrimitiveId;
  placingRef.current = placingKind;
  onPlaceRef.current = onPlacePrimitive;
  onSelectRef.current = onSelectPrimitive;
  onMoveRef.current = onMovePrimitive;
  onTelemetryRef.current = onTelemetry;
  onConnectionFlashRef.current = onConnectionFlash;

  useEffect(() => {
    if (!hostRef.current) return;

    const sketch = new p5((instance) => {
      instance.setup = () => {
        instance.createCanvas(960, 560);
        instance.frameRate(60);
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

        drawScene(
          instance,
          manifestRef.current,
          runtimeRef.current,
          selectedRef.current,
          placingRef.current,
          flashTimesRef.current,
        );
        onTelemetryRef.current(runtimeRef.current.telemetry);
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
          runtimeRef.current.bodyPositions,
        );
        draggingIdRef.current = hit?.id;
        onSelectRef.current(hit?.id);
      };

      instance.mouseDragged = () => {
        if (!draggingIdRef.current) return;
        onMoveRef.current(draggingIdRef.current, instance.mouseX, instance.mouseY);
      };

      instance.mouseReleased = () => {
        draggingIdRef.current = undefined;
      };
    }, hostRef.current);

    return () => { sketch.remove(); };
  }, []); // intentionally empty

  const hint = (() => {
    if (placingKind) return `Click canvas to place ${labelFor(placingKind)}`;
    const sel = manifest.primitives.find((p) => p.id === selectedPrimitiveId);
    if (!sel) return 'Click a part to select · Drag to reposition';
    switch (sel.kind) {
      case 'motor':    return 'Motor — place a Gear or Wheel inside the green ring to drive it';
      case 'gear':     return 'Gear — place another Gear or Wheel touching this one to mesh them';
      case 'wheel':    return 'Wheel — inside Motor range it spins · touching a Gear it meshes';
      case 'conveyor': return 'Conveyor — place Cargo Blocks on it · Motor within 300px boosts speed';
      case 'hopper':   return 'Hopper — drop Cargo Blocks above it to fill up';
      case 'winch':    return 'Winch — place a Hook below, then Quick Connect → Winch to Hook';
      case 'node':     return 'Node — place another Node then Quick Connect → Beam';
      case 'hook':     return 'Hook — Quick Connect to attach it to a Winch';
      case 'locomotive': return 'Locomotive — place Rail Segment, set its trackId in the Inspector';
      default:         return `${sel.label ?? sel.kind} — drag to move · Inspector to adjust`;
    }
  })();

  const status = manifest.metadata.recipeId
    ? `Recipe: ${manifest.metadata.recipeId}`
    : 'Free Build — Physics Active';

  return (
    <div className="machine-canvas-shell">
      <div className="machine-canvas-toolbar">
        <span>{status}</span>
        <span className="canvas-hint">{hint}</span>
      </div>
      {activeJobHint && (
        <div className="canvas-job-hint">
          <span className="canvas-job-hint-icon">→</span>
          {activeJobHint}
        </div>
      )}
      <div className="machine-canvas" ref={hostRef} />
    </div>
  );
}

// ─── Scene ────────────────────────────────────────────────────────────────────

function drawScene(
  instance: p5,
  manifest: ExperimentManifest,
  runtime: RuntimeSnapshot,
  selectedPrimitiveId: string | undefined,
  placingKind: PrimitiveKind | null | undefined,
  flashTimes: Record<string, number>,
) {
  instance.background(7, 14, 22);
  drawGrid(instance);
  drawRecipeDecor(instance, manifest.metadata.recipeId ?? '');

  if (!manifest.metadata.recipeId) {
    drawConnectionOverlay(instance, manifest, runtime, selectedPrimitiveId, placingKind, instance.mouseX, instance.mouseY);
  }

  for (const primitive of manifest.primitives) {
    const selected = primitive.id === selectedPrimitiveId;
    drawPrimitive(instance, primitive, runtime, selected, manifest.primitives, flashTimes);
  }

  // Gear/wheel placement preview
  if ((placingKind === 'gear' || placingKind === 'wheel') &&
      instance.mouseX >= 0 && instance.mouseX <= instance.width &&
      instance.mouseY >= 0 && instance.mouseY <= instance.height) {
    drawPlacingPreview(instance, manifest, placingKind, instance.mouseX, instance.mouseY);
  }

  drawGoalZones(instance, manifest.metadata.recipeId ?? '', runtime);
}

// ─── Connection overlay ───────────────────────────────────────────────────────

function drawConnectionOverlay(
  instance: p5,
  manifest: ExperimentManifest,
  runtime: RuntimeSnapshot,
  selectedPrimitiveId: string | undefined,
  placingKind: PrimitiveKind | null | undefined,
  mouseX: number,
  mouseY: number,
) {
  instance.push();
  const ctx = instance.drawingContext as CanvasRenderingContext2D;
  const isPlacingRotating = placingKind === 'gear' || placingKind === 'wheel';

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
        return cCfg.path.some((pt) => Math.hypot(pt.x - x, pt.y - y) < CONVEYOR_MOTOR_RANGE);
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
        instance.text('Place a Gear or Wheel in this ring', x, y + 26);
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
      for (const pt of [cCfg.path[0], cCfg.path[cCfg.path.length - 1]]) {
        instance.noFill();
        instance.stroke(245, 158, 11, 30);
        instance.strokeWeight(1);
        ctx.setLineDash([3, 8]);
        instance.circle(pt.x, pt.y, CONVEYOR_MOTOR_RANGE * 2);
        ctx.setLineDash([]);
      }
    }

    // ── Gear / Wheel mesh lines ─────────────────────────────────────────────
    if (prim.kind === 'gear' || prim.kind === 'wheel') {
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
        const existingRadius = prim.kind === 'gear'
          ? teethToRadius((prim.config as { teeth: number }).teeth)
          : ((prim.config as { radius?: number }).radius ?? 28);
        // Default new gear radius (teeth=20 → 28px, wheel default 28px)
        const newRadius = placingKind === 'gear' ? teethToRadius(20) : 28;
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
  instance.push();
  instance.noFill();

  if (placingKind === 'gear') {
    const radius = teethToRadius(20); // default teeth
    // Check if inside any motor range
    const inRange = manifest.primitives.some((p) => {
      if (p.kind !== 'motor') return false;
      const cfg = p.config as { x: number; y: number };
      return Math.hypot(cfg.x - mx, cfg.y - my) < MOTOR_RANGE;
    });
    instance.stroke(inRange ? 71 : 148, inRange ? 197 : 163, inRange ? 165 : 163, inRange ? 180 : 100);
    instance.strokeWeight(inRange ? 2 : 1.5);
    instance.circle(mx, my, radius * 2);
    // Tooth stubs
    for (let i = 0; i < 20; i++) {
      const a = (Math.PI * 2 * i) / 20;
      instance.line(Math.cos(a) * radius + mx, Math.sin(a) * radius + my,
                    Math.cos(a) * (radius + 7) + mx, Math.sin(a) * (radius + 7) + my);
    }
  } else if (placingKind === 'wheel') {
    const radius = 28;
    const inRange = manifest.primitives.some((p) => {
      if (p.kind !== 'motor') return false;
      const cfg = p.config as { x: number; y: number };
      return Math.hypot(cfg.x - mx, cfg.y - my) < MOTOR_RANGE;
    });
    instance.stroke(inRange ? 96 : 148, inRange ? 165 : 163, inRange ? 234 : 163, inRange ? 180 : 100);
    instance.strokeWeight(inRange ? 2 : 1.5);
    instance.circle(mx, my, radius * 2);
    instance.line(mx - radius, my, mx + radius, my);
    instance.line(mx, my - radius, mx, my + radius);
  }

  instance.pop();
}

// ─── Grid ─────────────────────────────────────────────────────────────────────

function drawGrid(instance: p5) {
  instance.stroke(24, 42, 58, 80);
  instance.strokeWeight(1);
  for (let x = 0; x < instance.width; x += 32) instance.line(x, 0, x, instance.height);
  for (let y = 0; y < instance.height; y += 32) instance.line(0, y, instance.width, y);
}

function drawRecipeDecor(instance: p5, recipeId: string) {
  instance.noStroke();
  if (recipeId === 'conveyor-loader') {
    instance.fill(18, 28, 34);
    instance.rect(0, 470, instance.width, 90);
  }
  if (recipeId === 'rail-cart-loop') {
    instance.fill(15, 23, 28);
    instance.rect(0, 400, instance.width, 160);
  }
}

function drawGoalZones(instance: p5, recipeId: string, runtime: RuntimeSnapshot) {
  if (recipeId === 'winch-crane') {
    instance.noFill();
    instance.stroke(runtime.telemetry.loadPlaced ? '#4ade80' : '#fbbf24');
    instance.strokeWeight(3);
    instance.rect(760, 210, 120, 60, 8);
  }
  if (recipeId === 'rail-cart-loop') {
    instance.noFill();
    instance.stroke(runtime.telemetry.wagonDelivered ? '#4ade80' : '#60a5fa');
    instance.strokeWeight(3);
    instance.rect(840, 280, 90, 90, 8);
  }
}

// ─── Primitive drawing ────────────────────────────────────────────────────────

function drawPrimitive(
  instance: p5,
  primitive: PrimitiveInstance,
  runtime: RuntimeSnapshot,
  selected: boolean,
  primitives: PrimitiveInstance[],
  flashTimes: Record<string, number>,
) {
  const highlight = selected ? '#f8fafc' : '#1d4f5f';
  const accent = selected ? '#fbbf24' : '#5eead4';

  // Connection flash ring (expanding circle when part first gets driven)
  const flashStart = flashTimes[primitive.id];
  if (flashStart) {
    const age = Date.now() - flashStart;
    if (age < FLASH_DURATION_MS) {
      const t = age / FLASH_DURATION_MS; // 0→1
      instance.push();
      const pos = getLivePos(primitive, runtime);
      const baseR = primitive.kind === 'gear'
        ? teethToRadius((primitive.config as { teeth: number }).teeth)
        : (primitive.kind === 'wheel' ? ((primitive.config as { radius?: number }).radius ?? 28) : 20);
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
      instance.stroke(selected ? '#fbbf24' : '#3dd5a1');
      instance.strokeWeight(selected ? 10 : 8);
      for (let i = 0; i < path.length - 1; i += 1) {
        instance.line(path[i].x, path[i].y, path[i + 1].x, path[i + 1].y);
      }
      // Arrow showing direction
      if (path.length >= 2) {
        const mx = (path[0].x + path[1].x) / 2;
        const my = (path[0].y + path[1].y) / 2;
        const dx = path[1].x - path[0].x;
        const dy = path[1].y - path[0].y;
        const len = Math.hypot(dx, dy);
        if (len > 0) {
          instance.stroke('#1a3a32');
          instance.strokeWeight(2);
          const nx = (dx / len) * 10;
          const ny = (dy / len) * 10;
          instance.line(mx - nx, my - ny, mx + nx, my + ny);
          instance.line(mx + nx, my + ny, mx + nx - ny * 0.5, my + ny + nx * 0.5);
          instance.line(mx + nx, my + ny, mx + nx + ny * 0.5, my + ny - nx * 0.5);
        }
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
      instance.fill(selected ? '#fbbf24' : '#cbd5e1');
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
  bodyPositions?: Record<string, { x: number; y: number; angle: number }>,
) {
  return [...primitives].reverse().find((primitive) => {
    switch (primitive.kind) {
      case 'beam':
      case 'rail-segment':
      case 'conveyor':
      case 'rope':
      case 'locomotive':
      case 'wagon':
        return false;
      default: {
        const phys = bodyPositions?.[primitive.id];
        const px = phys ? phys.x : ('x' in primitive.config ? (primitive.config as { x: number }).x : null);
        const py = phys ? phys.y : ('y' in primitive.config ? (primitive.config as { y: number }).y : null);
        if (px === null || py === null) return false;
        return Math.hypot(px - x, py - y) < 28;
      }
    }
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
