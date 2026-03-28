import { nanoid } from 'nanoid';
import {
  connectorReferencesPrimitive,
  getJointIsland,
  getPoweredHingeControls,
  getPrimitiveAnchor as getConnectorAnchor,
  hasConnectorBetween,
  isMechanicalJointEndpointKind,
  isRopeEndpointKind,
  isRotaryLinkEndpointKind,
  isTransmissionConnectorKind,
  measureConnectorPath,
  normalizeJointPair,
} from './connectors';
import type { ExperimentManifest, PrimitiveConfig, PrimitiveInstance, PrimitiveKind } from './types';

interface ConnectPrimitiveOptions {
  forceKind?: 'rope' | 'belt-link' | 'chain-link' | 'bolt-link' | 'hinge-link' | 'powered-hinge-link';
  motorId?: string;
}

function isLocomotiveDriverKind(kind: PrimitiveKind) {
  return kind === 'gear' || isRotaryLinkEndpointKind(kind);
}

function isLegacyRotaryRope(primitive: PrimitiveInstance, sourceId: string, targetId: string) {
  if (primitive.kind !== 'rope') return false;
  const cfg = primitive.config as { fromId?: string; toId?: string };
  return (
    (cfg.fromId === sourceId && cfg.toId === targetId)
    || (cfg.fromId === targetId && cfg.toId === sourceId)
  );
}

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
  const moved = manifest.primitives.find((primitive) => primitive.id === primitiveId);
  if (!moved) {
    return manifest;
  }

  const { deltaX, deltaY } = resolveMoveDelta(moved, x, y);
  if (deltaX === 0 && deltaY === 0) {
    return manifest;
  }

  const island = getJointIsland(manifest, primitiveId);
  const shiftedPrimitives = manifest.primitives.map((primitive) => {
    if (
      (primitive.kind === 'hinge-link' || primitive.kind === 'powered-hinge-link')
      && island.has((primitive.config as { fromId: string }).fromId)
      && island.has((primitive.config as { toId: string }).toId)
    ) {
      return {
        ...primitive,
        config: {
          ...primitive.config,
          pivotX: Number((primitive.config as { pivotX?: number }).pivotX ?? 0) + deltaX,
          pivotY: Number((primitive.config as { pivotY?: number }).pivotY ?? 0) + deltaY,
        } as PrimitiveConfig,
      };
    }

    if (!island.has(primitive.id)) {
      return primitive;
    }

    return shiftPrimitiveByDelta(primitive, deltaX, deltaY);
  });

  const finalPrimitives = shiftedPrimitives.map((primitive) => {
    const attachedToId = (primitive.config as { attachedToId?: string }).attachedToId;
    if (!attachedToId || !supportsAttachmentOffsets(primitive) || !('x' in primitive.config && 'y' in primitive.config)) {
      return primitive;
    }
    const parent = shiftedPrimitives.find((item) => item.id === attachedToId);
    if (!parent) {
      return primitive;
    }
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
  const removedIds = new Set(
    manifest.primitives
      .filter((primitive) => primitive.id === primitiveId || connectorReferencesPrimitive(primitive, primitiveId))
      .map((primitive) => primitive.id),
  );

  return {
    ...manifest,
    primitives: manifest.primitives
      .filter((primitive) => !removedIds.has(primitive.id))
      .map((primitive) => {
        const attachedToId = (primitive.config as { attachedToId?: string }).attachedToId;
        const drivePartId = (primitive.config as { drivePartId?: string }).drivePartId;
        if (primitive.kind === 'locomotive' && drivePartId === primitiveId) {
          const nextConfig = { ...primitive.config } as Record<string, unknown>;
          delete nextConfig.drivePartId;
          return { ...primitive, config: nextConfig as unknown as PrimitiveConfig };
        }
        if (attachedToId !== primitiveId) {
          return primitive;
        }
        const nextConfig = { ...primitive.config } as Record<string, unknown>;
        delete nextConfig.attachedToId;
        delete nextConfig.attachOffsetX;
        delete nextConfig.attachOffsetY;
        return { ...primitive, config: nextConfig as unknown as PrimitiveConfig };
      }),
    controls: manifest.controls.filter((control) => !removedIds.has(control.bind?.targetId ?? '')),
    behaviors: manifest.behaviors.filter(
      (behavior) => !behavior.targets.includes(primitiveId),
    ),
  };
}

export function connectPrimitives(
  manifest: ExperimentManifest,
  sourceId: string,
  targetId: string,
  options: ConnectPrimitiveOptions = {},
): ExperimentManifest {
  const source = manifest.primitives.find((primitive) => primitive.id === sourceId);
  const target = manifest.primitives.find((primitive) => primitive.id === targetId);
  if (!source || !target) {
    return manifest;
  }

  if (options.forceKind) {
    return createConnectorPrimitive(manifest, source, target, options.forceKind, options.motorId);
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

  if (
    (source.kind === 'winch' && isRopeEndpointKind(target.kind))
    || (target.kind === 'winch' && isRopeEndpointKind(source.kind))
  ) {
    return createConnectorPrimitive(manifest, source, target, 'rope');
  }

  if (
    (source.kind === 'locomotive' && isLocomotiveDriverKind(target.kind))
    || (target.kind === 'locomotive' && isLocomotiveDriverKind(source.kind))
  ) {
    const loco = source.kind === 'locomotive' ? source : target;
    const driver = source.kind === 'locomotive' ? target : source;
    return {
      ...manifest,
      primitives: manifest.primitives.map((primitive) => (
        primitive.id === loco.id
          ? {
              ...primitive,
              config: {
                ...primitive.config,
                drivePartId: driver.id,
              } as PrimitiveConfig,
            }
          : primitive
      )),
    };
  }

  if (isRotaryLinkEndpointKind(source.kind) && isRotaryLinkEndpointKind(target.kind)) {
    const exists = manifest.primitives.some((primitive) => (
      (isTransmissionConnectorKind(primitive.kind) || isLegacyRotaryRope(primitive, sourceId, targetId))
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
    return createConnectorPrimitive(
      manifest,
      source,
      target,
      source.kind === 'chain-sprocket' || target.kind === 'chain-sprocket' ? 'chain-link' : 'belt-link',
    );
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

function createConnectorPrimitive(
  manifest: ExperimentManifest,
  source: PrimitiveInstance,
  target: PrimitiveInstance,
  kind: NonNullable<ConnectPrimitiveOptions['forceKind']>,
  motorId?: string,
): ExperimentManifest {
  if (kind === 'rope') {
    const winch = source.kind === 'winch' ? source : target.kind === 'winch' ? target : null;
    const endpoint = winch === source ? target : source;
    if (!winch || !isRopeEndpointKind(endpoint.kind) || hasConnectorBetween(manifest, winch.id, endpoint.id, ['rope'])) {
      return manifest;
    }
    return {
      ...manifest,
      primitives: [
        ...manifest.primitives,
        {
          id: `rope-${nanoid(6)}`,
          kind: 'rope',
          label: endpoint.kind === 'bucket' ? 'Bucket Rope' : endpoint.kind === 'crane-arm' ? 'Arm Rope' : 'Hoist Rope',
          config: {
            fromId: winch.id,
            toId: endpoint.id,
            length: Math.max(120, measureConnectorPath(manifest, [winch.id, endpoint.id], 'rope')),
          },
        },
      ],
    };
  }

  if (kind === 'belt-link' || kind === 'chain-link') {
    if (!isRotaryLinkEndpointKind(source.kind) || !isRotaryLinkEndpointKind(target.kind)) {
      return manifest;
    }
    if (hasConnectorBetween(manifest, source.id, target.id, ['belt-link', 'chain-link'])) {
      return manifest;
    }
    const sourcePos = getAttachmentAnchor(source);
    const targetPos = getAttachmentAnchor(target);
    const linkKind: PrimitiveKind = kind === 'chain-link' || source.kind === 'chain-sprocket' || target.kind === 'chain-sprocket'
      ? 'chain-link'
      : 'belt-link';
    return {
      ...manifest,
      primitives: [
        ...manifest.primitives,
        {
          id: `${linkKind === 'chain-link' ? 'chain' : 'belt'}-${nanoid(6)}`,
          kind: linkKind,
          label: linkKind === 'chain-link' ? 'Chain Link' : 'Drive Belt',
          config: {
            fromId: source.id,
            toId: target.id,
            length: Math.max(40, Math.hypot(targetPos.x - sourcePos.x, targetPos.y - sourcePos.y)),
          },
        },
      ],
    };
  }

  if (kind === 'bolt-link') {
    if (!isMechanicalJointEndpointKind(source.kind) || !isMechanicalJointEndpointKind(target.kind)) {
      return manifest;
    }
    if (hasConnectorBetween(manifest, source.id, target.id, ['bolt-link', 'hinge-link', 'powered-hinge-link'])) {
      return manifest;
    }
    const { from, to } = normalizeJointPair(source, target);
    const fromAnchor = getConnectorAnchor(from, 'general');
    const toAnchor = getConnectorAnchor(to, 'general');
    return {
      ...manifest,
      primitives: [
        ...manifest.primitives,
        {
          id: `bolt-${nanoid(6)}`,
          kind: 'bolt-link',
          label: 'Bolt Link',
          config: {
            fromId: from.id,
            toId: to.id,
            offsetX: toAnchor.x - fromAnchor.x,
            offsetY: toAnchor.y - fromAnchor.y,
            angleOffset: 0,
          },
        },
      ],
    };
  }

  if (kind === 'hinge-link' || kind === 'powered-hinge-link') {
    if (!isMechanicalJointEndpointKind(source.kind) || !isMechanicalJointEndpointKind(target.kind)) {
      return manifest;
    }
    if (hasConnectorBetween(manifest, source.id, target.id, ['bolt-link', 'hinge-link', 'powered-hinge-link'])) {
      return manifest;
    }
    if (kind === 'powered-hinge-link' && !manifest.primitives.some((primitive) => primitive.id === motorId && primitive.kind === 'motor')) {
      return manifest;
    }

    const { from, to } = normalizeJointPair(source, target);
    const fromAnchor = getConnectorAnchor(from, 'joint');
    const toAnchor = getConnectorAnchor(to, 'joint');
    const connectorId = `${kind === 'powered-hinge-link' ? 'phinge' : 'hinge'}-${nanoid(6)}`;
    const nextPrimitives = [
      ...manifest.primitives,
      {
        id: connectorId,
        kind,
        label: kind === 'powered-hinge-link' ? 'Powered Hinge' : 'Hinge Link',
        config: {
          fromId: from.id,
          toId: to.id,
          pivotX: (fromAnchor.x + toAnchor.x) / 2,
          pivotY: (fromAnchor.y + toAnchor.y) / 2,
          fromLocalX: ((fromAnchor.x + toAnchor.x) / 2) - fromAnchor.x,
          fromLocalY: ((fromAnchor.y + toAnchor.y) / 2) - fromAnchor.y,
          toLocalX: ((fromAnchor.x + toAnchor.x) / 2) - toAnchor.x,
          toLocalY: ((fromAnchor.y + toAnchor.y) / 2) - toAnchor.y,
          minAngle: -75,
          maxAngle: 75,
          ...(kind === 'powered-hinge-link'
            ? {
                motorId,
                targetAngle: 45,
                enabled: true,
              }
            : {}),
        },
      } as PrimitiveInstance,
    ];

    if (kind !== 'powered-hinge-link') {
      return { ...manifest, primitives: nextPrimitives };
    }

    return {
      ...manifest,
      primitives: nextPrimitives,
      controls: [
        ...manifest.controls,
        ...getPoweredHingeControls(connectorId, 'Powered Hinge'),
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
    case 'belt-link':
      return { id: `belt-${nanoid(6)}`, kind, label: 'Drive Belt', config: { fromId: '', toId: '', length: 180 } };
    case 'chain-link':
      return { id: `chain-${nanoid(6)}`, kind, label: 'Chain Link', config: { fromId: '', toId: '', length: 180 } };
    case 'bolt-link':
      return { id: `bolt-${nanoid(6)}`, kind, label: 'Bolt Link', config: { fromId: '', toId: '', offsetX: 0, offsetY: 0, angleOffset: 0 } };
    case 'hinge-link':
      return {
        id: `hinge-link-${nanoid(6)}`,
        kind,
        label: 'Hinge Link',
        config: { fromId: '', toId: '', pivotX: x, pivotY: y, fromLocalX: 0, fromLocalY: 0, toLocalX: 0, toLocalY: 0, minAngle: -75, maxAngle: 75 },
      };
    case 'powered-hinge-link':
      return {
        id: `phinge-${nanoid(6)}`,
        kind,
        label: 'Powered Hinge',
        config: {
          fromId: '',
          toId: '',
          pivotX: x,
          pivotY: y,
          fromLocalX: 0,
          fromLocalY: 0,
          toLocalX: 0,
          toLocalY: 0,
          minAngle: -75,
          maxAngle: 75,
          motorId: '',
          targetAngle: 45,
          enabled: true,
        },
      };
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
    case 'station-zone':
      return { id: `station-${nanoid(6)}`, kind, label: 'Station Zone', config: { x, y, width: 120, height: 120, action: 'load' } };
    case 'trampoline':
      return { id: `trampoline-${nanoid(6)}`, kind, label: 'Trampoline', config: { x, y, width: 160 } };
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

function resolveMoveDelta(primitive: PrimitiveInstance, x: number, y: number) {
  if ('x' in primitive.config && 'y' in primitive.config) {
    return {
      deltaX: x - primitive.config.x,
      deltaY: y - primitive.config.y,
    };
  }
  if ('path' in primitive.config) {
    const anchor = averagePoint((primitive.config as { path: Array<{ x: number; y: number }> }).path);
    return {
      deltaX: x - anchor.x,
      deltaY: y - anchor.y,
    };
  }
  if ('points' in primitive.config) {
    const anchor = averagePoint((primitive.config as { points: Array<{ x: number; y: number }> }).points);
    return {
      deltaX: x - anchor.x,
      deltaY: y - anchor.y,
    };
  }
  return { deltaX: 0, deltaY: 0 };
}

function shiftPrimitiveByDelta(primitive: PrimitiveInstance, deltaX: number, deltaY: number): PrimitiveInstance {
  if ('x' in primitive.config && 'y' in primitive.config) {
    return {
      ...primitive,
      config: {
        ...primitive.config,
        x: primitive.config.x + deltaX,
        y: primitive.config.y + deltaY,
      } as PrimitiveConfig,
    };
  }
  if ('path' in primitive.config) {
    return {
      ...primitive,
      config: {
        ...primitive.config,
        path: (primitive.config as { path: Array<{ x: number; y: number }> }).path.map((point) => ({
          x: point.x + deltaX,
          y: point.y + deltaY,
        })),
      } as PrimitiveConfig,
    };
  }
  if ('points' in primitive.config) {
    return {
      ...primitive,
      config: {
        ...primitive.config,
        points: (primitive.config as { points: Array<{ x: number; y: number }> }).points.map((point) => ({
          x: point.x + deltaX,
          y: point.y + deltaY,
        })),
      } as PrimitiveConfig,
    };
  }
  return primitive;
}

function supportsAttachmentOffsets(primitive: PrimitiveInstance) {
  return primitive.kind === 'wheel'
    || primitive.kind === 'motor'
    || primitive.kind === 'gear'
    || primitive.kind === 'pulley'
    || primitive.kind === 'chain-sprocket'
    || primitive.kind === 'flywheel'
    || primitive.kind === 'winch'
    || primitive.kind === 'crane-arm'
    || primitive.kind === 'bucket'
    || primitive.kind === 'counterweight';
}

function getAttachmentAnchor(primitive: PrimitiveInstance) {
  return getConnectorAnchor(primitive, 'general');
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
