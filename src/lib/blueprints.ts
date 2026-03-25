import { nanoid } from 'nanoid';
import type {
  AssemblyInstance,
  BlueprintCategory,
  ExperimentManifest,
  MachineBlueprint,
  PrimitiveConfig,
  PrimitiveInstance,
} from './types';

export function createBlueprintFromExperiment(manifest: ExperimentManifest): MachineBlueprint {
  const category = inferBlueprintCategory(manifest);

  return {
    blueprintId: nanoid(),
    category,
    title: `${manifest.metadata.title} Module`,
    summary: manifest.metadata.shortDescription,
    tags: Array.from(new Set(['saved', ...manifest.metadata.tags])).slice(0, 6),
    ports: inferBlueprintPorts(manifest, category),
    fragment: {
      primitives: structuredClone(manifest.primitives),
      behaviors: structuredClone(manifest.behaviors),
      controls: structuredClone(manifest.controls),
      hud: structuredClone(manifest.hud),
    },
  };
}

export function mountBlueprintToManifest(
  manifest: ExperimentManifest,
  blueprint: MachineBlueprint,
  placement: { x: number; y: number } = { x: 620, y: 340 },
): ExperimentManifest {
  const idSuffix = nanoid(5);
  const idMap = new Map<string, string>();

  for (const primitive of blueprint.fragment.primitives) {
    idMap.set(primitive.id, `${primitive.id}-${idSuffix}`);
  }

  const bounds = getBlueprintBounds(blueprint.fragment.primitives);
  const dx = placement.x - bounds.centerX;
  const dy = placement.y - bounds.centerY;

  const mountedPrimitives = blueprint.fragment.primitives.map((primitive) => ({
    ...primitive,
    id: idMap.get(primitive.id) ?? primitive.id,
    config: remapPrimitiveConfig(primitive, idMap, dx, dy),
  }));

  const mountedBehaviors = blueprint.fragment.behaviors.map((behavior) => ({
    ...behavior,
    id: `${behavior.id}-${idSuffix}`,
    targets: behavior.targets.map((target) => idMap.get(target) ?? target),
  }));

  const mountedControls = blueprint.fragment.controls.map((control) => ({
    ...control,
    id: `${control.id}-${idSuffix}`,
    bind: control.bind
      ? {
          ...control.bind,
          targetId: idMap.get(control.bind.targetId) ?? control.bind.targetId,
        }
      : undefined,
  }));

  const mountedHud = blueprint.fragment.hud.map((widget) => ({
    ...widget,
    id: `${widget.id}-${idSuffix}`,
  }));

  const assembly: AssemblyInstance = {
    assemblyId: `assembly-${idSuffix}`,
    label: blueprint.title,
    role: inferAssemblyRole(blueprint.category),
    source: {
      type: 'blueprint',
      blueprintId: blueprint.blueprintId,
    },
  };

  return {
    ...manifest,
    primitives: [...manifest.primitives, ...mountedPrimitives],
    behaviors: [...manifest.behaviors, ...mountedBehaviors],
    controls: [...manifest.controls, ...mountedControls],
    hud: [...manifest.hud, ...mountedHud],
    assemblies: [...manifest.assemblies, assembly],
  };
}

function inferBlueprintCategory(manifest: ExperimentManifest): BlueprintCategory {
  const kinds = new Set(manifest.primitives.map((primitive) => primitive.kind));

  if (kinds.has('conveyor') || kinds.has('rail-segment') || kinds.has('wagon')) {
    return 'transport';
  }
  if (kinds.has('winch') || kinds.has('hook')) {
    return 'tool-head';
  }
  if (kinds.has('gear') || kinds.has('motor')) {
    return 'drivetrain';
  }
  if (kinds.has('hopper') || kinds.has('material-pile')) {
    return 'flow-system';
  }
  if (kinds.has('wheel') || kinds.has('axle')) {
    return 'chassis';
  }
  return 'structure';
}

