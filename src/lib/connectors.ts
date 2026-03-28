import type {
  ControlSpec,
  ExperimentManifest,
  PrimitiveInstance,
  PrimitiveKind,
} from './types';
import { getTrackPoseFromPoints, resolveRailRoute } from './rail-routing';

export const TRANSMISSION_CONNECTOR_KINDS = ['belt-link', 'chain-link'] as const;
export const MECHANICAL_CONNECTOR_KINDS = ['bolt-link', 'hinge-link', 'powered-hinge-link'] as const;
export const CONNECTOR_KINDS = ['rope', ...TRANSMISSION_CONNECTOR_KINDS, ...MECHANICAL_CONNECTOR_KINDS] as const;
export const ROTARY_LINK_ENDPOINT_KINDS = ['wheel', 'pulley', 'chain-sprocket', 'flywheel'] as const;
export const ROPE_ENDPOINT_KINDS = ['hook', 'bucket', 'crane-arm', 'cargo-block'] as const;
export const STRUCTURAL_BASE_KINDS = ['chassis', 'locomotive', 'wagon', 'platform', 'wall', 'ramp', 'gearbox', 'chute', 'silo-bin', 'tunnel', 'trampoline'] as const;
export const BODY_BACKED_CONNECTOR_ENDPOINT_KINDS = [
  'wheel',
  'motor',
  'gear',
  'pulley',
  'chain-sprocket',
  'flywheel',
  'gearbox',
  'piston',
  'rack',
  'spring-linear',
  'crane-arm',
  'bucket',
  'counterweight',
  'winch',
  'hook',
  'cargo-block',
  'ramp',
  'platform',
  'wall',
  'ball',
  'rock',
  'chassis',
  'locomotive',
  'wagon',
  'chute',
  'silo-bin',
  'tunnel',
  'trampoline',
] as const;

export type ConnectorKind = (typeof CONNECTOR_KINDS)[number];
export type ConnectorAnchorRole = 'general' | 'joint' | 'rope';

function asKindList(values: readonly PrimitiveKind[]) {
  return values as readonly PrimitiveKind[];
}

export function isConnectorKind(kind: PrimitiveKind): kind is ConnectorKind {
  return asKindList(CONNECTOR_KINDS).includes(kind);
}

export function isTransmissionConnectorKind(kind: PrimitiveKind): kind is 'belt-link' | 'chain-link' {
  return asKindList(TRANSMISSION_CONNECTOR_KINDS).includes(kind);
}

export function isMechanicalConnectorKind(kind: PrimitiveKind): kind is 'bolt-link' | 'hinge-link' | 'powered-hinge-link' {
  return asKindList(MECHANICAL_CONNECTOR_KINDS).includes(kind);
}

export function isRotaryLinkEndpointKind(kind: PrimitiveKind) {
  return asKindList(ROTARY_LINK_ENDPOINT_KINDS).includes(kind);
}

export function isRopeEndpointKind(kind: PrimitiveKind) {
  return asKindList(ROPE_ENDPOINT_KINDS).includes(kind);
}

export function isStructuralBaseKind(kind: PrimitiveKind) {
  return asKindList(STRUCTURAL_BASE_KINDS).includes(kind);
}

export function isMechanicalJointEndpointKind(kind: PrimitiveKind) {
  return asKindList(BODY_BACKED_CONNECTOR_ENDPOINT_KINDS).includes(kind);
}

export function connectorReferencesPrimitive(
  primitive: PrimitiveInstance,
  primitiveId: string,
) {
  if (primitive.kind === 'beam') {
    const config = primitive.config as { fromNodeId?: string; toNodeId?: string };
    return config.fromNodeId === primitiveId || config.toNodeId === primitiveId;
  }
  if (isConnectorKind(primitive.kind)) {
    const config = primitive.config as { fromId?: string; toId?: string; viaIds?: string[]; motorId?: string };
    return config.fromId === primitiveId
      || config.toId === primitiveId
      || config.motorId === primitiveId
      || Boolean(config.viaIds?.includes(primitiveId));
  }
  return false;
}

export function getConnectedPrimitiveIds(primitive: PrimitiveInstance) {
  if (!isConnectorKind(primitive.kind)) {
    return [];
  }
  const config = primitive.config as { fromId?: string; toId?: string; viaIds?: string[]; motorId?: string };
  return [
    config.fromId,
    ...(config.viaIds ?? []),
    config.toId,
    config.motorId,
  ].filter((value): value is string => typeof value === 'string' && value.length > 0);
}

