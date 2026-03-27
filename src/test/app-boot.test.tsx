import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppBootProvider, useAppBoot } from '../lib/app-boot';

function deferredTask() {
  let resolve!: () => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<void>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function BootStatusProbe() {
  const boot = useAppBoot();
  return (
    <div>
      <span data-testid="boot-status">{boot.status}</span>
      <span data-testid="boot-message">{boot.message ?? ''}</span>
    </div>
  );
}

describe('app boot provider', () => {
  it('transitions from pending to ready', async () => {
    const task = deferredTask();

    render(
      <AppBootProvider bootTask={() => task.promise}>
        <BootStatusProbe />
      </AppBootProvider>,
    );

    expect(screen.getByTestId('boot-status')).toHaveTextContent('pending');
    task.resolve();

    await waitFor(() => {
      expect(screen.getByTestId('boot-status')).toHaveTextContent('ready');
    });
  });

  it('transitions from pending to degraded on failure', async () => {
    const task = deferredTask();

    render(
      <AppBootProvider bootTask={() => task.promise}>
        <BootStatusProbe />
      </AppBootProvider>,
    );

    task.reject(new Error('storage failed'));

    await waitFor(() => {
      expect(screen.getByTestId('boot-status')).toHaveTextContent('degraded');
      expect(screen.getByTestId('boot-message')).toHaveTextContent('storage failed');
    });
  });
});
