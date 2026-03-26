import { nanoid } from 'nanoid';
import type { ExperimentManifest, PrimitiveConfig, PrimitiveInstance, PrimitiveKind } from './types';

export function addPrimitive(manifest: ExperimentManifest, kind: PrimitiveKind, x: number, y: number): ExperimentManifest {
  const primitive = createPrimitive(kind, x, y);
  return {
    ...manifest,
    primitives: [...manifest.primitives, primitive],
  };
}

export function updatePrimitive(manifest: ExperimentManifest, primitiveId: string, nextConfig: PrimitiveConfig): ExperimentManifest {
  return {
    ...manifest,
    primitives: manifest.primitives.map((primitive) =>
      primitive.id === primitiveId ? { ...primitive, config: nextConfig } : primitive,
    ),
  };
}

export function movePrimitive(manifest: ExperimentManifest, primitiveId: string, x: number, y: number): ExperimentManifest {
  return {
    ...manifest,
    primitives: manifest.primitives.map((primitive) => {
      if (primitive.id !== primitiveId) {
        return primitive;
      }
      if ('x' in primitive.config && 'y' in primitive.config) {
        return { ...primitive, config: { ...primitive.config, x, y } as PrimitiveConfig };
      }
      if ('path' in primitive.config) {
        const path = (primitive.config as { path: Array<{ x: number; y: number }> }).path;
        const anchor = averagePoint(path);
        const deltaX = x - anchor.x;
        const deltaY = y - anchor.y;
        return {
          ...primitive,
          config: {
            ...primitive.config,
            path: path.map((point) => ({ x: point.x + deltaX, y: point.y + deltaY })),
          } as PrimitiveConfig,
        };
      }
      if ('points' in primitive.config) {
        const points = (primitive.config as { points: Array<{ x: number; y: number }> }).points;
        const anchor = averagePoint(points);
        const deltaX = x - anchor.x;
        const deltaY = y - anchor.y;
        return {
          ...primitive,
          config: {
            ...primitive.config,
            points: points.map((point) => ({ x: point.x + deltaX, y: point.y + deltaY })),
          } as PrimitiveConfig,
        };
      }
      return primitive;
    }),
  };
}

export function deletePrimitive(manifest: ExperimentManifest, primitiveId: string): ExperimentManifest {
  return {
    ...manifest,
    primitives: manifest.primitives.filter((primitive) => primitive.id !== primitiveId),
    behaviors: manifest.behaviors.filter(
      (behavior) => !behavior.targets.includes(primitiveId),
    ),
  };
}

export function connectPrimitives(
  manifest: ExperimentManifest,
  sourceId: string,
  targetId: string,
): ExperimentManifest {
  const source = manifest.primitives.find((primitive) => primitive.id === sourceId);
  const target = manifest.primitives.find((primitive) => primitive.id === targetId);
  if (!source || !target) {
    return manifest;
  }

  if (source.kind === 'node' && target.kind === 'node') {
    return {
      ...manifest,
      primitives: [
        ...manifest.primitives,
        {
          id: `beam-${nanoid(6)}`,
          kind: 'beam',
          label: 'Support Beam',
          config: { fromNodeId: sourceId, toNodeId: targetId, stiffness: 0.8 },
        },
      ],
    };
  }

  if (source.kind === 'winch' && target.kind === 'hook') {
    return {
      ...manifest,
      primitives: [
        ...manifest.primitives,
        {
          id: `rope-${nanoid(6)}`,
          kind: 'rope',
          label: 'Hoist Rope',
          config: { fromId: sourceId, toId: targetId, length: 180 },
        },
      ],
    };
  }

  return manifest;
}

function createPrimitive(kind: PrimitiveKind, x: number, y: number): PrimitiveInstance {
  switch (kind) {
    case 'node':
      return { id: `node-${nanoid(6)}`, kind, label: 'Node', config: { x, y } };
    case 'beam':
      return { id: `beam-${nanoid(6)}`, kind, label: 'Beam', config: { fromNodeId: '', toNodeId: '', stiffness: 0.8 } };
    case 'wheel':
      return { id: `wheel-${nanoid(6)}`, kind, label: 'Wheel', config: { x, y, radius: 28, traction: 0.9 } };
    case 'axle':
      return { id: `axle-${nanoid(6)}`, kind, label: 'Axle', config: { x, y } };
    case 'motor':
      return { id: `motor-${nanoid(6)}`, kind, label: 'Motor', config: { x, y, rpm: 60, torque: 1, powerState: true } };
    case 'gear':
      return { id: `gear-${nanoid(6)}`, kind, label: 'Gear', config: { x, y, teeth: 24, input: false, color: '#47c5a5' } };
    case 'winch':
      return { id: `winch-${nanoid(6)}`, kind, label: 'Winch', config: { x, y, speed: 30, ropeLength: 180 } };
    case 'rope':
      return { id: `rope-${nanoid(6)}`, kind, label: 'Rope', config: { fromId: '', toId: '', length: 180 } };
    case 'hook':
      return { id: `hook-${nanoid(6)}`, kind, label: 'Hook', config: { x, y } };
    case 'rail-segment':
      return {
        id: `rail-${nanoid(6)}`,
        kind,
        label: 'Rail Segment',
        config: {
          points: [
            { x: x - 80, y },
            { x: x + 80, y },
          ],
          segmentType: 'straight',
        },
      };
    case 'conveyor':
      return {
        id: `conv-${nanoid(6)}`,
        kind,
        label: 'Conveyor',
        config: {
          path: [
            { x: x - 80, y },
            { x: x + 80, y },
          ],
          speed: 45,
          direction: 'forward',
        },
      };
    case 'hopper':
      return { id: `hopper-${nanoid(6)}`, kind, label: 'Hopper', config: { x, y, capacity: 10, releaseRate: 1.5, fill: 0 } };
    case 'cargo-block':
      return { id: `cargo-${nanoid(6)}`, kind, label: 'Cargo Block', config: { x, y, weight: 5 } };
    case 'material-pile':
      return { id: `pile-${nanoid(6)}`, kind, label: 'Material Pile', config: { x, y, quantity: 20 } };
    case 'rail-switch':
      return { id: `switch-${nanoid(6)}`, kind, label: 'Rail Switch', config: { x, y, branch: 'right' } };
    case 'locomotive':
      return { id: `loco-${nanoid(6)}`, kind, label: 'Locomotive', config: { trackId: 'track-main', progress: 0, speed: 0.18 } };
    case 'wagon':
      return { id: `wagon-${nanoid(6)}`, kind, label: 'Wagon', config: { trackId: 'track-main', offset: -0.12, capacity: 6 } };
    default:
      return { id: `node-${nanoid(6)}`, kind: 'node', label: 'Node', config: { x, y } };
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

  return {
    x: total.x / points.length,
    y: total.y / points.length,
  };
}
