import { afterEach, describe, expect, it, vi } from 'vitest';
import { scheduleBuildPrefetch, shouldPrefetchBuildRoute } from '../lib/route-preload';

const originalConnection = Object.getOwnPropertyDescriptor(window.navigator, 'connection');

describe('route preload helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    if (originalConnection) {
      Object.defineProperty(window.navigator, 'connection', originalConnection);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window.navigator as any).connection;
    }
  });

  it('disables build prefetch when save-data is enabled', () => {
    Object.defineProperty(window.navigator, 'connection', {
      configurable: true,
      value: { saveData: true },
    });

    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const cancel = scheduleBuildPrefetch();

    expect(shouldPrefetchBuildRoute()).toBe(false);
    expect(timeoutSpy).not.toHaveBeenCalled();
    cancel();
  });
});