export function getPrimitiveAnchor(
  primitive: PrimitiveInstance,
  role: ConnectorAnchorRole = 'general',
  primitives?: PrimitiveInstance[],
) {
  if (primitive.kind === 'locomotive' || primitive.kind === 'wagon') {
    const cfg = primitive.config as { x?: number; y?: number; trackId?: string; progress?: number; offset?: number };
    if (typeof cfg.x === 'number' && typeof cfg.y === 'number') {
      return { x: cfg.x, y: cfg.y };
    }
    if (typeof cfg.trackId === 'string' && primitives) {
      const route = resolveRailRoute(primitives, cfg.trackId);
      if (route.points.length >= 2) {
        let progress = cfg.progress ?? 0;
        if (
          primitive.kind === 'wagon'
          && typeof cfg.progress !== 'number'
          && typeof cfg.offset === 'number'
        ) {
          const leadLocomotive = primitives.find((candidate) =>
            candidate.kind === 'locomotive'
            && (candidate.config as { trackId?: string }).trackId === cfg.trackId);
          progress = Number((leadLocomotive?.config as { progress?: number } | undefined)?.progress ?? 0) + cfg.offset;
        }
        const pose = getTrackPoseFromPoints(route.points, progress);
        return { x: pose.x, y: pose.y };
      }
    }
  }

  if (primitive.kind === 'crane-arm') {
    const config = primitive.config as { x: number; y: number; length?: number };
    const length = config.length ?? 120;
    if (role === 'joint') {
      return { x: config.x, y: config.y };
    }
    if (role === 'rope') {
      return { x: config.x + length, y: config.y };
    }
    return { x: config.x + length / 2, y: config.y };
  }

  if (primitive.kind === 'bucket') {
    const config = primitive.config as { x: number; y: number; depth?: number };
    if (role === 'general') {
      return { x: config.x, y: config.y + (config.depth ?? 30) / 2 };
    }
    return { x: config.x, y: config.y };
  }

  if ('x' in primitive.config && 'y' in primitive.config) {
    return {
      x: Number(primitive.config.x),
      y: Number(primitive.config.y),
    };
  }

  if ('path' in primitive.config) {
    const path = (primitive.config as { path: Array<{ x: number; y: number }> }).path;
    return averagePoint(path);
  }

  if ('points' in primitive.config) {
    const points = (primitive.config as { points: Array<{ x: number; y: number }> }).points;
    return averagePoint(points);
  }

  return { x: 0, y: 0 };
}

export function normalizeJointPair(
  source: PrimitiveInstance,
  target: PrimitiveInstance,
) {
  if (isStructuralBaseKind(source.kind) && !isStructuralBaseKind(target.kind)) {
    return { from: source, to: target };
  }
  if (isStructuralBaseKind(target.kind) && !isStructuralBaseKind(source.kind)) {
    return { from: target, to: source };
  }
  return { from: source, to: target };
}

export function measureConnectorPath(
  manifest: ExperimentManifest,
  ids: string[],
  role: ConnectorAnchorRole = 'general',
) {
  let total = 0;
  for (let index = 1; index < ids.length; index += 1) {
    const current = manifest.primitives.find((primitive) => primitive.id === ids[index]);
    const previous = manifest.primitives.find((primitive) => primitive.id === ids[index - 1]);
    if (!current || !previous) {
      continue;
    }
    const currentAnchor = getPrimitiveAnchor(current, role, manifest.primitives);
    const previousAnchor = getPrimitiveAnchor(previous, role, manifest.primitives);
    total += Math.hypot(currentAnchor.x - previousAnchor.x, currentAnchor.y - previousAnchor.y);
  }
  return total;
}

export function hasConnectorBetween(
  manifest: ExperimentManifest,
  leftId: string,
  rightId: string,
  connectorKinds: PrimitiveKind[],
) {
  return manifest.primitives.some((primitive) => {
    if (!connectorKinds.includes(primitive.kind)) {
      return false;
    }
    const config = primitive.config as { fromId?: string; toId?: string };
    return (
      (config.fromId === leftId && config.toId === rightId)
      || (config.fromId === rightId && config.toId === leftId)
    );
  });
}

export function getJointIsland(manifest: ExperimentManifest, rootId: string) {
  const visited = new Set<string>();
  const queue = [rootId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId || visited.has(currentId)) {
      continue;
    }
    visited.add(currentId);

    for (const primitive of manifest.primitives) {
      if (isMechanicalConnectorKind(primitive.kind)) {
        const config = primitive.config as { fromId: string; toId: string };
        if (config.fromId === currentId && !visited.has(config.toId)) {
          queue.push(config.toId);
        } else if (config.toId === currentId && !visited.has(config.fromId)) {
          queue.push(config.fromId);
        }
      }

      const attachedToId = (primitive.config as { attachedToId?: string }).attachedToId;
      if (attachedToId === currentId && !visited.has(primitive.id)) {
        queue.push(primitive.id);
      }
      if (primitive.id === currentId && typeof attachedToId === 'string' && !visited.has(attachedToId)) {
        queue.push(attachedToId);
      }
    }
  }

  return visited;
}

export function getPoweredHingeControls(connectorId: string, label: string): ControlSpec[] {
  return [
    {
      id: `${connectorId}-enabled`,
      kind: 'toggle',
      label: `${label} Run`,
      description: 'Turns the powered hinge on or off.',
      bind: { targetId: connectorId, path: 'enabled' },
      defaultValue: true,
    },
    {
      id: `${connectorId}-target`,
      kind: 'slider',
      label: `${label} Angle`,
      description: 'Sets how far the powered hinge should swing.',
      bind: { targetId: connectorId, path: 'targetAngle' },
      defaultValue: 45,
      min: -90,
      max: 90,
      step: 5,
    },
  ];
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
