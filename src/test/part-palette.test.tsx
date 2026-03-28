import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PartPalette } from '../components/PartPalette';
import { createEmptyManifest } from '../lib/seed-data';

describe('PartPalette', () => {
  it('focuses the drawer on parts instead of connector shortcuts', () => {
    render(
      <PartPalette
        manifest={createEmptyManifest()}
        onSelectKind={() => {}}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Pick the next part' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rope' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bolt' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Starter' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All Parts' })).toBeInTheDocument();
  });
});
