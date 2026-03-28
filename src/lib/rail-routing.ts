import type { PrimitiveInstance } from './types';

export type RailSwitchBranch = 'left' | 'right';

export interface RailRoute {
  points: Array<{ x: number; y: number }>;
  activeTrackId: string;
  switchId?: string;
}

const RAIL_SWITCH_TOLERANCE = 30;

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalize(point: { x: number; y: number }) {
  const magnitude = Math.hypot(point.x, point.y);
  if (magnitude < 0.0001) {
    return { x: 1, y: 0 };
  }
  return {
    x: point.x / magnitude,
    y: point.y / magnitude,
  };
}

export function getRailPoints(track: PrimitiveInstance | undefined) {
  if (!track || track.kind !== 'rail-segment') {
    return [] as Array<{ x: number; y: number }>;
  }
  return (track.config as { points: Array<{ x: number; y: number }> }).points;
}

export function getTrackPointFromPoints(
  points: Array<{ x: number; y: number }>,
  progress: number,
) {
  if (points.length < 2) {
    return points[0] ?? { x: 0, y: 0 };
  }
  const clamped = Math.max(0, Math.min(0.999, progress));
  const segment = Math.min(points.length - 2, Math.floor(clamped * (points.length - 1)));
  const t = clamped * (points.length - 1) - segment;
  const start = points[segment];
  const end = points[segment + 1];
  return {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
  };
}

export function trackLengthFromPoints(points: Array<{ x: number; y: number }>) {
  if (points.length < 2) {
    return 1;
  }
  let total = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    total += Math.hypot(points[index + 1].x - points[index].x, points[index + 1].y - points[index].y);
  }
  return Math.max(1, total);
}

export function resolveRailRoute(
  primitives: PrimitiveInstance[],
  trackId: string,
  getSwitchBranch?: (switchId: string) => RailSwitchBranch,
): RailRoute {
  const baseTrack = primitives.find(
    (primitive) => primitive.id === trackId && primitive.kind === 'rail-segment',
  );
  const basePoints = getRailPoints(baseTrack);
  if (basePoints.length < 2) {
    return { points: basePoints, activeTrackId: trackId };
  }

  const switchPoint = basePoints.at(-1)!;
  const switchPrimitive = primitives.find((primitive) =>
    primitive.kind === 'rail-switch'
    && distance(
      { x: (primitive.config as { x: number; y: number }).x, y: (primitive.config as { x: number; y: number }).y },
      switchPoint,
    ) <= RAIL_SWITCH_TOLERANCE);

  if (!switchPrimitive) {
    return { points: basePoints, activeTrackId: trackId };
  }

  const desiredBranch = getSwitchBranch?.(switchPrimitive.id)
    ?? (((switchPrimitive.config as { branch?: RailSwitchBranch }).branch ?? 'right') as RailSwitchBranch);
  const inbound = normalize({
    x: switchPoint.x - basePoints[basePoints.length - 2].x,
    y: switchPoint.y - basePoints[basePoints.length - 2].y,
  });

  const branchCandidates = primitives
    .filter((primitive) => primitive.kind === 'rail-segment' && primitive.id !== trackId)
    .map((primitive) => {
      const points = getRailPoints(primitive);
      if (points.length < 2) {
        return null;
      }

      const startMatches = distance(points[0], switchPoint) <= RAIL_SWITCH_TOLERANCE;
      const endMatches = distance(points[points.length - 1], switchPoint) <= RAIL_SWITCH_TOLERANCE;
      if (!startMatches && !endMatches) {
        return null;
      }

      const orientedPoints = startMatches ? points : [...points].reverse();
      const outbound = normalize({
        x: orientedPoints[1].x - orientedPoints[0].x,
        y: orientedPoints[1].y - orientedPoints[0].y,
      });
      const cross = inbound.x * outbound.y - inbound.y * outbound.x;
      const branch = cross >= 0 ? 'right' : 'left';
      return {
        primitive,
        branch,
        crossMagnitude: Math.abs(cross),
        orientedPoints,
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
    .sort((left, right) => right.crossMagnitude - left.crossMagnitude);

  const chosenBranch = branchCandidates.find((candidate) => candidate.branch === desiredBranch) ?? branchCandidates[0];
  if (!chosenBranch) {
    return { points: basePoints, activeTrackId: trackId, switchId: switchPrimitive.id };
  }

  return {
    points: [...basePoints, ...chosenBranch.orientedPoints.slice(1)],
    activeTrackId: chosenBranch.primitive.id,
    switchId: switchPrimitive.id,
  };
}
