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
  let deltaX = 0;
  let deltaY = 0;

  const movedPrimitives = manifest.primitives.map((primitive) => {
    if (primitive.id !== primitiveId) {
      return primitive;
    }
    if ('x' in primitive.config && 'y' in primitive.config) {
      deltaX = x - primitive.config.x;
      deltaY = y - primitive.config.y;
      return { ...primitive, config: { ...primitive.config, x, y } as PrimitiveConfig };
    }
    if ('path' in primitive.config) {
      const path = (primitive.config as { path: Array<{ x: number; y: number }> }).path;
      const anchor = averagePoint(path);
      deltaX = x - anchor.x;
      deltaY = y - anchor.y;
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
      deltaX = x - anchor.x;
      deltaY = y - anchor.y;
      return {
        ...primitive,
        config: {
          ...primitive.config,
          points: points.map((point) => ({ x: point.x + deltaX, y: point.y + deltaY })),
        } as PrimitiveConfig,
      };
    }
    return primitive;
  });

  const shiftedChildren = (deltaX !== 0 || deltaY !== 0)
    ? movedPrimitives.map((primitive) => {
      const attachedToId = (primitive.config as { attachedToId?: string }).attachedToId;
      if (primitive.id === primitiveId || attachedToId !== primitiveId || !('x' in primitive.config && 'y' in primitive.config)) {
        return primitive;
      }
      return {
        ...primitive,
        config: {
          ...primitive.config,
          x: primitive.config.x + deltaX,
          y: primitive.config.y + deltaY,
        } as PrimitiveConfig,
      };
    })
    : movedPrimitives;

  const finalPrimitives = shiftedChildren.map((primitive) => {
    const attachedToId = (primitive.config as { attachedToId?: string }).attachedToId;
    if (
      !attachedToId
      || !('x' in primitive.config && 'y' in primitive.config)
      || (
        primitive.kind !== 'wheel'
        && primitive.kind !== 'motor'
        && primitive.kind !== 'gear'
        && primitive.kind !== 'pulley'
        && primitive.kind !== 'chain-sprocket'
        && primitive.kind !== 'flywheel'
        && primitive.kind !== 'winch'
        && primitive.kind !== 'crane-arm'
        && primitive.kind !== 'bucket'
        && primitive.kind !== 'counterweight'
      )
    ) {
      return primitive;
    }
    const parent = shiftedChildren.find((item) => item.id === attachedToId);
    if (!parent) return primitive;
    const anchor = getAttachmentAnchor(parent);
    return {
      ...primitive,
      config: {
        ...primitive.config,
        attachOffsetX: primitive.config.x - anchor.x,
        attachOffsetY: primitive.config.y - anchor.y,
      } as PrimitiveConfig,
    };
  });

  return {
    ...manifest,
    primitives: finalPrimitives,
  };
}

