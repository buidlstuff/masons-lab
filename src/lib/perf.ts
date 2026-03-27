const devLoggedMeasures = new Set<string>();

function canUsePerformance() {
  return typeof window !== 'undefined' && typeof window.performance !== 'undefined';
}

export function markPerformance(name: string) {
  if (!canUsePerformance()) {
    return;
  }

  try {
    window.performance.mark(name);
  } catch {
    // Ignore unsupported mark names or repeated runtime edge cases.
  }
}

export function measurePerformance(name: string, startMark: string, endMark: string) {
  if (!canUsePerformance()) {
    return;
  }

  try {
    window.performance.measure(name, startMark, endMark);
    if (!import.meta.env.DEV) {
      return;
    }

    const latestMeasure = window.performance
      .getEntriesByName(name, 'measure')
      .at(-1);

    if (!latestMeasure) {
      return;
    }

    const fingerprint = `${name}:${startMark}:${endMark}:${Math.round(latestMeasure.duration)}`;
    if (devLoggedMeasures.has(fingerprint)) {
      return;
    }

    devLoggedMeasures.add(fingerprint);
    console.info(`[perf] ${name}: ${latestMeasure.duration.toFixed(1)}ms`);
  } catch {
    // Ignore missing marks during partial boot flows.
  }
}
