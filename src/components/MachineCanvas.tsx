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
  const sketchRef = useRef<p5 | null>(null);
  const manifestRef = useRef(manifest);
  const runtimeRef = useRef(runtime);
  const draggingIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    manifestRef.current = manifest;
    runtimeRef.current = runtime;
  }, [manifest, runtime]);

  useEffect(() => {
    onTelemetry(runtime.telemetry);
  }, [onTelemetry, runtime.telemetry]);

  useEffect(() => {
    if (!hostRef.current) {
      return;
    }

    const sketch = new p5((instance) => {
      instance.setup = () => {
        instance.createCanvas(960, 560);
      };

      instance.draw = () => {
        drawScene(instance, manifestRef.current, runtimeRef.current, selectedPrimitiveId);
      };

      instance.mousePressed = () => {
        const x = instance.mouseX;
        const y = instance.mouseY;

        if (placingKind) {
          onPlacePrimitive(x, y);
          return;
        }

        const hit = hitTest(manifestRef.current.primitives, x, y);
        draggingIdRef.current = hit?.id;
        onSelectPrimitive(hit?.id);
      };

      instance.mouseDragged = () => {
        if (!draggingIdRef.current) {
          return;
        }
        onMovePrimitive(draggingIdRef.current, instance.mouseX, instance.mouseY);
      };

      instance.mouseReleased = () => {
        draggingIdRef.current = undefined;
      };
    }, hostRef.current);

    sketchRef.current = sketch;
    return () => {
      sketch.remove();
      sketchRef.current = null;
    };
  }, [onMovePrimitive, onPlacePrimitive, onSelectPrimitive, placingKind, selectedPrimitiveId]);

  const status = useMemo(() => {
    return manifest.metadata.recipeId ? `Recipe: ${manifest.metadata.recipeId}` : 'Free Build Draft';
  }, [manifest.metadata.recipeId]);

  return (
    <div className="machine-canvas-shell">
      <div className="machine-canvas-toolbar">
        <span>{status}</span>
        <span>{placingKind ? `Placing ${placingKind}` : 'Select or drag parts'}</span>
      </div>
      <div className="machine-canvas" ref={hostRef} />
    </div>
  );
}