export function deletePrimitive(manifest: ExperimentManifest, primitiveId: string): ExperimentManifest {
  return {
    ...manifest,
    primitives: manifest.primitives
      .filter((primitive) => {
        if (primitive.id === primitiveId) return false;
        if (primitive.kind === 'beam') {
          const cfg = primitive.config as { fromNodeId: string; toNodeId: string };
          return cfg.fromNodeId !== primitiveId && cfg.toNodeId !== primitiveId;
        }
        if (primitive.kind === 'rope') {
          const cfg = primitive.config as { fromId: string; toId: string };
          return cfg.fromId !== primitiveId && cfg.toId !== primitiveId;
        }
        return true;
      })
      .map((primitive) => {
        const attachedToId = (primitive.config as { attachedToId?: string }).attachedToId;
        if (attachedToId !== primitiveId) {
          return primitive;
        }
        const nextConfig = { ...primitive.config } as Record<string, unknown>;
        delete nextConfig.attachedToId;
        delete nextConfig.attachOffsetX;
        delete nextConfig.attachOffsetY;
        return { ...primitive, config: nextConfig as unknown as PrimitiveConfig };
      }),
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

  if (
    ['wheel', 'pulley', 'chain-sprocket', 'flywheel'].includes(source.kind)
    && ['wheel', 'pulley', 'chain-sprocket', 'flywheel'].includes(target.kind)
  ) {
    const exists = manifest.primitives.some((primitive) => (
      primitive.kind === 'rope'
      && (
        ((primitive.config as { fromId: string; toId: string }).fromId === sourceId
          && (primitive.config as { fromId: string; toId: string }).toId === targetId)
        || ((primitive.config as { fromId: string; toId: string }).fromId === targetId
          && (primitive.config as { fromId: string; toId: string }).toId === sourceId)
      )
    ));
    if (exists) {
      return manifest;
    }
    const sourcePos = getAttachmentAnchor(source);
    const targetPos = getAttachmentAnchor(target);
    return {
      ...manifest,
      primitives: [
        ...manifest.primitives,
        {
          id: `rope-${nanoid(6)}`,
          kind: 'rope',
          label: source.kind === 'chain-sprocket' || target.kind === 'chain-sprocket' ? 'Chain Link' : 'Drive Belt',
          config: {
            fromId: sourceId,
            toId: targetId,
            length: Math.max(40, Math.hypot(targetPos.x - sourcePos.x, targetPos.y - sourcePos.y)),
          },
        },
      ],
    };
  }

  if (
    (source.kind === 'wheel' && target.kind === 'chassis')
    || (source.kind === 'chassis' && target.kind === 'wheel')
  ) {
    const wheel = source.kind === 'wheel' ? source : target;
    const chassis = source.kind === 'chassis' ? source : target;
    return attachPrimitive(manifest, wheel.id, chassis.id);
  }

  if (
    (source.kind === 'motor' && target.kind === 'chassis')
    || (source.kind === 'chassis' && target.kind === 'motor')
  ) {
    const motor = source.kind === 'motor' ? source : target;
    const chassis = source.kind === 'chassis' ? source : target;
    return attachPrimitive(manifest, motor.id, chassis.id);
  }

  if (
    (
      ['gear', 'pulley', 'chain-sprocket', 'flywheel', 'winch', 'crane-arm'].includes(source.kind)
      && target.kind === 'chassis'
    )
    || (
      source.kind === 'chassis'
      && ['gear', 'pulley', 'chain-sprocket', 'flywheel', 'winch', 'crane-arm'].includes(target.kind)
    )
  ) {
    const mounted = source.kind === 'chassis' ? target : source;
    const chassis = source.kind === 'chassis' ? source : target;
    return attachPrimitive(manifest, mounted.id, chassis.id);
  }

  if (
    (source.kind === 'crane-arm' && (target.kind === 'bucket' || target.kind === 'counterweight'))
    || (target.kind === 'crane-arm' && (source.kind === 'bucket' || source.kind === 'counterweight'))
  ) {
    const arm = source.kind === 'crane-arm' ? source : target;
    const load = source.kind === 'crane-arm' ? target : source;
    return attachPrimitive(manifest, load.id, arm.id);
  }

  if (
    (source.kind === 'hook' && target.kind === 'cargo-block')
    || (source.kind === 'cargo-block' && target.kind === 'hook')
  ) {
    const hook = source.kind === 'hook' ? source : target;
    const cargo = source.kind === 'cargo-block' ? source : target;
    return {
      ...manifest,
      primitives: manifest.primitives.map((primitive) => (
        primitive.id === cargo.id
          ? {
              ...primitive,
              config: {
                ...primitive.config,
                attachedToId: hook.id,
              } as PrimitiveConfig,
            }
          : primitive
      )),
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
    case 'chassis':
      return { id: `chassis-${nanoid(6)}`, kind, label: 'Chassis', config: { x, y, width: 140, height: 20 } };
    case 'motor':
      return { id: `motor-${nanoid(6)}`, kind, label: 'Motor', config: { x, y, rpm: 60, torque: 1, powerState: true } };
    case 'gear':
      return { id: `gear-${nanoid(6)}`, kind, label: 'Gear', config: { x, y, teeth: 24, input: false, color: '#47c5a5' } };
    case 'pulley':
      return { id: `pulley-${nanoid(6)}`, kind, label: 'Pulley', config: { x, y, radius: 28 } };
    case 'chain-sprocket':
      return { id: `chain-${nanoid(6)}`, kind, label: 'Chain Sprocket', config: { x, y, radius: 28 } };
    case 'flywheel':
      return { id: `flywheel-${nanoid(6)}`, kind, label: 'Flywheel', config: { x, y, radius: 36, mass: 5 } };
    case 'gearbox':
      return { id: `gearbox-${nanoid(6)}`, kind, label: 'Gearbox', config: { x, y, inputTeeth: 24, outputTeeth: 12 } };
    case 'piston':
      return { id: `piston-${nanoid(6)}`, kind, label: 'Piston', config: { x, y, orientation: 'horizontal', stroke: 60, speed: 30 } };
    case 'rack':
      return { id: `rack-${nanoid(6)}`, kind, label: 'Rack', config: { x, y, width: 80, orientation: 'horizontal' } };
    case 'spring-linear':
      return { id: `spring-${nanoid(6)}`, kind, label: 'Linear Spring', config: { x, y, orientation: 'horizontal', restLength: 40, stiffness: 0.05 } };
    case 'crane-arm':
      return { id: `arm-${nanoid(6)}`, kind, label: 'Crane Arm', config: { x, y, length: 120 } };
    case 'counterweight':
      return { id: `counter-${nanoid(6)}`, kind, label: 'Counterweight', config: { x, y, mass: 5 } };
    case 'bucket':
      return { id: `bucket-${nanoid(6)}`, kind, label: 'Bucket', config: { x, y, width: 40, depth: 30 } };
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
    case 'water':
      return { id: `water-${nanoid(6)}`, kind, label: 'Water', config: { x, y, width: 120, height: 80, density: 0.8 } };
    case 'hinge':
      return { id: `hinge-${nanoid(6)}`, kind, label: 'Hinge', config: { x, y } };
    case 'chute':
      return { id: `chute-${nanoid(6)}`, kind, label: 'Chute', config: { x, y, length: 100, angle: 30 } };
    case 'silo-bin':
      return { id: `silo-${nanoid(6)}`, kind, label: 'Silo Bin', config: { x, y, width: 80, height: 100, gateOpen: false } };
    case 'tunnel':
      return { id: `tunnel-${nanoid(6)}`, kind, label: 'Tunnel', config: { x, y, width: 100, angle: 0 } };
    case 'ramp':
      return { id: `ramp-${nanoid(6)}`, kind, label: 'Ramp', config: { x, y, width: 120, angle: 20 } };
    case 'platform':
      return { id: `platform-${nanoid(6)}`, kind, label: 'Platform', config: { x, y, width: 120 } };
    case 'wall':
      return { id: `wall-${nanoid(6)}`, kind, label: 'Wall', config: { x, y, height: 80 } };
    case 'ball':
      return { id: `ball-${nanoid(6)}`, kind, label: 'Ball', config: { x, y, radius: 12 } };
    case 'rock':
      return { id: `rock-${nanoid(6)}`, kind, label: 'Rock', config: { x, y } };
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

function getAttachmentAnchor(primitive: PrimitiveInstance) {
  if (primitive.kind === 'crane-arm') {
    const cfg = primitive.config as { x: number; y: number; length?: number };
    return { x: cfg.x + (cfg.length ?? 120) / 2, y: cfg.y };
  }
  if ('x' in primitive.config && 'y' in primitive.config) {
    return { x: primitive.config.x, y: primitive.config.y };
  }
  return { x: 0, y: 0 };
}

function attachPrimitive(manifest: ExperimentManifest, childId: string, parentId: string): ExperimentManifest {
  const child = manifest.primitives.find((primitive) => primitive.id === childId);
  const parent = manifest.primitives.find((primitive) => primitive.id === parentId);
  if (!child || !parent || !('x' in child.config && 'y' in child.config)) {
    return manifest;
  }
  const anchor = getAttachmentAnchor(parent);
  const childPos = { x: child.config.x, y: child.config.y };
  return {
    ...manifest,
    primitives: manifest.primitives.map((primitive) => (
      primitive.id === child.id
        ? {
            ...primitive,
            config: {
              ...primitive.config,
              attachedToId: parent.id,
              attachOffsetX: childPos.x - anchor.x,
              attachOffsetY: childPos.y - anchor.y,
            } as PrimitiveConfig,
          }
        : primitive
    )),
  };
}
