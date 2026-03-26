import { useEffect, useMemo, useRef } from 'react';
import p5 from 'p5';
import type { BuildTelemetry, ExperimentManifest, PrimitiveInstance, PrimitiveKind } from '../lib/types';
import { findPrimitiveById, type RuntimeSnapshot } from '../lib/simulation';

interface MachineCanvasProps {
  manifest: ExperimentManifest;
  runtime: RuntimeSnapshot;
  selectedPrimitiveId?: string;
  placingKind?: PrimitiveKind | null;
  onPlacePrimitive: (x: number, y: number) => void;
  onSelectPrimitive: (primitiveId?: string) => void;
  onMovePrimitive: (primitiveId: string, x: number, y: number) => void;
  onTelemetry: (telemetry: BuildTelemetry) => void;
}

export function MachineCanvas({
  manifest,
  runtime,
  selectedPrimitiveId,
  placingKind,
  onPlacePrimitive,
  onSelectPrimitive,
  onMovePrimitive,
  onTelemetry,
}: MachineCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  // All volatile state as refs so the sketch is NEVER recreated.
  // Direct assignment in the function body keeps them current without useEffect.
  const manifestRef = useRef(manifest);
  const runtimeRef = useRef(runtime);
  const selectedRef = useRef(selectedPrimitiveId);
  const placingRef = useRef(placingKind);
  const onPlaceRef = useRef(onPlacePrimitive);
  const onSelectRef = useRef(onSelectPrimitive);
  const onMoveRef = useRef(onMovePrimitive);
  const onTelemetryRef = useRef(onTelemetry);
  const draggingIdRef = useRef<string | undefined>(undefined);

  // Sync refs on every render (cheap; no extra effect needed)
  manifestRef.current = manifest;
  runtimeRef.current = runtime;
  selectedRef.current = selectedPrimitiveId;
  placingRef.current = placingKind;
  onPlaceRef.current = onPlacePrimitive;
  onSelectRef.current = onSelectPrimitive;
  onMoveRef.current = onMovePrimitive;
  onTelemetryRef.current = onTelemetry;

  // Create the p5 sketch ONCE — it lives for the full component lifetime.
  // All dynamic values are read through refs inside the callbacks.
  useEffect(() => {
    if (!hostRef.current) return;

    const sketch = new p5((instance) => {
      instance.setup = () => {
        instance.createCanvas(960, 560);
        instance.frameRate(60);
      };

      instance.draw = () => {
        drawScene(instance, manifestRef.current, runtimeRef.current, selectedRef.current);
        // Push telemetry from the draw loop — no useEffect needed, no stale captures.
        onTelemetryRef.current(runtimeRef.current.telemetry);
      };

      instance.mousePressed = () => {
        const x = instance.mouseX;
        const y = instance.mouseY;
        // Ignore clicks outside the canvas bounds
        if (x < 0 || x > instance.width || y < 0 || y > instance.height) return;

        if (placingRef.current) {
          onPlaceRef.current(x, y);
          return;
        }

        // Hit-test against live physics positions first, then manifest fallback
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

    return () => {
      sketch.remove();
    };
  }, []); // intentionally empty — everything accessed through refs

  const status = useMemo(() => {
    return manifest.metadata.recipeId ? `Recipe: ${manifest.metadata.recipeId}` : 'Free Build — Physics Active';
  }, [manifest.metadata.recipeId]);

  const hint = useMemo(() => {
    if (placingKind) return `Click canvas to place ${placingKind}`;
    const sel = manifest.primitives.find((p) => p.id === selectedPrimitiveId);
    if (!sel) return 'Click a part to select · Drag to reposition';
    switch (sel.kind) {
      case 'motor': return 'Motor selected — place a Gear or Wheel inside its range ring · place Conveyor endpoint within 300px';
      case 'gear': return 'Gear selected — place another Gear or Wheel touching this one to mesh them';
      case 'wheel': return 'Wheel selected — place inside Motor range to spin · touching another Gear/Wheel to mesh';
      case 'conveyor': return 'Conveyor selected — place Cargo Blocks on it to carry them · Motor within 300px boosts belt speed';
      case 'winch': return 'Winch selected — place a Hook below it, then use Quick Connect → Winch to Hook';
      case 'node': return 'Node selected — place another Node and use Quick Connect → Connect Nodes with Beam';
      case 'hook': return 'Hook selected — use Quick Connect to attach it to a Winch';
      case 'hopper': return 'Hopper selected — drop Cargo Blocks above it to fill · watch the fill level rise';
      case 'locomotive': return 'Locomotive selected — place a Rail Segment, set trackId to match · it will follow the rail';
      default: return `${sel.label ?? sel.kind} selected — drag to move · Inspector to adjust`;
    }
  }, [manifest.primitives, placingKind, selectedPrimitiveId]);

  return (
    <div className="machine-canvas-shell">
      <div className="machine-canvas-toolbar">
        <span>{status}</span>
        <span className="canvas-hint">{hint}</span>
      </div>
      <div className="machine-canvas" ref={hostRef} />
    </div>
  );
}

function drawScene(instance: p5, manifest: ExperimentManifest, runtime: RuntimeSnapshot, selectedPrimitiveId?: string) {
  instance.background(7, 14, 22);
  drawGrid(instance);
  drawRecipeDecor(instance, manifest.metadata.recipeId ?? '');

  // Connection overlay: motor ranges, driven-gear lines, gear meshes
  if (!manifest.metadata.recipeId) {
    drawConnectionOverlay(instance, manifest, runtime, selectedPrimitiveId);
  }

  for (const primitive of manifest.primitives) {
    const selected = primitive.id === selectedPrimitiveId;
    drawPrimitive(instance, primitive, runtime, selected, manifest.primitives);
  }

  drawGoalZones(instance, manifest.metadata.recipeId ?? '', runtime);
}

function drawConnectionOverlay(
  instance: p5,
  manifest: ExperimentManifest,
  runtime: RuntimeSnapshot,
  selectedPrimitiveId?: string,
) {
  instance.push();

  for (const prim of manifest.primitives) {
    if (prim.kind === 'motor') {
      const { x, y } = prim.config as { x: number; y: number };
      const isSelected = prim.id === selectedPrimitiveId;
      const drivenIds = runtime.motorDrives?.[prim.id] ?? [];

      // Drive-range ring (220px radius)
      instance.noFill();
      instance.stroke(71, 197, 165, isSelected ? 60 : 28);
      instance.strokeWeight(1);
      instance.circle(x, y, 440);

      // Lines from motor to driven parts (gears = teal, wheels = blue)
      for (const drivenId of drivenIds) {
        const driven = manifest.primitives.find((p) => p.id === drivenId);
        if (!driven) continue;
        const dPos = getLivePos(driven, runtime);
        const isWheel = driven.kind === 'wheel';
        const r = isWheel ? 96 : 71;
        const g = isWheel ? 165 : 197;
        const b = isWheel ? 234 : 165;
        instance.stroke(r, g, b, 80);
        instance.strokeWeight(1);
        (instance.drawingContext as CanvasRenderingContext2D).setLineDash([4, 6]);
        instance.line(x, y, dPos.x, dPos.y);
        (instance.drawingContext as CanvasRenderingContext2D).setLineDash([]);
        instance.fill(r, g, b, 80);
        instance.noStroke();
        instance.circle(dPos.x, dPos.y, 8);
      }

      // Conveyor boost range ring (300px radius, amber)
      const nearConveyor = manifest.primitives.some((p) => {
        if (p.kind !== 'conveyor') return false;
        const cCfg = p.config as { path: Array<{ x: number; y: number }> };
        return cCfg.path.some((pt) => Math.hypot(pt.x - x, pt.y - y) < 300);
      });
      if (nearConveyor || isSelected) {
        instance.noFill();
        instance.stroke(245, 158, 11, isSelected ? 40 : 18);
        instance.strokeWeight(1);
        (instance.drawingContext as CanvasRenderingContext2D).setLineDash([3, 8]);
        instance.circle(x, y, 600); // 300px radius
        (instance.drawingContext as CanvasRenderingContext2D).setLineDash([]);
      }

      if (drivenIds.length === 0 && isSelected) {
        instance.noStroke();
        instance.fill(71, 197, 165, 140);
        instance.textSize(11);
        instance.textAlign(instance.CENTER, instance.TOP);
        instance.text('Place a Gear or Wheel inside this ring', x, y + 26);
      }
    }

    if (prim.kind === 'winch') {
      const { x, y } = prim.config as { x: number; y: number };
      const isSelected = prim.id === selectedPrimitiveId;
      const hasRope = manifest.primitives.some(
        (p) => p.kind === 'rope' && (p.config as { fromId: string }).fromId === prim.id,
      );

      if (!hasRope && isSelected) {
        // Draw a suggested rope drop-line
        instance.stroke(245, 158, 11, 60);
        instance.strokeWeight(1);
        (instance.drawingContext as CanvasRenderingContext2D).setLineDash([4, 6]);
        instance.line(x, y, x, y + 220);
        (instance.drawingContext as CanvasRenderingContext2D).setLineDash([]);
        instance.noStroke();
        instance.fill(245, 158, 11, 120);
        instance.textSize(11);
        instance.textAlign(instance.CENTER, instance.TOP);
        instance.text('Place a Hook here, then Quick Connect', x, y + 230);
      }
    }

    // Conveyor → cargo block flow indicators
    if (prim.kind === 'conveyor') {
      const cCfg = prim.config as { path: Array<{ x: number; y: number }>; direction: string };
      const isSelected = prim.id === selectedPrimitiveId;
      if (isSelected && cCfg.path.length >= 2) {
        // Highlight belt endpoints to show motor connection zone
        for (const pt of [cCfg.path[0], cCfg.path[cCfg.path.length - 1]]) {
          instance.noFill();
          instance.stroke(245, 158, 11, 50);
          instance.strokeWeight(1);
          instance.circle(pt.x, pt.y, 600); // 300px zone indicator
        }
      }
    }

    // Gear/wheel mesh connections
    if (prim.kind === 'gear' || prim.kind === 'wheel') {
      const pos = getLivePos(prim, runtime);
      for (const meshId of runtime.gearMeshes?.[prim.id] ?? []) {
        const meshPart = manifest.primitives.find((p) => p.id === meshId);
        if (!meshPart) continue;
        const mPos = getLivePos(meshPart, runtime);
        // Only draw each pair once (lower id draws)
        if (prim.id < meshId) {
          // gear-gear = teal, gear-wheel or wheel-wheel = blue
          const mixed = prim.kind !== meshPart.kind;
          instance.stroke(mixed ? 96 : 94, mixed ? 165 : 234, mixed ? 234 : 212, 60);
          instance.strokeWeight(1);
          instance.line(pos.x, pos.y, mPos.x, mPos.y);
        }
      }
    }
  }

  instance.pop();
}

function drawGrid(instance: p5) {
  instance.stroke(24, 42, 58, 80);
  instance.strokeWeight(1);
  for (let x = 0; x < instance.width; x += 32) {
    instance.line(x, 0, x, instance.height);
  }
  for (let y = 0; y < instance.height; y += 32) {
    instance.line(0, y, instance.width, y);
  }
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

/** Returns the live physics position if available, otherwise falls back to manifest config. */
function getLivePos(primitive: PrimitiveInstance, runtime: RuntimeSnapshot): { x: number; y: number } {
  const phys = runtime.bodyPositions?.[primitive.id];
  if (phys) return { x: phys.x, y: phys.y };
  if ('x' in primitive.config && 'y' in primitive.config) {
    return { x: (primitive.config as { x: number; y: number }).x, y: (primitive.config as { x: number; y: number }).y };
  }
  return { x: 0, y: 0 };
}

function drawPrimitive(
  instance: p5,
  primitive: PrimitiveInstance,
  runtime: RuntimeSnapshot,
  selected: boolean,
  primitives: PrimitiveInstance[],
) {
  const highlight = selected ? '#f8fafc' : '#1d4f5f';
  const accent = selected ? '#fbbf24' : '#5eead4';

  instance.push();
  instance.stroke(highlight);
  instance.strokeWeight(selected ? 3 : 2);

  switch (primitive.kind) {
    case 'node': {
      const { x, y } = getLivePos(primitive, runtime);
      instance.fill(accent);
      instance.circle(x, y, 14);
      // Selection ring
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
      // Motor is always static
      const { x, y } = primitive.config as { x: number; y: number };
      instance.fill(selected ? '#1a6a63' : '#134e4a');
      instance.stroke(selected ? '#fbbf24' : highlight);
      instance.rect(x - 28, y - 18, 56, 36, 10);
      instance.noStroke();
      instance.fill('#e2e8f0');
      instance.textAlign(instance.CENTER, instance.CENTER);
      instance.textSize(14);
      instance.text('M', x, y + 1);
      break;
    }
    case 'gear': {
      const cfgGear = primitive.config as { x: number; y: number; teeth: number; color: string };
      const { teeth, color } = cfgGear;
      const { x, y } = getLivePos(primitive, runtime);
      const radius = Math.max(24, teeth * 1.4);
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
        const x2 = Math.cos(angle) * (radius + 8);
        const y2 = Math.sin(angle) * (radius + 8);
        instance.line(x1, y1, x2, y2);
      }
      instance.fill(selected ? '#fbbf24' : color);
      instance.noStroke();
      instance.circle(0, 0, 10);
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
      // Spokes — make rotation clearly visible
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
      const { path } = primitive.config as { path: Array<{ x: number; y: number }> };
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
      break;
    }
    case 'hopper': {
      const { x, y } = primitive.config as { x: number; y: number };
      const fill = runtime.hopperFill;
      instance.stroke(selected ? '#fbbf24' : '#fec84b');
      instance.strokeWeight(selected ? 3 : 2);
      instance.noFill();
      instance.quad(x - 40, y - 10, x + 40, y - 10, x + 24, y + 60, x - 24, y + 60);
      instance.noStroke();
      instance.fill(254, 200, 75, 160);
      instance.rect(x - 24, y + 60 - Math.min(48, fill * 5), 48, Math.min(48, fill * 5));
      // Fill level label
      if (fill > 0) {
        instance.fill(254, 200, 75, 200);
        instance.textSize(10);
        instance.textAlign(instance.CENTER, instance.CENTER);
        instance.text(`${Math.round(fill)}`, x, y + 35);
      }
      break;
    }
    case 'cargo-block': {
      const progress = runtime.cargoProgress[primitive.id];
      let cx: number;
      let cy: number;
      if (progress !== undefined) {
        // Scripted conveyor animation (recipe mode)
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
      // Rope from winch down to hook
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
      // Rail ties
      instance.stroke(selected ? '#fbbf24' : '#475569');
      instance.strokeWeight(4);
      for (let i = 0; i < points.length - 1; i += 1) {
        const steps = 6;
        for (let t = 0; t <= steps; t += 1) {
          const fx = points[i].x + (points[i + 1].x - points[i].x) * (t / steps);
          const fy = points[i].y + (points[i + 1].y - points[i].y) * (t / steps);
          const angle = Math.atan2(points[i + 1].y - points[i].y, points[i + 1].x - points[i].x) + Math.PI / 2;
          instance.line(
            fx + Math.cos(angle) * 8,
            fy + Math.sin(angle) * 8,
            fx - Math.cos(angle) * 8,
            fy - Math.sin(angle) * 8,
          );
        }
      }
      // Rails
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

function getTrackPoint(track: PrimitiveInstance | undefined, progress: number) {
  if (!track || track.kind !== 'rail-segment') {
    return { x: 0, y: 0 };
  }
  const points = (track.config as { points: Array<{ x: number; y: number }> }).points;
  if (points.length < 2) {
    return points[0] ?? { x: 0, y: 0 };
  }

  const clamped = Math.max(0, Math.min(0.999, progress));
  const segmentIndex = Math.min(points.length - 2, Math.floor(clamped * (points.length - 1)));
  const localT = clamped * (points.length - 1) - segmentIndex;
  const a = points[segmentIndex];
  const b = points[segmentIndex + 1];

  return {
    x: a.x + (b.x - a.x) * localT,
    y: a.y + (b.y - a.y) * localT,
  };
}

/**
 * Hit test that checks live physics positions first, then falls back to manifest config.
 * This ensures you can click on a part where it actually IS after physics has moved it.
 */
function hitTest(
  primitives: PrimitiveInstance[],
  x: number,
  y: number,
  bodyPositions?: Record<string, { x: number; y: number; angle: number }>,
) {
  const positioned = [...primitives].reverse();
  return positioned.find((primitive) => {
    switch (primitive.kind) {
      case 'beam':
      case 'rail-segment':
      case 'conveyor':
      case 'rope':
        return false;
      case 'locomotive':
      case 'wagon':
        // These move along tracks — use track-interpolated position
        return false; // not draggable
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