function inferBlueprintPorts(manifest: ExperimentManifest, category: BlueprintCategory) {
  const kinds = new Set(manifest.primitives.map((primitive) => primitive.kind));
  const ports: MachineBlueprint['ports'] = [
    {
      portId: 'mount-main',
      kind: 'mount',
      label: 'Main Mount',
      compatibleWith: ['mount'],
    },
  ];

  if (kinds.has('motor') || kinds.has('gear') || kinds.has('winch')) {
    ports.push({
      portId: 'power-out',
      kind: 'power-out',
      label: 'Drive Output',
      compatibleWith: ['power-in', 'mount'],
    });
  }

  if (kinds.has('conveyor') || kinds.has('hopper') || kinds.has('wagon')) {
    ports.push({
      portId: 'material-in',
      kind: 'material-in',
      label: 'Material In',
      compatibleWith: ['material-out', 'mount'],
    });
    ports.push({
      portId: 'material-out',
      kind: 'material-out',
      label: 'Material Out',
      compatibleWith: ['material-in', 'mount'],
    });
  }

  if (category === 'chassis' && !ports.some((port) => port.kind === 'power-in')) {
    ports.push({
      portId: 'power-in',
      kind: 'power-in',
      label: 'Power Mount',
      compatibleWith: ['power-out', 'mount'],
    });
  }

  return ports.slice(0, 4);
}

function inferAssemblyRole(category: BlueprintCategory): AssemblyInstance['role'] {
  switch (category) {
    case 'chassis':
      return 'machine-base';
    case 'tool-head':
      return 'tool-head';
    case 'drivetrain':
      return 'drivetrain';
    case 'transport':
    case 'flow-system':
      return 'transport-line';
    default:
      return 'support-structure';
  }
}

function getBlueprintBounds(primitives: PrimitiveInstance[]) {
  const points: Array<{ x: number; y: number }> = [];

  for (const primitive of primitives) {
    if ('x' in primitive.config && 'y' in primitive.config) {
      points.push({ x: Number(primitive.config.x), y: Number(primitive.config.y) });
    }
    if ('points' in primitive.config && Array.isArray(primitive.config.points)) {
      for (const point of primitive.config.points) {
        points.push({ x: point.x, y: point.y });
      }
    }
    if ('path' in primitive.config && Array.isArray(primitive.config.path)) {
      for (const point of primitive.config.path) {
        points.push({ x: point.x, y: point.y });
      }
    }
  }

  if (points.length === 0) {
    return { centerX: 0, centerY: 0 };
  }

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);

  return {
    centerX: (Math.min(...xs) + Math.max(...xs)) / 2,
    centerY: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
}

function remapPrimitiveConfig(
  primitive: PrimitiveInstance,
  idMap: Map<string, string>,
  dx: number,
  dy: number,
): PrimitiveConfig {
  const config = structuredClone(primitive.config) as unknown as Record<string, unknown>;

  if ('x' in config && 'y' in config && typeof config.x === 'number' && typeof config.y === 'number') {
    config.x += dx;
    config.y += dy;
  }

  if ('points' in config && Array.isArray(config.points)) {
    config.points = config.points.map((point) => ({
      ...point,
      x: point.x + dx,
      y: point.y + dy,
    }));
  }

  if ('path' in config && Array.isArray(config.path)) {
    config.path = config.path.map((point) => ({
      ...point,
      x: point.x + dx,
      y: point.y + dy,
    }));
  }

  if (primitive.kind === 'beam') {
    config.fromNodeId = idMap.get(String(config.fromNodeId)) ?? config.fromNodeId;
    config.toNodeId = idMap.get(String(config.toNodeId)) ?? config.toNodeId;
  }

  if (primitive.kind === 'rope') {
    config.fromId = idMap.get(String(config.fromId)) ?? config.fromId;
    config.toId = idMap.get(String(config.toId)) ?? config.toId;
  }

  if (primitive.kind === 'locomotive' || primitive.kind === 'wagon') {
    config.trackId = idMap.get(String(config.trackId)) ?? config.trackId;
  }

  if (primitive.kind === 'cargo-block' && typeof config.attachedToId === 'string') {
    config.attachedToId = idMap.get(config.attachedToId) ?? config.attachedToId;
  }

  return config as unknown as PrimitiveConfig;
}
