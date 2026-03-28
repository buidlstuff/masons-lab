import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PartPalette } from '../components/PartPalette';
import { createEmptyManifest } from '../lib/seed-data';
import type { PrimitiveInstance } from '../lib/types';

describe('PartPalette connector shortcuts', () => {
  it('disables connector buttons until compatible parts are on the canvas', () => {
    const onCreateConnector = vi.fn();
    const manifest = createEmptyManifest();
    const { rerender } = render(
      <PartPalette
        manifest={manifest}
        onSelectKind={() => {}}
        onCreateConnector={onCreateConnector}
      />,
    );

    expect(screen.getByRole('button', { name: 'Rope' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Belt' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Chain' })).toBeDisabled();

    const readyPrimitives: PrimitiveInstance[] = [
      { id: 'winch-1', kind: 'winch', label: 'Winch', config: { x: 220, y: 220, ropeLength: 180, speed: 20 } },
      { id: 'hook-1', kind: 'hook', label: 'Hook', config: { x: 220, y: 360 } },
      { id: 'pulley-1', kind: 'pulley', label: 'Pulley', config: { x: 360, y: 220, radius: 28 } },
      { id: 'flywheel-1', kind: 'flywheel', label: 'Flywheel', config: { x: 460, y: 220, radius: 36, mass: 5 } },
      { id: 'sprocket-1', kind: 'chain-sprocket', label: 'Chain Sprocket', config: { x: 560, y: 220, radius: 28 } },
      { id: 'sprocket-2', kind: 'chain-sprocket', label: 'Chain Sprocket', config: { x: 660, y: 220, radius: 28 } },
    ];
    const readyManifest = {
      ...manifest,
      primitives: readyPrimitives,
    };

    rerender(
      <PartPalette
        manifest={readyManifest}
        onSelectKind={() => {}}
        onCreateConnector={onCreateConnector}
      />,
    );

    expect(screen.getByRole('button', { name: 'Rope' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Belt' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Chain' })).toBeEnabled();
  });
});
