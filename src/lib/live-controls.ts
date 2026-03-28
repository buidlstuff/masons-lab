import type { ControlSpec, ExperimentManifest, PrimitiveInstance } from './types';

function bindingKey(control: ControlSpec) {
  return control.bind ? `${control.bind.targetId}:${control.bind.path}` : `id:${control.id}`;
}

function hasBinding(
  controls: ControlSpec[],
  targetId: string,
  path: string,
) {
  return controls.some((control) => control.bind?.targetId === targetId && control.bind?.path === path);
}

function createGeneratedControls(primitive: PrimitiveInstance): ControlSpec[] {
  switch (primitive.kind) {
    case 'motor':
      return [
        {
          id: `${primitive.id}-power`,
          kind: 'toggle',
          label: 'Run',
          description: 'Turns the motor on or off.',
          bind: { targetId: primitive.id, path: 'powerState' },
          defaultValue: Boolean((primitive.config as { powerState?: boolean }).powerState ?? true),
        },
        {
          id: `${primitive.id}-rpm`,
          kind: 'slider',
          label: 'Speed',
          description: 'Raises or lowers motor speed.',
          bind: { targetId: primitive.id, path: 'rpm' },
          defaultValue: Number((primitive.config as { rpm?: number }).rpm ?? 60),
          min: 0,
          max: 160,
          step: 5,
        },
      ];
    case 'winch':
      return [
        {
          id: `${primitive.id}-rope-length`,
          kind: 'slider',
          label: 'Rope Length',
          description: 'Shorter rope lifts the hanging tool. Longer rope lowers it.',
          bind: { targetId: primitive.id, path: 'ropeLength' },
          defaultValue: Number((primitive.config as { ropeLength?: number }).ropeLength ?? 180),
          min: 60,
          max: 280,
          step: 5,
        },
      ];
    case 'powered-hinge-link':
      return [
        {
          id: `${primitive.id}-enabled`,
          kind: 'toggle',
          label: 'Run',
          description: 'Turns the powered hinge on or off.',
          bind: { targetId: primitive.id, path: 'enabled' },
          defaultValue: Boolean((primitive.config as { enabled?: boolean }).enabled ?? true),
        },
        {
          id: `${primitive.id}-target-angle`,
          kind: 'slider',
          label: 'Angle',
          description: 'Sets the hinge target angle.',
          bind: { targetId: primitive.id, path: 'targetAngle' },
          defaultValue: Number((primitive.config as { targetAngle?: number }).targetAngle ?? 45),
          min: Number((primitive.config as { minAngle?: number }).minAngle ?? -75),
          max: Number((primitive.config as { maxAngle?: number }).maxAngle ?? 75),
          step: 5,
        },
      ];
    case 'locomotive':
      return [
        {
          id: `${primitive.id}-enabled`,
          kind: 'toggle',
          label: 'Run',
          description: 'Stops or starts the locomotive without deleting the setup.',
          bind: { targetId: primitive.id, path: 'enabled' },
          defaultValue: Number((primitive.config as { speed?: number }).speed ?? 0.18) > 0,
        },
        {
          id: `${primitive.id}-speed`,
          kind: 'slider',
          label: 'Speed',
          description: 'Adjusts the locomotive speed target.',
          bind: { targetId: primitive.id, path: 'speed' },
          defaultValue: Number((primitive.config as { speed?: number }).speed ?? 0.18),
          min: 0,
          max: 1.2,
          step: 0.05,
        },
      ];
    case 'rail-switch':
      return [
        {
          id: `${primitive.id}-branch-right`,
          kind: 'toggle',
          label: 'Right Branch',
          description: 'Switches between the right branch and the left branch.',
          bind: { targetId: primitive.id, path: 'branchRight' },
          defaultValue: ((primitive.config as { branch?: string }).branch ?? 'right') === 'right',
        },
      ];
    case 'silo-bin':
      return [
        {
          id: `${primitive.id}-gate-open`,
          kind: 'toggle',
          label: 'Open Gate',
          description: 'Opens or closes the silo gate.',
          bind: { targetId: primitive.id, path: 'gateOpen' },
          defaultValue: Boolean((primitive.config as { gateOpen?: boolean }).gateOpen ?? false),
        },
      ];
    default:
      return [];
  }
}

export function getMergedControls(manifest: ExperimentManifest | null) {
  if (!manifest) {
    return [] as ControlSpec[];
  }

  const merged = [...manifest.controls];
  const seen = new Set(merged.map(bindingKey));

  for (const primitive of manifest.primitives) {
    for (const control of createGeneratedControls(primitive)) {
      const key = bindingKey(control);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      merged.push(control);
    }
  }

  return merged;
}

export function findBoundControl(
  controls: ControlSpec[],
  targetId: string,
  path: string,
) {
  return controls.find((control) => control.bind?.targetId === targetId && control.bind?.path === path);
}

export function readControlValue(
  controls: ControlSpec[],
  values: Record<string, string | number | boolean>,
  targetId: string,
  path: string,
  fallback: string | number | boolean,
) {
  const control = findBoundControl(controls, targetId, path);
  if (!control) {
    return fallback;
  }
  return values[control.id] ?? control.defaultValue ?? fallback;
}

export function hasGeneratedOrManifestControl(
  manifest: ExperimentManifest | null,
  targetId: string,
  path: string,
) {
  if (!manifest) {
    return false;
  }
  return hasBinding(getMergedControls(manifest), targetId, path);
}
