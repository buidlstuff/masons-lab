export function loadBuildPage() {
  return import('../pages/BuildPage');
}

export function loadMachinePage() {
  return import('../pages/MachinePage');
}

export function loadJobPage() {
  return import('../pages/JobPage');
}

export function loadBlueprintPage() {
  return import('../pages/BlueprintPage');
}

let buildPrefetchPromise: Promise<unknown> | null = null;

type ConnectionNavigator = Navigator & {
  connection?: {
    saveData?: boolean;
  };
};

export function shouldPrefetchBuildRoute() {
  if (typeof navigator === 'undefined') {
    return false;
  }

  return !(navigator as ConnectionNavigator).connection?.saveData;
}

export function prefetchBuildRoute() {
  if (!buildPrefetchPromise) {
    buildPrefetchPromise = loadBuildPage();
  }

  return buildPrefetchPromise;
}

export function scheduleBuildPrefetch() {
  if (typeof window === 'undefined' || !shouldPrefetchBuildRoute()) {
    return () => undefined;
  }

  const win = window as Window & typeof globalThis & {
    requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
    cancelIdleCallback?: (handle: number) => void;
  };
  let cancelled = false;

  const run = () => {
    if (cancelled) {
      return;
    }
    void prefetchBuildRoute();
  };

  if (typeof win.requestIdleCallback === 'function' && typeof win.cancelIdleCallback === 'function') {
    const idleId = win.requestIdleCallback(() => run(), { timeout: 1600 });
    return () => {
      cancelled = true;
      win.cancelIdleCallback?.(idleId);
    };
  }

  const timeoutId = globalThis.setTimeout(run, 900);
  return () => {
    cancelled = true;
    window.clearTimeout(timeoutId);
  };
}
