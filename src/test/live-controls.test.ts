import { describe, expect, it } from 'vitest';
import { getMergedControls, readControlValue } from '../lib/live-controls';
import { createEmptyManifest } from '../lib/seed-data';

describe('live controls', () => {
  it('generates quick-control bindings for runnable parts', () => {
    const manifest = createEmptyManifest();
    manifest.primitives = [
      { id: 'motor-1', kind: 'motor', label: 'Motor', config: { x: 100, y: 120, rpm: 90, torque: 1, powerState: true } },
      { id: 'winch-1', kind: 'winch', label: 'Winch', config: { x: 160, y: 120, speed: 30, ropeLength: 180 } },
      { id: 'hinge-1', kind: 'powered-hinge-link', label: 'Powered Hinge', config: {
        fromId: 'base-1',
        toId: 'arm-1',
        pivotX: 260,
        pivotY: 280,
        fromLocalX: 0,
        fromLocalY: -20,
        toLocalX: -75,
        toLocalY: 0,
        minAngle: -55,
        maxAngle: 65,
        motorId: 'motor-1',
        targetAngle: 35,
        enabled: true,
      } },
      { id: 'loco-1', kind: 'locomotive', label: 'Locomotive', config: { trackId: 'track-1', progress: 0, speed: 0.35, enabled: true } },
      { id: 'switch-1', kind: 'rail-switch', label: 'Switch', config: { x: 500, y: 260, branch: 'right' } },
      { id: 'silo-1', kind: 'silo-bin', label: 'Silo', config: { x: 620, y: 300, width: 90, height: 140, gateOpen: false } },
    ];

    const controls = getMergedControls(manifest);

    expect(controls.some((control) => control.bind?.targetId === 'motor-1' && control.bind.path === 'powerState')).toBe(true);
    expect(controls.some((control) => control.bind?.targetId === 'winch-1' && control.bind.path === 'ropeLength')).toBe(true);
    expect(controls.some((control) => control.bind?.targetId === 'hinge-1' && control.bind.path === 'targetAngle')).toBe(true);
    expect(controls.some((control) => control.bind?.targetId === 'loco-1' && control.bind.path === 'enabled')).toBe(true);
    expect(controls.some((control) => control.bind?.targetId === 'switch-1' && control.bind.path === 'branchRight')).toBe(true);
    expect(controls.some((control) => control.bind?.targetId === 'silo-1' && control.bind.path === 'gateOpen')).toBe(true);
  });

  it('reads live overrides while falling back to generated defaults', () => {
    const manifest = createEmptyManifest();
    manifest.primitives = [
      { id: 'motor-1', kind: 'motor', label: 'Motor', config: { x: 100, y: 120, rpm: 90, torque: 1, powerState: true } },
      { id: 'switch-1', kind: 'rail-switch', label: 'Switch', config: { x: 500, y: 260, branch: 'right' } },
    ];

    const controls = getMergedControls(manifest);

    expect(readControlValue(controls, {}, 'motor-1', 'rpm', 0)).toBe(90);
    expect(readControlValue(controls, { 'motor-1-rpm': 120 }, 'motor-1', 'rpm', 0)).toBe(120);
    expect(readControlValue(controls, {}, 'switch-1', 'branchRight', false)).toBe(true);
    expect(readControlValue(controls, { 'switch-1-branch-right': false }, 'switch-1', 'branchRight', true)).toBe(false);
  });
});