function drawScene(instance: p5, manifest: ExperimentManifest, runtime: RuntimeSnapshot, selectedPrimitiveId?: string) {
  instance.background(7, 14, 22);
  drawGrid(instance);
  drawRecipeDecor(instance, manifest.metadata.recipeId ?? '');

  for (const primitive of manifest.primitives) {
    const selected = primitive.id === selectedPrimitiveId;
    drawPrimitive(instance, primitive, runtime, selected, manifest.primitives);
  }

  drawGoalZones(instance, manifest.metadata.recipeId ?? '', runtime);
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
function getPhysicsPos(primitive: PrimitiveInstance, runtime: RuntimeSnapshot): { x: number; y: number } {
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
      const { x, y } = getPhysicsPos(primitive, runtime);
      instance.fill(accent);
      instance.circle(x, y, 10);
      break;
    }
    case 'beam': {
      const { fromNodeId, toNodeId } = primitive.config as { fromNodeId: string; toNodeId: string };
      const from = findPrimitiveById(primitives, fromNodeId);
      const to = findPrimitiveById(primitives, toNodeId);
      if (from && to) {
        const posA = getPhysicsPos(from, runtime);
        const posB = getPhysicsPos(to, runtime);
        instance.stroke('#5eead4');
        instance.line(posA.x, posA.y, posB.x, posB.y);
      }
      break;
    }
    case 'motor': {
      // Motor is always static — no physics position needed
      const { x, y } = primitive.config as { x: number; y: number };
      instance.fill('#134e4a');
      instance.rect(x - 28, y - 18, 56, 36, 10);
      instance.fill('#e2e8f0');
      instance.textAlign(instance.CENTER, instance.CENTER);
      instance.text('M', x, y + 1);
      break;
    }
    case 'gear': {
      const cfgGear = primitive.config as { x: number; y: number; teeth: number; color: string };
      const { teeth, color } = cfgGear;
      const { x, y } = getPhysicsPos(primitive, runtime);
      const radius = Math.max(24, teeth * 1.4);
      instance.push();
      instance.translate(x, y);
      instance.rotate(runtime.rotations[primitive.id] ?? 0);
      instance.stroke(color);
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
      instance.fill(color);
      instance.circle(0, 0, 10);
      instance.pop();
      break;
    }
    case 'conveyor': {
      const { path } = primitive.config as { path: Array<{ x: number; y: number }> };
      instance.stroke('#3dd5a1');
      instance.strokeWeight(8);
      for (let i = 0; i < path.length - 1; i += 1) {
        instance.line(path[i].x, path[i].y, path[i + 1].x, path[i + 1].y);
      }
      break;
    }
    case 'hopper': {
      const { x, y } = primitive.config as { x: number; y: number };
      const fill = runtime.hopperFill;
      instance.stroke('#fec84b');
      instance.noFill();
      instance.quad(x - 40, y - 10, x + 40, y - 10, x + 24, y + 60, x - 24, y + 60);
      instance.noStroke();
      instance.fill(254, 200, 75, 160);
      instance.rect(x - 24, y + 60 - Math.min(48, fill * 5), 48, Math.min(48, fill * 5));
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
        // Physics mode or static — use live body position
        const pos = getPhysicsPos(primitive, runtime);
        cx = pos.x;
        cy = pos.y;
      }
      instance.fill('#cbd5e1');
      instance.rect(cx - 12, cy - 12, 24, 24, 4);
      break;
    }
    case 'winch': {
      // Winch is always static
      const { x, y } = primitive.config as { x: number; y: number };
      instance.fill('#1f2937');
      instance.rect(x - 20, y - 20, 40, 40, 8);
      instance.stroke('#f59e0b');
      instance.circle(x, y, 16);
      break;
    }
    case 'hook': {
      const config = primitive.config as { x: number; y: number };
      // Physics mode: use live body position; scripted mode: use hookY
      const phys = runtime.bodyPositions?.[primitive.id];
      const hx = phys ? phys.x : config.x;
      const hy = phys ? phys.y : (runtime.hookY || config.y);
      // Draw rope line from winch anchor down to hook
      const winchPrim = primitives.find((p) => p.kind === 'winch');
      const winchPos = winchPrim ? (primitive.config as { x: number }).x : config.x;
      instance.stroke('#f59e0b');
      instance.line(winchPos, config.y - 180, hx, hy);
      instance.noFill();
      instance.arc(hx, hy, 24, 28, 0, Math.PI);
      break;
    }
    case 'rope': {
      const config = primitive.config as { fromId: string; toId: string };
      const from = findPrimitiveById(primitives, config.fromId);
      const to = findPrimitiveById(primitives, config.toId);
      if (from && to) {
        const posA = getPhysicsPos(from, runtime);
        const posB = getPhysicsPos(to, runtime);
        const toY = to.kind === 'hook' ? (runtime.bodyPositions?.[to.id]?.y ?? runtime.hookY) : posB.y;
        instance.stroke('#f8fafc');
        instance.line(posA.x, posA.y, posB.x, toY);
      }
      break;
    }
    case 'rail-segment': {
      const { points } = primitive.config as { points: Array<{ x: number; y: number }> };
      instance.stroke('#94a3b8');
      instance.strokeWeight(6);
      for (let i = 0; i < points.length - 1; i += 1) {
        instance.line(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y);
      }
      break;
    }
    case 'rail-switch': {
      const { x, y, branch } = primitive.config as { x: number; y: number; branch: 'left' | 'right' };
      instance.fill(branch === 'right' ? '#60a5fa' : '#f59e0b');
      instance.circle(x, y, 18);
      break;
    }
    case 'locomotive': {
      const track = primitives.find((item) => item.id === (primitive.config as { trackId: string }).trackId);
      const point = getTrackPoint(track, runtime.trainProgress);
      instance.fill('#ef7b45');
      instance.rect(point.x - 22, point.y - 18, 44, 24, 6);
      break;
    }
    case 'wagon': {
      const track = primitives.find((item) => item.id === (primitive.config as { trackId: string }).trackId);
      const offset = (primitive.config as { offset: number }).offset;
      const point = getTrackPoint(track, Math.max(0, runtime.trainProgress + offset));
      instance.fill('#94a3b8');
      instance.rect(point.x - 18, point.y - 16, 36, 20, 6);
      break;
    }
    case 'material-pile': {
      const { x, y } = primitive.config as { x: number; y: number };
      instance.noStroke();
      instance.fill('#64748b');
      instance.triangle(x - 50, y + 30, x, y - 30, x + 50, y + 30);
      break;
    }
    case 'wheel': {
      const cfgWheel = primitive.config as { radius: number; traction: number };
      const { x: wx, y: wy } = getPhysicsPos(primitive, runtime);
      const wRadius = cfgWheel.radius ?? 28;
      instance.push();
      instance.translate(wx, wy);
      instance.rotate(runtime.rotations[primitive.id] ?? 0);
      instance.stroke('#94a3b8');
      instance.noFill();
      instance.circle(0, 0, wRadius * 2);
      // Spoke lines so rotation is visible
      instance.line(-wRadius, 0, wRadius, 0);
      instance.line(0, -wRadius, 0, wRadius);
      instance.pop();
      break;
    }
    default:
      if ('x' in primitive.config && 'y' in primitive.config) {
        const { x: dx, y: dy } = getPhysicsPos(primitive, runtime);
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

function hitTest(primitives: PrimitiveInstance[], x: number, y: number) {
  const positioned = [...primitives].reverse();
  return positioned.find((primitive) => {
    switch (primitive.kind) {
      case 'beam': {
        return false;
      }
      case 'rail-segment': {
        return false;
      }
      case 'conveyor': {
        return false;
      }
      default:
        if ('x' in primitive.config && 'y' in primitive.config) {
          const dx = (primitive.config as { x: number }).x - x;
          const dy = (primitive.config as { y: number }).y - y;
          return Math.hypot(dx, dy) < 28;
        }
        return false;
    }
  });
}
